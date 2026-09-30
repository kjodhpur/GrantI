import type { Criteria } from "./criteria";
import { causeLabel } from "./taxonomy";

/** One row of foundation_profiles with numeric/JSON columns normalised. */
export type Profile = {
  ein: string;
  name: string;
  state: string | null;
  years: number[];
  only_preselected: boolean | null;
  open_to_apps: boolean | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  deadlines: string | null;
  app_materials: string | null;
  app_restrictions: string | null;
  grants_n: number;
  grants_usd: number;
  median_grant_usd: number | null;
  p25_grant_usd: number | null;
  p75_grant_usd: number | null;
  max_grant_usd: number | null;
  foreign_share: number;
  classified_share: number;
  cause_mix: Record<string, { usd: number; n: number }>;
  geo_states: Record<string, { usd: number; n: number }>;
  geo_countries: Record<string, { usd: number; n: number }>;
  top_recipients: { name: string | null; state: string | null; country: string; cause: string; usd: number }[];
  trend: Record<string, { usd: number; n: number }>;
};

export type Components = { cause: number | null; geo: number | null; size: number | null; capacity: number; access: number };

export const WEIGHTS = { cause: 0.45, geo: 0.25, size: 0.15, capacity: 0.1, access: 0.05 } as const;

const sat = (x: number, at: number) => Math.min(1, Math.max(0, x / at));
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Fit of the foundation's giving to each requested cause, weighted. Shares are "share of all grant dollars touching the cause". */
export function causeFit(p: Profile, c: Criteria): number | null {
  if (!c.causes.length) return null;
  let num = 0;
  let den = 0;
  for (const { id, weight } of c.causes) {
    const m = p.cause_mix[id];
    const shareUsd = m && p.grants_usd ? m.usd / p.grants_usd : 0;
    const shareN = m && p.grants_n ? m.n / p.grants_n : 0;
    const fit = sat(0.7 * shareUsd + 0.3 * shareN, 0.4); // 40% of giving on a cause is a full-strength focus
    num += weight * fit;
    den += weight;
  }
  const n = p.grants_n;
  const thin = n < 5 ? 0.6 : n < 10 ? 0.85 : 1; // few grants = weak evidence
  return (num / den) * thin;
}

export function geoFit(p: Profile, c: Criteria): number | null {
  const wantsStates = c.states.length > 0;
  const wantsIntl = c.international || c.countries.length > 0;
  if (!wantsStates && !wantsIntl) return null;
  let stateFit = 0;
  if (wantsStates) {
    const totalUs = Object.values(p.geo_states).reduce((s, v) => s + v.usd, 0);
    const totalUsN = Object.values(p.geo_states).reduce((s, v) => s + v.n, 0);
    const inUsd = c.states.reduce((s, st) => s + (p.geo_states[st]?.usd ?? 0), 0);
    const inN = c.states.reduce((s, st) => s + (p.geo_states[st]?.n ?? 0), 0);
    const share = totalUs ? 0.7 * (inUsd / totalUs) + 0.3 * (inN / Math.max(1, totalUsN)) : 0;
    const usPart = 1 - p.foreign_share; // a mostly-foreign funder is a weak domestic match
    stateFit = clamp01(sat(share, 0.5) * usPart + (p.state && c.states.includes(p.state) ? 0.25 : 0));
  }
  let intlFit = 0;
  if (wantsIntl) {
    intlFit = sat(p.foreign_share, 0.3);
    if (c.countries.length && intlFit > 0) {
      const totalFx = Object.values(p.geo_countries).reduce((s, v) => s + v.usd, 0);
      const inFx = c.countries.reduce((s, cc) => s + (p.geo_countries[cc]?.usd ?? 0), 0);
      const share = totalFx ? inFx / totalFx : 0;
      intlFit = clamp01(0.7 * intlFit + 0.3 * sat(share, 0.5)); // named countries refine, not gate
    }
  }
  return Math.max(stateFit, intlFit); // either geography the nonprofit named counts
}

export function sizeFit(p: Profile, c: Criteria): number | null {
  if (!c.askUsd) return null;
  const { p25_grant_usd: lo, p75_grant_usd: hi, median_grant_usd: med } = p;
  if (!lo || !hi || !med) return 0;
  const sigma = Math.log(4);
  let d = 0; // distance in log space from the typical band
  if (c.askUsd < lo) d = Math.log(lo / c.askUsd);
  else if (c.askUsd > hi) d = Math.log(c.askUsd / hi);
  let s = Math.exp(-(d * d) / (2 * sigma * sigma));
  if (p.max_grant_usd && c.askUsd > p.max_grant_usd) s *= 0.5; // larger than anything it ever gave
  return s;
}

export function capacityFit(p: Profile): number {
  const usd = clamp01((Math.log10(Math.max(1, p.grants_usd)) - 4.5) / 2.5); // ~$30K -> 0, ~$10M -> 1
  const n = clamp01(Math.log10(p.grants_n + 1) / 2); // 99 grants -> 1
  return 0.7 * usd + 0.3 * n;
}

export function accessFit(p: Profile): number {
  if (p.open_to_apps) return 1;
  return p.only_preselected ? 0 : 0.5;
}

export function scoreProfile(p: Profile, c: Criteria) {
  const components: Components = {
    cause: causeFit(p, c),
    geo: geoFit(p, c),
    size: sizeFit(p, c),
    capacity: capacityFit(p),
    access: accessFit(p),
  };
  let num = 0;
  let den = 0;
  for (const k of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const v = components[k];
    if (v === null) continue; // criterion not supplied: its weight is redistributed
    num += WEIGHTS[k] * v;
    den += WEIGHTS[k];
  }
  return { score: Math.round((100 * num) / den), components };
}

// ---------- rationale: built ONLY from computed facts ----------
const usd = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
const pct = (v: number) => `${Math.round(v * 100)}%`;
const list = (xs: string[]) => (xs.length <= 2 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`);

export function rationale(p: Profile, c: Criteria): string[] {
  const out: string[] = [];
  for (const { id } of c.causes) {
    const m = p.cause_mix[id];
    if (m && m.usd > 0 && p.grants_usd) {
      out.push(`${pct(m.usd / p.grants_usd)} of its ${usd(p.grants_usd)} in grants (${m.n} of ${p.grants_n} grants) went to ${causeLabel(id)} recipients.`);
    }
  }
  const wantsIntl = c.international || c.countries.length > 0;
  if (c.states.length) {
    const totalUs = Object.values(p.geo_states).reduce((s, v) => s + v.usd, 0);
    const inUsd = c.states.reduce((s, st) => s + (p.geo_states[st]?.usd ?? 0), 0);
    if (totalUs && inUsd) out.push(`${pct(inUsd / totalUs)} of its US grant dollars went to ${list(c.states)}.`);
    if (p.state && c.states.includes(p.state)) out.push(`It is based in ${p.state}, one of your target states.`);
  }
  if (wantsIntl && p.foreign_share > 0) {
    const cs = Object.entries(p.geo_countries).sort((a, b) => b[1].usd - a[1].usd).slice(0, 4).map(([cc]) => cc);
    out.push(`${pct(p.foreign_share)} of its grant dollars went to organizations outside the US${cs.length ? ` (top countries: ${cs.join(", ")})` : ""}.`);
  }
  if (p.median_grant_usd) {
    const band = p.p25_grant_usd && p.p75_grant_usd ? `; middle half ${usd(p.p25_grant_usd)} to ${usd(p.p75_grant_usd)}` : "";
    let ask = "";
    if (c.askUsd && p.p25_grant_usd && p.p75_grant_usd) {
      ask = c.askUsd < p.p25_grant_usd ? ` Your ${usd(c.askUsd)} is below its typical range.`
        : c.askUsd > p.p75_grant_usd ? ` Your ${usd(c.askUsd)} is above its typical range.`
        : ` Your ${usd(c.askUsd)} is inside its typical range.`;
    }
    out.push(`Median grant ${usd(p.median_grant_usd)}${band}.${ask}`);
  }
  if (p.open_to_apps) {
    const bits = [p.contact_name, p.contact_email, p.contact_phone].filter(Boolean).join(", ");
    out.push(`Lists an application contact${bits ? ` (${bits})` : ""}${p.deadlines ? `; deadlines: ${p.deadlines}` : ""}.`);
  } else if (p.only_preselected) {
    out.push("Filed as giving only to pre-selected charities, so unsolicited requests are unlikely to be considered.");
  }
  if (p.years.length) out.push(`Based on IRS 990-PF filings for tax year${p.years.length > 1 ? "s" : ""} ${p.years[0]}${p.years.length > 1 ? `–${p.years[p.years.length - 1]}` : ""}.`);
  return out;
}

export const CAVEATS = [
  "Cause and geography labels are keyword-based estimates from recipient names and grant purposes, not IRS classifications.",
  "'Open to applications' means the filer did not tick 'preselected charities only' and listed application contact info. Confirm current guidelines on the foundation's own website before reaching out.",
];

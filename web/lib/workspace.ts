// Workspace glue between the real matching backend (/api/match, foundation profiles) and the platform UI's
// Prospect model. There are no user accounts yet, so the organization profile and the user's own pipeline
// state (saved, status, review notes) live in this browser's localStorage.
import { CriteriaSchema, extractAsk, extractCriteria, type Criteria } from "./criteria";
import type { Match } from "./match";
import { rationale, scoreProfile, type Components, type Profile } from "./score";
import { MATCHABLE_CAUSES, STATES, causeLabel } from "./taxonomy";
import type { EvidenceItem, HumanReview, MatchFactor, OrganizationProfile, Prospect, ProspectStatus } from "@/types/prospect";

const KEY = "gpi.workspace.v1";

type Store = {
  profile: OrganizationProfile | null;
  status: Record<string, ProspectStatus>;
  saved: string[];
  reviews: Record<string, HumanReview & { at: string }>;
};

const empty = (): Store => ({ profile: null, status: {}, saved: [], reviews: {} });

export function readStore(): Store {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

export function writeStore(update: (s: Store) => Store) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(update(readStore())));
  } catch {
    // private window or blocked storage: the session still works, it just is not remembered
  }
}

// ---------- organization profile -> match request ----------

const causeIdFor = (label: string) => MATCHABLE_CAUSES.find((c) => c.label === label)?.id;

export function profileText(p: OrganizationProfile): string {
  return [
    p.mission,
    p.focusAreas.length ? `Focus areas: ${p.focusAreas.join(", ")}.` : "",
    p.geography.length ? `We work in ${p.geography.join(", ")}.` : "",
    p.fundingNeed ? `Funding need: ${p.fundingNeed}.` : "",
  ].filter(Boolean).join(" ");
}

/** Body for POST /api/match: free text plus the focus areas the user picked (first = primary cause). */
export function matchBody(p: OrganizationProfile, limit = 50) {
  const ids = p.focusAreas.map(causeIdFor).filter((x): x is string => !!x).slice(0, 5);
  const ask = extractAsk(p.fundingNeed);
  return {
    text: profileText(p),
    ...(ids.length ? { causes: ids.map((id, i) => ({ id, weight: i === 0 ? 1 : 0.7 })) } : {}),
    ...(ask ? { askUsd: ask } : {}),
    limit,
  };
}

/** The same criteria the server builds from matchBody, for scoring one foundation in the browser. */
export function profileCriteria(p: OrganizationProfile | null): Criteria {
  if (!p) return CriteriaSchema.parse({});
  const { text, causes, askUsd } = matchBody(p);
  return CriteriaSchema.parse({ ...extractCriteria(text), ...(causes ? { causes } : {}), ...(askUsd ? { askUsd } : {}) });
}

// ---------- backend shapes -> Prospect ----------

const FACTOR_LABELS: Record<keyof Components, string> = {
  cause: "Mission alignment",
  geo: "Geographic alignment",
  size: "Typical grant size fit",
  openness: "Openness to new grantees",
  capacity: "Giving capacity",
  access: "Accepts applications",
};

const usd = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const stateName = (code: string) => (STATES[code] ? titleCase(STATES[code]) : code);
const yearSpan = (ys: number[]) => (ys.length ? (ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : `${ys[0]}`) : "");

type Basis = {
  ein: string;
  name: string;
  score: number;
  components: Components;
  rationale: string[];
  causes: string[];
  geography: { states: string[]; countries: string[] };
  foreign_share: number;
  giving: { grants_n: number; median_grant_usd: number | null; p25_grant_usd: number | null; p75_grant_usd: number | null;
            new_grantee_rate: number | null; years: number[] };
  open_to_apps: boolean;
  contact: { name: string | null; email: string | null; phone: string | null; deadlines: string | null };
  recipients: Profile["top_recipients"];
};

function toProspect(b: Basis, status: ProspectStatus): Prospect {
  const thin = b.giving.grants_n < 10;
  const factors: MatchFactor[] = (Object.keys(FACTOR_LABELS) as (keyof Components)[])
    .filter((k) => b.components[k] !== null)
    .map((k) => ({
      label: FACTOR_LABELS[k],
      score: Math.round((b.components[k] as number) * 100),
      confidence: thin ? "low" : k === "cause" || k === "geo" ? "medium" : "high",
    }));
  const last = b.giving.years[b.giving.years.length - 1];
  const evidence: EvidenceItem[] = [
    { id: `${b.ein}-filings`, type: "filing", title: "IRS Form 990-PF filings", sourceLabel: "IRS e-file XML (public)",
      summary: `${b.giving.grants_n} grants of $250 or more in tax years ${yearSpan(b.giving.years)}.`, date: yearSpan(b.giving.years) },
    ...b.recipients.slice(0, 5).map((r, i) => ({
      id: `${b.ein}-grant-${i}`, type: "grant_history" as const, title: r.name ?? "Unnamed recipient",
      summary: `${usd(r.usd)} · ${causeLabel(r.cause)}${r.state ? ` · ${stateName(r.state)}` : r.country !== "US" ? ` · ${r.country}` : ""}`,
      sourceLabel: "Grant paid, IRS Form 990-PF",
    })),
  ];
  if (b.open_to_apps) {
    const bits = [b.contact.name, b.contact.email, b.contact.phone].filter(Boolean).join(" · ");
    evidence.push({ id: `${b.ein}-apply`, type: "filing", title: "Application information", sourceLabel: "IRS Form 990-PF, Part XIV",
      summary: `${bits || "Contact listed"}${b.contact.deadlines ? `. Deadlines: ${b.contact.deadlines}` : ""}` });
  }
  return {
    id: b.ein,
    name: b.name,
    matchScore: b.score,
    typicalGrantMin: b.giving.p25_grant_usd ?? b.giving.median_grant_usd ?? 0,
    typicalGrantMax: b.giving.p75_grant_usd ?? b.giving.median_grant_usd ?? 0,
    focusAreas: b.causes,
    // mostly-abroad funders list their countries first (codes as filed with the IRS)
    geography: (b.foreign_share >= 0.5
      ? [...b.geography.countries, ...b.geography.states.map(stateName)]
      : [...b.geography.states.map(stateName), ...b.geography.countries]).slice(0, 4),
    recentSignal: b.giving.new_grantee_rate !== null && last
      ? `${Math.round(b.giving.new_grantee_rate * 100)}% new grantees in ${last}`
      : last ? `Latest filing: tax year ${last}` : undefined,
    status,
    summary: b.rationale.join(" "),
    evidence,
    factors,
  };
}

export function prospectFromMatch(m: Match, status: ProspectStatus): Prospect {
  return toProspect({
    ein: m.ein, name: m.name, score: m.score, components: m.components, rationale: m.rationale,
    causes: m.matched_causes.map((c) => c.label), geography: m.top_geography, foreign_share: m.giving.foreign_share,
    giving: m.giving, open_to_apps: m.open_to_apps, contact: m.contact, recipients: m.example_recipients,
  }, status);
}

const topKeys = (o: Record<string, { usd: number }>, n: number) =>
  Object.entries(o).sort((a, b) => b[1].usd - a[1].usd).slice(0, n).map(([k]) => k);

/** Score one foundation profile against the organization profile, exactly as /api/match would. */
export function prospectFromProfile(p: Profile, org: OrganizationProfile | null, status: ProspectStatus): Prospect {
  const c = profileCriteria(org);
  const { score, components } = scoreProfile(p, c);
  const causes = c.causes.length
    ? c.causes.filter(({ id }) => (p.cause_mix[id]?.n ?? 0) > 0).map(({ id }) => causeLabel(id))
    : topKeys(p.cause_mix, 3).filter((id) => id !== "unclassified").map(causeLabel);
  return toProspect({
    ein: p.ein, name: p.name, score, components, rationale: rationale(p, c), causes,
    geography: { states: topKeys(p.geo_states, 5), countries: topKeys(p.geo_countries, 5) }, foreign_share: p.foreign_share,
    giving: p, open_to_apps: !!p.open_to_apps,
    contact: { name: p.contact_name, email: p.contact_email, phone: p.contact_phone, deadlines: p.deadlines },
    recipients: p.top_recipients,
  }, status);
}

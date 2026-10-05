import { getPool } from "./db";
import type { Criteria } from "./criteria";
import { CAVEATS, rationale, scoreProfile, type Components, type Profile } from "./score";
import { causeLabel } from "./taxonomy";

const CANDIDATE_LIMIT = 3000;

const COLUMNS = `ein, name, state, years, only_preselected, open_to_apps, contact_name, contact_email, contact_phone,
  deadlines, app_materials, app_restrictions, grants_n, grants_usd, median_grant_usd, p25_grant_usd, p75_grant_usd,
  max_grant_usd, new_grantee_rate, repeat_grantee_rate, foreign_share, classified_share, cause_mix, geo_states, geo_countries, top_recipients, trend`;

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function toProfile(r: Row): Profile {
  return {
    ...(r as unknown as Profile),
    grants_n: Number(r.grants_n),
    grants_usd: Number(r.grants_usd),
    median_grant_usd: num(r.median_grant_usd),
    p25_grant_usd: num(r.p25_grant_usd),
    p75_grant_usd: num(r.p75_grant_usd),
    max_grant_usd: num(r.max_grant_usd),
    new_grantee_rate: num(r.new_grantee_rate),
    repeat_grantee_rate: num(r.repeat_grantee_rate),
    foreign_share: Number(r.foreign_share ?? 0),
    classified_share: Number(r.classified_share ?? 0),
    years: (r.years as number[]) ?? [],
  };
}

export type OutcomeCounts = { approached: number; funded: number; declined: number };

export type Match = {
  ein: string;
  name: string;
  state: string | null;
  score: number;
  components: Components;
  matched_causes: { id: string; label: string; share_of_dollars: number; grants: number }[];
  rationale: string[];
  open_to_apps: boolean;
  contact: { name: string | null; email: string | null; phone: string | null; deadlines: string | null; materials: string | null; restrictions: string | null };
  giving: {
    grants_n: number;
    grants_usd: number;
    median_grant_usd: number | null;
    /** Middle half of grant sizes (grants of min_counted_grant_usd or more). */
    p25_grant_usd: number | null;
    p75_grant_usd: number | null;
    foreign_share: number;
    new_grantee_rate: number | null;
    repeat_grantee_rate: number | null;
    years: number[];
  };
  /** Where its grant dollars go: top US recipient states and foreign countries (ISO-like codes from the filings). */
  top_geography: { states: string[]; countries: string[] };
  example_recipients: Profile["top_recipients"];
  prior_outcomes: OutcomeCounts;
};

const topKeys = (m: Record<string, { usd: number }>, n: number) =>
  Object.entries(m).sort((a, b) => b[1].usd - a[1].usd).slice(0, n).map(([k]) => k);

export type MatchResponse = {
  criteria: Criteria;
  candidates_considered: number;
  results: Match[];
  warnings: string[];
  caveats: string[];
};

export async function outcomeCounts(eins: string[]): Promise<Map<string, OutcomeCounts>> {
  const pool = getPool();
  const map = new Map<string, OutcomeCounts>();
  if (!pool || !eins.length) return map;
  const { rows } = await pool.query(
    `SELECT foundation_ein, status, count(*)::int AS n FROM outcomes WHERE foundation_ein = ANY($1::text[]) GROUP BY 1, 2`,
    [eins]
  );
  for (const r of rows) {
    const c = map.get(r.foundation_ein) ?? { approached: 0, funded: 0, declined: 0 };
    c[r.status as keyof OutcomeCounts] = r.n;
    map.set(r.foundation_ein, c);
  }
  return map;
}

export async function matchFoundations(c: Criteria): Promise<MatchResponse> {
  const pool = getPool();
  if (!pool) throw new Error("NO_DB");
  const warnings: string[] = [];
  const causeIds = c.causes.map((x) => x.id);
  const wantsIntl = c.international || c.countries.length > 0;

  // Candidate retrieval: hard filters only on things a nonprofit cannot compromise on. Scoring does the rest.
  const where = ["grants_usd > 0"];
  const params: unknown[] = [];
  const p = (v: unknown) => (params.push(v), `$${params.length}`);
  if (c.requireOpen) where.push("open_to_apps");
  if (causeIds.length) where.push(`causes && ${p(causeIds)}::text[]`);
  else {
    warnings.push("No cause was identified, so results are ranked on geography, grant size and capacity only. Say what the nonprofit does (e.g. 'child nutrition') for a real match.");
    const geo: string[] = [];
    if (c.states.length) geo.push(`states && ${p(c.states)}::text[]`);
    if (wantsIntl) geo.push("foreign_share >= 0.1");
    if (geo.length) where.push(`(${geo.join(" OR ")})`);
  }
  // With causes, take the foundations giving the largest share of dollars to them, not the largest foundations:
  // otherwise small, focused funders never reach scoring. Under 10 grants the share is discounted (thin evidence),
  // so one-grant foundations cannot fill the pool.
  const focus = c.causes.length
    ? `(${c.causes
        .map(({ id, weight }, i) => `${p(i === 0 && c.causes.length > 1 ? 2 * weight : weight)}::numeric * coalesce((cause_mix->${p(id)}->>'usd')::numeric, 0)`)
        .join(" + ")})
        / grants_usd * LEAST(1, grants_n / 10.0) DESC, `
    : "";
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM foundation_profiles WHERE ${where.join(" AND ")} ORDER BY ${focus}grants_usd DESC LIMIT ${CANDIDATE_LIMIT}`,
    params
  );
  if (rows.length === CANDIDATE_LIMIT) {
    warnings.push(`Candidate pool capped at the ${CANDIDATE_LIMIT} ${c.causes.length ? "funders most focused on your causes" : "largest funders"}; narrow the criteria for full coverage.`);
  }

  const scored = rows
    .map((r) => toProfile(r))
    .map((prof) => ({ prof, ...scoreProfile(prof, c) }))
    // a requested cause with zero evidence is not a match, however well geography fits
    .filter((s) => s.components.cause === null || s.components.cause > 0)
    .sort((a, b) => b.score - a.score || b.prof.grants_usd - a.prof.grants_usd)
    .slice(0, c.limit);

  const outcomes = await outcomeCounts(scored.map((s) => s.prof.ein)).catch(() => new Map<string, OutcomeCounts>());
  if (!scored.length) warnings.push("No foundations matched. Try removing 'open to applications only' or broadening the cause or geography.");

  const results: Match[] = scored.map(({ prof, score, components }) => ({
    ein: prof.ein,
    name: prof.name,
    state: prof.state,
    score,
    components,
    matched_causes: c.causes
      .map(({ id }) => ({ id, label: causeLabel(id), share_of_dollars: prof.grants_usd ? (prof.cause_mix[id]?.usd ?? 0) / prof.grants_usd : 0, grants: prof.cause_mix[id]?.n ?? 0 }))
      .filter((m) => m.grants > 0),
    rationale: rationale(prof, c),
    open_to_apps: !!prof.open_to_apps,
    contact: { name: prof.contact_name, email: prof.contact_email, phone: prof.contact_phone, deadlines: prof.deadlines, materials: prof.app_materials, restrictions: prof.app_restrictions },
    giving: { grants_n: prof.grants_n, grants_usd: prof.grants_usd, median_grant_usd: prof.median_grant_usd,
      p25_grant_usd: prof.p25_grant_usd, p75_grant_usd: prof.p75_grant_usd, foreign_share: prof.foreign_share,
      new_grantee_rate: prof.new_grantee_rate, repeat_grantee_rate: prof.repeat_grantee_rate, years: prof.years },
    top_geography: { states: topKeys(prof.geo_states, 5), countries: topKeys(prof.geo_countries, 5) },
    example_recipients: prof.top_recipients,
    prior_outcomes: outcomes.get(prof.ein) ?? { approached: 0, funded: 0, declined: 0 },
  }));

  return { criteria: c, candidates_considered: rows.length, results, warnings, caveats: CAVEATS };
}

export async function getFoundation(ein: string): Promise<(Profile & { prior_outcomes: OutcomeCounts }) | null> {
  const pool = getPool();
  if (!pool) throw new Error("NO_DB");
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM foundation_profiles WHERE ein = $1`, [ein]);
  if (!rows.length) return null;
  const oc = await outcomeCounts([ein]).catch(() => new Map<string, OutcomeCounts>());
  return { ...toProfile(rows[0]), prior_outcomes: oc.get(ein) ?? { approached: 0, funded: 0, declined: 0 } };
}

/** Foundations whose name contains `q` (case-insensitive), largest givers first. For "analyze this funder" lookups. */
export async function searchFoundations(q: string, limit = 10): Promise<Profile[]> {
  const pool = getPool();
  if (!pool) throw new Error("NO_DB");
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM foundation_profiles WHERE name ILIKE '%' || $1 || '%' ORDER BY grants_usd DESC LIMIT $2`,
    [q, limit]
  );
  return rows.map(toProfile);
}

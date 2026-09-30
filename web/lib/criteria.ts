import { z } from "zod";
import {
  CAUSE_IDS,
  COUNTRIES,
  INTERNATIONAL_WORDS,
  MATCHABLE_CAUSES,
  REGIONS,
  STATES,
  keywordRegex,
} from "./taxonomy";

/** What a nonprofit wants, in structured form. This is the contract for /api/match and the agent's search tool. */
export const CriteriaSchema = z.object({
  mission: z.string().max(4000).optional(),
  causes: z
    .array(z.object({ id: z.enum(CAUSE_IDS), weight: z.number().min(0.1).max(1).default(1) }))
    .max(5)
    .default([]),
  states: z.array(z.string().length(2).transform((s) => s.toUpperCase())).max(10).default([]),
  international: z.boolean().default(false),
  countries: z.array(z.string().length(2).transform((s) => s.toUpperCase())).max(20).default([]),
  askUsd: z.number().positive().max(1e9).optional(),
  requireOpen: z.boolean().default(true),
  limit: z.number().int().min(1).max(50).default(20),
});
/** Same fields with NO defaults, for overlaying explicit user input on top of text-derived criteria.
 *  (zod's .partial() keeps defaults, which would silently overwrite what was parsed from the text.) */
export const CriteriaPatchSchema = z.object({
  causes: z.array(z.object({ id: z.enum(CAUSE_IDS), weight: z.number().min(0.1).max(1).optional() })).max(5).optional(),
  states: z.array(z.string().length(2)).max(10).optional(),
  international: z.boolean().optional(),
  countries: z.array(z.string().length(2)).max(20).optional(),
  askUsd: z.number().positive().max(1e9).optional(),
  requireOpen: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
export type Criteria = z.infer<typeof CriteriaSchema>;
export type CriteriaInput = z.input<typeof CriteriaSchema>;

const matchers = MATCHABLE_CAUSES.map((c) => ({ id: c.id, rx: keywordRegex(c.keywords) }));
const AMBIGUOUS_ABBR = new Set(["IN", "OR", "ME", "OK", "HI", "OH", "AS", "IT", "US", "ID", "LA", "DE", "MA", "PA", "CO", "CT"]);

/**
 * Deterministic extraction of criteria from free text. No LLM, no network: it is the fallback when no
 * ANTHROPIC_API_KEY is configured and the baseline the agent can be compared against.
 */
export function extractCriteria(text: string): Criteria {
  const lower = ` ${text.toLowerCase()} `;

  // causes: keyword hits per cause, strongest first
  const hits = matchers
    .map((m) => ({ id: m.id, n: (lower.match(m.rx) ?? []).length }))
    .filter((h) => h.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);
  const max = hits[0]?.n ?? 1;
  const causes = hits.map((h) => ({ id: h.id, weight: Math.round((0.4 + 0.6 * (h.n / max)) * 100) / 100 }));

  // states: full names anywhere, two-letter codes only when written in capitals and not a common word
  const states = new Set<string>();
  for (const [abbr, name] of Object.entries(STATES)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) states.add(abbr);
  }
  for (const m of text.matchAll(/\b([A-Z]{2})\b/g)) {
    if (m[1] in STATES && !AMBIGUOUS_ABBR.has(m[1])) states.add(m[1]);
  }
  // "Washington, DC" / "washington dc" is the district, not the state
  if (/\bwashington,? d\.?c\b|\bdistrict of columbia\b/i.test(text)) {
    states.delete("WA");
    states.add("DC");
  }

  // international: explicit words, or any named country / region
  const countries = new Set<string>();
  for (const [name, cc] of Object.entries(COUNTRIES)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) countries.add(cc);
  }
  for (const [name, ccs] of Object.entries(REGIONS)) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) ccs.forEach((cc) => countries.add(cc));
  }
  const international = INTERNATIONAL_WORDS.some((w) => lower.includes(w)) || countries.size > 0;

  return CriteriaSchema.parse({
    mission: text.slice(0, 4000),
    causes,
    states: [...states].slice(0, 10),
    international,
    countries: [...countries].slice(0, 20),
    askUsd: extractAsk(text),
  });
}

const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, mm: 1e6, million: 1e6 };

/** First dollar amount in the text ("$50,000", "$75k", "1.5 million"); the geometric mean when given a range. */
export function extractAsk(text: string): number | undefined {
  const amounts: number[] = [];
  const rx = /\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|thousand|million|mm|m)?\b|\b(\d+(?:\.\d+)?)\s?(k|thousand|million)\b/gi;
  for (const m of text.matchAll(rx)) {
    const num = parseFloat((m[1] ?? m[3]).replace(/,/g, ""));
    const unit = (m[2] ?? m[4] ?? "").toLowerCase();
    const v = num * (MULT[unit] ?? 1);
    if (v >= 100 && v <= 1e9) amounts.push(v);
  }
  if (!amounts.length) return undefined;
  if (amounts.length >= 2 && /\b(between|to|-|–|and)\b/i.test(text)) {
    return Math.round(Math.sqrt(amounts[0] * amounts[1]));
  }
  return amounts[0];
}

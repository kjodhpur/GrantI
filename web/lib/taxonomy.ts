import taxonomy from "./taxonomy.json";

// Vocabulary is shared with the Python pipeline (pipeline/classify.py reads the same JSON).
export type Cause = {
  id: string;
  label: string;
  keywords: string[];
  excluded_from_matching?: boolean;
  ntee?: string[];
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const CAUSES: Cause[] = taxonomy.causes;
export const MATCHABLE_CAUSES = CAUSES.filter((c) => !c.excluded_from_matching);
export const CAUSE_IDS = MATCHABLE_CAUSES.map((c) => c.id) as [string, ...string[]];
export const STATES: Record<string, string> = taxonomy.states;
export const COUNTRIES: Record<string, string> = taxonomy.countries;
export const REGIONS: Record<string, string[]> = taxonomy.regions;
export const INTERNATIONAL_WORDS: string[] = taxonomy.international_words;
const REWRITES = (taxonomy.rewrites as [string, string][]).map(([a, b]) => [new RegExp(`\\b${esc(a)}\\b`, "g"), b] as const);

/** Same as pipeline/classify.py: phrase replacements applied to lower-cased text before keyword matching. */
export const applyRewrites = (lower: string) => REWRITES.reduce((t, [rx, b]) => t.replace(rx, b), lower);

export const causeLabel = (id: string) => CAUSES.find((c) => c.id === id)?.label ?? id;

/** Same semantics as pipeline/classify.py: whole word, or word prefix when the keyword ends in `*`. */
export function keywordRegex(keywords: string[]): RegExp {
  const parts = keywords.map((kw) => {
    const k = kw.toLowerCase().trim();
    return k.endsWith("*") ? "\\b" + esc(k.slice(0, -1)) : "\\b" + esc(k) + "\\b";
  });
  return new RegExp(parts.join("|"), "g");
}

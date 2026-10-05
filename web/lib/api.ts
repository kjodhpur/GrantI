// Client API for the platform workspace. Rankings come from the real matching backend (POST /api/match over
// IRS Form 990-PF filings); the organization profile and the user's pipeline state are kept in this browser
// (lib/workspace.ts) until accounts exist.
import type { MatchResponse } from "@/lib/match";
import type { Profile } from "@/lib/score";
import { matchBody, prospectFromMatch, prospectFromProfile, readStore, writeStore } from "@/lib/workspace";
import type { HumanReview, OrganizationProfile, Prospect, ProspectStatus } from "@/types/prospect";

let pending: { key: string; promise: Promise<MatchResponse | null> } | null = null;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status})`);
  return data as T;
}

/** One /api/match call per profile, shared by the metrics, the prospect list and the match summary. */
function loadMatches(): Promise<MatchResponse | null> {
  const profile = readStore().profile;
  if (!profile) return Promise.resolve(null);
  const body = matchBody(profile);
  const key = JSON.stringify(body);
  if (!pending || pending.key !== key) {
    const promise = postJson<MatchResponse>("/api/match", body);
    promise.catch(() => { if (pending?.promise === promise) pending = null; });   // allow a retry after an error
    pending = { key, promise };
  }
  return pending.promise;
}

const statusOf = (id: string): ProspectStatus => readStore().status[id] ?? "research";

export async function getOrganizationProfile(): Promise<OrganizationProfile | null> {
  return readStore().profile;
}

export async function saveOrganizationProfile(profile: OrganizationProfile) {
  writeStore((s) => ({ ...s, profile }));
  pending = null;
  return profile;
}

export async function getProspects(filters?: { query?: string; status?: ProspectStatus | "all" }): Promise<Prospect[]> {
  const res = await loadMatches();
  const all = (res?.results ?? []).map((m) => prospectFromMatch(m, statusOf(m.ein)));
  return all.filter((p) => {
    const q = filters?.query?.toLowerCase();
    const queryMatch = !q || `${p.name} ${p.focusAreas.join(" ")}`.toLowerCase().includes(q);
    const statusMatch = !filters?.status || filters.status === "all" || p.status === filters.status;
    return queryMatch && statusMatch;
  });
}

/** How the backend read the profile, plus its warnings and caveats, for display next to the rankings. */
export async function getMatchSummary() {
  const res = await loadMatches();
  return res ? { criteria: res.criteria, warnings: res.warnings, caveats: res.caveats, considered: res.candidates_considered } : null;
}

const compactUsd = (v: number) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`;

export async function getDashboardMetrics() {
  const res = await loadMatches();
  const results = res?.results ?? [];
  const store = readStore();
  const good = results.filter((r) => r.score >= 75);
  return {
    prospectsAnalyzed: res?.candidates_considered ?? 0,
    highFit: results.filter((r) => r.score >= 85).length,
    // what a typical grant from each good-fit (75+) prospect would add up to
    potentialFunding: compactUsd(good.reduce((sum, r) => sum + (r.giving.median_grant_usd ?? 0), 0)),
    activePursuits: results.filter((r) => ["shortlist", "outreach", "applied"].includes(store.status[r.ein] ?? "")).length,
  };
}

/** Score a single foundation profile (from the server) against this browser's organization profile. */
export function prospectForProfile(profile: Profile): Prospect {
  return prospectFromProfile(profile, readStore().profile, statusOf(profile.ein));
}

export function getSavedIds(): string[] {
  return readStore().saved;
}

export async function saveProspect(id: string, saved = true) {
  writeStore((s) => ({ ...s, saved: saved ? [...new Set([...s.saved, id])] : s.saved.filter((x) => x !== id) }));
  return { id, saved };
}

export async function updateProspectStatus(id: string, status: ProspectStatus) {
  writeStore((s) => ({ ...s, status: { ...s.status, [id]: status } }));
  return { id, status };
}

export function getReview(id: string) {
  return readStore().reviews[id] ?? null;
}

export async function submitHumanReview(id: string, review: HumanReview) {
  writeStore((s) => ({ ...s, reviews: { ...s.reviews, [id]: { ...review, at: new Date().toISOString() } } }));
  return { id, ...review, submitted: true };
}

/** "Analyze a prospect": find a real foundation by name and score it against the organization profile. */
export async function analyzeProspect(input: { name: string }): Promise<Prospect | null> {
  const r = await fetch(`/api/foundations?q=${encodeURIComponent(input.name)}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Search failed (${r.status})`);
  const best: Profile | undefined = data.results?.[0];
  return best ? prospectForProfile(best) : null;
}

import assert from "node:assert/strict";
import { test } from "node:test";
import { CriteriaSchema, extractCriteria } from "../lib/criteria";
import { scoreProfile, type Profile } from "../lib/score";
import { matchBody, profileCriteria, prospectFromProfile } from "../lib/workspace";
import type { OrganizationProfile } from "../types/prospect";

const org: OrganizationProfile = {
  name: "Example Meals Network (SYNTHETIC)",
  mission: "We run school meal programs for children.",
  geography: ["Kenya", "Uganda"],
  focusAreas: ["Hunger & food security", "Children & youth"],
  fundingNeed: "$30,000 for a pilot",
};

const foundation: Profile = {
  ein: "000000001", name: "Test Foundation (SYNTHETIC)", state: "AZ", years: [2023, 2024, 2025], only_preselected: false,
  open_to_apps: true, contact_name: "Grants Office", contact_email: "g@example.invalid", contact_phone: null, deadlines: "March 1",
  app_materials: null, app_restrictions: null, grants_n: 40, grants_usd: 1_000_000, median_grant_usd: 20_000,
  p25_grant_usd: 10_000, p75_grant_usd: 40_000, max_grant_usd: 150_000, new_grantee_rate: 0.3, repeat_grantee_rate: 0.7,
  foreign_share: 0.6, classified_share: 0.9,
  cause_mix: { hunger_food: { usd: 500_000, n: 20 }, children_youth: { usd: 300_000, n: 12 } },
  geo_states: { AZ: { usd: 300_000, n: 10 } }, geo_countries: { KE: { usd: 400_000, n: 15 } },
  top_recipients: [{ name: "Example School Meals", state: null, country: "KE", cause: "hunger_food", usd: 120_000 }],
  trend: { "2025": { usd: 400_000, n: 15 } },
};

test("profile becomes a match request: picked focus areas lead, ask parsed from the funding need", () => {
  const body = matchBody(org);
  assert.deepEqual(body.causes, [{ id: "hunger_food", weight: 1 }, { id: "children_youth", weight: 0.7 }]);
  assert.equal(body.askUsd, 30_000);
  assert.match(body.text, /Kenya, Uganda/);
});

test("scoring one foundation in the browser matches the server's criteria", () => {
  const c = profileCriteria(org);
  const server = CriteriaSchema.parse({ ...extractCriteria(matchBody(org).text), causes: matchBody(org).causes, askUsd: 30_000 });
  assert.deepEqual(c, server);
  const p = prospectFromProfile(foundation, org, "shortlist");
  assert.equal(p.matchScore, scoreProfile(foundation, c).score);
  assert.equal(p.status, "shortlist");
  assert.deepEqual([p.typicalGrantMin, p.typicalGrantMax], [10_000, 40_000]);
  assert.deepEqual(p.focusAreas, ["Hunger & food security", "Children & youth"]);
  assert.ok(p.geography.includes("Arizona") && p.geography.includes("KE"));
  assert.ok(p.evidence.some((e) => e.title === "Example School Meals"));
  assert.ok(p.factors.every((f) => f.score! >= 0 && f.score! <= 100));
});

test("without an organization profile a foundation still renders, unscored on cause", () => {
  const p = prospectFromProfile(foundation, null, "research");
  assert.ok(!p.factors.some((f) => f.label === "Mission alignment"));
});

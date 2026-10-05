import assert from "node:assert/strict";
import { test } from "node:test";
import { CriteriaSchema } from "../lib/criteria";
import { rationale, scoreProfile, type Profile } from "../lib/score";

const base: Profile = {
  ein: "000000001", name: "Test (SYNTHETIC)", state: "CA", years: [2024, 2025], only_preselected: false, open_to_apps: true,
  contact_name: "Grants", contact_email: "g@example.invalid", contact_phone: null, deadlines: "March 1", app_materials: null, app_restrictions: null,
  grants_n: 40, grants_usd: 1_000_000, median_grant_usd: 20_000, p25_grant_usd: 10_000, p75_grant_usd: 40_000, max_grant_usd: 150_000,
  new_grantee_rate: null, repeat_grantee_rate: null, foreign_share: 0.6, classified_share: 0.9,
  cause_mix: { hunger_food: { usd: 500_000, n: 20 }, children_youth: { usd: 300_000, n: 12 } },
  geo_states: { CA: { usd: 300_000, n: 10 } }, geo_countries: { KE: { usd: 400_000, n: 15 }, UG: { usd: 200_000, n: 5 } },
  top_recipients: [], trend: {},
};
const crit = (o: object) => CriteriaSchema.parse(o);

test("cause focus drives score; zero evidence for a requested cause scores 0 on cause", () => {
  const hit = scoreProfile(base, crit({ causes: [{ id: "hunger_food" }] }));
  const miss = scoreProfile(base, crit({ causes: [{ id: "arts_culture" }] }));
  assert.equal(miss.components.cause, 0);
  assert.ok(hit.components.cause! > 0.9);
  assert.ok(hit.score > miss.score);
});

test("absent criteria are excluded and weights renormalised (score stays on 0-100)", () => {
  const r = scoreProfile(base, crit({}));
  assert.equal(r.components.cause, null);
  assert.equal(r.components.geo, null);
  assert.ok(r.score >= 0 && r.score <= 100);
});

test("size: ask inside p25-p75 beats ask far above; above max gets penalised", () => {
  const inside = scoreProfile(base, crit({ askUsd: 20_000 })).components.size!;
  const above = scoreProfile(base, crit({ askUsd: 400_000 })).components.size!;
  assert.equal(inside, 1);
  assert.ok(above < 0.2);
});

test("geo: international matches a 60% foreign funder, domestic-only ask does not", () => {
  const intl = scoreProfile(base, crit({ international: true })).components.geo!;
  const usOnly = scoreProfile(base, crit({ states: ["TX"] })).components.geo!;
  assert.ok(intl > 0.9);
  assert.ok(usOnly < 0.3);
});

test("preselected-only funders score 0 on access", () => {
  assert.equal(scoreProfile({ ...base, open_to_apps: false, only_preselected: true }, crit({})).components.access, 0);
});

test("thin evidence is discounted", () => {
  const thin = scoreProfile({ ...base, grants_n: 3 }, crit({ causes: [{ id: "hunger_food" }] })).components.cause!;
  const full = scoreProfile(base, crit({ causes: [{ id: "hunger_food" }] })).components.cause!;
  assert.ok(thin < full);
});

test("rationale only states numbers derivable from the profile", () => {
  const lines = rationale(base, crit({ causes: [{ id: "hunger_food" }], international: true, askUsd: 20_000 })).join("\n");
  assert.match(lines, /50% of its \$1,000,000 in grants \(20 of 40 grants of \$250\+\) went to Hunger & food security/);
  assert.match(lines, /60% of its grant dollars went to organizations outside the US/);
  assert.match(lines, /inside its typical range/);
});

test("openness: new-grantee rate raises the score; unknown is neutral, not maximal", () => {
  const open = scoreProfile({ ...base, new_grantee_rate: 0.6, repeat_grantee_rate: 0.4 }, crit({})).components.openness;
  const closed = scoreProfile({ ...base, new_grantee_rate: 0, repeat_grantee_rate: 1 }, crit({})).components.openness;
  const unknown = scoreProfile(base, crit({})).components.openness;
  assert.equal(open, 1);
  assert.equal(closed, 0);
  assert.equal(unknown, 0.5);
});

test("rationale states grantee rates only when known", () => {
  const known = rationale({ ...base, new_grantee_rate: 0.25, repeat_grantee_rate: 0.75 }, crit({}));
  assert.ok(known.some((l) => l.includes("25% of its 2025 grantees were new") && l.includes("75% were repeat")));
  assert.ok(!rationale(base, crit({})).some((l) => l.includes("grantees were new")));
});

test("primary cause counts double: secondary-cause giving cannot replace the core cause", () => {
  const two = crit({ causes: [{ id: "hunger_food" }, { id: "children_youth" }] });
  const childrenOnly = { ...base, cause_mix: { children_youth: { usd: 600_000, n: 25 } } };
  const hungerOnly = { ...base, cause_mix: { hunger_food: { usd: 600_000, n: 25 } } };
  assert.ok(scoreProfile(hungerOnly, two).components.cause! > scoreProfile(childrenOnly, two).components.cause!);
});

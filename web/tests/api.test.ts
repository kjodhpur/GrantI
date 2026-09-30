// Integration test against a running server. Needs a DB loaded from pipeline/make_synthetic.py data:
//   TEST_BASE_URL=http://localhost:3100 TEST_ACCESS_KEY=testkey npm test
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const BASE = process.env.TEST_BASE_URL;
const KEY = process.env.TEST_ACCESS_KEY ?? "";
const TRUTH = new URL("../../data/interim/synthetic/truth.json", import.meta.url);
const skip = !BASE || !existsSync(TRUTH) ? "set TEST_BASE_URL and run pipeline/make_synthetic.py first" : false;
const truth: { ein: string; tag: string }[] = skip ? [] : JSON.parse(readFileSync(TRUTH, "utf8"));
const tagOf = (ein: string) => truth.find((t) => t.ein === ein)?.tag;
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

const QUERY = "We fight childhood hunger and malnutrition internationally, mostly in East Africa. Typical ask is $30,000.";

test("health endpoint sees the index", { skip }, async () => {
  const j = await (await fetch(BASE + "/api/health")).json();
  assert.equal(j.db, "ok");
  assert.ok(j.index.profiles > 300);
});

test("free-text match: planted international child-hunger funders are recalled at the top", { skip }, async () => {
  const res = await post("/api/match", { text: QUERY, limit: 10 });
  assert.equal(res.status, 200);
  const j = await res.json();
  const tags = j.results.map((r: { ein: string }) => tagOf(r.ein));
  const top8 = tags.slice(0, 8);
  const recalled = top8.filter((t: string) => t === "PLANTED_INTL_CHILD_HUNGER").length;
  assert.ok(recalled >= 7, `expected >=7 of 8 planted in top 8, got ${recalled}: ${top8.join(",")}`);
  assert.ok(!tags.includes("DECOY_PRESELECTED_INTL_CHILD_HUNGER"), "preselected-only funders excluded by default");
  assert.ok(!top8.includes("DECOY_DOMESTIC_HUNGER"), "domestic-only hunger funders rank below international ones");
  assert.ok(j.results.every((r: { open_to_apps: boolean }) => r.open_to_apps));
  const first = j.results[0];
  assert.ok(first.rationale.length >= 3);
  assert.ok(first.score >= 60 && first.score <= 100);
});

test("requireOpen=false surfaces preselected-only funders, flagged, with zero access score", { skip }, async () => {
  const j = await (await post("/api/match", { text: QUERY, requireOpen: false, limit: 50 })).json();
  const pre = j.results.filter((r: { ein: string }) => tagOf(r.ein) === "DECOY_PRESELECTED_INTL_CHILD_HUNGER");
  assert.ok(pre.length >= 3);
  assert.ok(pre.every((r: { components: { access: number }; open_to_apps: boolean }) => r.components.access === 0 && !r.open_to_apps));
  assert.ok(pre.some((r: { rationale: string[] }) => r.rationale.some((l) => /pre-selected/.test(l))));
});

test("structured criteria override parsed text; domestic query finds domestic hunger funders", { skip }, async () => {
  const j = await (await post("/api/match", { causes: [{ id: "hunger_food" }], international: false, limit: 20 })).json();
  assert.ok(j.results.length > 0);
  assert.ok(j.results.slice(0, 5).some((r: { ein: string }) => tagOf(r.ein) === "DECOY_DOMESTIC_HUNGER" || tagOf(r.ein) === "PLANTED_INTL_CHILD_HUNGER"));
});

test("no cause in text -> warning, not a guess", { skip }, async () => {
  const j = await (await post("/api/match", { text: "We are a small organization looking for money in Texas" })).json();
  assert.ok(j.warnings.some((w: string) => /No cause was identified/.test(w)));
});

test("validation: bad limit, bad cause id, bad JSON", { skip }, async () => {
  assert.equal((await post("/api/match", { limit: 1000 })).status, 400);
  assert.equal((await post("/api/match", { causes: [{ id: "not_a_cause" }] })).status, 400);
  const bad = await fetch(BASE + "/api/match", { method: "POST", body: "{nope" });
  assert.equal(bad.status, 400);
});

test("SQL injection attempt in text is inert", { skip }, async () => {
  const res = await post("/api/match", { text: "'; DROP TABLE foundation_profiles; -- hunger" });
  assert.equal(res.status, 200);
  assert.equal((await (await fetch(BASE + "/api/health")).json()).db, "ok");
});

test("foundation detail: 200 / 400 / 404", { skip }, async () => {
  const ok = await fetch(BASE + "/api/foundations/000000001");
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).ein, "000000001");
  assert.equal((await fetch(BASE + "/api/foundations/abc")).status, 400);
  assert.equal((await fetch(BASE + "/api/foundations/123456789")).status, 404);
});

test("guarded endpoints: no key -> 401/503, agent without LLM key -> 503", { skip }, async () => {
  const o = await post("/api/outcomes", { org_id: "t", foundation_ein: "000000001", status: "approached" });
  assert.ok([401, 503].includes(o.status));
  const a = await post("/api/agent", { message: "hunger in Kenya" }, KEY ? { "x-api-key": KEY } : {});
  assert.ok([401, 503].includes(a.status));
  if (KEY) assert.equal(a.status, 503, "authorised but ANTHROPIC_API_KEY unset -> 503");
});

test("outcomes round trip feeds prior_outcomes in match results", { skip: skip || !KEY }, async () => {
  const H = { "x-api-key": KEY };
  const ein = truth.find((t) => t.tag === "PLANTED_INTL_CHILD_HUNGER")!.ein;
  assert.equal((await post("/api/outcomes", { org_id: "test-org", foundation_ein: ein, status: "funded", amount_usd: 25000 }, { "x-api-key": "wrong" })).status, 401);
  assert.equal((await post("/api/outcomes", { org_id: "test-org", foundation_ein: "12", status: "funded" }, H)).status, 400);
  assert.equal((await post("/api/outcomes", { org_id: "test-org", foundation_ein: ein, status: "funded", amount_usd: 25000, note: "test" }, H)).status, 201);
  const list = await (await fetch(BASE + "/api/outcomes?org_id=test-org", { headers: H })).json();
  assert.equal(list.outcomes[0].foundation_ein, ein);
  const m = await (await post("/api/match", { text: QUERY, limit: 10 })).json();
  assert.equal(m.results.find((r: { ein: string }) => r.ein === ein).prior_outcomes.funded, 1);
});

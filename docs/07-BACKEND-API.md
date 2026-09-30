# 07 · Backend: the matching agent and API

A nonprofit says what it wants; the backend ranks private foundations from indexed IRS Form 990-PF filings and explains each match from computed facts.

```
data/interim/<year>/*.parquet ──► pipeline/build_profiles.py ──► Postgres foundation_profiles ──► web/app/api/*
   (from build_year.py)            classify grants (classify.py)    one row per foundation          match · agent · outcomes
```

**How "searching the IRS database" works.** The IRS publishes the filings as multi-GB bulk zips, so nothing queries irs.gov per request. `build_year.py` downloads and parses them once; `build_profiles.py` rolls them into one profile per foundation; the API searches that index in Postgres. To refresh, rerun the pipeline (see Refreshing data).

## Endpoints (all under `web/app/api/`)

| Endpoint | Auth | What it does |
|---|---|---|
| `POST /api/match` | none | Deterministic matching. Body: `{ "text": "what we do…" }` and/or structured fields. No LLM, no cost. |
| `POST /api/agent` | `x-api-key` | The LLM agent. Body: `{ "message": "…" }` or `{ "messages": [{role, content}…] }` to continue a chat. Returns `{ answer, results, criteria, stop_reason, searches }`. |
| `GET /api/foundations/{ein}` | none | One foundation's full profile. |
| `POST /api/outcomes` · `GET /api/outcomes?org_id=` | `x-api-key` | Log and read approached/funded/declined results (the moat). Append-only. |
| `GET /api/causes` | none | Cause ids and labels. |
| `GET /api/health` | none | DB status, index size, whether the LLM key is set. Start here when something is off. |

### `POST /api/match`

```bash
curl -X POST $BASE/api/match -H 'content-type: application/json' -d '{
  "text": "We fight childhood hunger internationally, mostly East Africa. Typical ask $30,000."
}'
```

Structured fields (all optional; they **override** anything parsed from `text`):

| Field | Meaning |
|---|---|
| `causes` | `[{ "id": "hunger_food", "weight": 1 }]`, ids from `/api/causes`, up to 5 |
| `states` | US states served, e.g. `["CA","NY"]` |
| `international`, `countries` | Work abroad; ISO-2 country codes refine it |
| `askUsd` | Typical grant they would request |
| `requireOpen` | Default `true`: only foundations that list application contact info |
| `limit` | 1 to 50, default 20 |

Each result has `score` (0-100), `components` (cause, geo, size, capacity, access; `null` = criterion not supplied), `matched_causes`, `rationale` (plain-language lines, each derived from the profile's numbers), `contact` and `deadlines`, `giving` stats, `example_recipients`, and `prior_outcomes` (counts logged by users). The response also carries `warnings` and `caveats`; show the caveats in the UI.

### Score (all in `web/lib/score.ts`, unit-tested)

| Component | Weight | Idea |
|---|---|---|
| cause | 0.45 | Share of the foundation's grant dollars (70%) and grant count (30%) touching each requested cause; 40% of giving = full strength; discounted when it has under 10 grants |
| geo | 0.25 | Share of US dollars into requested states, or foreign share for international; home-state bonus; either geography counts |
| size | 0.15 | Requested ask vs the foundation's middle-half grant range (log distance), penalised above its largest grant ever |
| capacity | 0.10 | Log of total giving and number of grants |
| access | 0.05 | 1 if it lists application contact info, 0.5 unknown, 0 if preselected-only |

Components for criteria the nonprofit did not supply are dropped and the rest renormalised. A requested cause with zero evidence excludes the foundation.

### The agent (`web/lib/agent.ts`)

Claude with three tools (`search_foundations`, `get_foundation`, `list_causes`) over the same matcher. The system prompt forbids stating any number, name, contact or deadline that did not come from a tool result. It uses the SDK tool runner, adaptive thinking, and `fallbacks: "default"`. Model defaults to `claude-opus-5-5`; override with `ANTHROPIC_MODEL`.

## Environment variables

See `.env.example`. On Vercel add `DATABASE_URL`, `APP_ACCESS_KEY` and `ANTHROPIC_API_KEY` for Production and Preview, then redeploy. Without `APP_ACCESS_KEY` the agent and outcomes endpoints return 503 in production by design.

## Classification (what "cause" means here)

`pipeline/classify.py` labels each grant from recipient name + purpose using the keyword vocabulary in `web/lib/taxonomy.json` (shared with the web app so the query parser and the classifier agree). Up to 3 labels per grant, so shares mean "share of dollars **touching** a cause" and can sum past 100%. It is a baseline: expect misses and some false hits. Task 3 in `docs/06-NEXT-TASKS.md` measures it against a hand-labelled sample and adds an LLM pass.

## Refreshing data

```bash
cd pipeline && source .venv/bin/activate
python build_year.py --year 2025                    # repeat for 2024, 2023 (untested for older years)
export DATABASE_URL='<pooled string>'
python build_profiles.py --years 2023 2024 2025 --load
```

`build_profiles.py` truncates and reloads `foundation_profiles`; `outcomes` is never touched. Loading a year list rolls all of them into one profile per EIN.

## Testing without IRS data

`pipeline/make_synthetic.py` writes **fictional** foundations (names end "(SYNTHETIC)", EINs start `00`) with planted ground truth: 8 open funders of international child hunger plus decoys.

```bash
cd pipeline && python make_synthetic.py && python build_profiles.py --interim synthetic --load   # local Postgres only!
cd ../web && npm run build && npm start &
TEST_BASE_URL=http://localhost:3000 TEST_ACCESS_KEY=<your APP_ACCESS_KEY> npm test
```

Unit tests need no server: `npm test` alone runs them and skips the API tests. **Never load synthetic data into the production database.**

## Known limits

- Real-data quality is unmeasured: the classifier and ranking have only been tested on synthetic data. Run the recall check from `docs/06-NEXT-TASKS.md` task 8 on real filings before trusting rankings.
- The agent has been tested against a scripted fake Anthropic server (request shape, tool loop, error handling), not the live API.
- No rate limiting or per-user auth. `/api/match` is public and does a database query per call; add Vercel firewall rules or auth before wider sharing.
- Recipient EIN and NTEE are not in the XML; the Business Master File join is still to do.

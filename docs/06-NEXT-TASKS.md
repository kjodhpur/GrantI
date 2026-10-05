# 06 · Next tasks, in order

**Built already (tested on synthetic data only):** rule-based grant classifier, per-foundation profiles, scoring and ranking, `/api/match`, the Claude agent at `/api/agent`, `/api/outcomes`. See `docs/07-BACKEND-API.md`. The tasks below start from there.

Owners are suggestions from `docs/04-TEAM-WORKFLOW.md`; swap freely. Commit straight to `main`, one commit or more per task.

| # | Task | Suggested owner | Done when |
|---|---|---|---|
| 1 | Run 2026 (newest, partial year; test one zip first) together with 2025, then older years (2022 to 2024); check totals for a few known foundations against ProPublica Nonprofit Explorer (prototyping only, its terms bar commercial redistribution) | Kanha | Row counts per year recorded in this file; parser handles Part XV vs XIV |
| 2 | Business Master File join: recipient EIN and NTEE onto grants | Kanha / Sankalp | Grants Parquet has `recipient_ein` and `ntee`; match rate reported |
| 3 | Classification without paid LLM calls (team decision): keyword rules + recipient NTEE from the BMF join (done) + per-run cache of unique (name, purpose, NTEE). Remaining: measure against a hand-labelled sample | Sankalp | Labeled sample with measured accuracy; unclassified share of grants and dollars reported |
| 4 | Tune scoring weights in `web/lib/score.ts` on real filings; check the agent against the live API and its rationale text | Sankalp | Ranked list for a test profile; agent rationale cites only tool-returned numbers |
| 5 | Foundation profile page: giving size, cause mix, typical grant size, three-year trend | Rithik | `/foundations/[id]` renders from Postgres |
| 6 | Ranking UI: pick cause + geography, see ranked prospects with rationale | Rithik | Works on preview deployment |
| 7 | Outcome logging **UI** on top of `/api/outcomes` (approached, funded, amount, date) | Rithik / Sankalp | Rows persist; survive a pipeline reload |
| 8 | Recall test with the design partner's list of known international child-nutrition funders | Team | Recall at top-N reported |

Task 5 to 7 need the hosted database from `docs/03-VERCEL-SETUP.md`.

# 06 · Next tasks, in order

Owners are suggestions from `docs/04-TEAM-WORKFLOW.md`; swap freely. Commit straight to `main`, one commit or more per task.

| # | Task | Suggested owner | Done when |
|---|---|---|---|
| 1 | Run older years (2022 to 2024); check totals for a few known foundations against ProPublica Nonprofit Explorer (prototyping only, its terms bar commercial redistribution) | Kanha | Row counts per year recorded in this file; parser handles Part XV vs XIV |
| 2 | Business Master File join: recipient EIN and NTEE onto grants | Kanha / Sankalp | Grants Parquet has `recipient_ein` and `ntee`; match rate reported |
| 3 | LLM classification of cause and geography from recipient name + NTEE + purpose (never purpose alone). Batch API; start with a 10,000-grant sample and hand-check 100 | Sankalp | Labeled sample with measured accuracy; cost per 1M grants estimated |
| 4 | Ranking features and scores per foundation for a given cause and geography; LLM writes the rationale from computed facts only | Sankalp | Ranked list for a test profile; rationale cites only computed numbers |
| 5 | Foundation profile page: giving size, cause mix, typical grant size, three-year trend | Rithik | `/foundations/[id]` renders from Postgres |
| 6 | Ranking UI: pick cause + geography, see ranked prospects with rationale | Rithik | Works on preview deployment |
| 7 | Outcome logging UI writing to `outcomes` (approached, funded, amount, date) | Rithik / Sankalp | Rows persist; survive a pipeline reload |
| 8 | Recall test with the design partner's list of known international child-nutrition funders | Team | Recall at top-N reported |

Task 5 to 7 need the hosted database from `docs/03-VERCEL-SETUP.md`.

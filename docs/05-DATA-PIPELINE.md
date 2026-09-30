# 05 · Data pipeline

```
IRS index CSV + monthly zips ──► build_year.py ──► data/interim/<year>/*.parquet
   (free, no key)                 parse_990pf.py     grants, filings, officers
                                                          │
                                   build_foundations.py ◄─┘ (DuckDB rollup)
                                          │
                     data/processed/foundations_<year>.parquet ──► Postgres `foundations` ──► web/ (starter page)

data/interim/<year>/*.parquet ──► build_profiles.py (classify.py) ──► Postgres `foundation_profiles` ──► web/app/api (matching)
```

The matching backend reads `foundation_profiles`, built by `build_profiles.py`. See `docs/07-BACKEND-API.md`.

## Design decisions

- **Raw grants stay in Parquet** and are queried with DuckDB (about 68 MB for 2.0M rows in 2025). Postgres holds only app tables: `foundations`, and `outcomes` (customer results, which is our moat).
- The IRS zips use **Deflate64**, which Python's `zipfile` cannot read, so `parse_990pf.py` uses `inflate64`.
- **Open to applications** is a filter, not proof. It means the filer did not tick "contributions only to preselected charities" and listed application contact info. Check top matches against foundation websites.

## What the parser extracts

Grants paid (`GrantOrContributionPdDurYrGrp`) and approved for future payment (`GrantOrContriApprvForFutGrp`); the preselected-only flag; application contact, form/materials text, deadlines and restrictions; officers.

## What we measured on the full 2025 postings

130,347 filings, 2.08M grant rows in 317 seconds. Of 98,506 grant-paying filings, 76.7% are preselected-only. Recipient EIN and NTEE are **not** in the XML; that needs a join to the IRS Business Master File (next task). Filing years other than 2025 are untested; test before promising five years of history.

## Next tasks, in order

1. Run older years (2022 to 2024) and check totals for a few known foundations against ProPublica.
2. Business Master File join for recipient EIN and NTEE.
3. LLM classification on recipient name, NTEE and purpose together (never purpose alone: 42% of purposes are generic). Batch API, 10,000-grant sample first.
4. ~~Ranking features and scores~~ built (`web/lib/score.ts`); tune on real data.
5. Outcome logging **API** built (`/api/outcomes`); the UI is still to do.

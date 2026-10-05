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

## Years and file layout (checked 2026-10)

- Zip names differ by posting year: 2019-2020 `download990xml_<year>_N.zip` (plus a `_CT1` zip with no 990-PF), 2021-2022 `<year>_TEOS_XML_01A.zip`, 2023+ monthly `<year>_TEOS_XML_MMx.zip`. Index files before 2024 have no `XML_BATCH_ID` column, so `build_year.py` reads zip names from the IRS downloads page, then probes the server for monthly zips the page does not link: `2022_TEOS_XML_02A` is unlisted and holds 37,237 of 2022's 117,073 990-PFs.
- Zips with no 990-PF leave a `<zip>.empty` marker instead of empty Parquet.
- Older schemas parse with the same code: on a 2019 zip (schema 2017v2.2 to 2018v3.1) the parsed grants matched the reported total on 309 of 309 grant-paying filings.
- Set `GPI_DATA_DIR` to keep data outside the repo (the repo may sit in a synced OneDrive folder; a year downloads 2.6 to 4.5 GB, deleted zip by zip).

Coverage, parsed 990-PF filings vs the IRS index for that posting year:

| Posting year | 990-PF in index | Parsed | Paid grants |
|---|---|---|---|
| 2019 | 64,614 | 52,106 (81%) | 599,776 |
| 2020 | 27,883 | 7,614 (27%) | 86,705 |
| 2021 | 108,644 | 100% | 1,867,738 |
| 2022 | 117,073 | 100% | 2,000,636 |
| 2023 | 124,666 | 100% | 2,070,501 |
| 2024 | 126,982 | 100% | 1,715,216 |
| 2025 | 130,347 | 100% | 2,023,946 |
| 2026 (to Aug) | 79,686 | 100% | 820,251 |

The 32,777 filings missing from 2019 and 2020 (object ids from 2018 and 2019) are not in any zip on the server, including other years. They are tax years 2016 to 2018, older than any profile's 3-year window, so they affect only foundations that stopped filing after 2018.

## What the parser extracts

Grants paid (`GrantOrContributionPdDurYrGrp`, about 17% of them to individuals: those keep only amount, purpose, state/country and `is_individual`, never the person's name, city, ZIP or relationship) and approved for future payment (`GrantOrContriApprvForFutGrp`); the preselected-only flag; application contact, form/materials text, deadlines and restrictions; officers.

## What we measured on the full 2025 postings

130,347 filings, 2.08M grant rows in 317 seconds. Of 98,506 grant-paying filings, 76.7% are preselected-only. Recipient EIN and NTEE are **not** in the XML; that needs a join to the IRS Business Master File (next task). Filing years other than 2025 are untested; test before promising five years of history.

## Next tasks, in order

1. Run older years (2022 to 2024) and check totals for a few known foundations against ProPublica.
2. Business Master File join for recipient EIN and NTEE.
3. LLM classification on recipient name, NTEE and purpose together (never purpose alone: 42% of purposes are generic). Batch API, 10,000-grant sample first.
4. ~~Ranking features and scores~~ built (`web/lib/score.ts`); tune on real data.
5. Outcome logging **API** built (`/api/outcomes`); the UI is still to do.

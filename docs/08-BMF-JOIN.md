# 08 · Recipient join to the IRS Business Master File

990-PF grant rows name the recipient but carry no EIN or NTEE code. `pipeline/resolve.py` matches recipients to the IRS Exempt Organizations Business Master File (EO BMF, `eo1.csv` to `eo4.csv`, 1,964,956 organizations) so grants get the recipient's EIN and NTEE code, which is a far stronger cause signal than purpose text like "GENERAL SUPPORT".

```bash
cd pipeline
python resolve.py --download                 # eo1-eo4.csv into $GPI_DATA_DIR/bmf (~340 MB)
python resolve.py --years 2019 2020 2021 2022 2023 2024 2025 2026   # -> resolved/recipients.parquet + report.md (~35 min)
```

`build_profiles.py` uses the result automatically when `resolved/recipients.parquet` exists (recipient identity for the new-grantee rate); `resolve.attach(grants)` adds `recipient_ein`, `recipient_ntee` and `match_confidence` to any grants frame.

## Method

1. **Normalize** names: uppercase, `&` to AND, drop punctuation and legal suffixes (INC, CORP, THE, LLC…), expand common abbreviations (FDN, ASSN, UNIV…), strip legal prefixes (TRUSTEES OF, PRESIDENT AND FELLOWS OF, REGENTS OF).
2. **Exact** normalized name in the same state. Several same-name organizations (e.g. many "FIRST BAPTIST CHURCH" in one state) are decided by city; if the city does not decide, no EIN is attached, but the NTEE major group is kept when every candidate shares it.
3. **Fuzzy** (rapidfuzz `token_sort_ratio`) only within the same state and a shared first or longest word, with a city bonus or penalty. Every word of the shorter name must closely match a word in the other, and words of 4 letters or fewer must match exactly, so "STANFORD" never becomes "STANDARD" and "CSUB" never becomes "CUB".
4. A match is attached at confidence **0.90** or above. Grants to individuals and to foreign recipients are skipped (the BMF covers US organizations).

## Results (2025 + 2026 postings, 968,094 distinct US organization recipients)

| | distinct recipients | grants | dollars |
|---|---|---|---|
| EIN matched | 49.0% | 60.5% | 54.6% |
| NTEE code known | 39.9% | 50.8% | 49.6% |

All 8 posting years (2019 to 2026, 1,817,623 distinct US organization recipients): EIN matched for 36.1% of distinct recipients, 59.4% of grants and 49.8% of dollars; NTEE known for 29.4% / 49.6% / 45.0%. The share of distinct recipients falls because older years add a long tail of one-off names; coverage by grants barely changes.

NTEE coverage is below the EIN match rate because 29% of BMF records have no NTEE code. By method: exact 416,501; fuzzy accepted or rejected 185,781; city-decided 15,189; same-name ties 7,323; no candidate 343,300.

## Why recipients stay unmatched

Spot-checks of the largest unmatched recipients by dollars:

- **Not a recipient name**: "SEE ATTACHED STATEMENT", "VARIOUS NEEDY PATIENTS", "See Statement 16".
- **Not in the BMF**: public universities and school districts (government units, e.g. "UNIVERSITY OF MICHIGAN", "MSD OF WARREN TOWNSHIP"), foreign-incorporated bodies such as the World Bank.
- **Different legal name**: "MASSACHUSETTS GENERAL HOSPITAL" is filed as "THE GENERAL HOSPITAL CORPORATION"; donor-advised fund sponsors ("FIDELITY CHARITABLE" is "FIDELITY INVESTMENTS CHARITABLE GIFT FUND"). An alias list for the most common of these is a cheap next step.

## Precision near the threshold

`resolved/report.md` (git-ignored, regenerated each run) lists a random 50 fuzzy matches scored 0.85 to 0.93 for hand checking. In the first sample, 6 of 8 accepted matches near the threshold were correct; the errors (a 4-letter acronym off by one letter, and HARBOR vs HARBOUR FOUNDATION) led to the short-word rule. After it, 6 of 7 accepted near-threshold matches in a new sample were correct; the remaining error type is a short recipient name contained in a longer, different organization's name ("WISCONSIN UNIVERSITY" vs "WISCONSIN UNIVERSITY UNION"). Rejected examples just below the threshold were mostly correctly rejected (e.g. "UNITARIAN CHURCH IN CHARLESTON" vs "UNITY CHURCH OF CHARLESTON"), with some true matches lost (e.g. "VERA INSTITUTE FOR SOCIAL JUSTICE" vs "VERA INSTITUTE OF JUSTICE"). A full precision estimate needs a hand-labelled sample of accepted matches across the 0.90 to 0.99 range.

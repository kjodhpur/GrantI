# 00 · Project context (read this first)

Team 6, CIS 568. Kanha (repo, Vercel, pipeline), Rithik (web app, ranking UI), Sankalp (classification, scoring, outcomes).

## The product

**Grant Prospect Intelligence** reads private foundations' public IRS Form 990-PF filings and ranks the funders most likely to support a given nonprofit's cause and geography.

- **Why the data is hard:** Part XIV of every 990-PF lists each grant paid (recipient, amount, free-text purpose). It is a complete public record, but the purpose field is prose, so it cannot be searched or scored at scale without classification.
- **What is broken today:** a development officer reads filings by hand (about a day per twenty foundations) or pays $1,199 to $11,988 a year for a keyword database (Candid Foundation Directory, Instrumentl). Those return search results, not a judgment of who would actually fund you.
- **Why now:** e-filing of 990-PF is mandatory and the IRS publishes the XML free; LLMs make classifying millions of grant purposes cheap; USAID cuts and other aid reductions have pushed nonprofits to hunt for replacement funding.

## Customer

- **Buyer:** Executive Director or Development Director at a U.S. 501(c)(3) with a $500K to $10M budget.
- **User:** the grant writer or development associate, often part time, often the same person.
- **Design partner:** a newly formed childhood-hunger nonprofit, agreed as anchor customer. They provide a contact, a target-funder profile, a recall-test list of foundations known to fund international child nutrition, and practitioner review of our ranked output. **Their name and materials stay out of this public repo** (ask Kanha for the private folder). No donor data or PII is ever used; demos use synthetic data.

## v1 scope

In: private-foundation prospecting across the 990-PF universe; cause and geography classification of historical grants (including domestic vs international); a ranked prospect list with a plain-language rationale per score; a foundation profile (giving size, cause mix, typical grant size, three-year trend).

Out: corporate, government and individual-donor prospecting; grant writing; relationship management; outreach. **We rank prospects; we do not contact them.**

## The moat (design for it from day one)

An outcome-linked dataset that cannot be built from public records. Filings show what foundations funded, never which approaches worked. Customers record which prospects they approached and which funded; that accumulates in the `outcomes` table and improves ranking. A competitor can rebuild the public data in weeks; outcomes take a full grant cycle (6 to 12 months). Treat the `outcomes` table as precious: schema changes must never truncate it.

## Architecture

```
IRS index CSV + monthly zips -> pipeline/build_year.py -> data/interim/<year>/*.parquet
   (free, no key)               (parse_990pf.py)          grants, filings, officers
                                                              |
pipeline/build_foundations.py (DuckDB rollup) <---------------+
   -> data/processed/foundations_<year>.parquet -> Postgres `foundations` -> web/ (Next.js on Vercel)
```

- Raw grants stay in Parquet, queried with DuckDB. Postgres holds only app tables: `foundations` and `outcomes`.
- IRS zips use Deflate64, which Python's `zipfile` cannot read, so `parse_990pf.py` uses `inflate64`.
- "Open to applications" is a **filter, not proof**: the filer did not tick "contributions only to preselected charities" and listed application contact info. Verify top matches on foundation websites.
- Recipient EIN and NTEE are **not** in the XML; they need a join to the IRS Business Master File.

## Measured facts (2025 postings)

- 130,347 filings, 2.08M grant rows, parsed in about 317 seconds.
- 98,506 grant-paying filings; 76.7% are preselected-only.
- First zip (`2025_TEOS_XML_01A`): 2,292 filings, 21,259 grant rows.
- 42% of grant purposes are generic, so **never classify on purpose text alone**: use recipient name + NTEE + purpose together.
- Years other than 2025 are untested. Do not promise five years of history until checked.
- Form redesign: grants were in Part XV before 2023 and are in Part XIV after. Check the parser against older years.

## What was tested and what was not

Tested: pipeline on real IRS zips, Postgres load, Next.js build and runtime query, the missing-`DATABASE_URL` message.
Not tested: `docker compose` (YAML validated only), full-history years, classification accuracy on a hand-labelled sample (the project makes no paid LLM calls: labels come from keywords + recipient NTEE).

## Rules

1. No secrets in git: `.env*`, API keys, DB passwords. Rotate immediately if leaked.
2. No client materials: briefs, funder lists, contact names, donor data, `*.docx`, `*.pptx`.
3. No `data/` in git (IRS files, Parquet). Share processed files by drive.
4. The LLM writes rationales **from computed facts only**; it never invents numbers.
5. Hobby plan is non-commercial. Keep this a class project until the plan changes.

## Next tasks

See `docs/06-NEXT-TASKS.md`.

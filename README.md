# Grant Prospect Intelligence (Team 6, CIS 568)

Ranks private foundations most likely to fund a nonprofit, using IRS Form 990-PF filings.

```
pipeline/   Python: download IRS zips, parse 990-PF XML, roll up to foundations, load Postgres
web/        Next.js app (deployed on Vercel): the public search page, foundation profiles, and the /api backend. Reads Postgres.
docs/       Setup guides. Start with 01 and work down.
data/       Local only, git-ignored (IRS files and Parquet, several GB for a full year)
```

## 10-minute quick start (works offline after the first data download)

```bash
cp .env.example .env && cp .env.example web/.env.local
docker compose up -d                               # Postgres on localhost:5432
cd pipeline && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python build_year.py --year 2025 --only 2025_TEOS_XML_01A    # ~10 seconds, ~2,300 filings
export DATABASE_URL=postgresql://gpi:gpi@localhost:5432/gpi
python build_foundations.py --year 2025 --load
cd ../web && npm install && npm run dev            # http://localhost:3000
```

| Guide | What it covers |
|---|---|
| docs/00-PROJECT-CONTEXT.md | **Start here.** Product, customer, moat, architecture, measured facts |
| docs/01-GITHUB-SETUP.md | Create the repo, add teammates, branch and PR rules |
| docs/02-LOCAL-SETUP.md | Run everything on a laptop, offline |
| docs/03-VERCEL-SETUP.md | Connect the repo to a new Vercel project and a hosted database |
| docs/04-TEAM-WORKFLOW.md | Who works on what, daily habits, do-not-commit list |
| docs/05-DATA-PIPELINE.md | What the pipeline does and how to extend it |
| docs/06-NEXT-TASKS.md | Ordered backlog with suggested owners |
| docs/07-BACKEND-API.md | The matching agent, API endpoints, scoring, testing without IRS data |

**Confidentiality:** no documents from the design-partner client, lists, names of their contacts or donor data in this repo, ever.

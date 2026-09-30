# Grant Prospect Intelligence (Team 6, CIS 568)

Ranks private foundations most likely to fund a nonprofit, from IRS Form 990-PF filings.

Read `docs/00-PROJECT-CONTEXT.md` first (product, customer, moat, measured facts), then `docs/06-NEXT-TASKS.md`.

## Layout

- `pipeline/` Python: download IRS zips, parse 990-PF XML (`parse_990pf.py`), roll up (`build_foundations.py`, DuckDB), load Postgres. Schema in `pipeline/schema.sql`.
- `web/` Next.js app deployed on Vercel (Root Directory = `web`). Reads Postgres via `web/lib/db.ts`. **Next.js here has breaking changes: read `web/AGENTS.md` and `node_modules/next/dist/docs/` before writing code.**
- `docs/` setup guides 01 to 06. `data/` is git-ignored.

## Commands

- Web: `cd web && npm install && npm run dev`; before merging `npm run build && npm run lint`.
- Pipeline: `cd pipeline && pip install -r requirements.txt && python build_year.py --year 2025 --only 2025_TEOS_XML_01A`, then `python build_foundations.py --year 2025 --load` with `DATABASE_URL` set.
- Local DB: `docker compose up -d` (user/password/db all `gpi`).

## Hard rules

- Never commit `.env*`, secrets, `data/`, or anything from the client (briefs, funder lists, contact names, donor data, `*.docx`, `*.pptx`). The repo is public.
- Do not name the design-partner client in code, docs, commits or PRs.
- `foundations` is truncated and reloaded by the pipeline; `outcomes` must never be truncated or dropped.
- LLM output must come from computed facts only; classify on recipient name + NTEE + purpose, never purpose alone.
- Commit and push straight to `main` (team decision: no pull requests). Run `cd web && npm run build && npm run lint` first, and `git pull --rebase` before pushing.

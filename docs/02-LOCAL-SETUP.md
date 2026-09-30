# 02 · Run everything locally (offline capable)

You need internet once, to install tools and to download IRS data. After that the app, database and parsed data all run without a connection.

## Install once

- Git, Node 20+ (22 is what we tested), Python 3.10+ (3.11 tested), Docker Desktop.
- Docker is optional if you prefer to install Postgres 16 yourself; then set `DATABASE_URL` to it.

## Steps

1. `cp .env.example .env` and `cp .env.example web/.env.local`
2. `docker compose up -d` starts Postgres on port 5432 (user/password/db all `gpi`). Data survives restarts in the `pgdata` volume. Stop with `docker compose down`.
3. Pipeline:
   ```bash
   cd pipeline
   python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   python build_year.py --year 2025 --only 2025_TEOS_XML_01A
   export DATABASE_URL=postgresql://gpi:gpi@localhost:5432/gpi   # Windows PowerShell: $env:DATABASE_URL="..."
   python build_foundations.py --year 2025 --load
   ```
   Expected: about 2,292 filings, 21,259 grant rows from the first zip; loads in seconds.
4. Web: `cd web && npm install && npm run dev`, open http://localhost:3000. The page lists foundations with an "open to applications" filter. If you see "DATABASE_URL is not set", check `web/.env.local`.

## Getting a full year

`python build_year.py --year 2025` downloads every monthly zip (about 4.5 GB in total across form types, deleted after parsing) and parses all 990-PF returns. We measured about 5 minutes on a fast connection for the 2025 postings (130,347 filings, 2.08M grant rows). It is safe to re-run: finished zips are skipped. Do this **once, on one machine**. Then share `data/processed/foundations_2025.parquet` (small, tens of MB at most) with teammates by drive. They drop it in their own `data/processed/` and run `python build_foundations.py --year 2025 --load-only`, with no re-download.

## Offline days

Everything after the download is local: Docker Postgres, `npm run dev`, DuckDB over the Parquet files. The only online needs are `git push/pull`, IRS downloads and (later) LLM calls.

## Troubleshooting

- `remotezip`/`inflate64` install errors: upgrade pip (`pip install -U pip`); on Windows install Microsoft C++ Build Tools if a wheel is missing.
- IRS connection resets: the downloader retries with backoff on its own. Run one job at a time.
- Port 5432 busy: change the left side of `5432:5432` in docker-compose.yml and in your `DATABASE_URL`.
- The IRS index sometimes lists a filing under the wrong zip letter (05A vs 05B). The direct-download path here parses whole zips so it is not affected.

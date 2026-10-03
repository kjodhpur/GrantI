"""Roll parsed filings up to one row per foundation (its latest filing) and optionally load Postgres.

  python build_foundations.py --years 2025                     # writes data/processed/foundations_2025.parquet
  python build_foundations.py --years 2019 2020 ... 2026 --load   # latest filing per EIN across years, then load
  python build_foundations.py --years 2025 --load-only         # load an existing processed parquet (no interim data)

Several posting years hold several filings per EIN (and amended returns); only the newest
tax period (newest return within it) is kept, so the table has one row per foundation.
"""
import argparse, glob, os
import duckdb

ROOT = os.environ.get("GPI_DATA_DIR") or os.path.join(os.path.dirname(__file__), "..", "data")


def out_path(years):
    return os.path.join(ROOT, "processed", f"foundations_{'_'.join(sorted(years))}.parquet")


def build(years):
    dirs = [os.path.join(ROOT, "interim", y).replace("\\", "/") for y in years]
    for d in dirs:
        if not glob.glob(os.path.join(d, "*_filings.parquet")):
            raise SystemExit(f"no parsed data in {d}. Run build_year.py first.")
    os.makedirs(os.path.join(ROOT, "processed"), exist_ok=True)
    out = out_path(years)
    fl = ", ".join(f"'{d}/*_filings.parquet'" for d in dirs)
    gl = ", ".join(f"'{d}/*_grants.parquet'" for d in dirs)
    con = duckdb.connect()
    con.execute(f"""
    COPY (
      WITH f AS (SELECT * FROM read_parquet([{fl}], union_by_name=true)
                 QUALIFY row_number() OVER (PARTITION BY ein
                   ORDER BY tax_period_end DESC, return_ts DESC, object_id DESC) = 1),
      g AS (SELECT * FROM read_parquet([{gl}], union_by_name=true) WHERE object_id IN (SELECT object_id FROM f)),
      agg AS (
        SELECT object_id,
          count(*) FILTER (WHERE amount_type='paid') AS grants_paid_n,
          coalesce(sum(amount_usd) FILTER (WHERE amount_type='paid'),0) AS grants_paid_usd,
          median(amount_usd) FILTER (WHERE amount_type='paid') AS median_grant_usd,
          count(*) FILTER (WHERE amount_type='paid' AND recipient_country IS NOT NULL AND recipient_country <> 'US') AS foreign_grants_n,
          count(*) FILTER (WHERE amount_type='approved_future') AS approved_future_n,
          coalesce(sum(amount_usd) FILTER (WHERE amount_type='approved_future'),0) AS approved_future_usd
        FROM g GROUP BY object_id)
      SELECT f.object_id, f.ein, f.funder_name AS name, f.funder_state AS state,
        TRY_CAST(f.tax_period_end AS DATE) AS tax_period_end,
        (f.only_preselected IN ('X','true','1')) AS only_preselected,
        (coalesce(f.only_preselected,'') NOT IN ('X','true','1')
           AND (f.app_contact_name IS NOT NULL OR f.app_contact_email IS NOT NULL OR f.app_contact_phone IS NOT NULL)) AS open_to_apps,
        f.app_contact_name AS contact_name, f.app_contact_email AS contact_email,
        f.app_contact_phone AS contact_phone, f.app_deadlines AS deadlines,
        coalesce(a.grants_paid_n,0)::INTEGER AS grants_paid_n, coalesce(a.grants_paid_usd,0)::BIGINT AS grants_paid_usd,
        a.median_grant_usd, coalesce(a.foreign_grants_n,0)::INTEGER AS foreign_grants_n,
        coalesce(a.approved_future_n,0)::INTEGER AS approved_future_n,
        coalesce(a.approved_future_usd,0)::BIGINT AS approved_future_usd,
        f.xml_batch_id
      FROM f LEFT JOIN agg a USING (object_id)
    ) TO '{out}' (FORMAT PARQUET)""")
    n = con.execute(f"SELECT count(*) FROM read_parquet('{out}')").fetchone()[0]
    print(f"{n:,} foundations (latest filing each) -> {out}")
    return out


def load(path):
    import psycopg
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("Set DATABASE_URL (see .env.example)")
    schema = open(os.path.join(os.path.dirname(__file__), "schema.sql")).read()
    rows = duckdb.connect().execute(f"SELECT * FROM read_parquet('{path}')").fetchall()
    cols = [c[0] for c in duckdb.connect().execute(f"DESCRIBE SELECT * FROM read_parquet('{path}')").fetchall()]
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute(schema)
        cur.execute("TRUNCATE foundations")
        with cur.copy(f"COPY foundations ({','.join(cols)}) FROM STDIN") as cp:
            for r in rows:
                cp.write_row(r)
    print(f"loaded {len(rows):,} rows into Postgres")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", "--year", nargs="+", required=True)
    ap.add_argument("--load", action="store_true")
    ap.add_argument("--load-only", action="store_true")
    a = ap.parse_args()
    p = out_path(a.years) if a.load_only else build(a.years)
    if a.load or a.load_only:
        load(p)

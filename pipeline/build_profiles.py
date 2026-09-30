"""Roll parsed filings + grants up to one profile per foundation, classify grants, optionally load Postgres.

  python build_profiles.py --years 2025                      # -> data/processed/profiles.parquet
  python build_profiles.py --years 2023 2024 2025 --load     # multi-year rollup, then load $DATABASE_URL
  python build_profiles.py --load-only                       # load an existing profiles.parquet (no interim data)
  python build_profiles.py --interim synthetic --load        # use data/interim/synthetic (see make_synthetic.py)

Reads data/interim/<year>/*_{filings,grants}.parquet written by build_year.py. Only 'paid' grants count.
The profile table is truncated and reloaded each run; the `outcomes` table is never touched.
"""
import argparse
import glob
import json
import os

import numpy as np
import pandas as pd

from classify import Classifier, UNCLASSIFIED

ROOT = os.path.join(os.path.dirname(__file__), "..", "data")
OUT = os.path.join(ROOT, "processed", "profiles.parquet")
CAUSE_ARRAY_MIN_SHARE = 0.10   # a cause is a foundation's "focus" when it holds >=10% of classified dollars
STATE_ARRAY_MIN_SHARE = 0.05
TOP_RECIPIENTS = 5


def read_dirs(dirs):
    def read(pattern):
        files = [f for d in dirs for f in glob.glob(os.path.join(d, pattern))]
        if not files:
            raise SystemExit(f"no files matching {pattern} in {dirs}. Run build_year.py first.")
        return pd.concat([pd.read_parquet(f) for f in files], ignore_index=True)
    return read("*_filings.parquet"), read("*_grants.parquet")


def truthy(v):
    return str(v).strip().lower() in ("x", "true", "1")


def q(s, p):
    return float(np.quantile(s, p)) if len(s) else None


def nested(df, key, sub):
    """{ein: {sub_value: {usd, n}}} from a frame with columns [funder_ein, sub, usd, n]."""
    out = {}
    for ein, k, usd, n in zip(df.funder_ein, df[sub], df.usd, df.n):
        out.setdefault(ein, {})[str(k)] = {"usd": int(usd), "n": int(n)}
    return out


def sums(df, by):
    return df.groupby(by).agg(usd=("amount_usd", "sum"), n=("amount_usd", "size")).reset_index()


def build(dirs, intermediary_ids):
    filings, grants = read_dirs(dirs)
    filings = filings.drop_duplicates("object_id")
    filings["tax_year"] = pd.to_datetime(filings["tax_period_end"], errors="coerce").dt.year
    g = grants[(grants.amount_type == "paid") & grants.amount_usd.notna() & (grants.amount_usd > 0)].copy()
    g = g.merge(filings[["object_id", "tax_year"]], on="object_id", how="left").reset_index(drop=True)
    print(f"{len(filings):,} filings, {len(g):,} paid grants; classifying...")
    g["cause_list"] = Classifier().classify_frame(g)
    g["cause"] = g.cause_list.str[0]                                    # primary label, for display
    g["country"] = g["recipient_country"].fillna("US")
    g["is_foreign"] = g["country"] != "US"
    ge = g.explode("cause_list").rename(columns={"cause_list": "c"})    # one row per (grant, label); index = grant
    real = ge[~ge.c.isin([UNCLASSIFIED, *intermediary_ids])]

    basic = g.groupby("funder_ein").amount_usd.agg(grants_n="size", grants_usd="sum", max_grant_usd="max")
    qs = g.groupby("funder_ein").amount_usd.quantile([.25, .5, .75]).unstack()
    foreign_usd = g[g.is_foreign].groupby("funder_ein").amount_usd.sum()
    cls_usd = g[g.index.isin(real.index)].groupby("funder_ein").amount_usd.sum()
    mix = nested(sums(real, ["funder_ein", "c"]), "funder_ein", "c")
    geo_s = nested(sums(g[~g.is_foreign & g.recipient_state.notna()], ["funder_ein", "recipient_state"]), "funder_ein", "recipient_state")
    geo_c = nested(sums(g[g.is_foreign], ["funder_ein", "country"]), "funder_ein", "country")
    trend = nested(sums(g[g.tax_year.notna()].assign(y=lambda d: d.tax_year.astype(int)), ["funder_ein", "y"]), "funder_ein", "y")
    top = {}
    for r in g.sort_values("amount_usd", ascending=False).groupby("funder_ein").head(TOP_RECIPIENTS).itertuples():
        top.setdefault(r.funder_ein, []).append(dict(
            name=None if pd.isna(r.recipient_name_raw) else r.recipient_name_raw,
            state=None if pd.isna(r.recipient_state) else r.recipient_state,
            country=r.country, cause=r.cause, usd=int(r.amount_usd)))

    latest = filings.sort_values(["ein", "tax_period_end", "object_id"]).groupby("ein").tail(1).set_index("ein")
    rows = []
    for ein, b in basic.iterrows():
        if ein not in latest.index:
            continue
        f = latest.loc[ein]
        usd = int(b.grants_usd)
        cu = float(cls_usd.get(ein, 0))
        m, gs, gc = mix.get(ein, {}), geo_s.get(ein, {}), geo_c.get(ein, {})
        us_usd = sum(v["usd"] for v in gs.values())
        pre = truthy(f.get("only_preselected"))
        has_contact = any(pd.notna(f.get(k)) for k in ("app_contact_name", "app_contact_email", "app_contact_phone"))
        rows.append(dict(
            ein=ein, name=f.funder_name, state=f.funder_state,
            latest_tax_period=pd.to_datetime(f.tax_period_end, errors="coerce"),
            years=sorted(int(y) for y in trend.get(ein, {})),
            only_preselected=pre, open_to_apps=bool((not pre) and has_contact),
            contact_name=f.get("app_contact_name"), contact_email=f.get("app_contact_email"),
            contact_phone=f.get("app_contact_phone"), deadlines=f.get("app_deadlines"),
            app_materials=f.get("app_form_materials"), app_restrictions=f.get("app_restrictions"),
            grants_n=int(b.grants_n), grants_usd=usd,
            median_grant_usd=float(qs.loc[ein, .5]), p25_grant_usd=float(qs.loc[ein, .25]), p75_grant_usd=float(qs.loc[ein, .75]),
            max_grant_usd=int(b.max_grant_usd),
            foreign_share=float(foreign_usd.get(ein, 0)) / usd if usd else 0.0,
            classified_share=cu / usd if usd else 0.0,
            causes=[c for c, v in m.items() if cu and v["usd"] / cu >= CAUSE_ARRAY_MIN_SHARE],
            states=[s for s, v in gs.items() if us_usd and v["usd"] / us_usd >= STATE_ARRAY_MIN_SHARE],
            countries=sorted(gc),
            cause_mix=json.dumps(m), geo_states=json.dumps(gs), geo_countries=json.dumps(gc),
            top_recipients=json.dumps(top.get(ein, [])), trend=json.dumps(trend.get(ein, {})),
        ))
    df = pd.DataFrame(rows)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    df.to_parquet(OUT)
    print(f"{len(df):,} foundation profiles -> {OUT}")
    return df


JSON_COLS = ("cause_mix", "geo_states", "geo_countries", "top_recipients", "trend")


def load(df):
    import psycopg
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("Set DATABASE_URL (see .env.example)")
    schema = open(os.path.join(os.path.dirname(__file__), "schema.sql")).read()
    cols = list(df.columns)
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        cur.execute(schema)
        cur.execute("TRUNCATE foundation_profiles")   # outcomes is deliberately untouched
        with cur.copy(f"COPY foundation_profiles ({','.join(cols)}) FROM STDIN") as cp:
            for r in df.itertuples(index=False):
                vals = []
                for c, v in zip(cols, r):
                    if isinstance(v, np.ndarray):
                        v = v.tolist()
                    if v is pd.NaT or (not isinstance(v, (list, str)) and pd.isna(v)):
                        v = None
                    elif isinstance(v, pd.Timestamp):
                        v = v.date()
                    vals.append(v)
                cp.write_row(vals)
    print(f"loaded {len(df):,} profiles into Postgres")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", nargs="*", default=[])
    ap.add_argument("--interim", nargs="*", default=[], help="extra data/interim/<name> folders (e.g. synthetic)")
    ap.add_argument("--load", action="store_true")
    ap.add_argument("--load-only", action="store_true")
    a = ap.parse_args()
    if a.load_only:
        df = pd.read_parquet(OUT)
    else:
        names = a.years + a.interim
        if not names:
            raise SystemExit("give --years 2025 [2024 ...] or --interim synthetic")
        tax = json.load(open(os.path.join(os.path.dirname(__file__), "..", "web", "lib", "taxonomy.json")))
        inter = [c["id"] for c in tax["causes"] if c.get("excluded_from_matching")]
        df = build([os.path.join(ROOT, "interim", n) for n in names], inter)
    if a.load or a.load_only:
        load(df)

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

import resolve
from classify import Classifier, UNCLASSIFIED

ROOT = os.environ.get("GPI_DATA_DIR") or os.path.join(os.path.dirname(__file__), "..", "data")
OUT = os.path.join(ROOT, "processed", "profiles.parquet")
CAUSE_ARRAY_MIN_SHARE = 0.10   # a cause is a foundation's "focus" when it holds >=10% of classified dollars
STATE_ARRAY_MIN_SHARE = 0.05
TOP_RECIPIENTS = 5
INDIVIDUAL = "Individual recipient (name not stored)"
# Shared with web/lib/score.ts so pipeline and app agree on what counts as a grant.
CFG = json.load(open(os.path.join(os.path.dirname(__file__), "..", "web", "lib", "scoring-config.json")))
MIN_COUNTED = CFG["min_counted_grant_usd"]     # smaller grants count in dollar totals, not in counts or sizes
LOOKBACK = CFG["grantee_lookback_years"]
PROFILE_YEARS = CFG["profile_tax_years"]       # each profile covers its foundation's latest N tax years
GRANT_COLS = ["object_id", "funder_ein", "amount_type", "recipient_name_raw", "is_individual", "recipient_city",
              "recipient_state", "recipient_country", "grant_purpose", "amount_usd"]


def files(dirs, pattern):
    found = [f for d in dirs for f in glob.glob(os.path.join(d, pattern))]
    if not found:
        raise SystemExit(f"no files matching {pattern} in {dirs}. Run build_year.py first.")
    return found


def read_grants(dirs, keep_ids):
    """Paid grants of the kept filings only, file by file, so many posting years fit in memory."""
    import pyarrow.parquet as pq
    parts = []
    for f in files(dirs, "*_grants.parquet"):
        if "is_individual" not in pq.read_schema(f).names:
            raise SystemExit(f"{f} predates the individual-recipient privacy fix (no is_individual column). "
                             "Delete data/interim/<year> and rerun build_year.py.")
        d = pd.read_parquet(f, columns=GRANT_COLS)
        parts.append(d[(d.amount_type == "paid") & d.object_id.isin(keep_ids)])
    return pd.concat(parts, ignore_index=True)


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
    return df.groupby(by).agg(usd=("amount_usd", "sum"), n=("counted", "sum")).reset_index()


def recipient_keys(g):
    """Stable recipient identity: BMF EIN when matched, else normalized name + state. None for individuals."""
    ein = g.recipient_ein if "recipient_ein" in g else pd.Series(None, index=g.index, dtype=object)
    name = g.recipient_name_raw.map(resolve.norm_name)
    by_name = "N:" + name + "|" + g.recipient_state.fillna(g.country)
    key = ein.where(ein.notna(), by_name)
    return key.where((g.is_individual != True) & (name != ""))  # noqa: E712


def grantee_rates(g, filings):
    """{ein: (new_rate, repeat_rate)}: share of the latest tax year's recipients that were / were not funded in
    the previous LOOKBACK tax years. Null when the foundation filed for none of those years."""
    years = filings.dropna(subset=["tax_year"]).groupby("ein").tax_year.agg(set)
    latest = years.map(max)
    r = g[g.counted & g.rkey.notna()][["funder_ein", "tax_year", "rkey"]].drop_duplicates()
    r = r.assign(Y=r.funder_ein.map(latest))
    now = r[r.tax_year == r.Y][["funder_ein", "rkey"]].drop_duplicates()
    before = r[(r.tax_year < r.Y) & (r.tax_year >= r.Y - LOOKBACK)][["funder_ein", "rkey"]].drop_duplicates()
    now = now.merge(before.assign(seen=True), on=["funder_ein", "rkey"], how="left")
    rate = now.groupby("funder_ein").seen.apply(lambda x: x.isna().mean())
    out = {}
    for ein, ys in years.items():
        y = latest[ein]
        if ein in rate.index and any(y - k in ys for k in range(1, LOOKBACK + 1)):
            out[ein] = (round(float(rate[ein]), 4), round(1 - float(rate[ein]), 4))
    return out


def classification_stats(g, clf):
    """How each grant got its cause: NTEE (BMF), keywords only, or nothing. Written next to profiles.parquet."""
    unc = g.cause_list.map(lambda c: c == [UNCLASSIFIED])
    ntee = (g.recipient_ntee.map(clf.ntee_cause).notna() if "recipient_ntee" in g
            else pd.Series(False, index=g.index))
    usd = g.amount_usd.sum()
    rows = {"ntee (BMF)": ntee, "keywords only": ~ntee & ~unc, "unclassified": unc}
    stats = {k: {"grants": round(float(m.mean()), 4), "dollars": round(float(g.amount_usd[m].sum() / usd), 4)}
             for k, m in rows.items()}
    stats["grants_total"], stats["dollars_total"] = int(len(g)), int(usd)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(stats, open(os.path.join(os.path.dirname(OUT), "classification_stats.json"), "w"), indent=2)
    for k in rows:
        print(f"  cause from {k:14}: {stats[k]['grants']:.1%} of grants, {stats[k]['dollars']:.1%} of dollars")
    return stats


def build(dirs, intermediary_ids):
    filings = pd.concat([pd.read_parquet(f) for f in files(dirs, "*_filings.parquet")], ignore_index=True)
    filings = filings.drop_duplicates("object_id")
    # Amended/superseding returns share EIN + tax period but have new object_ids: keep only the latest so
    # grants are never double counted (matters most when several posting years are combined).
    n0 = len(filings)
    filings = (filings.sort_values(["ein", "tax_period_end", "return_ts", "object_id"])
               .drop_duplicates(["ein", "tax_period_end"], keep="last"))
    if len(filings) < n0:
        print(f"dropped {n0 - len(filings):,} superseded/amended returns")
    filings["tax_year"] = pd.to_datetime(filings["tax_period_end"], errors="coerce").dt.year
    latest_year = filings.groupby("ein").tax_year.transform("max")
    n1 = len(filings)
    filings = filings[filings.tax_year > latest_year - PROFILE_YEARS]
    print(f"kept each foundation's latest {PROFILE_YEARS} tax years: {len(filings):,} of {n1:,} filings")
    grants = read_grants(dirs, set(filings.object_id))
    g = grants[grants.amount_usd.notna() & (grants.amount_usd > 0)]
    g = g.merge(filings[["object_id", "tax_year"]], on="object_id", how="left").reset_index(drop=True)
    if os.path.exists(resolve.OUT):
        g = resolve.attach(g)
        g["recipient_ntee"] = g.recipient_ntee.fillna(g.recipient_ntee_major)   # unanimous same-name ties
        print(f"BMF: EIN for {g.recipient_ein.notna().mean():.1%} of grants, NTEE for {g.recipient_ntee.notna().mean():.1%}")
    else:
        print(f"note: {resolve.OUT} missing: no NTEE labels, recipients identified by name + state only")
    print(f"{len(filings):,} filings, {len(g):,} paid grants; classifying...")
    clf = Classifier()
    g["cause_list"] = clf.classify_frame(g)
    classification_stats(g, clf)
    g["cause"] = g.cause_list.str[0]                                    # primary label, for display
    g["country"] = g["recipient_country"].fillna("US")
    g["is_foreign"] = g["country"] != "US"
    g["counted"] = g.amount_usd >= MIN_COUNTED
    g["rkey"] = recipient_keys(g)
    ge = g.explode("cause_list").rename(columns={"cause_list": "c"})    # one row per (grant, label); index = grant
    real = ge[~ge.c.isin([UNCLASSIFIED, *intermediary_ids])]

    basic = g.groupby("funder_ein").agg(grants_n=("counted", "sum"), grants_usd=("amount_usd", "sum"),
                                        max_grant_usd=("amount_usd", "max"))
    qs = g[g.counted].groupby("funder_ein").amount_usd.quantile([.25, .5, .75]).unstack()
    rates = grantee_rates(g, filings)
    foreign_usd = g[g.is_foreign].groupby("funder_ein").amount_usd.sum()
    cls_usd = g[g.index.isin(real.index)].groupby("funder_ein").amount_usd.sum()
    mix = nested(sums(real, ["funder_ein", "c"]), "funder_ein", "c")
    geo_s = nested(sums(g[~g.is_foreign & g.recipient_state.notna()], ["funder_ein", "recipient_state"]), "funder_ein", "recipient_state")
    geo_c = nested(sums(g[g.is_foreign], ["funder_ein", "country"]), "funder_ein", "country")
    trend = nested(sums(g[g.tax_year.notna()].assign(y=lambda d: d.tax_year.astype(int)), ["funder_ein", "y"]), "funder_ein", "y")
    top = {}
    for r in g.sort_values("amount_usd", ascending=False).groupby("funder_ein").head(TOP_RECIPIENTS).itertuples():
        top.setdefault(r.funder_ein, []).append(dict(
            name=INDIVIDUAL if r.is_individual == True else (None if pd.isna(r.recipient_name_raw) else r.recipient_name_raw),
            state=None if pd.isna(r.recipient_state) else r.recipient_state,
            country=r.country, cause=r.cause, usd=int(r.amount_usd)))

    def qv(ein, p):                     # None when a foundation made no grant of MIN_COUNTED or more
        return float(qs.loc[ein, p]) if ein in qs.index else None

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
            median_grant_usd=qv(ein, .5), p25_grant_usd=qv(ein, .25), p75_grant_usd=qv(ein, .75),
            max_grant_usd=int(b.max_grant_usd),
            new_grantee_rate=rates.get(ein, (None, None))[0], repeat_grantee_rate=rates.get(ein, (None, None))[1],
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

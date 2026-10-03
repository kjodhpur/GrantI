"""Resolve grant recipients to the IRS Exempt Organizations Business Master File (EIN + NTEE).

990-PF grant rows carry no recipient EIN, so recipients are matched on normalized name + state (+ city):
  1. exact normalized name in the same state (city breaks ties between same-name orgs);
  2. fuzzy name (rapidfuzz token_sort_ratio) within blocks of the same state and a shared first or
     longest word, with a small city bonus/penalty.
A match is attached when confidence >= MATCH_THRESHOLD. Same-name ties with no city to decide keep no
EIN, but still get an NTEE major group when every candidate shares it (e.g. many "FIRST BAPTIST CHURCH").
Foreign recipients and grants to individuals are skipped (the BMF covers US organizations).

  python resolve.py --download                 # fetch eo1-eo4.csv into data/bmf/ (~340 MB)
  python resolve.py --years 2025 2026          # -> data/resolved/recipients.parquet + data/resolved/report.md

Use attach(grants) to add recipient_ein / recipient_ntee / match_confidence to a grants frame.
"""
import argparse
import glob
import os
import re
import time

import numpy as np
import pandas as pd
import requests
from rapidfuzz import fuzz, process

ROOT = os.environ.get("GPI_DATA_DIR") or os.path.join(os.path.dirname(__file__), "..", "data")
BMF_DIR = os.path.join(ROOT, "bmf")
OUT = os.path.join(ROOT, "resolved", "recipients.parquet")
REPORT = os.path.join(ROOT, "resolved", "report.md")
BMF_URL = "https://www.irs.gov/pub/irs-soi/eo{}.csv"
UA = {"User-Agent": "cis568-team6-research"}

MATCH_THRESHOLD = 0.90      # attach EIN/NTEE at or above this confidence
FUZZY_FLOOR = 80            # token_sort_ratio below this is never a candidate
CITY_BONUS, CITY_PENALTY = 0.03, 0.05
TOKEN_MIN = 85              # every word of the shorter name needs a word this close in the other

DROP = {"THE", "INC", "INCORPORATED", "CORP", "CORPORATION", "CO", "LLC", "LTD", "NFP", "A", "AN"}
SWAP = {"FDN": "FOUNDATION", "FNDTN": "FOUNDATION", "FOUND": "FOUNDATION", "ASSN": "ASSOCIATION",
        "ASSOC": "ASSOCIATION", "UNIV": "UNIVERSITY", "INTL": "INTERNATIONAL", "CTR": "CENTER",
        "SVCS": "SERVICES", "SOC": "SOCIETY", "DEPT": "DEPARTMENT", "NATL": "NATIONAL", "MT": "MOUNT"}


LEGAL_PREFIX = re.compile(r"^(BOARD OF TRUSTEES OF|TRUSTEES OF|PRESIDENT AND FELLOWS OF|REGENTS OF) ")


def norm_name(s):
    if not isinstance(s, str):
        return ""
    s = s.upper().replace("&", " AND ").replace("'", "").replace("`", "")
    toks = [SWAP.get(t, t) for t in re.split(r"[^A-Z0-9]+", s) if t]
    return LEGAL_PREFIX.sub("", " ".join(t for t in toks if t not in DROP))


def norm_city(s):
    return re.sub(r"[^A-Z]", "", s.upper()) if isinstance(s, str) else ""


def download():
    os.makedirs(BMF_DIR, exist_ok=True)
    for i in range(1, 5):
        dest = os.path.join(BMF_DIR, f"eo{i}.csv")
        with requests.get(BMF_URL.format(i), headers=UA, stream=True, timeout=300) as r:
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
        print("downloaded", dest)


def load_bmf():
    files = sorted(glob.glob(os.path.join(BMF_DIR, "eo*.csv")))
    if not files:
        raise SystemExit(f"no BMF files in {BMF_DIR}. Run: python resolve.py --download")
    cols = ["EIN", "NAME", "CITY", "STATE", "NTEE_CD", "SUBSECTION", "REVENUE_AMT"]
    b = pd.concat([pd.read_csv(f, dtype=str, usecols=cols) for f in files], ignore_index=True)
    b["name_norm"] = b.NAME.map(norm_name)
    b["city_norm"] = b.CITY.map(norm_city)
    b["revenue"] = pd.to_numeric(b.REVENUE_AMT, errors="coerce").fillna(0)
    return b[b.name_norm != ""].drop_duplicates("EIN").reset_index(drop=True)


def load_recipients(years):
    files = [f for y in years for f in glob.glob(os.path.join(ROOT, "interim", y, "*_grants.parquet"))]
    if not files:
        raise SystemExit(f"no grant files for {years}. Run build_year.py first.")
    g = pd.concat([pd.read_parquet(f, columns=["recipient_name_raw", "recipient_state", "recipient_city",
                                               "recipient_country", "is_individual", "amount_usd", "amount_type"])
                   for f in files], ignore_index=True)
    g = g[(g.amount_type == "paid") & (g.is_individual != True) & (g.recipient_country == "US")]  # noqa: E712
    g = g.assign(name_norm=g.recipient_name_raw.map(norm_name), state=g.recipient_state.fillna(""),
                 city_norm=g.recipient_city.map(norm_city))
    g = g[g.name_norm != ""]
    keys = (g.groupby(["name_norm", "state", "city_norm"])
            .agg(grants_n=("amount_usd", "size"), grants_usd=("amount_usd", "sum"),
                 example_name=("recipient_name_raw", "first"))
            .reset_index())
    return keys


def candidates(keys, names):
    """Join each recipient key (kid, city_norm) to every BMF org whose (name_norm, STATE) is in `names`
    (columns kid, name_norm, STATE), then keep the best org per key: city match, then 501(c)(3), then revenue."""
    c = (names.merge(BMF[["name_norm", "STATE", "EIN", "NAME", "NTEE_CD", "SUBSECTION", "revenue", "city_norm"]],
                     on=["name_norm", "STATE"])
         .merge(keys[["kid", "city_norm"]].rename(columns={"city_norm": "k_city"}), on="kid"))
    c["city_hit"] = (c.city_norm == c.k_city) & (c.k_city != "")
    c["c3"] = c.SUBSECTION == "03"
    c["major"] = c.NTEE_CD.str[0]
    agg = c.groupby("kid").agg(candidates=("EIN", "size"), any_city=("city_hit", "any"),
                               majors=("major", "nunique"), ntee_all=("NTEE_CD", lambda x: x.notna().all()),
                               bmf_city_known=("city_norm", lambda x: (x != "").any()))
    best = (c.sort_values(["kid", "city_hit", "c3", "revenue"], ascending=[True, False, False, False])
            .drop_duplicates("kid").set_index("kid"))
    return best.join(agg)


def exact(keys):
    names = keys[["kid", "name_norm", "state"]].rename(columns={"state": "STATE"})
    b = candidates(keys, names)
    single, multi = b.candidates == 1, b.candidates > 1
    out = pd.DataFrame(index=b.index)
    out["recipient_ein"], out["bmf_name"], out["ntee"] = b.EIN, b.NAME, b.NTEE_CD
    out["ntee_major"] = b.major
    out["candidates"] = b.candidates
    out["confidence"] = np.select([single & b.any_city, single, multi & b.any_city], [1.0, 0.97, 0.96], 0.80)
    out["method"] = np.select([single, multi & b.any_city], ["exact", "exact_city"], "exact_ambiguous")
    amb = out.method == "exact_ambiguous"
    # same-name tie with no city to decide: no EIN, NTEE major only if every candidate agrees
    out.loc[amb, ["recipient_ein", "ntee"]] = None
    out.loc[amb & ~((b.majors == 1) & b.ntee_all), "ntee_major"] = None
    return out


def tokens_align(a, b):
    """False when a word differs outright (STANFORD vs STANDARD), even if the whole-name score is high."""
    ta, tb = a.split(), b.split()
    short, long_ = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
    # short words (acronyms, numbers) must match exactly: CSUB is not CUB
    return all(t in long_ if len(t) <= 4 else max(fuzz.ratio(t, u) for u in long_) >= TOKEN_MIN for t in short)


def block_keys(name):
    toks = name.split()
    return {toks[0], max(toks, key=len)} if toks else set()


def fuzzy(keys):
    """Best fuzzy BMF name per unresolved key, scored within (state, shared word) blocks."""
    names = BMF[["name_norm", "STATE"]].drop_duplicates().reset_index(drop=True)
    blocks = {}
    for i, (n, st) in enumerate(zip(names.name_norm, names.STATE)):
        for t in block_keys(n):
            blocks.setdefault((st, t), []).append(i)
    q_blocks = {}
    for kid, n, st in zip(keys.kid, keys.name_norm, keys.state):
        for t in block_keys(n):
            q_blocks.setdefault((st, t), []).append(kid)
    qname = dict(zip(keys.kid, keys.name_norm))
    best = {}                                   # kid -> (score, names row)
    for bk, kids in q_blocks.items():
        cidx = blocks.get(bk)
        if not cidx:
            continue
        m = process.cdist([qname[k] for k in kids], names.name_norm.values[cidx], scorer=fuzz.token_sort_ratio,
                          score_cutoff=FUZZY_FLOOR, workers=-1)
        arg = m.argmax(axis=1)
        top = m[np.arange(len(kids)), arg]
        for kid, a, sc in zip(kids, arg, top):
            if sc > 0 and sc > best.get(kid, (0, None))[0]:
                best[kid] = (float(sc), cidx[a])
    if not best:
        return pd.DataFrame()
    hit = pd.DataFrame([(k, sc, i) for k, (sc, i) in best.items()], columns=["kid", "score", "ni"])
    hit = hit.join(names, on="ni")
    b = candidates(keys, hit[["kid", "name_norm", "STATE"]]).join(hit.set_index("kid").score)
    q = keys.set_index("kid").name_norm.reindex(b.index)
    aligned = [tokens_align(x, y) for x, y in zip(q, b.name_norm)]
    conf = (b.score / 100).where(aligned, (b.score / 100).clip(upper=MATCH_THRESHOLD - 0.06))
    both_city = b.k_city.ne("") & b.city_norm.ne("")
    conf = conf + np.where(both_city & b.city_hit, CITY_BONUS, 0) - np.where(both_city & ~b.city_hit, CITY_PENALTY, 0)
    return pd.DataFrame({"recipient_ein": b.EIN, "bmf_name": b.NAME, "ntee": b.NTEE_CD, "ntee_major": b.major,
                         "candidates": b.candidates, "confidence": conf.clip(upper=0.99).round(3), "method": "fuzzy"},
                        index=b.index)


BMF = None


def resolve(years):
    global BMF
    t0 = time.time()
    BMF = load_bmf()
    keys = load_recipients(years)
    keys["kid"] = np.arange(len(keys))
    print(f"{len(BMF):,} BMF orgs; {len(keys):,} distinct US recipient keys ({time.time() - t0:.0f}s)")
    ex = exact(keys)
    todo = keys[~keys.kid.isin(ex.index)]
    print(f"exact pass: {len(ex):,} hit; fuzzy on {len(todo):,} ({time.time() - t0:.0f}s)")
    fz = fuzzy(todo)
    res = pd.concat([ex, fz])
    keys = keys.join(res, on="kid")
    keys["method"] = keys.method.fillna("none")
    keys["confidence"] = keys.confidence.fillna(0.0)
    keys["candidates"] = keys.candidates.fillna(0).astype(int)
    keys["matched"] = keys.confidence >= MATCH_THRESHOLD
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    keys.drop(columns="kid").to_parquet(OUT)
    print(f"-> {OUT} ({time.time() - t0:.0f}s)")
    report(keys, years)
    return keys


def report(k, years):
    def share(mask, w=None):
        return (k[w][mask].sum() / k[w].sum()) if w else mask.mean()
    m = k.matched
    nt = (m & k.ntee.notna()) | ((k.method == "exact_ambiguous") & k.ntee_major.notna())
    lines = [f"# BMF recipient join ({', '.join(years)} postings)", "",
             f"Threshold {MATCH_THRESHOLD}. US organization recipients only (individuals and foreign excluded).", "",
             "| | distinct recipients | grants | dollars |", "|---|---|---|---|",
             f"| EIN matched | {share(m):.1%} | {share(m, 'grants_n'):.1%} | {share(m, 'grants_usd'):.1%} |",
             f"| NTEE known (matched with NTEE, or unanimous same-name tie) | {share(nt):.1%} | {share(nt, 'grants_n'):.1%} | {share(nt, 'grants_usd'):.1%} |",
             "", "By method (distinct recipients):", ""]
    for meth, n in k.method.value_counts().items():
        lines.append(f"- {meth}: {n:,}")
    near = k[(k.method == "fuzzy") & k.confidence.between(MATCH_THRESHOLD - 0.05, MATCH_THRESHOLD + 0.03)]
    lines += ["", f"## Sample near the threshold ({MATCH_THRESHOLD - 0.05:.2f} to {MATCH_THRESHOLD + 0.03:.2f})", "",
              "| grant recipient | state | BMF name | confidence | attached |", "|---|---|---|---|---|"]
    for r in near.sample(min(50, len(near)), random_state=1).sort_values("confidence").itertuples():
        lines.append(f"| {r.example_name} | {r.state} | {r.bmf_name} | {r.confidence:.2f} | {'yes' if r.matched else 'no'} |")
    with open(REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines[:14]))
    print("report ->", REPORT)


def attach(grants):
    """Add recipient_ein, recipient_ntee, recipient_ntee_major, match_confidence to a grants frame."""
    if not os.path.exists(OUT):
        raise SystemExit(f"{OUT} missing. Run: python resolve.py --years ...")
    r = pd.read_parquet(OUT, columns=["name_norm", "state", "city_norm", "recipient_ein", "ntee", "ntee_major",
                                      "confidence", "matched"])
    g = grants.assign(name_norm=grants.recipient_name_raw.map(norm_name), state=grants.recipient_state.fillna(""),
                      city_norm=grants.recipient_city.map(norm_city))
    g = g.merge(r, on=["name_norm", "state", "city_norm"], how="left").drop(columns=["name_norm", "state", "city_norm"])
    g.index = grants.index
    keep = g.matched.fillna(False).astype(bool)
    return grants.assign(recipient_ein=g.recipient_ein.where(keep), recipient_ntee=g.ntee.where(keep),
                         recipient_ntee_major=g.ntee_major.where(keep | g.recipient_ein.isna()),
                         match_confidence=g.confidence)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--years", nargs="*", default=[])
    a = ap.parse_args()
    if a.download:
        download()
    if a.years:
        resolve(a.years)

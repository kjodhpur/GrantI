"""Download IRS monthly zips for one year and parse every 990-PF in them.

  python build_year.py --year 2025                      # all months (~4.5 GB download, ~5 min)
  python build_year.py --year 2025 --only 2025_TEOS_XML_01A   # one zip, good for a first test

Output: data/interim/<year>/<zip>_{filings,grants,officers}.parquet  (safe to re-run; done zips are skipped)
"""
import argparse, os, re, sys, time, zipfile
import requests
import parse_990pf as P

ROOT = os.path.join(os.path.dirname(__file__), "..", "data")


def zip_names(year, index_csv):
    df = P.load_index(year, index_csv)
    return sorted(df.XML_BATCH_ID.unique())


def download(url, dest, tries=5):
    for i in range(tries):
        try:
            with requests.get(url, headers=P.UA, stream=True, timeout=120) as r:
                if r.status_code == 404:
                    return False
                r.raise_for_status()
                with open(dest, "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            if zipfile.is_zipfile(dest):
                return True
        except Exception as e:
            print("  retry", i, e, file=sys.stderr)
        time.sleep(2 ** i)
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", required=True)
    ap.add_argument("--only", help="a single zip name, e.g. 2025_TEOS_XML_01A")
    a = ap.parse_args()
    out_dir = os.path.join(ROOT, "interim", a.year)
    raw_dir = os.path.join(ROOT, "raw", a.year)
    os.makedirs(out_dir, exist_ok=True); os.makedirs(raw_dir, exist_ok=True)
    index_csv = os.path.join(ROOT, "raw", f"index_{a.year}.csv")
    names = [a.only] if a.only else zip_names(a.year, index_csv)
    for n in names:
        out = os.path.join(out_dir, n)
        if os.path.exists(out + "_filings.parquet"):
            print("skip", n); continue
        zp = os.path.join(raw_dir, n + ".zip")
        print("download", n, flush=True)
        if not download(f"{P.BASE}/{a.year}/{n}.zip", zp):
            print("  not available:", n, file=sys.stderr); continue
        P.run_local(a.year, zp, out, index_csv)
        os.remove(zp)   # keep disk small; parquet is what we need


if __name__ == "__main__":
    main()

"""
parse_990pf.py: pull Form 990-PF grants straight from the IRS bulk XML, no API key.

What it does
  1. Reads the free IRS index CSV for a year to find every 990-PF return and which zip holds it.
  2. Fetches ONLY the filings you ask for out of the multi-hundred-MB monthly zips using HTTP range
     requests (the zips are Deflate64, which Python's zipfile cannot read, so we use inflate64).
  3. Parses each return into flat rows: grants paid, grants approved for future payment, and the
     foundation-level fields (officers, "preselected charities only" flag, application info).

Install:  pip install remotezip inflate64 lxml pandas pyarrow requests
Usage:
  python parse_990pf.py --year 2025 --sample 40 --out sample_2025      # random sample
  python parse_990pf.py --year 2025 --ein 942278431 --out packard      # one foundation
  python parse_990pf.py --year 2025 --batch 2025_TEOS_XML_01A --out jan # a whole monthly zip (range requests)
  python parse_990pf.py --year 2025 --local-zip 2025_TEOS_XML_01A.zip --out jan  # bulk: parse a downloaded zip

Outputs (Parquet): <out>_grants.parquet, <out>_filings.parquet
"""
import argparse, io, os, struct, sys, zlib
import pandas as pd
from lxml import etree
from remotezip import RemoteZip

BASE = "https://apps.irs.gov/pub/epostcard/990/xml"
UA = {"User-Agent": "cis568-team6-research (kjodhpur@asu.edu)"}


def txt(el, path):
    """First text found at namespace-agnostic child path like 'A/B'."""
    if el is None:
        return None
    cur = el
    for part in path.split("/"):
        cur = cur.find("{*}" + part)
        if cur is None:
            return None
    return (cur.text or "").strip() or None


def parse_return(xml_bytes, object_id=None):
    root = etree.fromstring(xml_bytes)
    hdr = root.find("{*}ReturnHeader")
    filer = hdr.find("{*}Filer")
    name = " ".join(filter(None, [txt(filer, "BusinessName/BusinessNameLine1Txt"),
                                  txt(filer, "BusinessName/BusinessNameLine2Txt")]))
    state = txt(filer, "USAddress/StateAbbreviationCd")
    ein = txt(filer, "EIN")
    meta = dict(
        object_id=object_id, ein=ein, funder_name=name, funder_state=state,
        tax_period_begin=txt(hdr, "TaxPeriodBeginDt"), tax_period_end=txt(hdr, "TaxPeriodEndDt"),
        return_ts=txt(hdr, "ReturnTs"), return_version=root.get("returnVersion"),
    )
    body = root.find("{*}ReturnData/{*}IRS990PF")
    if body is None:
        return meta, [], []
    # foundation-level actionability signals (Part XIV lines 2a-2d), when the filer supplied them
    meta["only_preselected"] = txt(body, "SupplementaryInformationGrp/OnlyContriToPreselectedInd")
    app = body.find("{*}SupplementaryInformationGrp/{*}ApplicationSubmissionInfoGrp")
    if app is not None:
        meta["app_contact_name"] = txt(app, "RecipientPersonNm") or txt(app, "RecipientBusinessName/BusinessNameLine1Txt")
        meta["app_contact_email"] = txt(app, "RecipientEmailAddressTxt")
        meta["app_contact_phone"] = txt(app, "RecipientPhoneNum")
        meta["app_form_materials"] = txt(app, "FormAndInfoAndMaterialsTxt")
        meta["app_deadlines"] = txt(app, "SubmissionDeadlinesTxt")
        meta["app_restrictions"] = txt(app, "RestrictionsOnAwardsTxt")
    meta["total_paid_reported"] = txt(body, "SupplementaryInformationGrp/TotalGrantOrContriPdDurYrAmt")
    meta["total_future_reported"] = txt(body, "SupplementaryInformationGrp/TotalGrantOrContriApprvFutAmt")

    grants = []
    for tag, kind in (("GrantOrContributionPdDurYrGrp", "paid"), ("GrantOrContriApprvForFutGrp", "approved_future")):
        for g in body.iter("{*}" + tag):
            rec_name = " ".join(filter(None, [txt(g, "RecipientBusinessName/BusinessNameLine1Txt"),
                                               txt(g, "RecipientBusinessName/BusinessNameLine2Txt")])) or None
            # Grants to individuals (scholarships, relief): never store the person's name, city, ZIP or
            # relationship. Keep state/country (geography), amount and purpose only.
            individual = rec_name is None and txt(g, "RecipientPersonNm") is not None
            us, fx = g.find("{*}RecipientUSAddress"), g.find("{*}RecipientForeignAddress")
            amt = txt(g, "Amt")
            grants.append(dict(
                object_id=object_id, funder_ein=ein, amount_type=kind,
                recipient_name_raw=rec_name,
                is_individual=individual,
                recipient_city=None if individual else (txt(us, "CityNm") if us is not None else txt(fx, "CityNm")),
                recipient_state=txt(us, "StateAbbreviationCd") if us is not None else None,
                recipient_zip=txt(us, "ZIPCd") if us is not None and not individual else None,
                recipient_country="US" if us is not None else (txt(fx, "CountryCd") if fx is not None else None),
                recipient_relationship=None if individual else txt(g, "RecipientRelationshipTxt"),
                recipient_foundation_status=txt(g, "RecipientFoundationStatusTxt"),
                grant_purpose=txt(g, "GrantOrContributionPurposeTxt"),
                amount_usd=int(amt) if amt and amt.lstrip("-").isdigit() else None,
            ))
    officers = []
    for o in body.iter("{*}OfficerDirTrstKeyEmplGrp"):
        officers.append(dict(object_id=object_id, funder_ein=ein,
                             person=txt(o, "PersonNm") or txt(o, "BusinessName/BusinessNameLine1Txt"),
                             title=txt(o, "TitleTxt")))
    return meta, grants, officers


def read_member(z, name):
    """Read one member from a RemoteZip, handling Deflate64 (type 9) and Deflate (type 8)."""
    zi = z.getinfo(name)
    z.fp.seek(zi.header_offset)
    hdr = z.fp.read(30)
    fn, ex = struct.unpack("<HH", hdr[26:30])
    z.fp.seek(zi.header_offset + 30 + fn + ex)
    raw = z.fp.read(zi.compress_size)
    if zi.compress_type == 9:
        import inflate64
        return inflate64.Inflater().inflate(raw)
    if zi.compress_type == 8:
        return zlib.decompress(raw, -15)
    if zi.compress_type == 0:
        return raw
    raise ValueError(f"unsupported compression {zi.compress_type}")


def load_index(year, cache=None):
    cache = cache or f"index_{year}.csv"
    if not os.path.exists(cache):
        import requests
        r = requests.get(f"{BASE}/{year}/index_{year}.csv", headers=UA, stream=True, timeout=300)
        r.raise_for_status()
        with open(cache, "wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    df = pd.read_csv(cache, dtype=str, low_memory=False)
    return df[df.RETURN_TYPE == "990PF"].reset_index(drop=True)


def sibling_batches(batch):
    """IRS index quirk: a filing listed under ..._05A can live in ..._05B. Try the whole month."""
    stem, letter = batch[:-1], batch[-1]
    return [batch] + [stem + l for l in "ABCD" if l != letter]


def open_zip(url, tries=5):
    import time
    for i in range(tries):
        try:
            return RemoteZip(url, headers=UA)
        except Exception as e:
            if "404" in str(e):
                return None            # zip does not exist
            time.sleep(2 ** i)         # IRS drops connections under load: back off and retry
    raise RuntimeError(f"could not open {url}")


def get_xml(state, url, member, tries=5):
    """Read one member; reopen the zip and retry on dropped connections."""
    import time
    for i in range(tries):
        try:
            return read_member(state["z"], member)
        except Exception:
            time.sleep(2 ** i)
            state["z"] = open_zip(url)
    raise RuntimeError(f"could not read {member}")


def run(year, rows, out):
    metas, grants, officers = [], [], []
    for batch, sub in rows.groupby("XML_BATCH_ID"):
        todo = set(sub.OBJECT_ID)
        for cand in sibling_batches(batch):
            if not todo:
                break
            url = f"{BASE}/{year}/{cand}.zip"
            z = open_zip(url)
            if z is None:
                continue
            state = {"z": z}
            names = {n.split("/")[-1]: n for n in z.namelist()}
            for oid in sorted(todo & {n[:-11] for n in names if n.endswith("_public.xml")}):
                m, g, o = parse_return(get_xml(state, url, names[f"{oid}_public.xml"]), oid)
                m["xml_batch_id"] = cand
                metas.append(m); grants += g; officers += o
                todo.discard(oid)
            state["z"].close()
        for oid in todo:
            print("not found in any sibling zip:", oid, file=sys.stderr)
    pd.DataFrame(metas).to_parquet(f"{out}_filings.parquet")
    pd.DataFrame(grants).to_parquet(f"{out}_grants.parquet")
    pd.DataFrame(officers).to_parquet(f"{out}_officers.parquet")
    print(f"{len(metas)} filings, {len(grants):,} grant rows, {len(officers):,} officer rows -> {out}_*.parquet")


def run_local(year, zip_path, out, index_cache=None):
    """Parse every 990-PF inside a monthly zip you already downloaded (fast path for bulk builds)."""
    import zipfile
    pf_ids = set(load_index(year, index_cache).OBJECT_ID)
    metas, grants, officers = [], [], []
    with zipfile.ZipFile(zip_path) as z:
        for n in z.namelist():
            oid = n.split("/")[-1].replace("_public.xml", "")
            if oid in pf_ids:
                m, g, o = parse_return(read_member(z, n), oid)
                m["xml_batch_id"] = os.path.basename(zip_path)[:-4]
                metas.append(m); grants += g; officers += o
    pd.DataFrame(metas).to_parquet(f"{out}_filings.parquet")
    pd.DataFrame(grants).to_parquet(f"{out}_grants.parquet")
    pd.DataFrame(officers).to_parquet(f"{out}_officers.parquet")
    print(f"{len(metas)} filings, {len(grants):,} grant rows, {len(officers):,} officer rows -> {out}_*.parquet")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--sample", type=int)
    ap.add_argument("--ein")
    ap.add_argument("--batch")
    ap.add_argument("--index-cache", help="where to keep index_YEAR.csv (default: current dir)")
    ap.add_argument("--local-zip", help="path to a monthly zip already downloaded from the IRS")
    a = ap.parse_args()
    if a.local_zip:
        run_local(a.year, a.local_zip, a.out, a.index_cache)
        sys.exit(0)
    pf = load_index(a.year, a.index_cache)
    if a.ein:
        pf = pf[pf.EIN == a.ein]
    if a.batch:
        pf = pf[pf.XML_BATCH_ID == a.batch]
    if a.sample:
        pf = pf.sample(a.sample, random_state=1)
    run(a.year, pf, a.out)

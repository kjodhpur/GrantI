"""Recipient -> BMF matching on a tiny synthetic BMF (all organizations and EINs are made up)."""
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import resolve  # noqa: E402


def bmf(rows):
    b = pd.DataFrame(rows, columns=["EIN", "NAME", "CITY", "STATE", "NTEE_CD", "SUBSECTION", "REVENUE_AMT"])
    b["name_norm"] = b.NAME.map(resolve.norm_name)
    b["city_norm"] = b.CITY.map(resolve.norm_city)
    b["revenue"] = pd.to_numeric(b.REVENUE_AMT)
    return b


def keys(rows):
    k = pd.DataFrame(rows, columns=["name_norm", "state", "city_norm"])
    k["name_norm"] = k.name_norm.map(resolve.norm_name)
    k["city_norm"] = k.city_norm.map(resolve.norm_city)
    k["kid"] = range(len(k))
    return k


def test_norm_name():
    n = resolve.norm_name
    assert n("The Example Food Bank, Inc.") == n("EXAMPLE FOOD BANK INC") == "EXAMPLE FOOD BANK"
    assert n("Trustees of Example College") == "EXAMPLE COLLEGE"
    assert n("Example Fdn") == "EXAMPLE FOUNDATION"
    assert n("Kids' Meals & More") == "KIDS MEALS AND MORE"
    assert n(None) == ""


def test_exact_unique_city_tie_and_ambiguous():
    resolve.BMF = bmf([
        ("000000001", "EXAMPLE FOOD BANK INC", "PHOENIX", "AZ", "K31", "03", "100"),
        ("000000002", "FIRST EXAMPLE CHURCH", "MESA", "AZ", "X21", "03", "10"),
        ("000000003", "FIRST EXAMPLE CHURCH", "TEMPE", "AZ", "X20", "03", "50"),
        ("000000004", "FIRST EXAMPLE CHURCH", "YUMA", "AZ", "X21", "03", "5"),
    ])
    out = resolve.exact(keys([
        ("The Example Food Bank", "AZ", "Phoenix"),     # unique name, city agrees
        ("First Example Church", "AZ", "Tempe"),        # three same-name orgs, city decides
        ("First Example Church", "AZ", "Flagstaff"),    # same-name tie, no city match
        ("Example Food Bank", "CA", ""),                # wrong state: no exact hit
    ]))
    assert out.loc[0, ["recipient_ein", "method", "confidence"]].tolist() == ["000000001", "exact", 1.0]
    assert out.loc[1, ["recipient_ein", "method"]].tolist() == ["000000003", "exact_city"]
    assert out.loc[2, "method"] == "exact_ambiguous" and pd.isna(out.loc[2, "recipient_ein"])
    assert out.loc[2, "ntee_major"] == "X"            # every candidate is an X (religion) org
    assert out.loc[2, "confidence"] < resolve.MATCH_THRESHOLD
    assert 3 not in out.index


def test_fuzzy_threshold():
    resolve.BMF = bmf([
        ("000000010", "EXAMPLE CHILDRENS HUNGER ALLIANCE", "TUCSON", "AZ", "K30", "03", "100"),
        ("000000011", "STANDARD EXAMPLE UNIVERSITY", "TUCSON", "AZ", "B43", "03", "100"),
    ])
    out = resolve.fuzzy(keys([
        ("Example Childrens Hunger Aliance", "AZ", "Tucson"),   # typo, same city -> attach
        ("Stanford Example University", "AZ", "Tucson"),        # different school -> stays below threshold
    ]))
    assert out.loc[0, "recipient_ein"] == "000000010" and out.loc[0, "confidence"] >= resolve.MATCH_THRESHOLD
    assert 1 not in out.index or out.loc[1, "confidence"] < resolve.MATCH_THRESHOLD


def test_short_words_must_match_exactly():
    assert not resolve.tokens_align("CSUB FOUNDATION", "CUB FOUNDATION")
    assert resolve.tokens_align("GEOGIA POLICE FOUNDATION", "GEORGIA POLICE FOUNDATION")

"""Profile features on synthetic filings: the small-grant floor and new/repeat grantee rates."""
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import build_profiles as bp  # noqa: E402


def filing(ein, year):
    return dict(object_id=f"{ein}-{year}", ein=ein, funder_name=f"FUNDER {ein} (SYNTHETIC)", funder_state="AZ",
                tax_period_end=f"{year}-12-31", return_ts=f"{year + 1}-05-01", only_preselected=None,
                app_contact_name=None, app_contact_email=None, app_contact_phone=None)


def grant(ein, year, name, usd):
    return dict(object_id=f"{ein}-{year}", funder_ein=ein, amount_type="paid", recipient_name_raw=name,
                is_individual=False, recipient_city="PHOENIX", recipient_state="AZ", recipient_country="US",
                grant_purpose="GENERAL SUPPORT", amount_usd=usd)


def build(tmp_path, monkeypatch, filings, grants):
    pd.DataFrame(filings).to_parquet(tmp_path / "t_filings.parquet")
    pd.DataFrame(grants).to_parquet(tmp_path / "t_grants.parquet")
    monkeypatch.setattr(bp, "OUT", str(tmp_path / "out" / "profiles.parquet"))
    monkeypatch.setattr(bp.resolve, "OUT", str(tmp_path / "no-bmf.parquet"))   # name + state identity only
    return bp.build([str(tmp_path)], []).set_index("ein")


def test_small_grants_count_in_totals_not_counts(tmp_path, monkeypatch):
    p = build(tmp_path, monkeypatch, [filing("001", 2025)], [
        grant("001", 2025, "Alpha Food Bank", 10_000), grant("001", 2025, "Beta Shelter", 30_000),
        grant("001", 2025, "Gamma Club", 100),                  # under the floor
    ]).loc["001"]
    assert p.grants_usd == 40_100 and p.grants_n == 2
    assert p.median_grant_usd == 20_000 and p.max_grant_usd == 30_000


def test_grantee_rates(tmp_path, monkeypatch):
    p = build(tmp_path, monkeypatch,
              [filing("001", 2023), filing("001", 2024), filing("001", 2025), filing("002", 2025)], [
        grant("001", 2023, "Alpha Food Bank", 5_000),
        grant("001", 2024, "Beta Shelter", 5_000),
        grant("001", 2025, "ALPHA FOOD BANK INC", 5_000),       # repeat (same org after normalization)
        grant("001", 2025, "Beta Shelter", 5_000),              # repeat
        grant("001", 2025, "Delta Clinic", 5_000),              # new
        grant("001", 2025, "Echo School", 5_000),               # new
        grant("001", 2025, "Tiny Club", 100),                   # under the floor: ignored
        grant("002", 2025, "Alpha Food Bank", 5_000),           # no prior-year filing -> unknown
    ])
    assert (p.loc["001", "new_grantee_rate"], p.loc["001", "repeat_grantee_rate"]) == (0.5, 0.5)
    assert pd.isna(p.loc["002", "new_grantee_rate"]) and pd.isna(p.loc["002", "repeat_grantee_rate"])

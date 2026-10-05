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


def test_profile_covers_latest_tax_years_only(tmp_path, monkeypatch):
    years = [2020, 2021, 2023, 2024, 2025]           # 2020 and 2021 fall outside the 3-year window
    p = build(tmp_path, monkeypatch, [filing("001", y) for y in years],
              [grant("001", y, f"Org {y}", 1_000 * (y - 2019)) for y in years]).loc["001"]
    assert list(p.years) == [2023, 2024, 2025]
    assert p.grants_usd == 4_000 + 5_000 + 6_000


def test_ntee_label_from_bmf(tmp_path, monkeypatch):
    import resolve
    pd.DataFrame([dict(name_norm=resolve.norm_name("Desert Hope Center"), state="AZ", city_norm="PHOENIX",
                       recipient_ein="000000099", ntee="K31", ntee_major="K", confidence=1.0, matched=True)]
                 ).to_parquet(tmp_path / "recipients.parquet")
    pd.DataFrame([filing("001", 2025)]).to_parquet(tmp_path / "t_filings.parquet")
    pd.DataFrame([grant("001", 2025, "Desert Hope Center", 5_000)]).to_parquet(tmp_path / "t_grants.parquet")
    monkeypatch.setattr(bp, "OUT", str(tmp_path / "out" / "profiles.parquet"))
    monkeypatch.setattr(bp.resolve, "OUT", str(tmp_path / "recipients.parquet"))
    p = bp.build([str(tmp_path)], []).set_index("ein").loc["001"]
    assert "hunger_food" in p.causes                  # no food keyword in name or purpose: only NTEE K31 says food

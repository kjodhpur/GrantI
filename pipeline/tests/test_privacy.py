"""Grants to individuals must never carry the person's name, city, ZIP or relationship into parsed
output or foundation profiles. The fixture is synthetic: every name and number is made up."""
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import build_profiles  # noqa: E402
import parse_990pf  # noqa: E402

PERSON = "Zebulon Quillfeather"          # fake individual grant recipient
PERSON_CITY = "Quillfeather Hollow"
CONTACT = "Ada Grantwell"                # fake published application contact: must be kept

XML = f"""<?xml version="1.0" encoding="utf-8"?>
<Return xmlns="http://www.irs.gov/efile" returnVersion="2023v4.0">
  <ReturnHeader>
    <ReturnTs>2025-05-01T10:00:00-05:00</ReturnTs>
    <TaxPeriodEndDt>2024-12-31</TaxPeriodEndDt>
    <TaxPeriodBeginDt>2024-01-01</TaxPeriodBeginDt>
    <Filer>
      <EIN>001234567</EIN>
      <BusinessName><BusinessNameLine1Txt>EXAMPLE TEST FOUNDATION (SYNTHETIC)</BusinessNameLine1Txt></BusinessName>
      <USAddress><StateAbbreviationCd>AZ</StateAbbreviationCd></USAddress>
    </Filer>
  </ReturnHeader>
  <ReturnData>
    <IRS990PF>
      <SupplementaryInformationGrp>
        <ApplicationSubmissionInfoGrp>
          <RecipientPersonNm>{CONTACT}</RecipientPersonNm>
          <RecipientPhoneNum>5555550100</RecipientPhoneNum>
        </ApplicationSubmissionInfoGrp>
        <GrantOrContributionPdDurYrGrp>
          <RecipientPersonNm>{PERSON}</RecipientPersonNm>
          <RecipientUSAddress>
            <CityNm>{PERSON_CITY}</CityNm><StateAbbreviationCd>AZ</StateAbbreviationCd><ZIPCd>85001</ZIPCd>
          </RecipientUSAddress>
          <RecipientRelationshipTxt>NIECE OF TRUSTEE</RecipientRelationshipTxt>
          <GrantOrContributionPurposeTxt>SCHOLARSHIP</GrantOrContributionPurposeTxt>
          <Amt>90000</Amt>
        </GrantOrContributionPdDurYrGrp>
        <GrantOrContributionPdDurYrGrp>
          <RecipientBusinessName><BusinessNameLine1Txt>Example Food Bank</BusinessNameLine1Txt></RecipientBusinessName>
          <RecipientUSAddress>
            <CityNm>Phoenix</CityNm><StateAbbreviationCd>AZ</StateAbbreviationCd><ZIPCd>85002</ZIPCd>
          </RecipientUSAddress>
          <RecipientFoundationStatusTxt>PC</RecipientFoundationStatusTxt>
          <GrantOrContributionPurposeTxt>CHILD HUNGER PROGRAM</GrantOrContributionPurposeTxt>
          <Amt>5000</Amt>
        </GrantOrContributionPdDurYrGrp>
      </SupplementaryInformationGrp>
    </IRS990PF>
  </ReturnData>
</Return>""".encode()


def parsed():
    return parse_990pf.parse_return(XML, "TEST0001")


def contains(frame, needle):
    return frame.astype(str).apply(lambda col: col.str.contains(needle, case=False, regex=False)).any().any()


def test_parser_drops_individual_identity():
    meta, grants, _ = parsed()
    g = pd.DataFrame(grants)
    person = g[g.is_individual]
    assert len(person) == 1
    row = person.iloc[0]
    assert row[["recipient_name_raw", "recipient_city", "recipient_zip", "recipient_relationship"]].isna().all()
    assert (row.amount_usd, row.grant_purpose, row.recipient_state) == (90000, "SCHOLARSHIP", "AZ")
    assert not contains(g, PERSON) and not contains(g, PERSON_CITY)
    # organizations and the foundation's own published contact are kept
    assert g[~g.is_individual].iloc[0].recipient_name_raw == "Example Food Bank"
    assert meta["app_contact_name"] == CONTACT


def test_profiles_never_show_individual_names(tmp_path, monkeypatch):
    meta, grants, _ = parsed()
    pd.DataFrame([meta]).to_parquet(tmp_path / "t_filings.parquet")
    pd.DataFrame(grants).to_parquet(tmp_path / "t_grants.parquet")
    monkeypatch.setattr(build_profiles, "OUT", str(tmp_path / "out" / "profiles.parquet"))
    df = build_profiles.build([str(tmp_path)], [])
    assert not contains(df, PERSON) and not contains(df, PERSON_CITY)
    assert build_profiles.INDIVIDUAL in df.iloc[0].top_recipients


def test_profiles_refuse_pre_fix_data(tmp_path, monkeypatch):
    meta, grants, _ = parsed()
    pd.DataFrame([meta]).to_parquet(tmp_path / "t_filings.parquet")
    pd.DataFrame(grants).drop(columns="is_individual").to_parquet(tmp_path / "t_grants.parquet")
    monkeypatch.setattr(build_profiles, "OUT", str(tmp_path / "out" / "profiles.parquet"))
    try:
        build_profiles.build([str(tmp_path)], [])
    except SystemExit as e:
        assert "privacy fix" in str(e)
    else:
        raise AssertionError("build accepted grant data without is_individual")

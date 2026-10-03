"""Generate FICTIONAL 990-PF-shaped test data so the backend can be developed and tested without IRS downloads.

  python make_synthetic.py            # writes data/interim/synthetic/synthetic_{filings,grants}.parquet
  python build_profiles.py --interim synthetic --load

Every foundation is named "... (SYNTHETIC)" and every EIN starts with "00" (not a valid IRS prefix), so this
data cannot be mistaken for real filings. NEVER load it into the production database. It is for local
Postgres only.

Planted ground truth for tests (see web/tests): 8 open foundations that fund international child hunger
(PLANTED_INTL_CHILD_HUNGER), plus decoys: domestic-only hunger funders, international health funders, and
preselected-only hunger+international funders (which must be excluded when open-only).
"""
import json
import os

import numpy as np
import pandas as pd

ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "interim", "synthetic")
rng = np.random.default_rng(568)
YEARS = (2023, 2024, 2025)

ADJ = ["Alder", "Birch", "Cedar", "Dunmore", "Elm", "Fairhaven", "Granite", "Harbor", "Ironwood", "Juniper", "Kestrel",
       "Linden", "Maple", "Northgate", "Oakridge", "Pinecrest", "Quarry", "Riverbend", "Stonebridge", "Thornfield",
       "Upland", "Vale", "Willow", "Yarrow", "Zephyr", "Ashford", "Bramble", "Copperfield"]
KIND = ["Family Foundation", "Charitable Trust", "Foundation", "Fund for Good", "Legacy Foundation", "Giving Trust"]
STATES = ["CA", "NY", "TX", "WA", "MA", "IL", "PA", "OH", "GA", "CO", "MN", "NC", "FL", "MI", "OR", "AZ", "VA", "NJ"]
COUNTRIES = ["KE", "UG", "ET", "TZ", "RW", "MW", "NP", "IN", "HT", "GT", "PE", "PH"]

RECIP = {
    "hunger_food": ["{p} Food Bank", "{p} Meals Program", "{p} Community Pantry", "{p} Hunger Relief Network"],
    "children_youth": ["{p} Children's Alliance", "{p} Youth Mentoring", "{p} Kids After School", "{p} Child Development Center"],
    "education_k12": ["{p} Elementary School", "{p} Literacy Project", "{p} Charter Academy"],
    "higher_education": ["{p} University", "{p} College Scholarship Fund"],
    "health": ["{p} Hospital", "{p} Community Health Clinic", "{p} Cancer Research Center"],
    "mental_health": ["{p} Counseling Services", "{p} Recovery Center"],
    "human_services": ["{p} Family Services", "{p} United Way", "{p} Homeless Shelter Alliance"],
    "environment": ["{p} Land Trust", "{p} Conservation Society", "{p} Watershed Alliance"],
    "arts_culture": ["{p} Museum", "{p} Symphony", "{p} Theatre Company"],
    "religion": ["{p} Baptist Church", "{p} Ministries", "{p} Synagogue"],
    "international_development": ["{p} International Relief", "{p} Global Village Project", "{p} Africa Partners"],
    "animals": ["{p} Humane Society", "{p} Animal Rescue"],
    "veterans_military": ["{p} Veterans Support", "{p} Wounded Warrior Fund"],
    "grantmaking_intermediary": ["{p} Community Foundation", "{p} Donor Advised Giving Fund"],
    "unclassified": ["{p} Holdings LLC", "The {p} Group", "{p} Associates"],
}
PURPOSE = {
    "hunger_food": ["food distribution to families", "school lunch and nutrition program", "child nutrition and meals"],
    "children_youth": ["youth programs", "early childhood development", "mentoring for children"],
    "education_k12": ["tutoring and reading", "classroom technology"],
    "health": ["patient care", "medical equipment", "clinic operations"],
    "environment": ["habitat conservation", "clean water"],
    "international_development": ["village development in East Africa", "overseas relief", "global child nutrition"],
    "arts_culture": ["exhibition support", "season sponsorship"],
    "religion": ["ministry programs"],
}
GENERIC = ["general support", "operating", "unrestricted", "charitable purposes", "annual campaign", None]
_SEEN_NAMES = set()


def unique_name():
    while True:
        n = f"{rng.choice(ADJ)} {rng.choice(ADJ)} {rng.choice(KIND)} (SYNTHETIC)"
        if n not in _SEEN_NAMES:
            _SEEN_NAMES.add(n)
            return n


PERSONAS = []   # dicts: cause_weights, geo, home, intl_share, scale, n_grants, open, tag


def persona(causes, geo="local", intl_share=0.0, scale=None, n=None, open_=True, tag=None, home=None):
    w = np.array(list(causes.values()), float)
    PERSONAS.append(dict(causes=dict(zip(causes, w / w.sum())), geo=geo, intl=intl_share,
                         scale=scale or float(rng.lognormal(9.0, 0.7)), n=n or int(rng.integers(8, 120)),
                         open=open_, tag=tag, home=home or str(rng.choice(STATES))))


# planted ground truth ------------------------------------------------------------------------------------
for _ in range(8):
    persona({"hunger_food": 4, "children_youth": 3, "international_development": 3, "unclassified": 1},
            geo="intl", intl_share=float(rng.uniform(0.55, 0.85)), scale=float(rng.uniform(15000, 40000)),
            n=int(rng.integers(20, 60)), tag="PLANTED_INTL_CHILD_HUNGER")
for _ in range(8):
    persona({"hunger_food": 5, "human_services": 2, "children_youth": 1, "unclassified": 1}, geo="local",
            tag="DECOY_DOMESTIC_HUNGER")
for _ in range(8):
    persona({"health": 5, "international_development": 3, "children_youth": 1, "unclassified": 1}, geo="intl",
            intl_share=0.7, tag="DECOY_INTL_HEALTH")
for _ in range(5):
    persona({"hunger_food": 4, "children_youth": 3, "international_development": 3}, geo="intl", intl_share=0.7,
            open_=False, tag="DECOY_PRESELECTED_INTL_CHILD_HUNGER")
# background noise ----------------------------------------------------------------------------------------
KEYS = [k for k in RECIP if k != "unclassified"]
for _ in range(330):
    picks = rng.choice(KEYS, size=int(rng.integers(1, 4)), replace=False)
    causes = {str(k): float(rng.uniform(1, 5)) for k in picks} | {"unclassified": 1.0}
    persona(causes, geo=str(rng.choice(["local", "national", "national", "intl"])),
            intl_share=float(rng.uniform(0.05, 0.4)), open_=bool(rng.random() < 0.25), tag="BACKGROUND")


def recipient(cause, p_state, country):
    base = str(rng.choice(ADJ)) + " " + str(rng.choice(["Valley", "County", "Regional", "Metro", "Coastal", "United"]))
    return str(rng.choice(RECIP[cause])).format(p=base)


def make():
    filings, grants, truth = [], [], []
    for i, p in enumerate(PERSONAS):
        ein = f"00{i + 1:07d}"
        name = unique_name()
        pre = None if p["open"] else "X"
        for yr in YEARS:
            oid = f"SYN{yr}{i + 1:06d}"
            filings.append(dict(
                object_id=oid, ein=ein, funder_name=name, funder_state=p["home"],
                tax_period_begin=f"{yr}-01-01", tax_period_end=f"{yr}-12-31", return_ts=f"{yr + 1}-04-01T00:00:00",
                return_version="2024v1", only_preselected=pre,
                app_contact_name="Grants Office (SYNTHETIC)" if p["open"] else None,
                app_contact_email=f"grants{i + 1}@example.invalid" if p["open"] else None,
                app_contact_phone="000-000-0000" if p["open"] else None,
                app_form_materials="Two-page letter of inquiry (SYNTHETIC)" if p["open"] else None,
                app_deadlines="March 1 and September 1 (SYNTHETIC)" if p["open"] else None,
                app_restrictions=None, xml_batch_id="synthetic"))
            n = max(3, int(p["n"] * rng.uniform(0.8, 1.2)))
            causes, weights = list(p["causes"]), list(p["causes"].values())
            for _ in range(n):
                c = str(rng.choice(causes, p=weights))
                foreign = (p["geo"] == "intl" and rng.random() < p["intl"]) or (c == "international_development" and rng.random() < 0.5)
                if foreign:
                    cc = str(rng.choice(COUNTRIES[:6] if p["tag"] == "PLANTED_INTL_CHILD_HUNGER" else COUNTRIES))
                    st, ctry = None, cc
                else:
                    if p["geo"] == "local":
                        st = p["home"] if rng.random() < 0.8 else str(rng.choice(STATES))
                    else:
                        st = str(rng.choice(STATES))
                    ctry = "US"
                purpose = str(rng.choice(PURPOSE[c])) if c in PURPOSE and rng.random() < 0.45 else rng.choice(GENERIC)
                grants.append(dict(
                    object_id=oid, funder_ein=ein, amount_type="paid",
                    recipient_name_raw=recipient(c, st, ctry), is_individual=False, recipient_city="Testville", recipient_state=st,
                    recipient_zip=None, recipient_country=ctry, recipient_relationship=None,
                    recipient_foundation_status="PC", grant_purpose=purpose if purpose else None,
                    amount_usd=int(max(500, rng.lognormal(np.log(p["scale"]), 0.8)) // 100 * 100)))
        truth.append(dict(ein=ein, name=name, tag=p["tag"]))
    return pd.DataFrame(filings), pd.DataFrame(grants), truth


if __name__ == "__main__":
    os.makedirs(ROOT, exist_ok=True)
    f, g, truth = make()
    f.to_parquet(os.path.join(ROOT, "synthetic_filings.parquet"))
    g.to_parquet(os.path.join(ROOT, "synthetic_grants.parquet"))
    json.dump(truth, open(os.path.join(ROOT, "truth.json"), "w"), indent=1)
    print(f"{len(PERSONAS)} synthetic foundations, {len(f)} filings, {len(g):,} grants -> {ROOT}")

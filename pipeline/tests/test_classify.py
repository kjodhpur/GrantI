"""Rule-based classifier: keywords, NTEE codes and phrase rewrites (names are made up)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from classify import UNCLASSIFIED, Classifier  # noqa: E402

C = Classifier()


def test_ntee_leads_and_keywords_add():
    assert C.classify("Example Food Bank", "general support", "K31") == ["hunger_food"]
    assert C.classify("Hope Center", "general support", "P30") == ["children_youth"]   # longest prefix beats P
    assert C.classify("Hope Center", "general support", None) == [UNCLASSIFIED]


def test_agriculture_ntee_is_not_hunger():
    assert C.ntee_cause("K25") is None and C.ntee_cause("K40") == "hunger_food"


def test_animal_shelter_is_not_housing():
    assert C.classify("Happy Tails Animal Shelter", "general support") == ["animals"]
    assert C.classify("Family Shelter of Example County", "operating") == ["housing"]

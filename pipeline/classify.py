"""Rule-based grant classifier: recipient name + purpose text -> up to 3 cause ids (multi-label).

Vocabulary lives in web/lib/taxonomy.json (shared with the web app). This is the offline, free,
deterministic baseline. It is deliberately conservative: a grant with no keyword hit is
'unclassified' rather than guessed. Task 3 in docs/06-NEXT-TASKS.md replaces or augments this with
an LLM pass over the unique (recipient, purpose) pairs and compares against this baseline.

Rules
  * Recipient name is the primary signal (weight 1.0 per keyword hit). Purpose text adds 1.5 per hit.
    42% of real purposes are generic ("general support"), so purpose is never required.
  * Generic purpose phrases are stripped before matching so "operating support" cannot match "operating".
  * A grant gets every cause scoring >= 60% of its best score (and >= 1 hit), max 3, so "child nutrition in
    Ethiopia" is children + hunger + international rather than one arbitrary winner. Shares built from
    these labels mean "share of dollars touching this cause" and can sum to more than 100%.
  * Order in taxonomy.json breaks ties when trimming to 3. 'grantmaking_intermediary' is dropped whenever
    a real cause also matches, and is otherwise excluded from matching downstream.
"""
import json
import os
import re

import pandas as pd

TAXONOMY_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "lib", "taxonomy.json")
UNCLASSIFIED = "unclassified"
NAME_WEIGHT, PURPOSE_WEIGHT = 1.0, 1.5
RELATIVE_CUTOFF, MAX_LABELS = 0.6, 3
INTERMEDIARY = "grantmaking_intermediary"


def load_taxonomy(path=TAXONOMY_PATH):
    with open(path) as f:
        return json.load(f)


def _compile(keywords):
    parts = []
    for kw in keywords:
        kw = kw.lower().strip()
        if kw.endswith("*"):
            parts.append(r"\b" + re.escape(kw[:-1]))
        else:
            parts.append(r"\b" + re.escape(kw) + r"\b")
    return re.compile("|".join(parts))


class Classifier:
    def __init__(self, taxonomy=None):
        self.tax = taxonomy or load_taxonomy()
        self.causes = [(c["id"], _compile(c["keywords"])) for c in self.tax["causes"]]
        generic = sorted(self.tax["generic_purposes"], key=len, reverse=True)
        self.generic = re.compile(r"\b(" + "|".join(re.escape(g) for g in generic) + r")\b")

    def classify(self, name, purpose):
        """Return a list of cause ids, best first. [UNCLASSIFIED] when nothing matches."""
        name = name.lower() if isinstance(name, str) else ""       # nulls arrive as NaN from pandas
        purpose = self.generic.sub(" ", purpose.lower()) if isinstance(purpose, str) else ""
        scored = []
        for order, (cid, rx) in enumerate(self.causes):
            score = NAME_WEIGHT * len(rx.findall(name)) + PURPOSE_WEIGHT * len(rx.findall(purpose))
            if score > 0:
                scored.append((-score, order, cid))
        if not scored:
            return [UNCLASSIFIED]
        scored.sort()
        best = -scored[0][0]
        keep = [cid for neg, _, cid in scored if -neg >= RELATIVE_CUTOFF * best]
        if len(keep) > 1 and INTERMEDIARY in keep:
            keep.remove(INTERMEDIARY)
        return keep[:MAX_LABELS]

    def classify_frame(self, df, name_col="recipient_name_raw", purpose_col="grant_purpose"):
        """Return a Series of cause-id lists aligned to df. Classifies each unique pair once."""
        pairs = df[[name_col, purpose_col]].drop_duplicates().reset_index(drop=True)
        pairs["cause_list"] = [self.classify(n, p) for n, p in zip(pairs[name_col], pairs[purpose_col])]
        merged = df[[name_col, purpose_col]].merge(pairs, on=[name_col, purpose_col], how="left")
        return pd.Series(merged["cause_list"].values, index=df.index)


if __name__ == "__main__":
    c = Classifier()
    for n, p in [("Feeding America", "general support"), ("Kenya Schools Project", "school lunch program"),
                 ("First Baptist Church", "operating"), ("Community Foundation of Ohio", None),
                 ("Save the Children", "child nutrition in Ethiopia"), ("Random LLC", "general support")]:
        print(f"{n!r:40} {p!r:32} -> {c.classify(n, p)}")

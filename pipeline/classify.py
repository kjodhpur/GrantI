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
  * When the recipient matched the IRS Business Master File (pipeline/resolve.py), its NTEE code adds the
    cause with the longest matching `ntee` prefix in taxonomy.json, ranked first: the registered purpose of
    the organization is a stronger signal than keywords. Keywords still add secondary labels.
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
        self.ntee = sorted(((code, c["id"]) for c in self.tax["causes"] for code in c.get("ntee", [])),
                           key=lambda x: -len(x[0]))     # longest prefix first
        self.rewrites = [(re.compile(r"\b" + re.escape(a) + r"\b"), b) for a, b in self.tax.get("rewrites", [])]
        generic = sorted(self.tax["generic_purposes"], key=len, reverse=True)
        self.generic = re.compile(r"\b(" + "|".join(re.escape(g) for g in generic) + r")\b")

    def ntee_cause(self, ntee):
        if not isinstance(ntee, str) or not ntee:
            return None
        code = ntee.strip().upper()
        return next((cid for prefix, cid in self.ntee if code.startswith(prefix)), None)

    def classify(self, name, purpose, ntee=None):
        """Return a list of cause ids, best first. [UNCLASSIFIED] when nothing matches."""
        keep = self._keywords(name, purpose)
        nc = self.ntee_cause(ntee)
        if nc:
            keep = [nc] + [c for c in keep if c not in (nc, UNCLASSIFIED)]
        if len(keep) > 1 and INTERMEDIARY in keep:
            keep.remove(INTERMEDIARY)
        return keep[:MAX_LABELS]

    def _rewrite(self, text):
        for rx, repl in self.rewrites:
            text = rx.sub(repl, text)
        return text

    def _keywords(self, name, purpose):
        name = self._rewrite(name.lower()) if isinstance(name, str) else ""       # nulls arrive as NaN from pandas
        purpose = self.generic.sub(" ", self._rewrite(purpose.lower())) if isinstance(purpose, str) else ""
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

    def classify_frame(self, df, name_col="recipient_name_raw", purpose_col="grant_purpose", ntee_col="recipient_ntee"):
        """Return a Series of cause-id lists aligned to df. Classifies each unique (name, purpose, NTEE) once."""
        cols = [name_col, purpose_col] + ([ntee_col] if ntee_col in df else [])
        keys = df[cols].drop_duplicates().reset_index(drop=True)
        ntee = keys[ntee_col] if ntee_col in keys else [None] * len(keys)
        keys["cause_list"] = [self.classify(n, p, t) for n, p, t in zip(keys[name_col], keys[purpose_col], ntee)]
        merged = df[cols].merge(keys, on=cols, how="left")
        return pd.Series(merged["cause_list"].values, index=df.index)


if __name__ == "__main__":
    c = Classifier()
    for n, p in [("Feeding America", "general support"), ("Kenya Schools Project", "school lunch program"),
                 ("First Baptist Church", "operating"), ("Community Foundation of Ohio", None),
                 ("Save the Children", "child nutrition in Ethiopia"), ("Random LLC", "general support")]:
        print(f"{n!r:40} {p!r:32} -> {c.classify(n, p)}")

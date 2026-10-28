"""Unconstrained reference (M5) for the benchmark in docs/preregistration-benchmark.md.

Fits LightGBM gradient boosted trees on every column of the Korea Customs declaration dataset, including
columns Madoun does not use (office, process type, import type, declarant, seller, courier, tax columns).
It exists to show how much ranking skill the explainable model gives up, not to be deployed.

    pip install lightgbm numpy
    node scripts/fetch-reference-data.mjs
    python scripts/ceiling.py

Writes docs/data/ceiling-scores.json (scores for the validation and test months, in file order), which
`npm run benchmark` reads. Everything is seeded; the grid is the one in the preregistration.
"""
import csv
import json
import os
import sys
from datetime import date

import lightgbm as lgb
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data", "external", "korea-customs")
OUT = os.path.join(ROOT, "docs", "data", "ceiling-scores.json")

CATEGORICAL = [
    "Office ID", "Process Type", "Import Type", "Import Use", "Payment Type", "Mode of Transport",
    "Declarant ID", "Importer ID", "Seller ID", "Courier ID", "HS6 Code", "Country of Departure",
    "Country of Origin", "Tax Type", "Country of Origin Indicator",
]
NUMERIC = ["Tax Rate", "Net Mass", "Item Price"]


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def day_of_week(s):
    y, m, d = (int(x) for x in s.split("-"))
    return date(y, m, d).weekday()


def main():
    try:
        train, valid, test = (load(f"df_syn_{s}_eng.csv") for s in ("train", "valid", "test"))
    except FileNotFoundError:
        sys.exit("Run node scripts/fetch-reference-data.mjs first.")

    # Level codes come from the training rows only. A level never seen in training becomes -1 (missing).
    vocab = {c: {v: i for i, v in enumerate(sorted({r[c] for r in train}))} for c in CATEGORICAL}

    def matrix(rows):
        cols = [[vocab[c].get(r[c], -1) for r in rows] for c in CATEGORICAL]
        cols += [[float(r[c]) for r in rows] for c in NUMERIC]
        cols += [[day_of_week(r["Date"]) for r in rows]]
        return np.array(cols, dtype=float).T

    X = {"train": matrix(train), "valid": matrix(valid), "test": matrix(test)}
    names = CATEGORICAL + NUMERIC + ["Day of week"]
    cat_idx = list(range(len(CATEGORICAL)))

    def target(rows, which):
        if which == "fraud":
            return np.array([int(r["Fraud"]) == 1 for r in rows], dtype=int)
        return np.array([int(r["Critical Fraud"]) == 2 for r in rows], dtype=int)

    out = {
        "about": "Scores of the unconstrained reference model (M5) from scripts/ceiling.py. Rows are in file order.",
        "library": f"lightgbm {lgb.__version__}",
        "seed": 1,
        "grid": {"num_leaves": [15, 31, 63], "learning_rate": 0.05, "early_stopping_rounds": 50},
    }
    for which in ("fraud", "critical"):
        ytr, yva = target(train, which), target(valid, which)
        best = None
        for leaves in (15, 31, 63):
            clf = lgb.LGBMClassifier(
                n_estimators=2000, learning_rate=0.05, num_leaves=leaves, random_state=1,
                deterministic=True, force_row_wise=True, n_jobs=1, verbose=-1,
            )
            clf.fit(
                X["train"], ytr, eval_set=[(X["valid"], yva)], eval_metric="auc",
                categorical_feature=cat_idx, feature_name=names,
                callbacks=[lgb.early_stopping(50, verbose=False)],
            )
            auc = clf.best_score_["valid_0"]["auc"]
            if best is None or auc > best[0]:
                best = (auc, leaves, clf)
        auc, leaves, clf = best
        out[which] = {
            "num_leaves": leaves,
            "best_iteration": int(clf.best_iteration_),
            "valid": [round(float(x), 6) for x in clf.predict_proba(X["valid"])[:, 1]],
            "test": [round(float(x), 6) for x in clf.predict_proba(X["test"])[:, 1]],
        }
        print(f"{which}: leaves={leaves} iterations={clf.best_iteration_} validation AUC={auc:.4f}")

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")
    print("wrote", os.path.relpath(OUT, ROOT))


if __name__ == "__main__":
    main()

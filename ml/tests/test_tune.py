"""Tests of the Optuna search (model/tune.py) on a tiny synthetic dataset:
fast, no real data needed."""
import json

import numpy as np
import pandas as pd
import yaml

from BaselineModel.data.data import Dataset
from BaselineModel.model.tune import match_folds, tune


def tiny_dataset(n_matches=30, shots_per_match=20, seed=0):
    rng = np.random.default_rng(seed)
    n = n_matches * shots_per_match
    distance = rng.uniform(2, 35, n)
    y = (rng.uniform(size=n) < 1 / (1 + np.exp(0.15 * distance - 1))).astype(int)
    X = pd.DataFrame({"distance": distance, "angle": rng.uniform(0, 1.5, n)})
    shots = pd.DataFrame({"match_id": np.repeat(np.arange(n_matches), shots_per_match), "split": "train"})
    masks = {"train": np.ones(n, bool), "validation": np.zeros(n, bool), "test": np.zeros(n, bool)}
    return Dataset(shots, X, y, masks, shots, X, 0.73, {})


CFG = {
    "seed": 1,
    "model": {"n_estimators": 50, "learning_rate": 0.1, "max_depth": 3, "early_stopping_rounds": 10},
    "tuning": {
        "n_trials": 3,
        "timeout_minutes": 2,
        "cv_folds": 3,
        "search_space": {"learning_rate": [0.05, 0.3, "log"], "max_depth": [2, 4]},
    },
}


def test_folds_never_split_a_match():
    data = tiny_dataset()
    for fit_idx, score_idx in match_folds(data.shots, 3, seed=1):
        fit_matches = set(data.shots["match_id"].iloc[fit_idx])
        score_matches = set(data.shots["match_id"].iloc[score_idx])
        assert not fit_matches & score_matches


def test_tune_writes_best_config_and_never_edits_the_input(tmp_path):
    cfg = json.loads(json.dumps(CFG))
    summary = tune(tiny_dataset(), cfg, cfg["seed"], tmp_path)
    out = next(tmp_path.glob("tuning_*"))

    assert cfg == CFG  # the input config is untouched
    assert summary["trials_complete"] + summary["trials_pruned"] == 3
    # Trial 0 is the current config, as the reference.
    trials = pd.read_csv(out / "trials.csv")
    assert trials.loc[0, "params_max_depth"] == CFG["model"]["max_depth"]

    best = yaml.safe_load((out / "best_config.yaml").read_text())
    assert best["model"]["max_depth"] == summary["best_params"]["max_depth"]
    assert best["tuned_from"]["study"] == out.name
    assert (out / "study.db").exists()

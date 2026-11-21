"""Data orchestration: load the parquet files, split by match, drop penalties,
build X / y. Feature engineering itself lives in build_features.py, never here.

build_features() runs ONCE per run, over every shot (penalties included). The
result is saved as OUTPUT_AI/<run>/features.parquet and everything else (the
model rows, the shots.csv for Node, --only-evaluate) reads from it."""
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from ..build_features import build_features

RENAME = {
    "shot_body_part_name": "body_part",
    "shot_technique_name": "technique",
    "shot_type_name": "shot_type",
    "play_pattern_name": "play_pattern",
}
SPLITS = ("train", "validation", "test")
# Saved next to the features so a run's file can be checked against the data.
ID_COLUMNS = ["match_id", "split", "is_goal", "xg_statsbomb"]


@dataclass
class Dataset:
    shots: pd.DataFrame        # model rows (penalties out if configured), with "split"
    X: pd.DataFrame            # features, aligned with shots
    y: np.ndarray
    masks: dict                # split name -> boolean array over shots
    all_shots: pd.DataFrame    # every shot, penalties included, with "split"
    all_X: pd.DataFrame        # features of every shot, aligned with all_shots
    penalty_xg: float
    quality: dict

    def part(self, name):
        m = self.masks[name]
        return self.X[m], self.y[m], self.shots[m]


def load_raw(path):
    path = Path(path)
    df = pd.concat([pd.read_parquet(path / f"{s}.parquet") for s in SPLITS])
    return df.rename(columns=RENAME).reset_index(drop=True)


def check_quality(df):
    """Fail loudly on what would silently break the comparison."""
    nulls = df.isna().sum()
    xg_nulls = int(nulls.get("xg_statsbomb", 0))
    if xg_nulls:
        raise ValueError(f"xg_statsbomb has {xg_nulls} nulls: the three-way comparison needs it on every shot")
    return {
        "rows": int(len(df)),
        "matches": int(df["match_id"].nunique()),
        "nulls_by_column": {k: int(v) for k, v in nulls.items() if v},
        "xg_statsbomb_nulls": xg_nulls,
        "x_beyond_goal_line": int((df["x"] > 120).sum()),
    }


def assign_splits(df, cfg, seed):
    """Split the *matches* train/validation/test; demo matches forced to test."""
    demo_ids = [m["match_id"] for m in cfg.get("demo_matches", [])]
    missing = sorted(set(demo_ids) - set(df["match_id"]))
    if missing:
        raise ValueError(f"Demo match id(s) not in the dataset: {missing}. Fix demo_matches in config.yaml")

    share = cfg["data"]["split"]
    is_demo = df["match_id"].isin(demo_ids)
    rest = df[~is_demo]
    hold_share = share["validation"] + share["test"]
    outer = GroupShuffleSplit(n_splits=1, test_size=hold_share, random_state=seed)
    train_idx, hold_idx = next(outer.split(rest, groups=rest["match_id"]))
    hold = rest.iloc[hold_idx]
    inner = GroupShuffleSplit(n_splits=1, test_size=share["test"] / hold_share, random_state=seed)
    val_idx, _ = next(inner.split(hold, groups=hold["match_id"]))

    split = pd.Series("test", index=df.index)
    split[rest.index[train_idx]] = "train"
    split[hold.index[val_idx]] = "validation"
    return split


def save_features(data, path):
    """This run's features, one row per shot (penalties included)."""
    frame = pd.concat([data.all_shots[ID_COLUMNS].reset_index(drop=True), data.all_X.reset_index(drop=True)], axis=1)
    frame.to_parquet(path, index=False)


def load_features(path, df):
    """Read a run's features.parquet and check it belongs to these shots."""
    saved = pd.read_parquet(path)
    if len(saved) != len(df):
        raise ValueError(f"{path} has {len(saved)} rows, the data has {len(df)}: the dataset changed")
    for col in ID_COLUMNS:
        if not saved[col].reset_index(drop=True).equals(df[col].reset_index(drop=True)):
            raise ValueError(f"{path}: column {col} does not match the data (dataset or split changed)")
    return saved.drop(columns=ID_COLUMNS)


def prepare(cfg, seed, features_path=None):
    """features_path: a saved features.parquet to reuse (--only-evaluate).
    Without it, the features are built here, once."""
    df = load_raw(cfg["data"]["path"])
    quality = check_quality(df)
    df["split"] = assign_splits(df, cfg, seed)
    X_all = load_features(features_path, df) if features_path else build_features(df)

    is_pen = df["shot_type"].eq("Penalty")
    penalty_xg = float(df.loc[is_pen, "is_goal"].mean())
    quality["penalties"] = int(is_pen.sum())

    keep = (~is_pen if cfg["data"]["exclude_penalties"] else pd.Series(True, index=df.index)).to_numpy()
    shots = df[keep].reset_index(drop=True)
    X = X_all[keep].reset_index(drop=True)
    y = shots["is_goal"].to_numpy()
    masks = {s: (shots["split"] == s).to_numpy() for s in SPLITS}
    return Dataset(shots, X, y, masks, df, X_all, penalty_xg, quality)


def split_sizes(data):
    return {
        s: {"shots": int(m.sum()), "matches": int(data.shots.loc[m, "match_id"].nunique())}
        for s, m in data.masks.items()
    }


def export_shots_csv(data, path):
    """Every shot with this run's split, for the Node ETL. Distance and angle
    are the ones computed by build_features.py: Node must never recompute them."""
    df = data.all_shots.drop(columns=["distance_to_goal", "angle_to_goal"]).copy()
    feats = data.all_X
    df["distance"] = feats["distance"].round(3)
    df["angle_deg"] = np.degrees(feats["angle"]).round(3)
    df.to_csv(path, index=False)
    return len(df)

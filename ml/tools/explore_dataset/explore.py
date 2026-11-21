"""Builds one interactive HTML explorer per shots parquet (train, validation, test).

Run inside the ML image (or: ml/run.sh explore [RUN]):
    docker run --rm -v <repo>/data:/data -v <repo>/ml:/app footboard-ml python tools/explore_dataset/explore.py [RUN]

The features are NOT recomputed: they are read from OUTPUT_AI/<RUN>/features.parquet,
written by the training pipeline (default RUN: the latest run that has one).

Writes tools/explore_dataset/output/explore_<split>.html: self-contained (data embedded), opens in any
browser. Lets you pick a feature, group by a column and filter, and shows its
distribution, the goal rate along it, a goal-rate map of the pitch and a table.
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

import sys

ML = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ML))  # ml/ on the path
from BaselineModel.data.data import SPLITS  # noqa: E402  same file order as the pipeline

DATA = Path("/data/statsbomb_shots")
OUTPUT = ML / "OUTPUT_AI"
CHECK = ["match_id", "is_goal", "xg_statsbomb"]
HERE = Path(__file__).parent
REPORTS = HERE / "output"

RENAME = {
    "competition_name": "competition",
    "season_name": "season",
    "shot_outcome_name": "outcome",
    "shot_body_part_name": "body_part",
    "shot_technique_name": "technique",
    "shot_type_name": "shot_type",
    "play_pattern_name": "play_pattern",
}

# column -> (label, kind). kind: "num" (binned) or "cat" (one bar per value).
COLUMNS = {
    "distance": ("Distancia a portería (nuestra, yardas)", "num"),
    "angle_deg": ("Ángulo de portería visible (nuestro, grados)", "num"),
    "lateral_offset": ("Desvío lateral del centro (yardas)", "num"),
    "x": ("x (largo del campo, 120 = línea de gol)", "num"),
    "y": ("y (ancho del campo, 40 = centro)", "num"),
    "distance_to_goal": ("Distancia del dataset", "num"),
    "angle_to_goal": ("Ángulo del dataset", "num"),
    "xg_statsbomb": ("xG de StatsBomb", "num"),
    "body_part": ("Parte del cuerpo", "cat"),
    "technique": ("Técnica", "cat"),
    "shot_type": ("Tipo de tiro", "cat"),
    "play_pattern": ("Origen de la jugada", "cat"),
    "under_pressure": ("Bajo presión", "cat"),
    "in_box": ("Dentro del área", "cat"),
    "outcome": ("Resultado del tiro", "cat"),
    "is_goal": ("Gol", "cat"),
    "competition": ("Competición", "cat"),
    "season": ("Temporada", "cat"),
}

TEMPLATE = (HERE / "explore_template.html").read_text(encoding="utf-8")


def find_features(run=None):
    if run:
        path = OUTPUT / run / "features.parquet"
        if not path.exists():
            raise SystemExit(f"{path} does not exist: train that run again or pick another")
        return path
    found = sorted(OUTPUT.glob("*/features.parquet"))
    if not found:
        raise SystemExit("No run with features.parquet in OUTPUT_AI/: train once first (ml/run.sh train)")
    return found[-1]


def load_all(features_path):
    """The three dataset files, in the pipeline's order, plus that run's saved features."""
    parts = [pd.read_parquet(DATA / f"{s}.parquet").assign(file=s) for s in SPLITS]
    df = pd.concat(parts).rename(columns=RENAME).reset_index(drop=True)
    feats = pd.read_parquet(features_path)
    if len(feats) != len(df) or not all(feats[c].equals(df[c]) for c in CHECK):
        raise SystemExit(f"{features_path} does not match the dataset: train again")
    return df, feats


def prepare(df, feats):
    df = df.copy()
    df["distance"] = feats["distance"].round(2)
    df["angle_deg"] = np.degrees(feats["angle"]).round(2)
    df["lateral_offset"] = feats["lateral_offset"].round(2)
    df["in_box"] = feats["in_box"].map({1: "Sí", 0: "No"})
    df["under_pressure"] = df["under_pressure"].map({True: "Sí", False: "No"})
    df["is_goal"] = df["is_goal"].map({1: "Gol", 0: "No gol"})
    df["goal"] = (df["is_goal"] == "Gol").astype(int)
    return df


def encode(df):
    """Columnar JSON: numbers as arrays, categories as codes + dictionary."""
    cols = {}
    for name, (label, kind) in COLUMNS.items():
        if kind == "num":
            vals = df[name].astype(float).round(4)
            cols[name] = {"label": label, "kind": kind,
                          "values": [None if math.isnan(v) else v for v in vals]}
        else:
            cat = df[name].astype(str).astype("category")
            cols[name] = {"label": label, "kind": kind,
                          "dict": list(cat.cat.categories), "values": cat.cat.codes.tolist()}
    cols["goal"] = {"label": "Gol (0/1)", "kind": "raw", "values": df["goal"].tolist()}
    return cols


def main():
    features_path = find_features(sys.argv[1] if len(sys.argv) > 1 else None)
    print(f"Features from {features_path.parent.name}/features.parquet")
    all_df, all_feats = load_all(features_path)
    REPORTS.mkdir(exist_ok=True)
    for split in SPLITS:
        mask = (all_df["file"] == split).to_numpy()
        df = prepare(all_df[mask].reset_index(drop=True), all_feats[mask].reset_index(drop=True))
        payload = json.dumps({"split": split, "rows": len(df), "columns": encode(df)},
                             ensure_ascii=False, separators=(",", ":"))
        html = TEMPLATE.replace("__TITLE__", f"Tiros StatsBomb · {split}").replace("__DATA__", payload)
        out = REPORTS / f"explore_{split}.html"
        out.write_text(html, encoding="utf-8")
        print(f"{out.name}: {len(df)} shots, {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()

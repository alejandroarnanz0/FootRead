"""xG inference service (CLAUDE.md 11.3). Loads a trained run at startup and
never trains while serving.

    uvicorn serve:app --host 0.0.0.0 --port 8000

Which run: env MODEL_RUN (a folder name in OUTPUT_AI/); by default the most
recent run that has a model.json.

POST /predict receives a *raw* shot and builds its features with
BaselineModel.build_features.build_features, the same function used in training, so
the service can never drift from what the model learned.
"""
import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
import shap
import xgboost as xgb
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

import joblib
from BaselineModel.build_features import build_features, feature_names
from BaselineModel.model.train import calibrate

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "OUTPUT_AI"
MAX_BATCH = 500


class RawShot(BaseModel):
    """A shot as StatsBomb describes it (field names as in build_features.py)."""

    x: float = Field(ge=0, le=125, description="0-120, attacking towards x = 120")
    y: float = Field(ge=0, le=80)
    under_pressure: bool = False
    body_part: Optional[str] = Field(None, examples=["Right Foot"])
    technique: Optional[str] = Field(None, examples=["Normal"])
    shot_type: Optional[str] = Field(None, examples=["Open Play"])
    play_pattern: Optional[str] = Field(None, examples=["Regular Play"])


class Batch(BaseModel):
    shots: list[RawShot] = Field(min_length=1, max_length=MAX_BATCH)


def pick_run():
    name = os.environ.get("MODEL_RUN")
    if name:
        run = OUTPUT / name
        if not (run / "model.json").exists():
            raise RuntimeError(f"MODEL_RUN={name}: no model.json in {run}")
        return run
    runs = sorted(p for p in OUTPUT.glob("*") if (p / "model.json").exists())
    if not runs:
        raise RuntimeError(f"No trained run in {OUTPUT}: train first (python -m BaselineModel.main)")
    return runs[-1]


class XgModel:
    def __init__(self, run_dir):
        self.run = run_dir.name
        meta = json.loads((run_dir / "features.json").read_text())
        # The saved model and today's feature function must agree, or every
        # prediction would be silently wrong.
        if meta["features"] != feature_names():
            raise RuntimeError(f"Run {self.run} was trained with other features than BaselineModel/build_features.py")
        self.features = meta["features"]
        self.penalty_xg = float(meta["penalty_xg"])
        self.model = xgb.XGBClassifier()
        self.model.load_model(run_dir / "model.json")
        self.calibrator = joblib.load(run_dir / "calibrator.joblib")
        self.explainer = shap.TreeExplainer(self.model)

    def predict(self, shots):
        """shots: list[RawShot] -> list of {xg, xgRaw, shapValues, baseValue, penalty}."""
        out = [None] * len(shots)
        regular = [i for i, s in enumerate(shots) if s.shot_type != "Penalty"]
        for i, s in enumerate(shots):
            if s.shot_type == "Penalty":
                # Penalties are out of the model: fixed empirical conversion rate.
                out[i] = {"xg": self.penalty_xg, "xgRaw": None, "shapValues": {}, "baseValue": None, "penalty": True}
        if regular:
            X = build_features([shots[i].model_dump() for i in regular])
            raw = self.model.predict_proba(X)[:, 1]
            cal = calibrate(self.calibrator, raw)
            sv = self.explainer.shap_values(X)
            base = float(np.ravel(self.explainer.expected_value)[0])
            for k, i in enumerate(regular):
                out[i] = {
                    "xg": round(float(cal[k]), 4),
                    "xgRaw": round(float(raw[k]), 4),
                    # Contribution of each feature to the log-odds of the raw model.
                    "shapValues": {f: round(float(v), 4) for f, v in zip(self.features, sv[k]) if v != 0},
                    "baseValue": round(base, 4),
                    "penalty": False,
                }
        return out


xg_model = XgModel(pick_run())
app = FastAPI(title="Footboard xG service")


@app.get("/health")
def health():
    return {"status": "ok", "run": xg_model.run, "features": len(xg_model.features)}


@app.post("/predict")
def predict(shot: RawShot):
    return {**xg_model.predict([shot])[0], "run": xg_model.run}


@app.post("/predict/batch")
def predict_batch(batch: Batch):
    if len(batch.shots) > MAX_BATCH:
        raise HTTPException(413, f"At most {MAX_BATCH} shots per batch")
    return {"predictions": xg_model.predict(batch.shots), "run": xg_model.run}

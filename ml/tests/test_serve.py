"""Tests of the xG service and of the shared feature function.
Run inside the image: python -m pytest tests -q   (needs a trained run in OUTPUT_AI/)"""
import math

import pytest
from fastapi.testclient import TestClient

from BaselineModel.build_features import build_features, feature_names, goal_angle

import serve

client = TestClient(serve.app)

CENTRAL = {"x": 108, "y": 40, "body_part": "Right Foot", "technique": "Normal",
           "shot_type": "Open Play", "play_pattern": "Regular Play", "under_pressure": False}


# --- build_features.py: the function training and serving share -------------------

def test_feature_columns_are_stable():
    X = build_features([CENTRAL])
    assert list(X.columns) == feature_names()
    assert len(X.columns) == 33


def test_distance_and_angle_geometry():
    X = build_features([CENTRAL]).iloc[0]
    assert X["distance"] == pytest.approx(12.0)
    # Goal 8 yards wide seen from 12 yards in front: 2 * atan(4 / 12)
    assert X["angle"] == pytest.approx(2 * math.atan(4 / 12))
    assert X["in_box"] == 1 and X["in_six_yard_box"] == 0
    assert goal_angle(120, 0) < goal_angle(110, 40)  # byline sees almost nothing


def test_unknown_categories_fall_into_unknown():
    X = build_features([{**CENTRAL, "technique": "Rabona"}]).iloc[0]
    assert X["technique=unknown"] == 1 and X["technique=normal"] == 0


# --- the service ----------------------------------------------------------------

def test_health_reports_the_loaded_run():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok" and res.json()["features"] == 33


def test_predict_returns_xg_and_shap():
    body = client.post("/predict", json=CENTRAL).json()
    assert 0 < body["xg"] < 1
    assert "distance" in body["shapValues"] and "angle" in body["shapValues"]
    assert body["penalty"] is False


def test_closer_shots_are_worth_more():
    near = client.post("/predict", json={**CENTRAL, "x": 114}).json()["xg"]
    far = client.post("/predict", json={**CENTRAL, "x": 90}).json()["xg"]
    assert near > far


def test_penalty_gets_the_fixed_rate():
    body = client.post("/predict", json={**CENTRAL, "shot_type": "Penalty"}).json()
    assert body["penalty"] is True and body["xg"] == serve.xg_model.penalty_xg


def test_batch_keeps_order_and_mixes_penalties():
    shots = [{**CENTRAL, "x": 114}, {**CENTRAL, "shot_type": "Penalty"}, {**CENTRAL, "x": 90}]
    preds = client.post("/predict/batch", json={"shots": shots}).json()["predictions"]
    assert len(preds) == 3 and preds[1]["penalty"] is True
    assert preds[0]["xg"] > preds[2]["xg"]


def test_invalid_shot_is_rejected():
    assert client.post("/predict", json={"y": 40}).status_code == 422  # no x
    assert client.post("/predict", json={**CENTRAL, "y": 99}).status_code == 422
    assert client.post("/predict/batch", json={"shots": []}).status_code == 422

"""Training: baseline logistic regression, XGBoost and its calibration."""
import json
import time

import joblib
import numpy as np
import xgboost as xgb
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

BASELINE_FEATURES = ["distance", "angle"]


def fit_calibrator(method, p_val, y_val):
    """Returns {"method", "model"}; apply with calibrate()."""
    if method == "isotonic":
        model = IsotonicRegression(out_of_bounds="clip", y_min=0.001, y_max=0.999).fit(p_val, y_val)
    elif method == "sigmoid":  # Platt scaling on the log-odds
        model = LogisticRegression().fit(_logit(p_val).reshape(-1, 1), y_val)
    elif method == "none":
        model = None
    else:
        raise ValueError(f"Unknown calibration method: {method}")
    return {"method": method, "model": model}


def calibrate(calibrator, p):
    method, model = calibrator["method"], calibrator["model"]
    if method == "isotonic":
        return model.predict(p)
    if method == "sigmoid":
        return model.predict_proba(_logit(p).reshape(-1, 1))[:, 1]
    return p


def _logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


def train(data, cfg, seed):
    start = time.time()
    X_tr, y_tr, _ = data.part("train")
    X_val, y_val, _ = data.part("validation")

    baseline = make_pipeline(StandardScaler(), LogisticRegression())
    baseline.fit(X_tr[BASELINE_FEATURES], y_tr)

    model = xgb.XGBClassifier(
        objective="binary:logistic", eval_metric="logloss", random_state=seed, **cfg["model"]
    )
    # Validation last: early stopping watches the last eval set.
    model.fit(X_tr, y_tr, eval_set=[(X_tr, y_tr), (X_val, y_val)], verbose=False)
    history = model.evals_result()

    calibrator = fit_calibrator(cfg["calibration"]["method"], model.predict_proba(X_val)[:, 1], y_val)
    return {
        "model": model,
        "baseline": baseline,
        "calibrator": calibrator,
        "history": {
            "train": history["validation_0"]["logloss"],
            "validation": history["validation_1"]["logloss"],
            "best_iteration": int(model.best_iteration),
        },
        "seconds": round(time.time() - start, 1),
    }


def save(trained, run_dir):
    trained["model"].save_model(run_dir / "model.json")
    joblib.dump(trained["calibrator"], run_dir / "calibrator.joblib")
    joblib.dump(trained["baseline"], run_dir / "baseline.joblib")
    (run_dir / "training_history.json").write_text(json.dumps(trained["history"]))


def load(run_dir):
    model = xgb.XGBClassifier()
    model.load_model(run_dir / "model.json")
    return {
        "model": model,
        "calibrator": joblib.load(run_dir / "calibrator.joblib"),
        "baseline": joblib.load(run_dir / "baseline.joblib"),
        "history": json.loads((run_dir / "training_history.json").read_text()),
    }

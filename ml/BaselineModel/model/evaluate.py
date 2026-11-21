"""Inference on test and every analysis of the model. Works on a saved run, so
plots and error analysis can change without retraining."""
import json

import numpy as np
import pandas as pd
import shap
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score

from ..plots import plots
from ..build_features import build_features
from .train import BASELINE_FEATURES, calibrate

EPS = 1e-6
# Distance bands, in yards (StatsBomb pitch units, 120 x 80).
DISTANCE_BANDS = [0, 6, 12, 18, 30, np.inf]
DISTANCE_LABELS = ["0-6", "6-12", "12-18", "18-30", "30+"]


def scores(y, p):
    p = np.clip(p, EPS, 1 - EPS)
    return {
        "log_loss": round(float(log_loss(y, p)), 4),
        "brier": round(float(brier_score_loss(y, p)), 4),
        "pr_auc": round(float(average_precision_score(y, p)), 4),
        "roc_auc": round(float(roc_auc_score(y, p)), 4),
        "mean_xg": round(float(p.mean()), 4),
        "goal_rate": round(float(np.mean(y)), 4),
    }


def pointwise_log_loss(y, p):
    p = np.clip(p, EPS, 1 - EPS)
    return -(y * np.log(p) + (1 - y) * np.log(1 - p))


def bootstrap_diff(y, p_a, p_b, match_ids, iterations, seed):
    """95% CI of log loss(a) - log loss(b), resampling whole *matches* with
    replacement (shots of one match are not independent)."""
    diff = pointwise_log_loss(y, p_a) - pointwise_log_loss(y, p_b)
    frame = pd.DataFrame({"m": match_ids, "d": diff})
    per_match = frame.groupby("m")["d"].agg(["sum", "count"])
    sums, counts = per_match["sum"].to_numpy(), per_match["count"].to_numpy()
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(sums), size=(iterations, len(sums)))
    samples = sums[idx].sum(axis=1) / counts[idx].sum(axis=1)
    low, high = np.percentile(samples, [2.5, 97.5])
    return {
        "observed": round(float(diff.mean()), 5),
        "ci95": [round(float(low), 5), round(float(high), 5)],
        "significant": bool(low > 0 or high < 0),
        "iterations": iterations,
        "resampled_unit": "match",
    }


def most_common_context(shots):
    """Typical non-positional values, used to probe the model (heatmap, dependence)."""
    return {c: shots[c].mode().iloc[0] for c in ["body_part", "technique", "shot_type", "play_pattern"]} | {
        "under_pressure": False
    }


def predict_raw_positions(trained, xy, context, raw=False):
    """xG for raw shot positions with the rest of the shot fixed to `context`.
    raw=True skips the calibration (to see what it changes)."""
    shots = pd.DataFrame(xy, columns=["x", "y"]).assign(**context)
    p = trained["model"].predict_proba(build_features(shots))[:, 1]
    return p if raw else calibrate(trained["calibrator"], p)


def importance_table(model, sample_X, shap_values):
    booster = model.get_booster()
    names = list(sample_X.columns)
    table = pd.DataFrame(index=names)
    for kind in ["gain", "weight", "cover"]:
        score = booster.get_score(importance_type=kind)
        table[kind] = [float(score.get(n, 0.0)) for n in names]
    table["shap_mean_abs"] = np.abs(shap_values).mean(axis=0)
    table.index.name = "feature"
    return table.sort_values("gain", ascending=False)


def error_by_segment(test):
    segments = {
        "distance_yd": pd.cut(test["distance"], DISTANCE_BANDS, labels=DISTANCE_LABELS, right=False),
        "body_part": test["body_part"],
        "shot_type": test["shot_type"],
        "under_pressure": test["under_pressure"].map({True: "pressure", False: "no pressure"}),
    }
    rows = []
    for name, key in segments.items():
        for value, g in test.groupby(key, observed=True):
            if len(g) == 0:
                continue
            rows.append(
                {
                    "segment": name,
                    "value": str(value),
                    "shots": len(g),
                    "goal_rate": round(g["is_goal"].mean(), 4),
                    "our_xg_mean": round(g["xg_ours"].mean(), 4),
                    "statsbomb_xg_mean": round(g["xg_statsbomb"].mean(), 4),
                    "our_log_loss": round(pointwise_log_loss(g["is_goal"], g["xg_ours"]).mean(), 4),
                    "statsbomb_log_loss": round(pointwise_log_loss(g["is_goal"], g["xg_statsbomb"]).mean(), 4),
                }
            )
    out = pd.DataFrame(rows)
    out["log_loss_gap"] = (out["our_log_loss"] - out["statsbomb_log_loss"]).round(4)
    return out


def evaluate(run_dir, data, trained, cfg, seed):
    ev = cfg["evaluation"]
    figs = run_dir / "plots"
    figs.mkdir(exist_ok=True)
    model, calibrator = trained["model"], trained["calibrator"]

    X_test, y_test, test = data.part("test")
    p_raw = model.predict_proba(X_test)[:, 1]
    p_ours = calibrate(calibrator, p_raw)
    p_base = trained["baseline"].predict_proba(X_test[BASELINE_FEATURES])[:, 1]
    p_sb = test["xg_statsbomb"].to_numpy()
    test = test.assign(xg_ours=p_ours, xg_raw=p_raw, distance=X_test["distance"].to_numpy())

    # SHAP on the raw model (log-odds), for a sample and for the worst shots.
    explainer = shap.TreeExplainer(model)
    sample = X_test.sample(min(ev["shap_sample"], len(X_test)), random_state=seed)
    shap_sample = explainer.shap_values(sample)

    importance = importance_table(model, sample, shap_sample)
    importance.round(4).to_csv(run_dir / "feature_importance.csv")

    # Worst predictions: largest |real - predicted|, with their own SHAP values.
    err = np.abs(y_test - p_ours)
    worst_idx = np.argsort(-err)[: ev["worst_predictions"]]
    worst = test.iloc[worst_idx].copy()
    worst_shap = explainer.shap_values(X_test.iloc[worst_idx])
    worst["abs_error"] = err[worst_idx]
    worst = pd.concat(
        [
            worst.reset_index(drop=True),
            X_test.iloc[worst_idx].reset_index(drop=True).add_prefix("f_"),
            pd.DataFrame(worst_shap, columns=X_test.columns).add_prefix("shap_"),
        ],
        axis=1,
    )
    worst.round(4).to_csv(run_dir / "worst_predictions.csv", index=False)

    segments = error_by_segment(test)
    segments.to_csv(run_dir / "error_by_segment.csv", index=False)

    # Demo matches: total xG vs real goals (no penalties).
    demo = []
    for m in cfg.get("demo_matches", []):
        s = test[test["match_id"] == m["match_id"]]
        demo.append(
            {
                **m,
                "shots": int(len(s)),
                "goals": int(s["is_goal"].sum()),
                "our_xg": round(float(s["xg_ours"].sum()), 2),
                "statsbomb_xg": round(float(s["xg_statsbomb"].sum()), 2),
            }
        )

    match_ids = test["match_id"].to_numpy()
    iters = ev["bootstrap_iterations"]
    metrics = {
        "test": {
            "baseline_logistic": scores(y_test, p_base),
            "xgboost_raw": scores(y_test, p_raw),
            "xgboost_calibrated": scores(y_test, p_ours),
            "statsbomb": scores(y_test, p_sb),
        },
        "bootstrap_log_loss_difference": {
            "ours_minus_statsbomb": bootstrap_diff(y_test, p_ours, p_sb, match_ids, iters, seed),
            "ours_minus_baseline": bootstrap_diff(y_test, p_ours, p_base, match_ids, iters, seed),
        },
        "best_iteration": trained["history"]["best_iteration"],
        "calibration_method": calibrator["method"],
        "penalty_xg": round(data.penalty_xg, 4),
        "top_features_gain": importance["gain"].head(10).round(2).to_dict(),
        "top_features_shap": {
            k: round(float(v), 4)
            for k, v in importance["shap_mean_abs"].sort_values(ascending=False).head(10).items()
        },
        "demo_matches": demo,
    }
    (run_dir / "metrics.json").write_text(json.dumps(metrics, indent=2, ensure_ascii=False))

    # Figures.
    context = most_common_context(data.part("train")[2])
    plots.learning_curve(trained["history"], figs / "learning_curve.png")
    (figs / "training_curve.png").unlink(missing_ok=True)  # replaced by learning_curve
    plots.reliability(
        y_test,
        {"Baseline (distance + angle)": p_base, "Our XGBoost": p_ours, "StatsBomb": p_sb},
        figs / "reliability.png",
    )
    plots.importance_gain(importance, figs / "feature_importance_gain.png")
    plots.shap_summary(shap_sample, sample, figs / "shap_summary.png")
    predict = lambda xy, raw=False: predict_raw_positions(trained, xy, context, raw)  # noqa: E731
    plots.pitch_heatmap(predict, context, figs / "pitch_heatmap.png")
    plots.dependence_distance(predict, figs / "dependence_distance.png")
    plots.dependence_angle(predict, figs / "dependence_angle.png")
    plots.error_by_segment(segments, figs / "error_by_segment.png")
    plots.metrics_comparison(metrics["test"], metrics["bootstrap_log_loss_difference"], figs / "metrics_comparison.png")
    return metrics

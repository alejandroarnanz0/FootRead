"""Entry point of the xG pipeline: data -> train -> evaluate -> report.

    python -m BaselineModel.main                       # full pipeline
    python -m BaselineModel.main --only-evaluate RUN   # re-evaluate a saved run
    python -m BaselineModel.main --config other.yaml   # other parameters
    python -m BaselineModel.main --seeds 42,7,123      # stability across seeds
    python -m BaselineModel.main --tune                # Optuna search, then the full
                                                       # pipeline with the best parameters
    python -m BaselineModel.main --tune --resume tuning_<date>   # continue a cut search
"""
import argparse
import copy
import json
import os
import platform
import shutil
import time
from datetime import datetime
from pathlib import Path

import pandas as pd
import shap
import sklearn
import xgboost as xgb
import yaml

from .data import data as data_mod
from .model import evaluate as evaluate_mod
from .model import train as train_mod

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "OUTPUT_AI"


def load_config(path):
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def new_run_dir(suffix=""):
    name = datetime.now().strftime("%Y-%m-%d_%H%M") + suffix
    run_dir = OUTPUT / name
    n = 2
    while run_dir.exists():
        run_dir = OUTPUT / f"{name}_{n}"
        n += 1
    run_dir.mkdir(parents=True)
    return run_dir


def manifest(run_dir, cfg, seed, data, seconds):
    info = {
        "run": run_dir.name,
        "created": datetime.now().isoformat(timespec="seconds"),
        # No .git inside the container: the commit comes in as an env var.
        "git_commit": os.environ.get("GIT_COMMIT") or None,
        "seed": seed,
        "python": platform.python_version(),
        "versions": {
            "xgboost": xgb.__version__,
            "scikit-learn": sklearn.__version__,
            "pandas": pd.__version__,
            "shap": shap.__version__,
        },
        "split_sizes": data_mod.split_sizes(data),
        "data_quality": data.quality,
        "seconds": seconds,
    }
    (run_dir / "manifest.json").write_text(json.dumps(info, indent=2))


def features_json(run_dir, data):
    from .build_features import CATEGORIES, feature_names

    (run_dir / "features.json").write_text(
        json.dumps(
            {"features": feature_names(), "categories": CATEGORIES, "penalty_xg": round(data.penalty_xg, 4)},
            indent=2,
        )
    )


def run_pipeline(cfg_path, seed=None, suffix="", data=None):
    """data: already prepared shots to reuse (only --tune passes it: same data
    and split, so the features are not built twice)."""
    start = time.time()
    cfg = load_config(cfg_path)
    seed = cfg["seed"] if seed is None else seed
    cfg = copy.deepcopy(cfg)
    cfg["seed"] = seed
    run_dir = new_run_dir(suffix)
    (run_dir / "config.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True))
    print(f"Run {run_dir.name} (seed {seed})")

    if data is None:
        data = data_mod.prepare(cfg, seed)
    data_mod.save_features(data, run_dir / "features.parquet")
    test_matches = sorted(data.shots.loc[data.masks["test"], "match_id"].unique().tolist())
    (run_dir / "test_matches.json").write_text(json.dumps(test_matches))
    if cfg["data"].get("export_shots_csv"):
        n = data_mod.export_shots_csv(data, Path(cfg["data"]["path"]) / "shots.csv")
        print(f"  shots.csv exported ({n} shots)")

    trained = train_mod.train(data, cfg, seed)
    train_mod.save(trained, run_dir)
    features_json(run_dir, data)
    print(f"  trained in {trained['seconds']} s, best iteration {trained['history']['best_iteration']}")

    metrics = evaluate_mod.evaluate(run_dir, data, trained, cfg, seed)
    manifest(run_dir, cfg, seed, data, round(time.time() - start, 1))
    print(f"  outputs in {run_dir}")
    return run_dir, metrics


def only_evaluate(run_name):
    run_dir = OUTPUT / run_name
    if not run_dir.exists():
        raise SystemExit(f"No run named {run_name} in {OUTPUT}")
    cfg = load_config(run_dir / "config.yaml")
    seed = cfg["seed"]
    saved = run_dir / "features.parquet"
    if not saved.exists():  # runs made before features.parquet existed
        print("  no features.parquet in this run: rebuilding the features with the current build_features.py")
    data = data_mod.prepare(cfg, seed, saved if saved.exists() else None)
    saved = json.loads((run_dir / "test_matches.json").read_text())
    now = sorted(data.shots.loc[data.masks["test"], "match_id"].unique().tolist())
    if saved != now:
        raise SystemExit("The rebuilt test set differs from the one this run was trained with")
    metrics = evaluate_mod.evaluate(run_dir, data, train_mod.load(run_dir), cfg, seed)
    print(f"Re-evaluated {run_name}")
    return metrics


def seeds_summary(cfg_path, seeds):
    rows = []
    for s in seeds:
        run_dir, m = run_pipeline(cfg_path, seed=s, suffix=f"_seed{s}")
        t = m["test"]
        rows.append(
            {
                "seed": s,
                "run": run_dir.name,
                "ours_log_loss": t["xgboost_calibrated"]["log_loss"],
                "ours_pr_auc": t["xgboost_calibrated"]["pr_auc"],
                "statsbomb_log_loss": t["statsbomb"]["log_loss"],
                "baseline_log_loss": t["baseline_logistic"]["log_loss"],
            }
        )
    table = pd.DataFrame(rows)
    spread = table.drop(columns=["seed", "run"]).agg(["mean", "std"]).round(4)
    print(table.to_string(index=False))
    print(spread.to_string())
    out = OUTPUT / f"seeds_{datetime.now().strftime('%Y-%m-%d_%H%M')}.csv"
    table.to_csv(out, index=False)
    print(f"Saved {out.name}")


def tune(cfg_path, resume=None):
    from .model import tune as tune_mod  # optuna is only needed here

    cfg = load_config(OUTPUT / resume / "config.yaml") if resume else load_config(cfg_path)
    if "tuning" not in cfg:
        raise SystemExit("No `tuning:` section in the config")
    data = data_mod.prepare(cfg, cfg["seed"])
    summary = tune_mod.tune(data, cfg, cfg["seed"], OUTPUT, resume)
    if summary is None:
        return None
    print("Training with the best parameters found")
    return OUTPUT / summary["study"] / "best_config.yaml", data


def main():
    parser = argparse.ArgumentParser(description="xG pipeline")
    parser.add_argument("--config", default=str(ROOT / "config.yaml"))
    parser.add_argument("--only-evaluate", metavar="RUN")
    parser.add_argument("--seeds", help="comma-separated, e.g. 42,7,123")
    parser.add_argument("--tune", action="store_true", help="hyperparameter search with Optuna")
    parser.add_argument("--resume", metavar="STUDY", help="with --tune: continue OUTPUT_AI/<STUDY>")
    args = parser.parse_args()

    if args.resume and not args.tune:
        parser.error("--resume only works with --tune")
    if args.tune:
        found = tune(args.config, args.resume)
        if found is None:
            return
        best_config, data = found
        _, metrics = run_pipeline(best_config, suffix="_tuned", data=data)
    elif args.only_evaluate:
        metrics = only_evaluate(args.only_evaluate)
    elif args.seeds:
        seeds_summary(args.config, [int(s) for s in args.seeds.split(",")])
        return
    else:
        _, metrics = run_pipeline(args.config)
    print(json.dumps(metrics, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

"""One row per run in OUTPUT_AI/: date, key parameters and main metrics.

    python tools/compare_runs.py   # prints the table and writes OUTPUT_AI/runs_comparison.csv
"""
import json
from pathlib import Path

import pandas as pd
import yaml

OUTPUT = Path(__file__).resolve().parents[1] / "OUTPUT_AI"  # ml/OUTPUT_AI


def main():
    rows = []
    for run in sorted(p for p in OUTPUT.iterdir() if (p / "metrics.json").exists()):
        m = json.loads((run / "metrics.json").read_text())
        cfg = yaml.safe_load((run / "config.yaml").read_text())
        man = json.loads((run / "manifest.json").read_text()) if (run / "manifest.json").exists() else {}
        t = m["test"]
        boot = m.get("bootstrap_log_loss_difference", {}).get("ours_minus_statsbomb", {})
        rows.append(
            {
                "run": run.name,
                "commit": man.get("git_commit"),
                "seed": cfg.get("seed"),
                "lr": cfg["model"]["learning_rate"],
                "depth": cfg["model"]["max_depth"],
                "calibration": cfg["calibration"]["method"],
                "best_iter": m.get("best_iteration"),
                "ours_log_loss": t["xgboost_calibrated"]["log_loss"],
                "ours_pr_auc": t["xgboost_calibrated"]["pr_auc"],
                "raw_log_loss": t["xgboost_raw"]["log_loss"],
                "baseline_log_loss": t["baseline_logistic"]["log_loss"],
                "statsbomb_log_loss": t["statsbomb"]["log_loss"],
                "gap_vs_sb_ci95": boot.get("ci95"),
            }
        )
    if not rows:
        print(f"No runs with metrics.json in {OUTPUT}")
        return
    table = pd.DataFrame(rows)
    pd.set_option("display.width", 200)
    print(table.to_string(index=False))
    table.to_csv(OUTPUT / "runs_comparison.csv", index=False)


if __name__ == "__main__":
    main()

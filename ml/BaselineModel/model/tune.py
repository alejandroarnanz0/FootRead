"""Hyperparameter search for XGBoost with Optuna.

    ml/run.sh train --tune                          # search, then train with the best
    ml/run.sh train --tune --resume tuning_<date>   # continue a cut search

Each trial is scored by cross-validation over the TRAIN matches only
(GroupKFold: the shots of one match never sit on both sides). Validation and
test are never looked at: validation keeps its two jobs (early stopping and
calibration of the final model) and test stays untouched for the final
evaluation. Inside each fold, early stopping watches the scoring fold; that
makes every trial equally (slightly) optimistic, so the ranking is still fair.

Trial 0 is always the current config.yaml, so the study says whether the
search beats what we already have.

Writes OUTPUT_AI/tuning_<date>/:
    study.db          the whole search (SQLite): can be resumed
    trials.csv        one row per trial: parameters, CV log loss, state
    best_config.yaml  config.yaml with the best parameters in `model:`
    summary.json      best vs current, trials done / pruned, time
    plots/            search history and parameter importance

It NEVER edits config.yaml. main.py then runs the normal pipeline with
best_config.yaml (a run named <date>_tuned): compare it with ml/run.sh compare
and, if it is better, copy the values into config.yaml yourself.
"""
import copy
import json
import time
from datetime import datetime

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import optuna  # noqa: E402
import xgboost as xgb  # noqa: E402
import yaml  # noqa: E402
from sklearn.metrics import log_loss  # noqa: E402
from sklearn.model_selection import GroupKFold  # noqa: E402

INT_PARAMS = {"max_depth", "n_estimators", "early_stopping_rounds"}


def suggest(trial, space):
    """search_space entry: [low, high] or [low, high, log]."""
    params = {}
    for name, spec in space.items():
        low, high = spec[0], spec[1]
        log = len(spec) > 2 and spec[2] == "log"
        if name in INT_PARAMS:
            params[name] = trial.suggest_int(name, int(low), int(high), log=log)
        else:
            params[name] = trial.suggest_float(name, float(low), float(high), log=log)
    return params


def match_folds(shots, n_folds, seed):
    """Folds over the train shots, grouped by match."""
    groups = shots["match_id"].to_numpy()
    splitter = GroupKFold(n_splits=n_folds, shuffle=True, random_state=seed)
    return list(splitter.split(np.zeros(len(groups)), groups=groups))


def cv_log_loss(trial, X, y, folds, params, seed):
    """Mean log loss over the folds. Reports after each fold so a clearly bad
    trial is pruned early."""
    losses, iterations = [], []
    for k, (fit_idx, score_idx) in enumerate(folds):
        start = time.time()
        model = xgb.XGBClassifier(objective="binary:logistic", eval_metric="logloss", random_state=seed, **params)
        model.fit(X.iloc[fit_idx], y[fit_idx], eval_set=[(X.iloc[score_idx], y[score_idx])], verbose=False)
        p = np.clip(model.predict_proba(X.iloc[score_idx])[:, 1], 1e-6, 1 - 1e-6)
        losses.append(log_loss(y[score_idx], p))
        iterations.append(int(model.best_iteration))
        print(
            f"  trial {trial.number} · fold {k + 1}/{len(folds)} · log loss {losses[-1]:.4f} "
            f"· {iterations[-1]} trees · {time.time() - start:.0f} s",
            flush=True,
        )
        trial.report(float(np.mean(losses)), k)
        if trial.should_prune():
            raise optuna.TrialPruned()
    trial.set_user_attr("best_iterations", iterations)
    trial.set_user_attr("fold_log_loss", [round(v, 5) for v in losses])
    return float(np.mean(losses))


def new_study(out_dir, seed):
    return optuna.create_study(
        study_name="xg",
        direction="minimize",
        storage=f"sqlite:///{out_dir / 'study.db'}",
        load_if_exists=True,
        sampler=optuna.samplers.TPESampler(seed=seed),
        # Prune only after 5 complete trials, and never on the first fold.
        pruner=optuna.pruners.MedianPruner(n_startup_trials=5, n_warmup_steps=1),
    )


def save_results(study, cfg, out_dir, seconds):
    states = optuna.trial.TrialState
    complete = study.get_trials(deepcopy=False, states=[states.COMPLETE])
    pruned = study.get_trials(deepcopy=False, states=[states.PRUNED])
    study.trials_dataframe().to_csv(out_dir / "trials.csv", index=False)
    if not complete:
        print("  no trial finished: nothing to save")
        return None

    best = study.best_trial
    current = study.trials[0] if study.trials[0].state == states.COMPLETE else None
    best_cfg = copy.deepcopy(cfg)
    best_cfg["model"].update(best.params)
    best_cfg["tuned_from"] = {"study": out_dir.name, "trial": best.number, "cv_log_loss": round(best.value, 5)}
    (out_dir / "best_config.yaml").write_text(yaml.safe_dump(best_cfg, sort_keys=False, allow_unicode=True))

    summary = {
        "study": out_dir.name,
        "cv_folds": cfg["tuning"]["cv_folds"],
        "trials_complete": len(complete),
        "trials_pruned": len(pruned),
        "seconds": seconds,
        "current_config_cv_log_loss": round(current.value, 5) if current else None,
        "best_cv_log_loss": round(best.value, 5),
        "improvement": round(current.value - best.value, 5) if current else None,
        "best_trial": best.number,
        "best_params": best.params,
        "best_iterations_per_fold": best.user_attrs.get("best_iterations"),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))

    figs = out_dir / "plots"
    figs.mkdir(exist_ok=True)
    views = {
        "optimization_history.png": optuna.visualization.matplotlib.plot_optimization_history,
        "param_importances.png": optuna.visualization.matplotlib.plot_param_importances,
        "slice.png": optuna.visualization.matplotlib.plot_slice,
    }
    for name, plot in views.items():
        try:
            ax = plot(study)
            fig = (ax.flat[0] if hasattr(ax, "flat") else ax).figure
            fig.savefig(figs / name, dpi=130, bbox_inches="tight")
            plt.close(fig)
        except Exception as exc:  # e.g. importance needs several finished trials
            print(f"  skipped {name}: {exc}")
    return summary


def tune(data, cfg, seed, output_root, resume=None):
    tcfg = cfg["tuning"]
    out_dir = output_root / (resume or f"tuning_{datetime.now().strftime('%Y-%m-%d_%H%M')}")
    if resume and not out_dir.exists():
        raise SystemExit(f"No study named {resume} in {output_root}")
    out_dir.mkdir(parents=True, exist_ok=True)
    if not resume:
        (out_dir / "config.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True))

    X, y, shots = data.part("train")
    folds = match_folds(shots, tcfg["cv_folds"], seed)
    space = tcfg["search_space"]
    study = new_study(out_dir, seed)
    if not study.trials:  # trial 0 = the current config, as the reference
        study.enqueue_trial({k: cfg["model"][k] for k in space if k in cfg["model"]}, skip_if_exists=True)

    done = len([t for t in study.trials if t.state.is_finished()])
    remaining = max(tcfg["n_trials"] - done, 0)
    print(
        f"Tuning {out_dir.name}: {remaining} trials left (of {tcfg['n_trials']}), "
        f"{tcfg['cv_folds']}-fold CV over {len(np.unique(shots['match_id']))} train matches, "
        f"limit {tcfg['timeout_minutes']} min"
    )

    def objective(trial):
        params = {**cfg["model"], **suggest(trial, space)}
        return cv_log_loss(trial, X, y, folds, params, seed)

    start = time.time()
    study.optimize(objective, n_trials=remaining, timeout=tcfg["timeout_minutes"] * 60)
    summary = save_results(study, cfg, out_dir, round(time.time() - start, 1))
    if summary:
        print(
            f"  current config {summary['current_config_cv_log_loss']} -> best {summary['best_cv_log_loss']} "
            f"(trial {summary['best_trial']})"
        )
    print(f"  outputs in {out_dir}")
    return summary

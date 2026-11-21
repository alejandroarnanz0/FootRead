"""Every figure of a run. Same palette everywhere: ours blue, StatsBomb orange,
baseline gray (fixed order, never cycled)."""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
from matplotlib.patches import Arc, Rectangle

from ..build_features import goal_angle

OURS = "#2a78d6"
STATSBOMB = "#eb6834"
BASELINE = "#898781"
INK = "#52514e"
GRID = "#e1e0d9"

plt.rcParams.update(
    {
        "figure.dpi": 120,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.edgecolor": "#c3c2b7",
        "axes.labelcolor": INK,
        "xtick.color": INK,
        "ytick.color": INK,
        "axes.grid": True,
        "grid.color": GRID,
        "grid.linewidth": 0.8,
        "legend.frameon": False,
        "font.size": 10,
    }
)


def _save(fig, path):
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def learning_curve(history, path):
    """Train vs validation log loss per boosting iteration, face to face.
    Marks the best iteration (lowest validation loss, the model that is kept)
    and where early stopping cut training (best + patience)."""
    train = np.asarray(history["train"])
    val = np.asarray(history["validation"])
    it = np.arange(1, len(train) + 1)
    best = history["best_iteration"] + 1
    stop = len(train)

    fig, (ax, gap_ax) = plt.subplots(
        2, 1, figsize=(8, 6.4), sharex=True, gridspec_kw={"height_ratios": [3, 1.3], "hspace": 0.08}
    )
    ax.axvspan(best, stop, color=GRID, alpha=0.6, lw=0, label=f"Patience ({stop - best} iterations without improving)")
    ax.plot(it, train, color=BASELINE, lw=2, label="Train")
    ax.plot(it, val, color=OURS, lw=2, label="Validation")
    ax.axvline(best, color=INK, lw=1.2, ls="--")
    ax.axvline(stop, color=STATSBOMB, lw=1.2, ls=":")
    ax.plot(best, val[best - 1], "o", ms=8, color=OURS, mec="white", mew=2, zorder=5)
    ax.annotate(f"best iteration {best}\nval log loss {val[best - 1]:.4f}", (best, val[best - 1]),
                xytext=(-12, 28), textcoords="offset points", ha="right", color=INK, fontsize=9,
                arrowprops=dict(arrowstyle="-", color=INK, lw=0.8))
    ax.text(stop - 3, 0.6, f"early stopping\nstopped at {stop}", transform=ax.get_xaxis_transform(),
            color=STATSBOMB, ha="right", va="top", fontsize=9)
    ax.set_ylabel("Log loss")
    ax.set_title("Learning curve: train vs validation")
    ax.legend(loc="upper center", fontsize=9)

    gap = val - train
    gap_ax.fill_between(it, 0, gap, color=OURS, alpha=0.18, lw=0)
    gap_ax.plot(it, gap, color=OURS, lw=1.5)
    gap_ax.axvline(best, color=INK, lw=1.2, ls="--")
    gap_ax.axvline(stop, color=STATSBOMB, lw=1.2, ls=":")
    gap_ax.set_ylabel("Val − train")
    gap_ax.set_xlabel("Boosting iteration")
    gap_ax.set_ylim(min(0, gap.min()), gap.max() * 1.15)
    gap_ax.text(0.01, 0.92, "growing gap = overfitting", transform=gap_ax.transAxes, va="top", color=INK, fontsize=9)
    fig.subplots_adjust(left=0.1, right=0.97, top=0.94, bottom=0.09)
    fig.savefig(path)
    plt.close(fig)


def reliability(y, preds, path):
    fig, ax = plt.subplots(figsize=(5.5, 5.5))
    ax.plot([0, 1], [0, 1], color="#c3c2b7", lw=1, label="Perfect calibration")
    for (name, p), color in zip(preds.items(), [BASELINE, OURS, STATSBOMB]):
        bins = pd.qcut(p, 10, duplicates="drop")
        g = pd.DataFrame({"p": p, "y": y}).groupby(bins, observed=True).mean()
        ax.plot(g["p"], g["y"], marker="o", ms=5, lw=2, color=color, label=name)
    lim = max(0.6, ax.get_xlim()[1])
    ax.set_xlim(0, lim)
    ax.set_ylim(0, lim)
    ax.set_xlabel("Predicted xG (decile mean)")
    ax.set_ylabel("Observed goal rate")
    ax.set_title("Reliability on test (no penalties)")
    ax.legend(loc="upper left")
    _save(fig, path)


def importance_gain(table, path, top=15):
    t = table.sort_values("gain", ascending=False).head(top)[::-1]
    fig, ax = plt.subplots(figsize=(7, 5.5))
    ax.barh(t.index, t["gain"], color=OURS, height=0.65)
    ax.set_xlabel("Gain (average loss reduction per split)")
    ax.set_title(f"Feature importance by gain (top {top})")
    ax.grid(axis="y", visible=False)
    _save(fig, path)


def shap_summary(shap_values, sample, path):
    plt.figure()
    shap.summary_plot(shap_values, sample, max_display=15, show=False, plot_size=(8, 6))
    fig = plt.gcf()
    fig.suptitle("SHAP: impact of each feature on the log-odds of a goal", y=1.0)
    _save(fig, path)


def draw_half_pitch(ax):
    """Attacking half, goal on the right (StatsBomb 120 x 80, yards)."""
    line = dict(color="white", lw=1.5, fill=False, zorder=3)
    ax.add_patch(Rectangle((60, 0), 60, 80, **line))
    ax.add_patch(Rectangle((102, 18), 18, 44, **line))
    ax.add_patch(Rectangle((114, 30), 6, 20, **line))
    ax.add_patch(Rectangle((120, 36), 1.5, 8, **line))
    ax.add_patch(Arc((108, 40), 20, 20, theta1=127, theta2=233, color="white", lw=1.5, zorder=3))
    ax.add_patch(Arc((60, 40), 20, 20, theta1=-90, theta2=90, color="white", lw=1.5, zorder=3))
    ax.plot(108, 40, "o", color="white", ms=3, zorder=3)
    ax.set_xlim(59, 122)
    ax.set_ylim(80, 0)
    ax.set_aspect("equal")
    ax.axis("off")


def pitch_heatmap(predict, context, path):
    xs = np.arange(60.5, 120, 1.0)
    ys = np.arange(0.5, 80, 1.0)
    gx, gy = np.meshgrid(xs, ys)
    z = predict(np.column_stack([gx.ravel(), gy.ravel()])).reshape(gy.shape)
    fig, ax = plt.subplots(figsize=(8, 6.4))
    im = ax.imshow(z, extent=(60, 120, 80, 0), cmap="Blues", vmin=0, vmax=max(0.5, z.max()), zorder=1)
    draw_half_pitch(ax)
    cb = fig.colorbar(im, ax=ax, fraction=0.035, pad=0.02)
    cb.set_label("Predicted xG")
    desc = ", ".join(f"{k}={v}" for k, v in context.items())
    ax.set_title(f"Predicted xG by location\n({desc})", fontsize=9, color=INK)
    _save(fig, path)


def _curves(ax, x, predict, xy):
    """Calibrated (what we serve) and raw XGBoost, to see what calibration adds."""
    ax.plot(x, predict(xy, raw=True), color=BASELINE, lw=1.5, ls="--", label="XGBoost raw")
    ax.plot(x, predict(xy), color=OURS, lw=2, label="XGBoost calibrated")
    ax.legend()


def dependence_distance(predict, path):
    """Straight towards the goal centre (y = 40): only distance moves."""
    d = np.linspace(1, 40, 200)
    fig, ax = plt.subplots(figsize=(7, 4.2))
    _curves(ax, d, predict, np.column_stack([120 - d, np.full_like(d, 40)]))
    ax.set_xlabel("Distance to goal centre (yards), central shot")
    ax.set_ylabel("Predicted xG")
    ax.set_ylim(0, None)
    ax.set_title("Learned shape: xG vs distance (should fall smoothly)")
    _save(fig, path)


def dependence_angle(predict, path, radius=12.0):
    """On an arc of fixed radius around the goal centre: distance stays the
    same, only the visible angle changes (wide = central, narrow = byline)."""
    theta = np.linspace(0, np.radians(85), 200)
    x = 120 - radius * np.cos(theta)
    y = 40 + radius * np.sin(theta)
    angle = np.degrees([goal_angle(a, b) for a, b in zip(x, y)])
    order = np.argsort(angle)
    fig, ax = plt.subplots(figsize=(7, 4.2))
    _curves(ax, angle[order], predict, np.column_stack([x, y])[order])
    ax.set_xlabel(f"Visible goal angle (degrees), shots {radius:.0f} yards from goal centre")
    ax.set_ylabel("Predicted xG")
    ax.set_ylim(0, None)
    ax.set_title("Learned shape: xG vs angle at fixed distance")
    _save(fig, path)


def error_by_segment(segments, path):
    seg = segments.copy()
    seg["label"] = seg["segment"] + ": " + seg["value"]
    seg = seg[::-1]
    pos = np.arange(len(seg))
    fig, ax = plt.subplots(figsize=(8, max(4, 0.38 * len(seg) + 1)))
    h = 0.38
    ax.barh(pos + h / 2, seg["our_log_loss"], height=h, color=OURS, label="Our XGBoost")
    ax.barh(pos - h / 2, seg["statsbomb_log_loss"], height=h, color=STATSBOMB, label="StatsBomb")
    ax.set_yticks(pos, [f"{l}  (n={n})" for l, n in zip(seg["label"], seg["shots"])])
    ax.set_xlabel("Log loss (lower is better)")
    ax.set_title("Error by segment on test")
    ax.grid(axis="y", visible=False)
    ax.legend(loc="lower right")
    _save(fig, path)


# (label, key, higher_is_better)
HEADLINE_METRICS = [
    ("Log loss", "log_loss", False),
    ("Brier score", "brier", False),
    ("PR-AUC", "pr_auc", True),
    ("ROC-AUC", "roc_auc", True),
]


def metrics_comparison(test_metrics, bootstrap, path):
    """One small panel per metric (each has its own scale: never a dual axis).
    Our calibrated XGBoost vs StatsBomb, with the baseline as a gray reference."""
    models = [
        ("Baseline", "baseline_logistic", BASELINE),
        ("Our XGBoost", "xgboost_calibrated", OURS),
        ("StatsBomb", "statsbomb", STATSBOMB),
    ]
    fig, axes = plt.subplots(1, len(HEADLINE_METRICS), figsize=(12, 4.2))
    for ax, (label, key, higher) in zip(axes, HEADLINE_METRICS):
        values = [test_metrics[m][key] for _, m, _ in models]
        bars = ax.bar([n for n, _, _ in models], values, color=[c for _, _, c in models], width=0.62)
        for bar, v in zip(bars, values):
            ax.annotate(f"{v:.3f}", (bar.get_x() + bar.get_width() / 2, v), xytext=(0, 3),
                        textcoords="offset points", ha="center", va="bottom", fontsize=9, color=INK)
        ours, sb = test_metrics["xgboost_calibrated"][key], test_metrics["statsbomb"][key]
        better = (ours > sb) == higher
        ax.set_title(f"{label}\n({'higher' if higher else 'lower'} is better)", fontsize=10)
        ax.set_xlabel(f"ours vs StatsBomb: {ours - sb:+.3f}" + ("  ✓" if better else ""), fontsize=9, color=INK)
        ax.set_ylim(0, max(values) * 1.18)
        ax.grid(axis="x", visible=False)
        ax.tick_params(axis="x", labelsize=9)
    ci = bootstrap["ours_minus_statsbomb"]
    verdict = "significant" if ci["significant"] else "NOT significant"
    fig.suptitle(
        "Test set, no penalties · log loss gap ours − StatsBomb "
        f"{ci['observed']:+.4f}, 95% CI [{ci['ci95'][0]:+.4f}, {ci['ci95'][1]:+.4f}] ({verdict}, match bootstrap)",
        fontsize=10, color=INK,
    )
    _save(fig, path)

"""The single source of xG features (CLAUDE.md 11.2).

model/train.py (via data/data.py) and serve.py both call build_features(), so the model sees exactly the
same numbers in training and live. Input is a *raw* shot, the same fields a
StatsBomb event has:

    x, y            location on the 120 x 80 pitch, attacking towards x = 120
    under_pressure  bool
    body_part       "Right Foot", "Left Foot", "Head", "Other"
    technique       "Normal", "Volley", "Half Volley", "Lob", ...
    shot_type       "Open Play", "Free Kick", "Corner", "Kick Off" (no penalties)
    play_pattern    "Regular Play", "From Corner", "From Free Kick", ...

The dataset's own distance_to_goal / angle_to_goal are ignored: its angle
formula is undocumented, so both are recomputed here from x, y.
"""
import math

import numpy as np
import pandas as pd

GOAL_X = 120.0
GOAL_Y = 40.0
POST_HALF_WIDTH = 4.0  # posts at y = 36 and y = 44

# Category values one-hot encoded. Anything else falls into "unknown".
CATEGORIES = {
    "body_part": ["Right Foot", "Left Foot", "Head"],
    "technique": ["Normal", "Half Volley", "Volley", "Lob", "Backheel", "Overhead Kick", "Diving Header"],
    "shot_type": ["Open Play", "Free Kick", "Corner"],
    "play_pattern": [
        "Regular Play", "From Corner", "From Free Kick", "From Throw In",
        "From Counter", "From Goal Kick", "From Keeper", "From Kick Off", "Other",
    ],
}

NUMERIC = [
    "distance",
    "angle",
    "lateral_offset",
    "in_box",
    "in_six_yard_box",
    "under_pressure",
    "header_distance",
]


def _slug(value):
    return str(value).lower().replace(" ", "_")


def feature_names():
    names = list(NUMERIC)
    for field, values in CATEGORIES.items():
        names += [f"{field}={_slug(v)}" for v in values] + [f"{field}=unknown"]
    return names


def goal_angle(x, y):
    """Angle (radians) between the lines from the ball to each post: how much
    goal the shooter sees. Wide open in front of goal, near 0 from the byline."""
    dx = GOAL_X - x
    a = math.atan2(GOAL_Y + POST_HALF_WIDTH - y, dx)
    b = math.atan2(GOAL_Y - POST_HALF_WIDTH - y, dx)
    return abs(a - b)


def build_features(shots):
    """shots: DataFrame (or list of dicts) of raw shots -> DataFrame of features,
    columns in feature_names() order."""
    df = pd.DataFrame(shots).reset_index(drop=True)
    x = df["x"].astype(float)
    y = df["y"].astype(float)
    distance = np.hypot(GOAL_X - x, GOAL_Y - y)
    is_head = df["body_part"].eq("Head")

    out = pd.DataFrame(
        {
            "distance": distance,
            "angle": [goal_angle(a, b) for a, b in zip(x, y)],
            "lateral_offset": (y - GOAL_Y).abs(),
            "in_box": ((x >= 102) & (y >= 18) & (y <= 62)).astype(int),
            "in_six_yard_box": ((x >= 114) & (y >= 30) & (y <= 50)).astype(int),
            "under_pressure": df["under_pressure"].fillna(False).astype(bool).astype(int),
            # A long header is far less dangerous than a long shot with the foot.
            "header_distance": np.where(is_head, distance, 0.0),
        }
    )
    for field, values in CATEGORIES.items():
        col = df[field].fillna("")
        for v in values:
            out[f"{field}={_slug(v)}"] = col.eq(v).astype(int)
        out[f"{field}=unknown"] = (~col.isin(values)).astype(int)
    return out[feature_names()]

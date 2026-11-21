#!/usr/bin/env bash
# Shortcuts for the Docker commands in ml/README.md. Works from any folder.
#
#   ml/run.sh build                 build the image (first time / new requirements.txt)
#   ml/run.sh train [args...]       train + evaluate (extra args go to BaselineModel.main,
#                                   e.g. --config mi_config.yaml  or  --seeds 42,7,123
#                                   or  --tune: Optuna search first, then train with the best)
#   ml/run.sh eval <run>            redo metrics and plots of a saved run, no training
#   ml/run.sh compare               table comparing all runs
#   ml/run.sh test                  pytest
#   ml/run.sh serve [run]           xG service on http://localhost:8000 (default: MODEL_RUN in .env, else latest)
#   ml/run.sh explore [run]         HTML data explorer (features from that run, default latest)
set -euo pipefail

cd "$(dirname "$0")/.."                      # repo root
ROOT="$(pwd -W 2>/dev/null || pwd)"          # Git Bash needs C:/... paths for Docker
export MSYS_NO_PATHCONV=1                    # stop Git Bash from rewriting /data, /app

IMAGE=footboard-ml
DATA=(-v "$ROOT/data:/data")
APP=(-v "$ROOT/ml:/app" -e PYTHONUNBUFFERED=1)   # print progress as it happens

cmd="${1:-help}"
shift || true

case "$cmd" in
  build)   docker build -t "$IMAGE" ml ;;
  train)   docker run --rm -e GIT_COMMIT="$(git rev-parse --short HEAD)" "${DATA[@]}" "${APP[@]}" \
             "$IMAGE" python -m BaselineModel.main "$@" ;;
  eval)    [ $# -ge 1 ] || { echo "Usage: ml/run.sh eval <run>   (a folder in ml/OUTPUT_AI/)"; exit 1; }
           docker run --rm "${DATA[@]}" "${APP[@]}" "$IMAGE" python -m BaselineModel.main --only-evaluate "$@" ;;
  compare) docker run --rm "${APP[@]}" "$IMAGE" python tools/compare_runs.py "$@" ;;
  test)    docker run --rm "${APP[@]}" "$IMAGE" python -m pytest tests -q "$@" ;;
  serve)   run="${1:-$(grep -E '^MODEL_RUN=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]' || true)}"
           docker run --rm -p 8000:8000 -e MODEL_RUN="$run" "${APP[@]}" "$IMAGE" ;;
  explore) docker run --rm "${DATA[@]}" "${APP[@]}" "$IMAGE" python tools/explore_dataset/explore.py "$@" ;;
  *)       sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//' ; exit 1 ;;
esac

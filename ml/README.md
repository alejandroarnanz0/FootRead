# ml/ — modelo de xG

Modelo de *expected goals* de Footboard: estima la probabilidad de que un tiro
acabe en gol. Se entrena offline con los tiros de StatsBomb Open Data y se
compara con un baseline sencillo y con el xG profesional de StatsBomb.

Todo corre en **Docker** (imagen `footboard-ml`, Python 3.12), la misma imagen
que servirá el modelo: así entrenamiento y servido usan exactamente las mismas
versiones de las librerías.

---

## Comandos

Desde la **raíz del repo**, con **Docker Desktop abierto**.

> **Atajo (Git Bash / WSL):** `ml/run.sh train`, `ml/run.sh serve`, `ml/run.sh test`…
> hace lo mismo que los comandos de abajo. `ml/run.sh` sin nada muestra la lista.

**1. Construir la imagen** (la primera vez y cada vez que cambie `requirements.txt`):

```bash
docker build -t footboard-ml ml
```

**2. Entrenar y evaluar** (pipeline completo, ~2 min):

```bash
docker run --rm -e GIT_COMMIT=$(git rev-parse --short HEAD) \
  -v "$(pwd)/data:/data" -v "$(pwd)/ml:/app" \
  footboard-ml python -m BaselineModel.main
```

**3. Variantes:**

```bash
# Rehacer métricas y gráficas de una ejecución ya guardada, sin reentrenar
docker run --rm -v "$(pwd)/data:/data" -v "$(pwd)/ml:/app" \
  footboard-ml python -m BaselineModel.main --only-evaluate 2026-11-20_1945

# Probar otros parámetros (copia config.yaml, cámbiala y pásala)
docker run --rm -v "$(pwd)/data:/data" -v "$(pwd)/ml:/app" \
  footboard-ml python -m BaselineModel.main --config mi_config.yaml

# Estabilidad: entrenar con varias semillas y ver cuánto bailan las métricas
docker run --rm -v "$(pwd)/data:/data" -v "$(pwd)/ml:/app" \
  footboard-ml python -m BaselineModel.main --seeds 42,7,123

# Optimización con Optuna: busca hiperparámetros y luego entrena con los mejores
# (atajo: ml/run.sh train --tune ; para reanudar una búsqueda cortada: --resume tuning_<fecha>)
docker run --rm -v "$(pwd)/data:/data" -v "$(pwd)/ml:/app"   footboard-ml python -m BaselineModel.main --tune

# Tabla comparativa de todas las ejecuciones
docker run --rm -v "$(pwd)/ml:/app" footboard-ml python tools/compare_runs.py

# Tests del servicio y de la función de features
docker run --rm -v "$(pwd)/ml:/app" footboard-ml python -m pytest tests -q

# Servicio de xG (FastAPI) en http://localhost:8000 (MODEL_RUN = ejecución a servir; vacío = la última)
docker run --rm -p 8000:8000 -e MODEL_RUN=2026-11-20_1949 -v "$(pwd)/ml:/app" footboard-ml

# Explorador visual de los datos (un HTML por parquet)
docker run --rm -v "$(pwd)/data:/data" -v "$(pwd)/ml:/app" \
  footboard-ml python tools/explore_dataset/explore.py
```

En **PowerShell**, cambia `$(pwd)` por `${PWD}` y quita las `\` (todo en una
línea). En **WSL**, activa antes Docker Desktop → Settings → Resources → WSL
integration.

Qué significa cada trozo del comando: `--rm` borra el *contenedor* al acabar
(no tus ficheros); `-v carpeta_local:/ruta` deja ver esa carpeta dentro del
contenedor (`data/` en `/data`, `ml/` en `/app`); `-e GIT_COMMIT=...` apunta el
commit en el `manifest.json` (dentro del contenedor no hay git).

---

## Datos

`data/statsbomb_shots/{train,validation,test}.parquet`: dataset de Hugging Face
`ClementeH/statsbomb-open-data-shots` (88.023 tiros, CC BY-SA 4.0). Cómo
descargarlo: ver `data/README.md`.

Del dataset **no** se usan:
- **sus splits**: repartían los tiros al azar, de modo que un mismo partido caía
  en entrenamiento y en test. Se rehacen por partido (ver abajo).
- **`distance_to_goal` y `angle_to_goal`**: la fórmula del ángulo no está
  documentada. Se recalculan desde `x`, `y` en `build_features.py`.
- **`xg_statsbomb`** como feature (es la referencia) ni **`shot_outcome_name`**
  (es el resultado): meterlos sería copiar la respuesta.

---

## El pipeline

`python -m BaselineModel.main` ejecuta, en orden:

```
config.yaml ─► data/data.prepare ─► model/train.train ─► model/evaluate.evaluate ─► OUTPUT_AI/<fecha_hora>/

BaselineModel/
├── main.py              punto de entrada
├── build_features.py    tiro en bruto → features (la comparten entrenamiento y serve.py)
├── data/data.py         carga, reparto por partido, penaltis, features.parquet, shots.csv
├── model/train.py       baseline, XGBoost, calibración
├── model/evaluate.py    métricas, bootstrap, SHAP, errores
└── plots/plots.py       todas las gráficas
```

1. **Datos** (`data/data.py`)
   - Carga los tres parquet y los junta.
   - Comprueba la calidad: falla si `xg_statsbomb` tiene nulos.
   - **Reparte por partido** (`match_id`), no por tiro: 80 % de los partidos a
     entrenamiento, 10 % a validación y 10 % a test, con la semilla de
     `config.yaml`. Todos los tiros de un partido van al mismo conjunto.
   - Los **partidos de la demo** van siempre a test. Si alguno no existe en
     el dataset, el pipeline falla.
   - Saca los **penaltis** (se predicen con su tasa histórica, ~0,73).
   - Construye las features con `build_features.py` **una sola vez**, sobre todos los
     tiros, y las guarda en `OUTPUT_AI/<run>/features.parquet`. Todo lo demás
     (filas del modelo, CSV de Node, `--only-evaluate`) sale de ahí.
   - Exporta `data/statsbomb_shots/shots.csv` (todos los tiros, con el split y
     la distancia y el ángulo calculados) para el ETL de Node (`npm run etl:shots`).
2. **Entrenamiento** (`model/train.py`)
   - **Baseline**: regresión logística con solo distancia y ángulo.
   - **XGBoost** (`binary:logistic`) con *early stopping* sobre validación.
   - **Calibración** ajustada en validación (`isotonic`, `sigmoid` o `none`).
3. **Evaluación** (`model/evaluate.py`), siempre sobre **test**, que no se ha tocado:
   métricas, bootstrap, importancia, peores predicciones, error por segmento y
   gráficas. Se puede relanzar sola con `--only-evaluate`, que reutiliza el
   `features.parquet` de esa ejecución (si no lo tiene, porque es anterior,
   recalcula las features con el `build_features.py` actual y lo avisa).

### Optimización de hiperparámetros (`--tune`)

`ml/run.sh train --tune` añade un paso **antes** de entrenar:

```
datos ─► Optuna (model/tune.py) ─► best_config.yaml ─► entrenar ─► evaluar ─► OUTPUT_AI/<fecha>_tuned/
```

- Cada prueba de Optuna se puntúa con **validación cruzada por partido dentro
  de train** (`GroupKFold`, 5 trozos): log loss medio. **Validación y test no se
  miran**: validación sigue haciendo la parada temprana y la calibración del
  modelo final, y test queda intacto para la evaluación.
- La **prueba 0 es tu `config.yaml` actual**, como referencia: `summary.json`
  dice cuánto mejora (o no) la búsqueda.
- Las pruebas claramente peores se abandonan tras 2 trozos (`MedianPruner`).
- Presupuesto, trozos y rangos: sección `tuning:` de `config.yaml`. Para lo que
  dure, manda `timeout_minutes`.
- Salida en `OUTPUT_AI/tuning_<fecha>/`: `study.db` (reanudable con
  `--resume`), `trials.csv`, `best_config.yaml`, `summary.json` y `plots/`
  (historia de la búsqueda, importancia de cada parámetro, cortes).
- **Nunca cambia `config.yaml`.** Compara la ejecución `_tuned` con
  `ml/run.sh compare` y, si es mejor (más que lo que varía con la semilla:
  `--seeds`), copia tú los valores.

---

## Ficheros

| Fichero | Qué hace |
| --- | --- |
| `config.yaml` | **Todos** los parámetros: semilla, reparto, partidos de la demo, hiperparámetros, calibración, evaluación |
| `BaselineModel/build_features.py` | **La única** función que convierte un tiro en bruto en features. La usan el entrenamiento y (más adelante) `serve.py`. No duplicarla nunca |
| `BaselineModel/data/data.py` | Carga, calidad, reparto por partido, penaltis, export del CSV |
| `BaselineModel/model/train.py` | Baseline, XGBoost, calibración; guardar y cargar modelos |
| `BaselineModel/model/tune.py` | Búsqueda de hiperparámetros con Optuna (`--tune`) |
| `BaselineModel/model/evaluate.py` | Métricas, bootstrap, importancia, análisis de errores |
| `BaselineModel/plots/plots.py` | Todas las gráficas |
| `BaselineModel/main.py` | Punto de entrada y opciones de línea de comandos |
| `serve.py` | Servicio FastAPI: carga una ejecución de `OUTPUT_AI/` al arrancar. `GET /health`, `POST /predict` (un tiro **en bruto** → `{ xg, xgRaw, shapValues, baseValue, penalty }`), `POST /predict/batch`. Comprueba al arrancar que la ejecución se entrenó con las mismas features que `build_features.py` |
| `tests/` | `pytest` del servicio, de la función de features y de la búsqueda con Optuna |
| `tools/compare_runs.py` | Una fila por ejecución con parámetros clave y métricas → `OUTPUT_AI/runs_comparison.csv` |
| `tools/explore_dataset/` | Explorador interactivo de los datos: `explore.py` + plantilla HTML; salida en `tools/explore_dataset/output/`. No recalcula features: lee el `features.parquet` de la última ejecución (o de la que le pases: `ml/run.sh explore 2026-11-21_1030`) |
| `Dockerfile`, `requirements.txt` | La imagen y sus versiones fijadas |

### Features (33)

| Feature | Cómo se calcula |
| --- | --- |
| `distance` | Distancia de (x, y) al centro de la portería (120, 40), en yardas |
| `angle` | Ángulo entre las líneas a los dos postes (y = 36 y 44): cuánta portería se ve |
| `lateral_offset` | \|y − 40\| |
| `in_box`, `in_six_yard_box` | Si el tiro sale del área / del área pequeña |
| `header_distance` | La distancia si es de cabeza; 0 si no |
| `under_pressure` | 0/1 |
| `body_part=…`, `technique=…`, `shot_type=…`, `play_pattern=…` | Una columna 0/1 por valor; lo desconocido va a `=unknown` |

---

## Qué deja cada ejecución: `OUTPUT_AI/<fecha_hora>/`

| Fichero | Contenido |
| --- | --- |
| `config.yaml` | Copia exacta de los parámetros usados |
| `manifest.json` | Fecha, commit, semilla, versiones, tamaño de cada conjunto (tiros y partidos), calidad de datos, duración |
| `model.json`, `calibrator.joblib`, `baseline.joblib` | Los modelos entrenados |
| `features.json` | Lista de features, categorías y xG del penalti (lo que necesita `serve.py`) |
| `metrics.json` | Comparación a tres bandas, bootstrap, mejores features y partidos de la demo |
| `feature_importance.csv` | Todas las features con gain, weight, cover y media \|SHAP\| |
| `worst_predictions.csv` | Los 50 tiros de test peor predichos, con sus características y sus SHAP |
| `error_by_segment.csv` | Por tramo de distancia, parte del cuerpo, tipo de tiro y presión: tiros, tasa real, xG medio y log loss, nuestro y de StatsBomb |
| `training_history.json`, `test_matches.json` | Curva de entrenamiento y lista de partidos de test (para `--only-evaluate`) |
| `plots/` | `learning_curve` (train vs validación, mejor iteración y corte del early stopping), `reliability`, `feature_importance_gain`, `shap_summary`, `pitch_heatmap`, `dependence_distance`, `dependence_angle`, `error_by_segment`, `metrics_comparison` (log loss, Brier, PR-AUC y ROC-AUC: nuestro XGBoost frente a StatsBomb, con el baseline de referencia y el intervalo del bootstrap) |

`OUTPUT_AI/` no se versiona (está en `.gitignore`).

---

## Cómo leer los resultados

- **Tres modelos sobre los mismos tiros de test**: baseline, nuestro XGBoost y
  el xG de StatsBomb (`xg_statsbomb`, que ya viene en el dataset: no se entrena).
- **Métricas**: *log loss* (penaliza estar seguro y equivocarse; menor es
  mejor), *Brier*, *PR-AUC* y curva de fiabilidad. **Nunca accuracy**: solo ~1 de
  cada 10 tiros es gol, y decir siempre «no gol» acertaría el 90 %.
- **Bootstrap**: remuestrea los partidos de test 1.000 veces y da el intervalo
  al 95 % de la diferencia de log loss. Si no cruza el cero, la diferencia es
  real y no casualidad del test.
- **XGBoost raw vs calibrado**: raw es la probabilidad que da el modelo; la
  calibración la corrige para que «0,3» signifique que de cada diez tiros así
  entran tres. Las gráficas de dependencia pintan los dos.

Atribución: datos de StatsBomb Open Data.

# data/

Copias congeladas de las fuentes. **No se versionan** (`data/*` está en `.gitignore`,
salvo este README): pesan cerca de 1 GB. Aquí se explica cómo obtenerlas para que el
proyecto sea reproducible.

## Transfermarkt — `data_from_transfermarkt/`

- **Origen:** dataset *Football Data from Transfermarkt* de dcaribou en Kaggle
  (también en GitHub: `dcaribou/transfermarkt-datasets`).
- **Versión usada:** la foto de septiembre de 2026. Las actualizaciones automáticas del
  dataset están pausadas desde julio de 2026.
- **Cómo obtenerla:** descargar el ZIP desde Kaggle y descomprimir los CSV en
  `data/data_from_transfermarkt/`.

Ficheros que usa el ETL (el resto del ZIP se puede dejar ahí y se ignora):

| Fichero | Para qué |
| --- | --- |
| `competitions.csv` | Competiciones (solo las ligas elegidas) |
| `clubs.csv` | Clubes de esas ligas |
| `players.csv` | Perfil de jugador y valor actual |
| `player_valuations.csv` | Histórico de valor de mercado |
| `games.csv` | Temporada y tipo de competición de cada partido |
| `appearances.csv` | Minutos, goles y asistencias por partido (se agregan por temporada) |

## Cargar en MongoDB

Desde `api/`, con `MONGODB_URI` en el `.env` de la raíz:

```
npm run etl:wipe -- --force                 # vacía las 5 colecciones (p. ej. los datos del seed)
npm run etl -- --leagues=ES1                # solo LaLiga, para validar
npm run etl -- --leagues=ES1,GB1,IT1,L1,FR1 # las cinco grandes
```

El ETL es idempotente: relanzarlo actualiza, no duplica. Cada paso imprime cuántos
documentos ha insertado, actualizado y descartado (y por qué). Los pasos se pueden
lanzar sueltos (`node scripts/etl/03-players.js --leagues=ES1`), en orden 01 → 05.

## StatsBomb — tiros para entrenar el xG: `statsbomb_shots/`

- **Origen:** dataset de Hugging Face `ClementeH/statsbomb-open-data-shots`, derivado de
  StatsBomb Open Data. Licencia **CC BY-SA 4.0**.
- **Ficheros:** `train.parquet`, `validation.parquet`, `test.parquet` (88.023 tiros en total).
  Sus splits no se usan: el pipeline de `ml/` reparte de nuevo por partido.
- **Cómo obtenerlo:**
  ```
  B=https://huggingface.co/datasets/ClementeH/statsbomb-open-data-shots/resolve/main/data
  for s in train validation test; do
    curl -L -o data/statsbomb_shots/$s.parquet "$B/$s-00000-of-00001.parquet"
  done
  ```
- `shots.csv` lo **genera** el pipeline de `ml/` (todos los tiros, con su split y con la
  distancia y el ángulo calculados por `ml/BaselineModel/features.py`). Lo lee `npm run etl:shots`.

## StatsBomb Open Data — partidos de la demo: `statsbomb_open_data/`

- **Origen:** repositorio `github.com/statsbomb/open-data` (rama `master`), descargado el
  20-11-2026. Licencia **CC BY-SA 4.0**; StatsBomb exige citar la fuente en cualquier
  publicación o análisis derivado (pie del dashboard y memoria).
- **Contenido:**

  | Ruta | Qué es |
  | --- | --- |
  | `competitions.json` | Catálogo de competiciones y temporadas |
  | `matches/43/106.json` | Partidos del Mundial 2022 |
  | `matches/16/37.json` | Champions League 2004/05 |
  | `matches/11/27.json` | La Liga 2015/16 |
  | `events/3869685.json` | Argentina 3-3 Francia, final del Mundial 2022 (con prórroga y penaltis) |
  | `events/2302764.json` | AC Milan 3-3 Liverpool, final de Champions 2005 (con prórroga y penaltis) |
  | `events/3825700.json` | Real Madrid 10-2 Rayo Vallecano, La Liga 2015/16 |

  Los tres `match_id` son los de `demo_matches` en `ml/config.yaml`.
- **Cómo obtenerlo:**
  ```
  B=https://raw.githubusercontent.com/statsbomb/open-data/master/data
  curl -o data/statsbomb_open_data/competitions.json $B/competitions.json
  for cs in 43/106 16/37 11/27; do
    mkdir -p data/statsbomb_open_data/matches/${cs%/*}
    curl -o data/statsbomb_open_data/matches/$cs.json $B/matches/$cs.json
  done
  for id in 3869685 2302764 3825700; do
    curl -o data/statsbomb_open_data/events/$id.json $B/events/$id.json
  done
  ```
- `npm run etl:matches` (desde `api/`) carga los partidos en `Match` y marca como
  `available` los que tienen su fichero de eventos. `api/scripts/replay.js` reproduce
  `events/<match_id>.json` por la API.

## FBref

Descartado (ver CLAUDE.md §6 y §15).

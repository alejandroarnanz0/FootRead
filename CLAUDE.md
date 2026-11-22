# Footboard

Dashboard de analítica de fútbol con dos piezas: **scouting de jugadores
infravalorados** (heurística de comparables sobre datos de Transfermarkt) y un
**modelo de xG servido en tiempo real** mientras se reproduce un partido ya
jugado (StatsBomb). Proyecto final de Sistemas de Información Ubicuos (Grado de
Ingeniería Informática de Talavera, curso 2026-27).

**La entrega es un VÍDEO (18-12-2026), no una memoria.** Todo lo que se quiera
contar tiene que poder **enseñarse en pantalla**.

`AGENTS.md` (raíz) son las instrucciones para el compañero que hace el frontend,
Socket.IO y el usuario simulado. Este fichero es la fuente de verdad del proyecto.

---

## 1. Qué hace la aplicación

Ingiere datos públicos de fútbol, los normaliza en MongoDB y los sirve a un
dashboard interactivo.

- **Valor de mercado por comparables** (heurística, **no** modelo): un jugador
  debería valer lo que valen los jugadores parecidos a él. La diferencia con su
  valor real (el **residuo**) señala a los posibles infravalorados.
- **xG** (*expected goals*, XGBoost): probabilidad de que un tiro acabe en gol.
  Un script reproduce un partido ya jugado enviando sus eventos por la API como
  si ocurrieran en directo; cada tiro recibe su xG al llegar.

**Preguntas que responde:** ¿qué jugadores valen menos que otros parecidos a
ellos? ¿Qué calidad tienen las ocasiones de un partido, en directo?

---

## 2. Requisitos del enunciado

- Aplicación web **distribuida full-stack** con cuadro de mando
- Datos **heterogéneos** en tipo, formato, granularidad y frecuencia
- Obtener **información con valor** a partir de los datos crudos
- Representación gráfica **flexible**, con **manipulación directa**
- Solución innovadora

"Manipulación directa": el usuario actúa sobre la representación visual
(clicar un punto, arrastrar para acotar un rango) y todo lo demás reacciona.

Requisitos añadidos por el profesor en la tutoría del 29-10-2026: sección 14.

---

## 3. Arquitectura

```
  FUENTES            ETL               MONGODB          API              WEB
  CSV / parquet  →   scripts Node  →   Atlas      →    Express    →     React
  / JSON             (a mano, 1 vez)   footboard        (JSON + JWT)    (navegador)
                                                        │      ▲
                                                        │      │ WebSocket (Socket.IO, pendiente)
                                         POST /predict  ▼      │
  REPRODUCTOR  ── POST eventos (JWT) ──►  API  ──►  SERVICIO ML (Python, FastAPI, Docker)
  (partido ya jugado)                                   XGBoost + SHAP
```

- **ETL**: scripts de Node que se lanzan a mano; no forman parte de la web.
- **API Express**: sin interfaz; JSON. Hace de intermediaria con el servicio de ML.
- **Servicio ML** (`ml/serve.py`): aparte, porque XGBoost y SHAP no existen en Node.
- **Reproductor** (`api/scripts/replay.js`): envía por la API los eventos de un
  partido ya jugado respetando su ritmo (sección 14.3).
- **React**: pide datos con axios. La vista en vivo consulta los eventos por REST.

---

## 4. Stack

| Capa | Tecnología |
| --- | --- |
| ETL | Node.js (`api/scripts/etl/`) |
| Base de datos | MongoDB Atlas + Mongoose 8 |
| Backend | Express 4 (`express-generator --no-view`) |
| Autenticación | `jsonwebtoken` + `bcryptjs` |
| Tiempo real | Socket.IO (pendiente) |
| Frontend | React 19 + Vite 8 + react-router-dom 7 |
| Cliente HTTP | axios |
| Gráficos | Recharts |
| Modelo (xG) | Python 3.12 en Docker: XGBoost, scikit-learn, SHAP, FastAPI |
| Orquestación local | Docker Compose |
| Despliegue | Render (auto-deploy desde `main`) + Atlas |

No introducir TypeScript, Redux, Next.js ni ORMs alternativos: la asignatura es
MERN y el proyecto debe parecerse a lo enseñado en clase.

---

## 5. Estructura del repositorio

```
FootRead/
├── AGENTS.md / CLAUDE.md
├── .env.example            un único .env en la raíz para todo el repo
├── docker-compose.yml      api, web, ml (sin Mongo: es Atlas)
├── api/                    backend Express
│   ├── app.js              conexión, middlewares, JWT, rutas, manejador de errores
│   ├── bin/www             arranque (PORT)
│   ├── models/             Competition, Club, Player, Valuation, SeasonStat,
│   │                       Shot, Match, MatchEvent, User
│   ├── routes/             competitions, clubs, players, valuations, stats,
│   │                       comparables, aggregates, predictions, matches, auth
│   ├── middleware/         filters.js (filtros transversales), auth.js (JWT)
│   ├── utils/              asyncHandler, httpError, pick, mlClient, statsbombEvent
│   ├── scripts/            etl/ (Transfermarkt, shots, matches), value/ (heurística),
│   │                       replay.js (reproductor), seed.js (datos ficticios, obsoleto)
│   └── test/               integración contra footboard_test (+ helpers/, fixtures/)
├── web/src/                api/ (cliente axios por recurso), components/, hooks/, pages/
├── ml/                     modelo de xG (ver ml/README.md)
│   ├── config.yaml         todos los parámetros
│   ├── BaselineModel/      main.py (punto de entrada), build_features.py (LA función
│   │                       de features), data/data.py, model/{train,evaluate,tune}.py,
│   │                       plots/plots.py
│   ├── serve.py            servicio FastAPI;  tests/ (pytest)
│   ├── tools/              compare_runs.py (tabla de ejecuciones),
│   │                       explore_dataset/ (explorador HTML de los datos)
│   └── OUTPUT_AI/<run>/    una carpeta por entrenamiento (en .gitignore)
└── data/                   fuentes congeladas (en .gitignore salvo README.md)
```

---

## 6. Fuentes de datos

Todas se congelan en `data/` (en `.gitignore`). Cómo obtenerlas: `data/README.md`.

### Transfermarkt (dcaribou, Kaggle) — `data/data_from_transfermarkt/`

Foto de septiembre de 2026 (las actualizaciones del dataset están pausadas desde
julio de 2026: versión estable). Se usan `competitions`, `clubs`, `players`,
`player_valuations`, `appearances` y `games`.

**Limitación:** `appearances.csv` solo trae minutos, goles, asistencias y
tarjetas. Ni tiros, ni pases, ni entradas: `shots`, `passesCompleted` y
`tackles` de `SeasonStat` quedan vacíos. Transfermarkt alimenta la parte de
jugadores del dashboard y la heurística de valor (11.1), no un modelo.

### StatsBomb — dos vías distintas, no mezclarlas

**Vía A, entrenar el xG:** dataset de Hugging Face
`ClementeH/statsbomb-open-data-shots` en `data/statsbomb_shots/` (88.023 tiros,
CC BY-SA 4.0). **No trae minuto** ni orden dentro del partido. Sus splits
(al azar, tiro a tiro) **no se usan**, ni sus columnas `distance_to_goal` /
`angle_to_goal` (fórmula del ángulo sin documentar): ver 11.2.

**Vía B, reproducir en vivo:** StatsBomb Open Data (`github.com/statsbomb/open-data`)
en `data/statsbomb_open_data/`: catálogo, partidos y los JSON de eventos
completos de los 3 partidos de la demo (con `index`, `period`, `minute`, `second`).
Los eventos de tiro traen además `freeze_frame` (posición de defensas y portero),
que el dataset de la vía A no tiene: es la mejora más prometedora del xG.

**Atribución obligatoria** (CC BY-SA 4.0): citar a StatsBomb en el dashboard
(pie de las vistas que usan sus datos) y en el vídeo.

### Descartadas

FBref (emparejar nombres sin ids comunes, y dudas sobre si sigue dando
estadísticas avanzadas) y Football-Data (solo servía para un modelo de resultado).

---

## 7. Modelo de datos (Mongoose)

Un fichero por modelo en `api/models/`, nombre en singular con mayúscula.

```
Competition  code (unique, "ES1") · name · country · tier
Club         name · competition → Competition · country · externalIds{transfermarkt, fbref}
Player       name · birthDate · position (GK|DF|MF|FW) · subPosition · foot · heightCm (140-220)
             club → Club · currentValue (€) · predictedValue (€, lo escribe la heurística)
             contractUntil · lastSeason (año de inicio) · externalIds{transfermarkt, fbref}
Valuation    player → Player · date · value (€)          único {player, date}
SeasonStat   player · season ("2023-24") · competition · minutes · goals · assists
             (shots, passesCompleted, tackles vacíos)   único {player, season, competition}
Shot         tiros de la vía A para el dashboard: shotKey (único) · matchId · competition
             season · team · playerName · x · y · distanceToGoal · angleToGoal (calculados
             por build_features.py, nunca en Node) · outcome · bodyPart · technique · shotType
             playPattern · xgStatsbomb · isGoal · split
Match        matchId (StatsBomb, único) · competition · season · matchDate · homeTeam
             awayTeam · available (tiene fichero de eventos → se puede reproducir)
MatchEvent   matchId · sequence (el `index` de StatsBomb) · period (1-5; 5 = penaltis)
             minute · second · type · team · playerName · x · y
             tiros: shotOutcome · shotType · isGoal · xg (nuestro; null si el ML no
             respondió) · xgStatsbomb · card · replacement · raw (evento original)
             único {matchId, sequence}: reenviar un evento no lo duplica
User         email (único, minúsculas) · name · passwordHash (bcrypt, select: false)
```

### Reglas
- La **validación vive en el esquema**, nunca repetida en las rutas.
- Relaciones por `ObjectId` + `ref`; `populate` solo cuando la respuesta lo necesita.
- Agregados pesados en el **aggregation pipeline**, no en Node.
- **Coordenadas de StatsBomb**: campo 120 × 80 yardas, y **cada evento está
  orientado hacia la portería que ataca su equipo** (x = 120). Para pintar a los
  dos equipos en un mismo campo hay que reflejar a uno: `x' = 120 − x`, `y' = 80 − y`.

---

## 8. ETL

Scripts en `api/scripts/etl/`. Escriben **directamente con Mongoose**, no por la
API (ver 14.2). Idempotentes: `updateOne` + `upsert` sobre la clave natural, en
lotes con `bulkWrite`; cada documento se valida con `validateSync()` antes
(`bulkWrite` no ejecuta validadores). Informe final: insertados, actualizados y
descartados por motivo. Flag `--test-db` para escribir en `footboard_test`.

| Script | Qué carga |
| --- | --- |
| `npm run etl -- --leagues=ES1,GB1,IT1,L1,FR1` | Transfermarkt: competiciones → clubes → jugadores → valoraciones → `SeasonStat` |
| `npm run etl:wipe -- --force` | Vacía las 5 colecciones de Transfermarkt |
| `npm run etl:shots` | `Shot` desde `data/statsbomb_shots/shots.csv` (lo genera el pipeline de `ml/`) |
| `npm run etl:matches` | `Match` desde `data/statsbomb_open_data/matches/**` |

Alcance de Transfermarkt (confirmado): las cinco grandes ligas; jugadores cuyo
club **actual** está en una liga cargada (incluye retirados, que se distinguen
por `lastSeason`); `SeasonStat` solo de liga doméstica (`games.season` "2023" →
"2023-24"). Normalización: posiciones `Goalkeeper/Defender/Midfield/Attack` →
`GK/DF/MF/FW` (`Missing` no se carga), alturas fuera de 140-220 a null, nombres
con `trim`, fechas a `Date` UTC, valores en euros enteros.

---

## 9. API

### Patrones
- Routers anidados con `express.Router({ mergeParams: true })`; la referencia al
  padre **sale de la URL, nunca del cuerpo**. `router.param` carga el recurso una vez.
- `asyncHandler` (sin `try/catch` repetidos), `httpError(status, msg)`, `pick`
  (POST/PUT solo aceptan campos del modelo). Errores siempre `{ "error": "..." }`.
- Listas: `{ data, page, limit, total, totalPages }`; 50 por defecto, máximo 200.
  `.lean()` y `.select()` explícito en lecturas.
- Filtros transversales en la *query string*, parseados una vez por
  `middleware/filters.js`: `position` (lista con comas), `minAge`, `maxAge`,
  `competition` (código), `maxValue`, `sort` (lista blanca por recurso, `-` =
  descendente), `page`, `limit`. Valores no string → 400 (inyección de operadores).
- Códigos: 201 crear · 204 borrar · 400 validación o id mal formado · 401 sin
  token / token inválido o caducado · 404 · 409 duplicado o padre con hijos ·
  503 servicio de ML caído.

### Autenticación (JWT)
**Toda la API exige `Authorization: Bearer <token>`, lecturas incluidas**, salvo
`GET /api/health` y `/api/auth/*`. Token HS256, caduca a la hora.

### Endpoints

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET | `/api/health` | Comprobación (público) |
| POST | `/api/auth/register`, `/api/auth/login` | `{ token, user }` (público) |
| GET | `/api/auth/me` | Usuario del token |
| GET/POST | `/api/competitions` | Listar / crear |
| GET/PUT/DELETE | `/api/competitions/:id` | Ficha |
| GET/POST | `/api/competitions/:id/clubs` | Clubes de una competición / crear |
| GET | `/api/clubs` | Todos los clubes (filtro `competition`) |
| GET/PUT/DELETE | `/api/clubs/:id` | Ficha |
| GET/POST | `/api/clubs/:id/players` | Jugadores de un club / crear |
| GET | `/api/players` | Todos los jugadores, con filtros |
| GET/PUT/DELETE | `/api/players/:id` | Ficha (`DELETE` en cascada) |
| GET | `/api/players/:id/valuations` | Histórico de valor |
| GET | `/api/players/:id/stats` | Estadísticas por temporada |
| GET | `/api/players/:id/comparables` | Los comparables de la heurística (solo lectura) |
| GET | `/api/aggregates/undervalued` | Ranking por residuo, con filtros |
| GET | `/api/aggregates/summary` | KPIs (jugadores, MAE, residuo medio, valor medio y cobertura) y distribuciones por posición y edad, con filtros |
| POST | `/api/predictions/xg` | Proxy al servicio de ML: un tiro en bruto o `{ shots: [...] }` |
| POST | `/api/predictions/value` | Stub antiguo, sin uso |
| GET | `/api/matches` | Catálogo de partidos marcados para replay, con el número de eventos registrados por partido |
| GET | `/api/matches/:matchId` | Ficha del partido |
| GET/POST/DELETE | `/api/matches/:matchId/events` | Eventos (`?after=<sequence>`, `?raw=true`) / recibir uno crudo de StatsBomb / limpiar |
| GET | `/api/matches/:matchId/state` | Marcador, xG acumulado, tanda de penaltis, minuto |

Los POST de recursos solo existen en la ruta anidada (`POST /api/players` da 404).
Ejemplos reales de las respuestas más usadas (estado y evento de partido, xG): `AGENTS.md`, secciones 5 y 6.

---

## 10. Frontend

React + Vite en `web/`. Un **único cliente axios** (`src/api/client.js`, base
`VITE_API_URL`, adjunta el token y ante un 401 manda a `/login`); llamadas
agrupadas por recurso en `src/api/`. **Estado global** de filtros (`useFilters`)
y de sesión (`useAuth`); `useApi` para carga, error y reintento. Estados de
carga, error **y vacío** explícitos en cada vista. CSS propio con un sistema
visual compartido: tema oscuro principal y tema claro mediante
`prefers-color-scheme`; `PageHeader` y `Button` para elementos comunes.
La navegación pública muestra el acceso y oculta las áreas protegidas hasta
iniciar sesión. Textos en español, código en inglés.

### Vistas

| Ruta | Vista | Estado |
| --- | --- | --- |
| `/login` | Entrar o registrarse, con la identidad visual de Footboard | Hecha |
| `/` | **Explorador**: scatter real vs. referencia (log-log, diagonal), filtros, tabla ordenable; clic → ficha | Identidad visual aplicada; faltan arrastre y CSV |
| `/players/:id` | **Ficha**: perfil, serie de valor, estadísticas por temporada, comparables | Básica |
| `/live/:matchId` | **Partido en vivo**: marcador, feed de eventos, mapa de tiros interactivo y evolución del xG | Disponible con actualización por REST |
| `/overview` | **Visión general**: KPIs, distribuciones y rankings paginados de mercado y scouting | Disponible |
| `/matches` | **Partidos**: catálogo de replays con búsqueda por equipo, filtros por competición y eventos y orden por fecha | Disponible |
| `/compare` | **Comparador** de 2-3 jugadores | Placeholder |
| `/model` | **El modelo de xG**: las gráficas de evaluación con una frase cada una | Pendiente |

### Manipulación directa (requisito)
Clic en un punto → ficha · arrastrar sobre el scatter → recorta la tabla · los
filtros mueven a la vez scatter, tabla y KPIs · descarga CSV del subconjunto.

La heurística se presenta como **"referencia por comparables"**, nunca como
"predicción" ni "modelo".

### Visión general y Partidos

- **Visión general** toma los totales, el valor medio y las distribuciones por
  posición y edad de `GET /api/aggregates/summary`. El KPI de competiciones
  usa el total de `GET /api/competitions`. La media excluye a los jugadores cuyo
  valor de mercado no está registrado.
- **Rankings:** mayor valor de mercado (`GET /api/players`) y oportunidades de
  scouting (`GET /api/aggregates/undervalued`). El segundo ordena por diferencia
  positiva entre la referencia por comparables y el valor de mercado. Cada
  lista tiene su propio scroll vertical, empieza con seis jugadores y pide
  otra página al acercarse al final. Conserva el orden recibido, deduplica por
  ID y permite reintentar una página fallida sin descartar las filas cargadas.
- **Partidos** abre la ruta protegida y de carga diferida `/matches`, que monta
  `MatchesSection`. El catálogo reúne las páginas de `GET /api/matches` antes
  de aplicar la búsqueda por equipo, los filtros por competición y eventos y
  el orden por fecha. Muestra resultados por tandas de ocho y distingue carga,
  error y ausencia de resultados. Cada fila enlaza a `/live/:matchId`.
- **Centro de partido:** sincroniza marcador, cronología, mapa de tiros y
  evolución del xG a partir de los eventos recibidos. Las fichas sin eventos
  conservan la información del encuentro y muestran el marcador como no
  disponible. Los breadcrumbs permiten volver a Partidos o a Visión general.

---

## 11. Capa de análisis

### 11.1 Valor de mercado: heurística de comparables

`api/scripts/value/` (`comparables.js` funciones puras, `population.js`,
`run.js`). `npm run value` escribe `Player.predictedValue`; `-- --dry-run` solo
muestra el informe. **El código es la fuente de verdad**: el documento de
diseño `PLAN-xg-tiempo-real.md` (§8) describe una versión anterior (agrupar por
competición, mínimo 8) que se sustituyó por esta.

- **Población:** jugadores en activo (`lastSeason` ≥ 2025) con `currentValue` y
  minutos de liga en 2025-26. El resto queda sin `predictedValue` (y fuera del
  Explorador). Edad calculada a 1-1-2026.
- **Grupo de comparables**, del más estricto (nivel 0) al más laxo (3):
  0. `subPosition` + tramo de edad (≤21, 22-24, 25-27, 28-30, 31+) + tramo de
     minutos (<25 %, 25-50 %, 50-75 %, ≥75 % de 38 partidos, 34 en L1/FR1) +
     tramo de goles+asistencias por 90 (solo atacantes y mediapuntas con ≥ 450 min)
  1. sin el tramo de producción
  2. con tramo de edad ancho (≤23, 24-29, 30+)
  3. con la posición general en vez de `subPosition`
  Se usa el primer nivel con **al menos 10** jugadores, **sin contar al propio**.
- **Valor relativo:** valor / mediana de **su club** (absorbe liga y fuerza del
  club). Referencia = mediana del valor relativo del grupo × mediana de su club.
  (Con la mediana de liga el top eran suplentes de la Premier a 90 M€.)
- Resultado actual: 2.445 jugadores con referencia, **MAE 6,11 M€**.
- `GET /api/players/:id/comparables` recalcula los grupos en memoria (caché de
  10 min) y devuelve los comparables del jugador; nunca escribe.

Limitación que debe decirse en el vídeo: un residuo grande significa o que el
mercado se equivoca, o que a la heurística le falta información (lesión,
contrato, calidad que no sale en goles y asistencias, sobre todo en defensas y
porteros). El ranking es por residuo absoluto y favorece a clubes caros.

Descartado un modelo histórico de valor: inflación (mediana de LaLiga de 1 M€ en
2015-16 a 3 M€ en 2025-26) y sesgo de supervivencia.

### 11.2 Modelo de xG

Pipeline en `ml/` (detalle y comandos en `ml/README.md`), todo en Docker
(imagen `footboard-ml`). `config.yaml` lo describe; cada ejecución deja en
`ml/OUTPUT_AI/<fecha_hora>/` modelo, métricas, análisis y gráficas.

- **Features:** una única función, `build_features()` en
  `ml/BaselineModel/build_features.py` (el documento de diseño la llama
  `shot_features()`: es la misma). La usan el entrenamiento y `serve.py`.
  33 features: distancia y ángulo **recalculados desde x, y**, desvío lateral,
  dentro del área / área pequeña, distancia si es cabezazo, presión y las
  categorías (parte del cuerpo, técnica, tipo de tiro, origen de la jugada) en 0/1.
  **Nunca** `xg_statsbomb` ni el resultado del tiro como feature.
  Se calculan **una vez por ejecución** sobre todos los tiros y se guardan en
  `OUTPUT_AI/<run>/features.parquet` (con `match_id`, split, `is_goal`,
  `xg_statsbomb` para comprobar que encaja); `--only-evaluate` lo reutiliza.
- **Datos:** reparto propio **por partido** (80/10/10), partidos de la demo
  forzados a test, penaltis fuera (tasa fija empírica 0,733).
- **Modelo:** XGBoost `binary:logistic` con early stopping; calibración ajustada
  en validación (`config.yaml`: ahora `sigmoid`; la isotónica creaba mesetas).
  Optimización opcional con Optuna (`ml/run.sh train --tune`): CV por partido
  dentro de train, nunca mira validación ni test, no edita `config.yaml`.
- **Evaluación solo en test**, a tres bandas: baseline (logística con distancia
  y ángulo), nuestro XGBoost y el xG de StatsBomb. Log loss, Brier, PR-AUC,
  ROC-AUC y fiabilidad; **nunca accuracy**. Bootstrap por partido para ver si
  las diferencias son reales.
- **Resultados** (ejecución `2026-11-20_1949`, sigmoid; log loss / PR-AUC):
  baseline 0,302 / 0,280 · nuestro 0,283 / 0,348 · StatsBomb 0,271 / 0,421.
  Mejoramos al baseline y StatsBomb nos mejora, ambas cosas de forma
  significativa. Perdemos sobre todo a menos de 6 yardas: ahí manda la posición
  del portero y los defensas, que no tenemos.
- **Gráficas** (`plots/`): curva de aprendizaje, fiabilidad, comparativa de
  métricas, importancia (gain), SHAP, mapa de calor del xG, dependencia con
  distancia y ángulo, error por segmento. Para el vídeo se muestran en la vista `/model`.

### 11.3 Servido

`ml/serve.py` (FastAPI) carga la ejecución `MODEL_RUN` al arrancar (nunca
entrena), comprueba que sus features coinciden con `build_features.py`, y expone
`GET /health`, `POST /predict` (tiro **en bruto** → `{ xg, xgRaw, shapValues,
baseValue, penalty, run }`) y `POST /predict/batch`. Express llama a través de
`api/utils/mlClient.js`. Si el servicio no responde, la ingesta guarda `xg: null`
y sigue; **el ML nunca bloquea**.

---

## 12. Convenciones

- Código, variables y comentarios en **inglés**. Textos de la interfaz y
  documentación en español. **Commits en inglés** (Conventional Commits:
  `feat(api): ...`, `fix(web): ...`).
- Ramas siempre; nunca trabajar sobre `main`. Se fusiona por PR.
- Un único `.env` en la raíz; sin secretos en el repo. `.env.example` con marcadores.
- **Base de datos:** se **lee** de `footboard`; los scripts y tests **escriben
  solo en `footboard_test`**. Escribir en `footboard` (ETL, heurística) solo con
  permiso explícito de Alejandro.
- Tests: `npm test` en `api/` (en serie, contra `footboard_test`); `pytest` en `ml/`.
- Finales de línea LF (`.gitattributes`, `core.autocrlf input`).
- No tocar `ml/BaselineModel/` sin revisión de Alejandro.

### Despliegue (Render)
Variables en el panel de Render, no en un fichero. **Atlas debe autorizar las
IPs de salida de Render.** El plan gratuito duerme los servicios: calentarlos
(`/api/health`, `ml /health`) antes de grabar.

---

## 13. Estado actual (21-11-2026)

La API, JWT, la heurística, el servicio de xG y el reproductor forman parte de
la base previa. La fase de Visión general y Partidos amplía las consultas de
lectura y la navegación sobre el centro de partido existente.

### Hecho
- **Datos en `footboard`:** Transfermarkt (5 competiciones, 176 clubes, 11.781
  jugadores, 191.512 valoraciones, 27.680 `SeasonStat`), `predictedValue` de la
  heurística (2.445 jugadores), 88.023 `Shot`, 445 `Match` (3 reproducibles) y la
  final del Mundial 2022 reproducida (120 `MatchEvent`; reproducir con `--reset`
  para que guarde también `card` y `replacement`, añadidos después).
- **API:** todo lo de la sección 9. 53 tests de integración (`npm test`), en
  serie, con helpers `test/helpers/` (`testDb`, `apiServer`, `mlStub`).
- **ML:** pipeline completo, `serve.py` con 9 tests pytest, explorador de datos.
- **Reproductor** probado de punta a punta: final del Mundial → 3-3, penaltis
  4-2, xG 3,07-1,96 (StatsBomb 2,76-2,27).
- **Web:** sistema visual global con tema oscuro principal y tema claro por
  `prefers-color-scheme`, aplicado al Explorador y a Login/Register.
  `PageHeader` y `Button` son reutilizables; la navegación pública oculta
  las áreas protegidas hasta iniciar sesión. Ficha básica; faltan arrastre y CSV.
- **Partido en vivo:** `/live/:matchId` lee la ficha y sigue el replay por REST.
  Marcador, mapa, feed y gráfico se actualizan a partir de los mismos eventos.
- **Visión general:** resumen de mercado agregado en MongoDB y rankings
  con carga progresiva y acceso a fichas.
- **Partidos:** catálogo de replays en una ruta propia, con filtros y búsqueda.

### Pendiente (reparto)
- **Compañero (ver `AGENTS.md`):** todo el frontend (diseño y vistas a su
  criterio), Socket.IO y usuario simulado. Libertad en la API;
  no toca `ml/`, el proxy de xG ni la estructura de carpetas.
- **Alejandro:** commits y PRs; decidir mejoras del xG (restricciones monótonas,
  indicador femenino/masculino, `freeze_frame`); promocionar la ejecución elegida
  (`OUTPUT_AI/` está en `.gitignore`); despliegue en Render; guion y grabación del vídeo.
- Confirmar con el profesor que la temática de fútbol está aprobada por escrito.

### Decisiones abiertas
- Lecturas de la API públicas o privadas (ahora privadas: hay login).
- Ordenar el ranking de infravalorados por residuo relativo.
- `worst_predictions.csv` ordenado por diferencia frente a StatsBomb.

---

## 14. Requisitos añadidos tras la tutoría (29-10-2026)

### 14.1 Autenticación con JWT — obligatorio, hecho
Modelo `User` (bcrypt, nunca en claro), `register`/`login` devuelven el token,
middleware `requireAuth` (401 si falta, es inválido o caducó), secreto en el
`.env` (≥ 32 bytes), caducidad 1 h, interceptor de axios. Se protege **toda** la
API salvo `/api/health` y `/api/auth`.

### 14.2 Datos que entran por la API — enfoque mixto aceptado
| Script | Vía | Para qué |
| --- | --- | --- |
| ETL de carga masiva | Mongoose directo, `bulkWrite` | Los ~200.000 registros reales |
| Usuario simulado (**pendiente**, `api/scripts/simulate-user.js`) | HTTP → API | Demostrar que la API es usable |
| Reproductor (hecho) | HTTP → API | Tiempo real (14.3) |

El usuario simulado: se autentica, **crea** datos claramente ficticios,
**consulta** con filtros, **modifica** y **borra** todo lo que creó.

### 14.3 Procesamiento en tiempo real — parte central
`api/scripts/replay.js` reproduce un partido ya jugado:
`npm run replay -- --match=<id> [--speed=60] [--reset]` (credenciales
`REPLAY_EMAIL`/`REPLAY_PASSWORD`).
- Envía solo los tipos útiles: `Shot`, `Own Goal For/Against`, `Foul Committed`,
  `Bad Behaviour`, `Substitution` y `Pass` con `shot_assist` o `goal_assist`
  (~105-133 de ~4.000 eventos por partido), en orden de `index`.
- Espera la respuesta de cada POST; vuelve a hacer login solo tras un 401.
- Marcador: cuentan los goles en propia puerta (`Own Goal For` va al equipo que
  se beneficia); la tanda de penaltis (`period` 5) se informa aparte en
  `shootout` y no cuenta ni en el marcador ni en el xG acumulado.
- La web consulta `GET /api/matches/:matchId/events` cada dos segundos tras
  cada respuesta. La lista completa permite detectar un reinicio del replay.
  LIVE requiere que el último evento tenga un `receivedAt` válido y de hace
  menos de 15 segundos. La cabecera distingue actividad reciente del replay,
  eventos históricos y fichas sin eventos. Un fallo de consulta se muestra
  por separado y puede reintentarse.
- El catálogo distingue entre partidos con y sin eventos registrados mediante
  `eventCount`; `available` indica que el ETL encontró el archivo al importar
  el catálogo. El listado no certifica marcador final, tanda ni actividad.
  El detalle espera el replay si no hay eventos y muestra el marcador
  acumulado cuando llegan. Para reproducir otro encuentro, obtener su JSON
  según `data/README.md` y ejecutar el reproductor contra una base autorizada.
- **Socket.IO (fase posterior):** la web sigue usando polling REST. Idea
  orientativa: una sala por partido, avisar tras cada evento nuevo (201) y, al
  reconectar, recuperar lo perdido con `GET /events?after=<sequence>`.
  Pistas en `AGENTS.md` §5.

Partidos de la demo (`ml/config.yaml`, forzados a test en el xG): 3869685
Argentina-Francia (final del Mundial 2022), 2302764 Milan-Liverpool (final de
Champions 2005), 3825700 Real Madrid-Rayo Vallecano (10-2, La Liga 2015-16).

---

## 15. Fuera de alcance (decidido, no reabrir)

Detección de jugadores en vídeo · FBref · modelo XGBoost de valor de mercado
(mejora opcional de la heurística si sobra tiempo) · modelo histórico de valor ·
modelo de predicción de resultado en vivo · Optuna hasta cerrar las features.

Entrega: **vídeo, 18-12-2026**.

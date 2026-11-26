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
                                                        │      │ avisos y estado del replay (Socket.IO)
                                         POST /predict  ▼      │ órdenes play/pausa/velocidad/reinicio
  REPRODUCTOR  ── POST eventos (JWT) ──►  API  ──►  SERVICIO ML (Python, FastAPI, Docker)
  (agente)     ◄── órdenes (Socket.IO, JWT) ──┘          XGBoost + SHAP
```

- **ETL**: scripts de Node que se lanzan a mano; no forman parte de la web.
- **API Express**: sin interfaz; JSON. Hace de intermediaria con el servicio de ML.
- **Servicio ML** (`ml/serve.py`): aparte, porque XGBoost y SHAP no existen en Node.
- **Reproductor** (`api/scripts/replay.js`): envía por la API los eventos de un
  partido ya jugado respetando su ritmo. En modo agente lo controla la web
  (play, pausa, velocidad, reinicio) a través de la API (sección 14.3).
- **React**: pide datos con axios. La vista en vivo recibe avisos de Socket.IO
  y sincroniza los eventos por REST.

---

## 4. Stack

| Capa | Tecnología |
| --- | --- |
| ETL | Node.js (`api/scripts/etl/`) |
| Base de datos | MongoDB Atlas + Mongoose 8 |
| Backend | Express 4 (`express-generator --no-view`) |
| Autenticación | `jsonwebtoken` + `bcryptjs` |
| Tiempo real | Socket.IO 4 (avisos por sala, datos por REST) |
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
             imageUrl (retrato de Transfermarkt; solo lo escribe el ETL y solo admite su
             servidor de imágenes; la silueta genérica `default.jpg` cuenta como sin foto)
             bio{text, url, lang} (primer párrafo de su artículo de Wikipedia, CC BY-SA;
             solo lo escribe `etl:bios`; url solo admite artículos de es/en.wikipedia.org)
Valuation    player → Player · date · value (€)          único {player, date}
SeasonStat   player · season ("2023-24") · competition · minutes · goals · assists
             (shots, passesCompleted, tackles vacíos)   único {player, season, competition}
Shot         tiros de la vía A para el dashboard: shotKey (único) · matchId · competition
             season · team · playerName · x · y · distanceToGoal · angleToGoal (calculados
             por build_features.py, nunca en Node) · outcome · bodyPart · technique · shotType
             playPattern · xgStatsbomb · isGoal · split
Match        matchId (StatsBomb, único) · competition · season · matchDate · homeTeam
             awayTeam · available (tiene fichero de eventos → se puede reproducir)
             finishedAt (lo marca el reproductor al enviar el último evento; un reset lo borra)
MatchEvent   matchId · sequence (el `index` de StatsBomb) · period (1-5; 5 = penaltis)
             minute · second · type · team · playerName · x · y
             tiros: shotOutcome · shotType · isGoal · xg (nuestro; null si el ML no
             respondió) · xgStatsbomb · card · replacement · raw (evento original)
             único {matchId, sequence}: reenviar un evento no lo duplica
User         email (único, minúsculas) · name · passwordHash (bcrypt, select: false)
Lineup       owner → User · name · formation · slots[{slotId, playerId → Player}]
             budgetEuros (opcional, € enteros) · revision · createdAt · updatedAt
GameSession  owner → User · state (rondas, respuestas, plazo y puntuación)
             revision · finishedAt · cancelledAt · expiresAt (TTL de partidas incompletas)
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
| `npm run etl:bios` | `Player.bio` desde Wikipedia, cruzando por el id de Transfermarkt en Wikidata (P2446). Necesita Internet; fuera de `etl`. `--langs=es` (por defecto) o `es,en` (inglés si no hay español), `--only-missing`, `--limit=N`, `--test-db` |

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
`GET /api/health`, el acceso en `/api/auth/*` y el catálogo y las partidas de
invitado en `/api/games/*`. Las estadísticas personales requieren JWT. Token
HS256, caduca a la hora.

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
| GET | `/api/players` | Todos los jugadores, con filtros y búsqueda por nombre (`q`, hasta 80 caracteres, ignora mayúsculas y diacríticos latinos) |
| GET | `/api/lineups/formations` | Catálogo compartido de 29 formaciones y sus huecos |
| GET/POST | `/api/lineups` | Listar las alineaciones propias / crear una |
| GET/PATCH/DELETE | `/api/lineups/:lineupId` | Abrir, actualizar o borrar una alineación propia; PATCH y DELETE exigen la revisión vigente |
| GET/PUT/DELETE | `/api/players/:id` | Ficha (`DELETE` en cascada) |
| GET | `/api/games/catalog` | Catálogo público, dificultades y reglas de duración |
| POST | `/api/games/sessions` | Inicia una partida para invitado o usuario autenticado |
| GET/POST | `/api/games/sessions/:id` / `/api/games/sessions/:id/actions` | Recupera la ronda o envía respuesta, pista, fin por tiempo o avance |
| POST | `/api/games/sessions/:id/cancel` | Cancela idempotentemente una partida propia o de invitado; conserva las completadas |
| GET | `/api/games/stats` | Récord, partidas, acierto por juego y 20 resultados recientes del usuario autenticado |
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
`GET /api/players` acepta además `clubId`, `subPosition`, `minValue` y
`excludeIds` (hasta 11 IDs) para Footboard XI; todos se aplican antes de contar
y paginar. Las rutas de alineaciones usan el JWT existente, validan huecos y
jugadores únicos y devuelven 409 ante una revisión obsoleta.
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
| `/players/:id` | **Ficha**: perfil con retrato, escudo, club, liga, edad y cifras de mercado | Disponible. Historial, estadísticas y comparables en ficha pendientes |
| `/live/:matchId` | **Centro de partido**: marcador, control del replay (play, pausa, velocidad, reinicio, rebobinar), mapa de tiros con aciertos y errores del modelo, feed con los tiros destacados, lectura del modelo y resumen final | Hecha (rehecha el 24-11, ver 10.1) |
| `/overview` | **Visión general**: KPIs, distribuciones y rankings paginados de mercado y scouting | Disponible |
| `/matches` | **Partidos**: catálogo de replays con búsqueda por equipo, filtros por competición y eventos y orden por fecha | Disponible |
| `/compare` | **Comparador** de dos jugadores, con mercado, referencias y estadísticas de liga por temporada | Disponible |
| `/lineup-builder` | **Footboard XI**: creador de alineaciones privadas con campo interactivo y presupuesto opcional | Disponible |
| `/games`, `/games/:game` | **Footboard Games**: catálogo público, configuración, rondas y resultados. Historial personal con sesión | Disponible |
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
- **Centro de partido:** ver 10.1. Los breadcrumbs permiten volver a Partidos
  o a Visión general.

### 10.1 Centro de partido: la lectura del modelo

La vista existe para enseñar **qué esperaba el modelo de cada tiro y qué pasó**.
Lógica pura y testeada en `components/live/matchData.js`
(`node --test web/test/live.test.js`).

- **xG de un tiro en porcentaje** (0,34 → 34 %). Los totales de equipo siguen en
  goles esperados (2,41 xG): una suma de probabilidades no es un porcentaje.
- **Franjas** por xG: clara ≥ 30 %, posible 10-30 %, improbable < 10 %.
  No se usa un umbral de 0,5: en test solo el 3,5 % de los tiros lo supera y el
  78 % de los goles quedaría como «error» (medido con el xG de StatsBomb).
- **Seis casos** (franja × resultado): gol previsto, gol posible, **gol
  inesperado**, **ocasión perdida**, fallo normal, fallo previsto. Solo los dos
  marcados son **errores del modelo** (anillo ámbar discontinuo en el mapa y en
  la gráfica, etiqueta ámbar en el feed).
- **Acierto** = tiros que no son error / tiros con xG (sin la tanda de penaltis).
  Se compara siempre con la referencia «nunca gol», juzgada con la misma regla
  (acierta todo salvo los goles): sin modelo ya se saca un 88-90 %.
- **Mapa:** círculos con el color del equipo; relleno = gol, solo borde = sin gol;
  área proporcional al xG; el tiro recién llegado aparece con una onda y una
  tarjeta flotante (jugador, %, caso). Las marcas se escalan con el ancho del
  campo (container query).
- **Feed:** los tiros, en tarjetas con barra 0-100 % (marcas en 10 y 30) y caso;
  el resto, en una línea discreta. Filtros Todo / Tiros / Goles.
- **Lectura del modelo:** probabilidad de cada tiro en el tiempo (piruletas sobre
  las bandas de franja), acierto frente a «nunca gol», tabla 2 × 3 de casos y
  goles frente a xG por equipo. Clic en un tiro lo selecciona en mapa, feed y gráfica.
- **Control del replay:** play/pausa, reinicio, velocidad (x5-x120) y barra de
  tiempo para **rebobinar** (solo cambia lo que se muestra; el replay sigue).
- **Resumen final** (`<dialog>` nativo) al terminar: marcador, acierto, diferencia
  con «nunca gol», tabla de casos, goles frente a esperados, el gol más
  inesperado y la ocasión más clara fallada. Se reabre con «Ver resumen».
- Pendiente (anotado): comparar tiro a tiro con el xG de StatsBomb y explicar
  cada xG con SHAP (el servicio ya lo calcula; la API aún no lo guarda).

### Comparador de jugadores

Cada selector consulta `GET /api/players?q=…&sort=-currentValue` con debounce
y carga páginas de 20 resultados al desplazarse. El filtro se aplica antes de
paginar, los empates se resuelven por ID y los jugadores sin valoración siguen
en el listado. Clubes y competiciones se consultan por separado.

Las fichas muestran club, liga, posición, edad y valor de mercado. Comparten
la resolución del retrato y el escudo con el resto de la aplicación.

El bloque de mercado enfrenta valor, referencia heurística por comparables
y diferencias absoluta y relativa (esta última con valor de mercado positivo).
Las cifras deportivas proceden de `GET /api/players/:id/stats`: se elige una
temporada común, se prioriza una competición compartida y se identifican las
ligas si difieren. Los goles y las asistencias por 90 minutos requieren un
recuento válido y minutos positivos. Cada barra compara la misma métrica
entre los dos futbolistas.

La cobertura actual de estadísticas de liga se limita a minutos, goles y
asistencias. El replay contiene eventos seleccionados con coordenadas cuando
están disponibles, sin seguimiento continuo ni enlace estable entre el jugador
de StatsBomb y el del catálogo. Quedan pendientes radar y mapas de calor con
datos suficientemente comparables.

### Identidad visual

El catálogo local en `web/src/media/catalog/` registra origen, licencia e
identificadores verificados. Comparador, ficha individual, tabla del
Explorador y rankings usan el mismo retrato cuando coincide el ID de
Transfermarkt y la fecha de nacimiento. `GET /api/players` y
`GET /api/aggregates/undervalued` incluyen `externalIds.transfermarkt` cuando
existe. El segundo endpoint lo incluye también en el club de cada fila.

El escudo de un club se obtiene por su ID de Transfermarkt. Partidos y Live
Match usan correspondencias explícitas por ID de partido, lado, competición,
temporada y nombre del equipo registrado. Jugadores y partidos siguen sin
una relación de selección general en MongoDB. Los retratos y escudos se
sirven en local, con iniciales cuando no hay recurso o falla la carga.
`/credits` recoge la atribución. Fuentes, cobertura y preparación en
[web/MEDIA.md](web/MEDIA.md).

### Footboard XI

Ruta protegida de carga diferida. Permite editar 29 formaciones, agrupadas por
3, 4 y 5 defensas, con búsqueda, variantes y miniaturas del campo. El catálogo
`api/models/lineupFormations.json` define las líneas tácticas que Express
valida y expone a la web en `GET /api/lineups/formations`. Se conservan las
claves y huecos de 4-3-3, 4-4-2 y 3-5-2. El hueco central del 4-3-3 equilibrado
conserva el ID `CDM` y se presenta como MC. El cambio de formación conserva
destinos compatibles y permite revisar, recolocar o retirar jugadores antes de
confirmar.
Se arrastra desde los resultados o desde el campo con `@dnd-kit/react`. Con
teclado o tacto, se elige un hueco y se confirma el jugador, o se selecciona
un jugador colocado y se activa «Mover o intercambiar». Escape cancela.
Arrastrar desde la búsqueda sobre un hueco ocupado pide confirmación.

El catálogo reutiliza `GET /api/players`. Los filtros `clubId`,
`subPosition` (lista separada por comas) y `minValue` se aplican antes de la
paginación, junto con los filtros de edad, competición, posición general y
valor máximo. Las sugerencias distinguen la posición registrada de un rol afín.
Footboard XI envía `excludeIds` con hasta once identificadores del once
confirmado. Express los excluye antes de contar y paginar. El buscador ajusta
la porción ya cargada cuando se coloca o se retira un jugador.
El catálogo no registra nacionalidad ni posiciones secundarias. Los retratos y
escudos disponibles se resuelven con el catálogo compartido.

El subtotal usa `currentValue` en euros enteros. Con valores ausentes puede
confirmar un exceso mínimo, o dejar indeterminado el cumplimiento. Un límite
desactivado oculta el consumo y los avisos. El valor es el registrado en el
catálogo, con antigüedad variable, y puede cambiar al abrir un XI guardado.

La colección `Lineup` guarda propietario, nombre, formación, huecos con
referencias a jugadores, presupuesto, fechas y revisión. `GET/POST /api/lineups`
lista y crea alineaciones. `GET/PATCH/DELETE /api/lineups/:lineupId` abre,
actualiza o elimina; PATCH y DELETE requieren la revisión vigente y devuelven
409 si cambió. Duplicar prepara un borrador y lo crea con POST. Toda consulta
individual se limita al ID y al propietario del JWT. Si una referencia
desaparece, el hueco permite retirarla o sustituirla. Guardar resuelve los datos
actuales por lote; el documento no guarda una instantánea de valoraciones.

Desde la raíz, `node --test web/test/lineup.test.js` comprueba el dominio.
`npm test` en `api/` comprueba persistencia, autorización, filtros y
concurrencia en `footboard_test`. Para comprobar la vista con Playwright,
usar Vite apuntando a la API de pruebas, abrir un usuario de pruebas y
verificar las asignaciones tras arrastrar, tocar o usar el teclado, además de
guardar y recuperar un once. Todas las escrituras de esta comprobación van a
`footboard_test`.

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
- **Base de datos:** se **lee** de `footboard`; los scripts **escriben solo en
  `footboard_test`**. Escribir en `footboard` (ETL, heurística) solo con
  permiso explícito de Alejandro.
- **Dos bases de pruebas, nunca mezclarlas:**
  - `footboard_test` (`MONGODB_URI_TEST`): la de las pruebas a mano
    (`npm run start:test`, ETL con `--test-db`). **Ningún test la vacía.**
  - `footboard_ci_test` (mismo URI con `_ci_test`, lo calcula
    `test/helpers/testDb.js`): la de `npm test`, que la vacía cuando quiere.
  Ningún test debe escribir a mano el nombre de la base: comprobar que termina en `_test`.
- Tests: `npm test` en `api/` (en serie, contra `footboard_ci_test`); `pytest` en `ml/`.
- Finales de línea LF (`.gitattributes`, `core.autocrlf input`).
- No tocar `ml/BaselineModel/` sin revisión de Alejandro.

### Despliegue (Render)
Variables en el panel de Render, no en un fichero. **Atlas debe autorizar las
IPs de salida de Render.** El plan gratuito duerme los servicios: calentarlos
(`/api/health`, `ml /health`) antes de grabar.

---

## 13. Estado actual (26-11-2026)

La API, JWT, la heurística, el servicio de xG y el reproductor forman parte de
la base previa. La web incluye Visión general, Partidos, Comparador y
Footboard XI, además del centro de partido con Socket.IO.

### Hecho
- **Datos en `footboard`:** Transfermarkt (5 competiciones, 176 clubes, 11.781
  jugadores, 191.512 valoraciones, 27.680 `SeasonStat`), `predictedValue` de la
  heurística (2.445 jugadores), 88.023 `Shot`, 445 `Match` (3 reproducibles) y la
  final del Mundial 2022 reproducida (120 `MatchEvent`; reproducir con `--reset`
  para que guarde también `card` y `replacement`, añadidos después).
- **API:** rutas protegidas, incluido Footboard XI. 103 tests (`npm test`), en
  serie, con helpers `test/helpers/` (`testDb`, `apiServer`, `mlStub`).
- **ML:** pipeline completo, `serve.py` con 9 tests pytest, explorador de datos.
- **Reproductor** probado de punta a punta: final del Mundial → 3-3, penaltis
  4-2, xG 3,07-1,96 (StatsBomb 2,76-2,27).
- **Web:** sistema visual global con tema oscuro principal y tema claro por
  `prefers-color-scheme`, aplicado al Explorador y a Login/Register.
  `PageHeader` y `Button` son reutilizables; la navegación pública oculta
  las áreas protegidas hasta iniciar sesión. Faltan arrastre y CSV.
- **Centro de partido (rehecho el 24-11, rama `feat/live-model-view`):** el
  replay se controla desde la web (reproductor en modo agente, 14.3) y la vista
  se centra en los aciertos y errores del modelo (10.1). Probado de punta a punta
  contra `footboard_test` con el servicio de xG real: final del Mundial 3-3,
  penaltis 4-2, xG 3,11-1,96, acierto 97 % frente al 80 % de «nunca gol».
- **Visión general:** resumen de mercado agregado en MongoDB y rankings
  con carga progresiva y acceso a fichas.
- **Partidos:** catálogo de replays en una ruta propia, con filtros y búsqueda.
- **Comparador:** dos jugadores del catálogo, búsquedas paginadas por nombre
  y comparación de mercado y rendimiento por temporada común, con tasas por
  90 minutos.
- **Footboard XI:** 29 formaciones, edición por arrastre, tacto o teclado,
  presupuesto opcional y guardado privado con control de revisión.
- **Fotos de jugadores (25-11, rama `feat/player-photos`):** `Player.imageUrl` desde `players.csv`; 10.270 de los 11.781 jugadores tienen foto (el resto, iniciales). Orden: retrato local verificado → foto de Transfermarkt → iniciales. Cargado también en `footboard` (25-11).
- **Escudos de clubes y selecciones (25-11, misma rama):** sin cambios en la base ni en el ETL. La web monta la URL de Transfermarkt con el id del equipo (`tmssl.akamaized.net/images/wappen/head/<id>.png`, `transfermarktCrest` en `identityCatalog.js`). Orden: escudo local verificado → Transfermarkt → monograma (también si da 404). Cubre los 176 clubes, las selecciones y los equipos de los partidos.
- **Descripciones de jugadores (25-11, misma rama):** `Player.bio` con el primer párrafo de Wikipedia en español (`npm run etl:bios`, 06-bios.js). Cruce exacto por el id de Transfermarkt en Wikidata. Cobertura medida: 6.531 de 11.781 jugadores (55 %) en español, 95 % de los de ≥ 10 M€; con `--langs=es,en` llegaría a 10.053 (85 %), decidido dejarlo solo en español por ahora. Wikipedia limita las ráfagas (429): el script pide 20 artículos por petición (Action API, TextExtracts), una por segundo, y respeta Retry-After; la carga completa tarda ~30 min. Cargado en `footboard_test`: 6.531 con descripción, 4.086 sin artículo en español, 1.164 sin Wikidata. La ficha muestra «Sobre el jugador» con enlace al artículo y la licencia. Cargado también en `footboard` (26-11): 6.531 con descripción.
- **`footboard_test` vaciada otra vez el 25-11 (~18:45)** por alguien que pasó `npm test` con el código de `main` (sus tests aún usan `footboard_test`; la separación en `footboard_ci_test` solo está en `feat/player-photos`). Recargada. Hasta que esa rama llegue a `main` puede volver a pasar.
- **Tests en su propia base (25-11):** `npm test` usa `footboard_ci_test`; `footboard_test` queda para las pruebas a mano (sección 12).
- **Identidad visual:** catálogo local con retratos acreditados, escudos de
  clubes y federaciones. Los recursos verificados se reutilizan entre la
  ficha, el Comparador y las listas o los centros de partido pertinentes.
- **Footboard Games:** `/games` y `/games/:game` ofrecen cuatro juegos con el
  catálogo existente de MongoDB: valor, edad, goles y pistas. Cada partida
  consta de diez rondas de 30 s. Las partidas de invitado conservan el progreso
  en una instancia durante una hora y usan un token opaco. Las autenticadas se
  guardan en `GameSession`; las incompletas caducan y las finalizadas alimentan
  el historial privado. Reiniciar cancela la sesión y crea otra; abandonar
  cancela sin añadir resultados al historial. El servidor calcula plazos,
  soluciones y puntuaciones.
  Un acierto suma 100/150/200 puntos según dificultad, más los segundos enteros
  restantes y menos 15 puntos por pista adicional. Valor exige fecha exacta y
  usa razones de 2 y 1,25. Edad usa diferencias de 5 y 2 años. Goles exige
  misma liga y temporada, 450 minutos y diferencias de 5, 2–4 o 1 gol.
  La dificultad también limita la población: fácil usa exclusivamente 64
  estrellas verificadas por ID de Transfermarkt; medio incorpora 103 futbolistas
  conocidos; difícil utiliza toda la base elegible. Goles prioriza temporadas
  desde 2024-25 en fácil y desde 2022-23 en medio. En pistas, la posición
  reduce las cuatro opciones a dos en fácil, a tres en medio y no discrimina
  en difícil; allí coinciden también la liga y edades próximas. La fecha de
  nacimiento final distingue la solución.

### Pendiente (reparto)
- **Compañero (ver `AGENTS.md`):** todo el frontend (diseño y vistas a su
  criterio) y usuario simulado. Libertad en la API;
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
API con las excepciones de la sección 9.

### 14.2 Datos que entran por la API — enfoque mixto aceptado
| Script | Vía | Para qué |
| --- | --- | --- |
| ETL de carga masiva | Mongoose directo, `bulkWrite` | Los ~200.000 registros reales |
| Usuario simulado (**pendiente**, `api/scripts/simulate-user.js`) | HTTP → API | Demostrar que la API es usable |
| Reproductor (hecho) | HTTP → API | Tiempo real (14.3) |

El usuario simulado: se autentica, **crea** datos claramente ficticios,
**consulta** con filtros, **modifica** y **borra** todo lo que creó.

### 14.3 Procesamiento en tiempo real — parte central
`api/scripts/replay.js` reproduce un partido ya jugado, de dos formas
(credenciales `REPLAY_EMAIL`/`REPLAY_PASSWORD`):
- **Agente, controlado desde la web (lo normal):** `npm run replay:agent --
  [--api=http://localhost:3001/api] [--speed=20]`. Hace login, se conecta por
  Socket.IO con su JWT y el rol `replayer`, y espera órdenes. Lee el JSON de
  eventos del partido que le pidan (`data/statsbomb_open_data/events/<id>.json`).
  Los eventos siguen viajando por **POST con JWT**, igual que antes.
- **Una pasada, sin web:** `npm run replay -- --match=<id> [--speed=60] [--reset]`.

El agente lleva un reloj virtual por partido (`ReplaySession`): antes de cada
evento espera el hueco de juego con el anterior dividido por la velocidad, y se
puede pausar o cambiar de velocidad en cualquier momento. Play sobre un partido
nuevo o terminado empieza de cero (borra sus eventos); el reinicio para el bucle,
espera al POST en vuelo y borra antes de empezar. Si la API aún no responde al
arrancar, reintenta el login; si caduca el token, vuelve a entrar y reconecta.
- Envía solo los tipos útiles: `Shot`, `Own Goal For/Against`, `Foul Committed`,
  `Bad Behaviour`, `Substitution` y `Pass` con `shot_assist` o `goal_assist`
  (~105-133 de ~4.000 eventos por partido), en orden de `index`.
- Espera la respuesta de cada POST; vuelve a hacer login solo tras un 401.
- Marcador: cuentan los goles en propia puerta (`Own Goal For` va al equipo que
  se beneficia); la tanda de penaltis (`period` 5) se informa aparte en
  `shootout` y no cuenta ni en el marcador ni en el xG acumulado.
- «Replay · Actividad reciente» indica que el `receivedAt` más reciente es
  válido y de hace menos de 15 segundos. El reloj de partido se lee del último
  evento por secuencia.
  La cabecera muestra por separado el transporte, la actividad del replay
  y los fallos de consulta.
- El catálogo distingue entre partidos con y sin eventos registrados mediante
  `eventCount`; `available` indica que el ETL encontró el archivo al importar
  el catálogo. El listado no certifica marcador final, tanda ni actividad.
  El detalle espera el replay si no hay eventos y muestra el marcador
  acumulado cuando llegan. Para reproducir otro encuentro, obtener su JSON
  según `data/README.md` y ejecutar el reproductor contra una base autorizada.

#### Socket.IO y recuperación

`api/bin/www` acopla Socket.IO al mismo servidor de Express, con la ruta
`/socket.io/` y `CORS_ORIGIN`. El cliente usa el origen de `VITE_API_URL`.
El handshake recibe `auth: { token }`, verifica el JWT con las mismas reglas
HS256 de REST y cierra la conexión al caducar. El servidor valida el ID de
StatsBomb y la existencia del partido. Cada socket se suscribe a un partido.

| Dirección | Evento | Datos |
| --- | --- | --- |
| Cliente → servidor | `match:join` | `{ matchId }`. Devuelve `{ ok: true, matchId }` al entrar en `match:<id>` o `{ ok: false, code }`; después recibe `replay:state` |
| Cliente → servidor | `match:leave` | `{ matchId }`. Confirmación idempotente |
| Servidor → sala | `match:changed` | `{ matchId, reason: 'event' \| 'reset' }` |
| Web → API → reproductor | `replay:command` | `{ matchId, action: 'play' \| 'pause' \| 'speed' \| 'restart', speed? }` (1-240). Devuelve la respuesta del reproductor `{ ok, state }` o `{ ok: false, code }`: `REPLAYER_OFFLINE`, `REPLAYER_TIMEOUT`, `NO_EVENTS_FILE`, `INVALID_*` |
| Reproductor → API → sala | `replay:state` | `{ matchId, status: 'idle' \| 'playing' \| 'paused' \| 'finished', speed, clock, duration, sent, total, online }`. Al llegar `finished`, la API guarda `Match.finishedAt` |

El rol sale de `auth.role` en el handshake (`replayer` o, por defecto, `viewer`).
Solo los sockets `replayer` pueden publicar `replay:state`; las órdenes solo las
envía la web. Al conectarse o desconectarse el reproductor, todas las salas
reciben su estado con `online` actualizado.

Una inserción confirmada (`201`) emite `event`. Un borrado confirmado
(`204`) emite `reset`. Un duplicado (`200`) conserva la respuesta REST y
omite el aviso. Los fallos de emisión se registran tras la escritura. El
reproductor sigue usando los mismos métodos y respuestas REST.

Con el ack de suscripción, al reconectar o al recuperar el foco, la web lee
la lista completa de `GET /api/matches/:matchId/events`. Los avisos agrupan
lecturas con una petición en vuelo. Si llegan durante una lectura, queda una
lectura pendiente. La lista ordenada sustituye a la anterior. Los `_id`
identifican altas y versiones nuevas de eventos tras un reset. Al detectar
un reset se limpian la selección y las animaciones antiguas. La secuencia
de StatsBomb puede reutilizarse o llegar fuera de orden.

En conexión sana se revalida por REST cada 30 s de inactividad. Durante
desconexión, espera de suscripción o error, el respaldo REST funciona cada
5 s. El contenido anterior se conserva durante fallos recuperables.
El módulo usa salas en memoria para una sola instancia. Si se escala la
API, hay que compartir salas y configurar afinidad para long-polling.
Se admite un productor por partido durante el replay. Antes de usar
`--reset`, detener el productor anterior para evitar escrituras en vuelo.

La integración de Socket.IO se ha validado con fixtures en `footboard_test`.
Queda pendiente repetir la validación con un replay histórico completo y el
servicio real de xG. La auditoría de la API conserva un aviso moderado
preexistente de `csv-parse` (versión instalada 5.6.0).

#### Comprobación local

1. Instalar dependencias en `api/` y `web/`. Para uso normal arrancar
   `npm run dev` en ambas carpetas.
2. Para un ensayo con escrituras, arrancar `npm run start:test` en
   `api/`. Comprobar que `GET http://localhost:3001/api/health` devuelve
   `db: "footboard_test"` y arrancar Vite con
   `VITE_API_URL=http://localhost:3001/api`, conservando el origen
   autorizado por `CORS_ORIGIN`.
3. Con un partido presente en la base de pruebas, abrir `/live/<id>`
   en dos sesiones autenticadas y otro partido en una tercera. Enviar
   eventos con el POST ya existente, o con el reproductor cuando estén
   disponibles sus archivos y credenciales autorizadas para pruebas.
   Lo normal: desde `api/`, `npm run replay:agent -- --api=http://localhost:3001/api`
   y pulsar «Reproducir» en `/live/<id>`. El usuario de `REPLAY_EMAIL` tiene
   que existir en `footboard_test` (registrarlo una vez) y el partido también
   (`npm run etl:matches -- --test-db`). `npm test` ya no toca esta base.
   Las pruebas automatizadas usan fixtures y no necesitan esos JSON históricos
   (`test/replayAgent.test.js` cubre órdenes, pausa, velocidad, reinicio y fin).

Partidos de la demo (`ml/config.yaml`, forzados a test en el xG): 3869685
Argentina-Francia (final del Mundial 2022), 2302764 Milan-Liverpool (final de
Champions 2005), 3825700 Real Madrid-Rayo Vallecano (10-2, La Liga 2015-16).

---

## 15. Fuera de alcance (decidido, no reabrir)

Detección de jugadores en vídeo · FBref · modelo XGBoost de valor de mercado
(mejora opcional de la heurística si sobra tiempo) · modelo histórico de valor ·
modelo de predicción de resultado en vivo · Optuna hasta cerrar las features.

Entrega: **vídeo, 18-12-2026**.

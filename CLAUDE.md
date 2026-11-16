# Footboard

Herramienta de scouting: detecta jugadores de fútbol infravalorados por el
mercado. Proyecto final de Sistemas de Información Ubicuos (Grado de Ingeniería
Informática de Talavera, curso 2026-27).

---

## 1. Qué hace la aplicación

Ingiere datos públicos de jugadores de fútbol (perfil, valor de mercado histórico
y estadísticas de rendimiento), los normaliza en MongoDB y los sirve a un
dashboard interactivo.

Un modelo de regresión aprende cuánto vale un jugador según su edad, posición,
liga y rendimiento. Comparando esa predicción con el valor real de mercado
aparecen los **residuos**: jugadores que el modelo tasa muy por encima de lo que
cuestan. Esos son los infravalorados.

**La pregunta que responde la app:** ¿qué jugadores valen menos de lo que
deberían, dado su perfil y su rendimiento?

**Para quién:** un club con presupuesto limitado buscando fichajes eficientes.

---

## 2. Requisitos del enunciado

Deben guiar cada decisión de diseño:

- Aplicación web **distribuida full-stack** con cuadro de mando
- Datos **heterogéneos** en tipo, formato, granularidad y frecuencia
- Obtener **información con valor** a partir de los datos crudos
- Representación gráfica **flexible**, con **manipulación directa**
- Solución innovadora

Nota: "manipulación directa" significa que el usuario actúa sobre la
representación visual misma (clicar un punto del gráfico, arrastrar para acotar
un rango) y todo lo demás reacciona. No basta con un panel de gráficas estáticas.

---

## 3. Arquitectura

Cuatro procesos independientes:

```
  FUENTES          ETL            MONGODB         API            WEB
  CSV/JSON   →   Node script  →   Atlas    →   Express   →    React
                 (una vez)                      (JSON)       (navegador)
                                                   ↕
                                            SERVICIO ML
                                          Python (FastAPI)
```

- **ETL** — script de Node que se ejecuta a mano, no forma parte de la web
- **MongoDB Atlas** — los datos ya limpios
- **API Express** — sin interfaz; recibe peticiones HTTP y devuelve JSON
- **React** — lo que ve el usuario; pide datos a la API con axios
- **Servicio ML** — Python aparte, porque XGBoost y SHAP no existen en Node.
  Express hace de intermediario.

---

## 4. Stack

| Capa | Tecnología |
| --- | --- |
| ETL | Node.js, scripts en `scripts/` |
| Base de datos | MongoDB Atlas + Mongoose |
| Backend | Express (`express-generator --no-view`) |
| Frontend | React + Vite |
| Cliente HTTP | axios |
| Gráficos | Recharts |
| Modelo | Python: scikit-learn, XGBoost, SHAP |
| Orquestación local | Docker Compose |
| Despliegue | Render (auto-deploy desde `main`) + Atlas |

No introducir TypeScript, Redux, Next.js ni ORMs alternativos. La asignatura es
MERN y el proyecto debe parecerse a lo enseñado en clase.

---

## 5. Estructura del repositorio

```
footboard/
├── api/                    backend Express
│   ├── app.js              conexión a Atlas, middlewares, rutas, errores
│   ├── bin/www             arranque del servidor
│   ├── models/             Player.js, Club.js, Competition.js, Valuation.js, SeasonStat.js
│   ├── routes/             players.js, clubs.js, competitions.js, aggregates.js, predictions.js
│   ├── utils/              asyncHandler.js, httpError.js, pick.js
│   ├── scripts/            seed.js, etl/
│   └── test/               pruebas de integración
├── web/                    frontend React + Vite
│   └── src/
│       ├── api/            cliente axios y funciones por recurso
│       ├── components/     componentes reutilizables
│       ├── pages/          una por vista
│       └── hooks/          estado compartido de filtros
├── ml/                     servicio Python de modelos
│   ├── train.py            entrenamiento offline
│   ├── serve.py            endpoint de inferencia
│   └── models/             modelo serializado + features.json
├── data/                   muestras congeladas de las fuentes
├── docker-compose.yml
├── README.md
└── CLAUDE.md
```

---

## 6. Fuentes de datos

### Decidida y descargada

**Transfermarkt** (dataset de dcaribou, vía Kaggle). Fuente principal, en
`data/data_from_transfermarkt/`. Foto de septiembre de 2026; las actualizaciones
automáticas del dataset están pausadas desde julio de 2026, lo que para el
proyecto es una ventaja: versión estable y reproducible.

| Fichero | Contenido | Filas |
| --- | --- | --- |
| `competitions.csv` | Ligas y torneos | 65 |
| `clubs.csv` | Clubes y su liga | 796 |
| `players.csv` | Perfiles, posición, valor actual | 50.149 |
| `player_valuations.csv` | Histórico de valoraciones | 656.301 |
| `appearances.csv` | Una fila por jugador y partido | 1.894.350 |

**Limitación importante:** `appearances.csv` solo trae minutos, goles,
asistencias y tarjetas. **Ni tiros, ni pases, ni entradas.** Con solo esta
fuente, el modelo apenas distingue a un central de un portero y acabaría
prediciendo casi por edad, posición y liga. Los campos `shots`,
`passesCompleted` y `tackles` de `SeasonStat` quedan vacíos.

### Siguiente: FBref

Deja de ser un extra y pasa a ser **necesaria** por la limitación anterior. Es lo
que hace que el rendimiento pese de verdad en la predicción.

No se descarga como fichero: se extrae con la librería `soccerdata` de Python
(`pip install soccerdata`), llamando a `read_player_season_stats` con
`stat_type` en `shooting`, `passing` y `defense`, y juntando los resultados.

Es un *scraper*, así que se extrae una vez y se congelan los CSV en `data/`.
Tiene límite de peticiones; la primera extracción de cinco ligas tarda.

**No comparte identificadores con Transfermarkt.** Hace falta una tabla de
equivalencias de nombres de jugador y club, con normalización de cadenas y
revisión manual de lo que no case. Es la tarea con más riesgo de desbordarse:
**empezar emparejando solo LaLiga.**

### Candidatas, no decididas

- **StatsBomb** — eventos con coordenadas. Para métricas espaciales y para la
  simulación en tiempo real (14.3). No alimenta el modelo de valor.
- **Football-Data** — resultados y cuotas de casas de apuestas. Serviría de
  *baseline* para un modelo de predicción de resultado.

Todas las fuentes se congelan en `data/`, que está en `.gitignore`. Documentar en
`data/README.md` cómo obtenerlas.

---

## 7. Modelo de datos (Mongoose)

Cinco modelos, un fichero por modelo en `api/models/`, nombre en singular y con
mayúscula inicial.

### Competition
```
code        String, required, unique    // "ES1"
name        String, required
country     String
tier        Number                      // 1 = primera división
```

### Club
```
name          String, required
competition   ObjectId → Competition, required
country       String
externalIds   { transfermarkt: String, fbref: String }
```

### Player
```
name           String, required, trim
birthDate      Date
position       String, enum: ['GK','DF','MF','FW'], required
subPosition    String                  // una de las 13 de Transfermarkt ("Centre-Forward")
foot           String, enum: ['left','right','both']
heightCm       Number, min: 140, max: 220
club           ObjectId → Club
currentValue   Number, min: 0          // euros, desnormalizado para listar rápido
predictedValue Number, min: 0          // euros, lo escribe el scoring offline (no la API)
contractUntil  Date
lastSeason     Number, min: 1900       // año de inicio de la última temporada jugada
externalIds    { transfermarkt: String, fbref: String }
```

### Valuation
```
player    ObjectId → Player, required
date      Date, required
value     Number, required, min: 0     // euros
```
Índice compuesto único: `{ player: 1, date: 1 }`

### SeasonStat
```
player         ObjectId → Player, required
season         String, required        // "2023-24"
competition    ObjectId → Competition
minutes        Number, min: 0
goals          Number, min: 0
assists        Number, min: 0
shots          Number, min: 0
passesCompleted Number, min: 0
tackles        Number, min: 0
```
Índice compuesto único: `{ player: 1, season: 1, competition: 1 }`

### Reglas
- La **validación vive en el esquema**, nunca repetida en las rutas. Mongoose
  lanza `ValidationError` y la ruta responde 400.
- Relaciones por `ObjectId` + `ref`, resueltas con `populate` solo cuando la
  respuesta lo necesite (populate indiscriminado mata el rendimiento).
- Índices por los campos de filtro habituales: `position`, `currentValue`,
  `club`, `birthDate`.
- Los agregados pesados se calculan con el **aggregation pipeline**, no trayendo
  documentos a Node para sumarlos ahí.

---

## 8. ETL

Scripts en `api/scripts/etl/`, uno por entidad, ejecutables de forma
independiente y en este orden: competiciones → clubes → jugadores → valoraciones
→ estadísticas. Escriben **directamente con Mongoose**, no por la API (ver 14.2).

### Decisiones de alcance (confirmadas)

| Decisión | Valor |
| --- | --- |
| Ligas | Las cinco grandes: `ES1`, `GB1`, `IT1`, `L1`, `FR1` |
| Jugadores | Solo los que militan **hoy** en una liga cargada |
| `SeasonStat` | Solo competiciones de liga doméstica, ni copas ni UEFA |
| Base previa | **Vaciar** antes de la primera carga (el seed la contaminaría) |

Volumen esperado: ~176 clubes, ~11.813 jugadores (~3.012 con valor de mercado),
~191.754 valoraciones y ~27.697 filas de `SeasonStat`.

**Validar primero con LaLiga sola** (33 clubes, 2.278 jugadores) y ampliar
después. Si algo está mal se ve en dos minutos en vez de media hora.

### Campos nuevos que exige el ETL

- `Player.lastSeason` (Number) — solo 748 de los 2.278 jugadores de LaLiga siguen
  en activo. Los retirados **sí sirven para entrenar** el modelo, pero **no deben
  aparecer** en el Explorador. Se cargan todos y se filtra en la vista.
- `Player.subPosition` (String) — los 13 valores de Transfermarkt. Distingue un
  extremo de un delantero centro, y eso es señal real para el modelo.

### Normalización al cargar

- Posiciones al `enum` de cuatro valores: `Goalkeeper`→GK, `Defender`→DF,
  `Midfield`→MF, `Attack`→FW. Los 586 con posición `Missing` **no se cargan**.
- Alturas fuera de 140–220 cm se descartan (hay 13 absurdas, una de 17 cm).
- Nombres con `trim` y dobles espacios colapsados.
- Fechas a `Date`; valores de mercado en euros enteros.
- `Competition.name` no existe legible en el CSV (solo un *slug* tipo `laliga`):
  **mapa manual** para las cinco ligas.
- `Club.country` se deriva del `country_name` de su competición.
- `SeasonStat` se obtiene agregando `appearances.csv` por
  `(player_id, season, competition_id)`, uniendo con `games.csv` para sacar la
  temporada. Formato `YYYY-YY`.

### Reglas técnicas

- **Idempotente**: `updateOne` + `upsert: true` sobre el id externo de
  Transfermarkt, nunca `insertMany` a ciegas.
- Procesar en **lotes** con `bulkWrite`.
- Informe final: insertados, actualizados y **descartados por cada motivo**.
- Reutilizar los modelos de Mongoose, no consultas crudas.

---

## 9. API

### Patrón de routers anidados

El padre delega y el hijo hereda parámetros con
`express.Router({ mergeParams: true })`. **Sin `mergeParams` los parámetros del
padre llegan como `undefined`.**

```
/api/competitions/:competitionId/clubs/:clubId/players
/api/players/:playerId/valuations
/api/players/:playerId/stats
```

La referencia al padre **sale siempre de la URL, nunca del cuerpo**. Al crear un
jugador bajo un club, el club es el de la ruta.

### Endpoints

| Método | Ruta | Acción |
| --- | --- | --- |
| GET/POST | `/api/competitions` | Listar / crear |
| GET/PUT/DELETE | `/api/competitions/:id` | Ver / modificar / eliminar |
| GET/POST | `/api/competitions/:id/clubs` | Clubes de una competición / crear en ella |
| GET | `/api/clubs` | Clubes de todas las competiciones (global) |
| GET/PUT/DELETE | `/api/clubs/:id` | Ficha de club |
| GET/POST | `/api/clubs/:id/players` | Jugadores de un club / crear en él |
| GET | `/api/players` | Jugadores de todos los clubes (global, lo usa el Explorador) |
| GET/PUT/DELETE | `/api/players/:id` | Ficha de jugador |
| GET | `/api/players/:id/valuations` | Histórico de valoración |
| GET | `/api/players/:id/stats` | Estadísticas por temporada |
| GET | `/api/aggregates/undervalued` | Ranking de infravalorados |
| GET | `/api/aggregates/summary` | KPIs de cabecera |
| POST | `/api/predictions/value` | Proxy al servicio ML |

### Filtros transversales

Van en la *query string*, **nunca en la ruta**. Un middleware compartido los
parsea una sola vez y todos los routers de consulta lo reutilizan:

```
?position=FW&minAge=18&maxAge=23&competition=ES1&maxValue=5000000
&sort=-residual&page=2&limit=50
```

Mal: `/players/position/FW/page/2`

**Colecciones anidadas y globales.** Coexisten: la anidada sirve «los jugadores
de este club» (el padre sale de la URL) y la global sirve al Explorador, que
filtra jugadores de todos los clubes a la vez. Las dos comparten handler y
filtros. Los **POST solo existen en la ruta anidada**, porque es la URL la que
aporta la referencia al padre: `POST /api/players` y `POST /api/clubs` dan 404.

Qué filtros aplica cada colección (los demás se ignoran):

| Colección | Filtros |
| --- | --- |
| `/players`, `/clubs/:id/players` | `position`, `minAge`, `maxAge`, `maxValue`, `sort`, `page`, `limit`. `competition` solo en la global. |
| `/clubs`, `/competitions/:id/clubs` | `sort`, `page`, `limit`. `competition` (código) solo en la global. |

### Códigos de estado

- **201** al crear
- **400** validación fallida, o id que no es un `ObjectId` válido
  (`CastError` es culpa del cliente, **no** un 500)
- **404** recurso inexistente, o que no pertenece al padre de la URL
- **500** errores del servidor

### Utilidades obligatorias en `utils/`

- `asyncHandler(fn)` — envuelve handlers `async` para que los errores lleguen al
  manejador central de `app.js`. **Prohibido repetir `try/catch` en cada ruta.**
- `pick(obj, fields)` — POST y PUT solo aceptan los campos del modelo; el resto
  del cuerpo se ignora.
- `httpError(status, message)` — errores uniformes.

Usar `router.param` para cargar y validar el recurso padre una sola vez por
petición.

### Rendimiento

- Paginación por defecto de 50, máximo 200. Nunca devolver colecciones enteras.
- `.lean()` en las consultas de solo lectura.
- `.select()` explícito: no devolver documentos completos cuando la vista solo
  necesita cuatro campos.

---

## 10. Frontend

### Vistas

1. **Explorador** (principal) — scatter plot de valor real contra valor predicho.
   La diagonal es "mercado y modelo coinciden"; los puntos por encima son los
   infravalorados. Panel de filtros al lado y tabla ordenable debajo.
2. **Ficha de jugador** — perfil, serie temporal de su valoración, estadísticas
   por temporada y desglose SHAP de por qué el modelo lo tasa como lo tasa.
3. **Comparador** — dos o tres jugadores enfrentados en las mismas métricas.
4. **Visión general** — KPIs: jugadores analizados, error del modelo, los diez
   más infravalorados.

### Manipulación directa

Es un requisito del enunciado, no un extra:
- Clic en un punto del scatter → abre la ficha de ese jugador
- Arrastrar sobre el scatter para seleccionar una región → recorta la tabla
- Los filtros afectan simultáneamente al scatter, la tabla y los KPIs
- Descarga en CSV del subconjunto filtrado

### Reglas

- Un **único estado global de filtros** (Context o hook propio) compartido por
  todas las vistas. No duplicar estado por componente.
- Un único cliente axios configurado en `src/api/client.js` con la URL base
  desde variable de entorno. Las llamadas se agrupan por recurso.
- axios rechaza la promesa si el estado no es 2xx (a diferencia de `fetch`).
  Manejar siempre el `catch` y mostrar el error al usuario, nunca fallar en
  silencio.
- Estados de carga y de error explícitos en cada vista.

---

## 11. Capa de ML

### El modelo

Regresión sobre el valor de mercado. **Target: logaritmo del valor**, no el valor
bruto — la distribución está brutalmente sesgada y sin log el modelo solo acierta
con las estrellas. Deshacer la transformación al predecir.

Features: edad (no lineal, pico a los 24-26), posición, minutos jugados, goles y
asistencias por 90 minutos, liga, años de contrato restantes, altura, pie.

### El producto son los residuos

`residual = valor_predicho − valor_real`. Un residuo positivo grande marca a un
jugador infravalorado.

**Advertencia que debe constar en la memoria:** un residuo grande significa o que
el mercado se equivoca, o que al modelo le falta información que el mercado sí
tiene (lesión reciente, conflicto con el club, contrato a punto de expirar). El
modelo no distingue ambos casos. Reconocerlo y proponer mitigaciones vale más que
fingir infalibilidad.

### Reglas no negociables

- **Split temporal, nunca aleatorio.** Entrenar con valoraciones antiguas,
  validar con las recientes.
- Evaluar con **MAE sobre el valor en euros** además del error en escala
  logarítmica: el error en log no se entiende.
- **Un jugador no puede estar en entrenamiento y validación a la vez.** Agrupar
  por jugador al hacer el split.
- Entrenamiento **offline**. El modelo se serializa junto a un `features.json`
  con la lista de features y sus tipos. **Nunca se entrena al atender una
  petición.**

### Servido

`ml/serve.py` carga el modelo al arrancar y expone `POST /predict`, que recibe el
vector de features y devuelve `{ predictedValue, shapValues }`. Express consulta
MongoDB, construye el vector y hace de intermediario.

---

## 12. Convenciones

- Código, variables y comentarios en **inglés**. Documentación y commits en
  español.
- Sin secretos en el repositorio. `.env` en `.gitignore`, `.env.example` con
  marcadores. La cadena de Atlas lleva contraseña.
- El puerto se lee de `process.env.PORT` (Render lo asigna).
- Trabajar en ramas, nunca directamente sobre `main`.
- Pruebas de integración contra una base desechable cuyo nombre acaba en `_test`
  y se borra al terminar. **Nunca contra la base real.**

### Despliegue

Render con auto-deploy desde `main`. Dos fallos que cuestan una tarde:
- Las variables de entorno van en el panel de Render, no en un `.env` subido.
- **Atlas debe autorizar los rangos de IP de salida de Render**, no solo la del
  desarrollador. Si no, funciona en local y falla en producción.

---

## 13. Estado actual

Tandas 1 y 2 fusionadas en `main` (PR #1); tanda 3 (seed + frontend) fusionada
en `main` (PR #2). Tanda 4 (ETL de Transfermarkt) en la rama `feat/tanda-4-etl`, sin commit.

**Hecho (tanda 4, ETL):**
- `api/scripts/etl/`: `01-competitions` → `05-stats`, `run-all.js`, `wipe.js` y `lib/` (`common.js`: flags, conexión, CSV en streaming con `csv-parse`, clase `Loader`; `normalize.js`: funciones puras). Scripts npm `etl` (`-- --leagues=ES1,...`, ES1 por defecto) y `etl:wipe` (`-- --force`).
- Probado con LaLiga contra `footboard_test` (Atlas): 1 competición, 33 clubes, 2.272 jugadores, 39.201 valoraciones y 5.070 `SeasonStat`, en ~115 s. Relanzado: 0 insertados (idempotente). Datos comprobados a mano (Lamine Yamal 200 M€, Mbappé 31 goles en 2024-25, 748 jugadores con `lastSeason` ≥ 2025).
- `api/test/etl.test.js`: 5 pruebas unitarias de `normalize.js`. `npm test`: 27/27.
- `data/README.md`: de dónde sale cada CSV y cómo lanzar el ETL.
- **Aún no ejecutado contra `footboard`** (la base real sigue con el seed).

**Decisiones tomadas en la tanda 4:**
- Cada script obtiene los `_id` de los padres consultando Mongo (mapa id de Transfermarkt → `_id`), así se pueden lanzar sueltos.
- `bulkWrite` no ejecuta validadores: cada documento pasa por `new Model(doc).validateSync()` antes; los inválidos se descartan con motivo `validation`.
- Upsert con `$set` y claves con punto (`externalIds.transfermarkt`), para no pisar `externalIds.fbref` cuando se cargue FBref.
- Valoraciones duplicadas (mismo jugador y día) en el CSV: se queda la primera.
- `SeasonStat` solo suma partidos con `competition_type = domestic_league` de las ligas cargadas; la temporada sale de `games.season` ("2023" → "2023-24"). Tarjetas no se guardan (el modelo no tiene campo).
- Altura fuera de 140–220: se anula el campo pero el jugador se carga (aparece como *nota* en el informe, no como descarte).
- `predictedValue` no se toca: el Explorador se quedará vacío hasta que exista el modelo (decisión del usuario).
- Alcance «club actual en una liga cargada»: jugadores históricos que acabaron en otra liga (p. ej. Messi) no entran.

**Hecho (preparación del ETL):**
- `Player` tiene dos campos nuevos: `subPosition` (String) y `lastSeason` (Number, índice). Se pueden enviar en POST/PUT y salen en los listados. El seed no los rellena.
- Pendiente: el filtro del Explorador que oculta a los retirados (por `lastSeason`) se decide al cargar los datos reales.

**Hecho (tanda 3, parte B: frontend):**
- `web/`: React 19 + Vite 8 + react-router-dom 7 + axios + Recharts 3. `npm run dev` (puerto 5173, el que admite el CORS de la API) y `npm run build`.
- `src/api/`: cliente axios único (`client.js`, base `VITE_API_URL`) y módulos por recurso (`players`, `competitions`, `aggregates`; `params.js` traduce los filtros a query string).
- `src/hooks/useFilters.jsx`: estado global de filtros (Context + `useReducer`) en `FiltersProvider`; `useApi` (carga/error/reintento, aborta la petición anterior) y `useDebouncedValue`.
- Vista Explorador completa: panel de filtros, scatter real vs. predicho y tabla ordenable, todos con la misma petición. Clic en un punto (o en el nombre en la tabla) abre `/players/:id`.
- Ficha (`/players/:id`) con datos básicos; Visión general y Comparador son placeholders. Comprobado renderizando con Chrome headless: Explorador en claro y oscuro, ficha y error 400.

**Decisiones tomadas en la tanda 3, parte B:**
- El Explorador pide `/api/aggregates/undervalued?limit=200` una sola vez, y scatter y tabla comparten esa respuesta (ya trae residuo y nombre del club). Si hay más de 200 jugadores filtrados se avisa en pantalla («Mostrando 200 de N»); solo aparecen jugadores con `predictedValue`.
- La ordenación de la tabla es estado local de la tabla (en cliente), no un filtro global.
- Filtros con *debounce* de 300 ms; si edad mínima > máxima se avisa y no se llama a la API. Mientras recarga, la vista mantiene los datos anteriores atenuados.
- Scatter con **escala logarítmica en ambos ejes** y el mismo dominio (la diagonal queda a 45°). Azul = infravalorado (residuo > 0), rojo = resto; paleta validada para modo claro y oscuro. Puntos con zona de clic de 24 px y tooltip.
- `vite.config.js` usa `envDir: '..'`: lee `VITE_API_URL` del `.env` único de la raíz. Se añadió esa línea al `.env` local.
- Si falta `VITE_API_URL`, el cliente falla con un mensaje explícito. Los errores de axios se convierten en «Error <status>: <mensaje de la API>» o «No se pudo conectar con la API».
- Textos de la interfaz en español; código y comentarios en inglés. Rutas: `/` Explorador, `/players/:playerId`, `/overview`, `/compare`.
- Sin librería de componentes ni CSS framework: CSS propio con tokens para modo claro/oscuro.
- Pendiente del Explorador: arrastrar para seleccionar región en el scatter y descarga CSV (sección 10). El bundle pesa 686 kB (Recharts); se puede trocear más adelante.

**Hecho (tanda 3, parte A: seed):**
- `api/scripts/seed.js` y `npm run seed` (`npm run seed -- --force` para vaciar y recargar). Sigue el patrón del seed de los apuntes.
- Ejecutado contra Atlas (`footboard`): 3 competiciones, 12 clubes, 120 jugadores, 1168 valoraciones y 467 estadísticas por temporada. Comprobado con curl: `/api/players` y `/api/aggregates/undervalued` devuelven datos.

**Decisiones tomadas en la tanda 3:**
- Datos **deterministas**: generador aleatorio con semilla fija y fecha de referencia fija (1-7-2026). Cada ejecución produce los mismos datos.
- Competiciones con códigos de Transfermarkt: `ES1` (LaLiga), `GB1` (Premier League), `IT1` (Serie A). Clubes reales (4 por liga) con un factor de fuerza; **jugadores con nombres ficticios**, para que no pasen por reales.
- Valor de mercado log-normal: valor «fundamental» según talento, curva de edad (pico 25-26), posición, liga y club. Resultado: mediana 2,8 M€, p90 14,5 M€, máximo 74,5 M€; 78 de 120 por debajo de 5 M€.
- `currentValue` = fundamental × ruido de mercado (10 % infravalorados, 6 % sobrevalorados, resto ±30 %); `predictedValue` = fundamental × ruido pequeño (±15 %). Así los residuos señalan a los mal tasados por el «mercado».
- Valoraciones semestrales (1 dic / 1 jun) desde dic-2021, solo desde los 16 años; la última coincide con `currentValue`.
- Estadísticas de 2022-23 a 2025-26 en la liga actual del club (sin traspasos); minutos y producción por 90 dependen de posición, talento y edad.
- `--force` vacía las cinco colecciones; sin él, el script no toca una base que tenga datos en cualquiera de ellas.

**Hecho (tanda 2, rutas):**
- Routers de la sección 9 en `api/routes/`: `competitions`, `clubs`, `players`, `valuations`, `stats`, `aggregates`, `predictions`, montados en `app.js`.
- `api/middleware/filters.js`: `parseFilters` (parsea una vez a `req.filters`), `buildSort` (lista blanca por recurso), `buildPlayerFilter` y `pageResponse`.
- `router.param` en `competitionId`, `clubId` y `playerId`: carga el recurso una vez (`req.competition`, `req.club`, `req.player`) y devuelve 404 si no pertenece al padre de la URL.
- `/api/predictions/value` es un stub: devuelve `{ predictedValue: 10000000, shapValues: {}, stub: true }`.
- Pruebas de integración en `api/test/api.test.js` (22 casos, `npm test`). Pasan contra un `mongod` temporal y, desde el 15-11-2026, contra la base `_test` de Atlas.

**Decisiones tomadas en la tanda 2:**
- Nuevo campo `Player.predictedValue` (euros). Sin él no hay residuos que servir. Lo escribirá el job de scoring offline; la API **no** lo acepta en POST/PUT.
- `residual = predictedValue − currentValue`, calculado en el aggregation pipeline. `undervalued` y `summary` solo cuentan jugadores con ambos valores.
- `summary` devuelve `players`, `scoredPlayers`, `totalMarketValue`, `maeEuros` y `meanResidual`, y respeta los mismos filtros.
- Las listas responden `{ data, page, limit, total, totalPages }`. `limit` por encima de 200 se recorta a 200; valores no numéricos o `page < 1` dan 400.
- Los filtros que no aplican a un recurso se ignoran (p. ej. `competition` en `/clubs/:id/players`, donde el club ya fija la competición). Un `competition` desconocido no devuelve nada. `position` admite lista separada por comas.
- Valores de query que no son strings (`?position[$ne]=GK`) dan 400, para evitar inyección de operadores.
- `sort` solo acepta campos de una lista blanca por recurso (400 si no); `_id` es el desempate para paginar de forma estable.
- `GET /api/clubs` y `GET /api/players` son colecciones globales (con los filtros transversales) que coexisten con las anidadas. Los POST siguen solo en las anidadas: `POST /api/clubs` y `POST /api/players` dan 404. El padre nunca se puede cambiar por PUT.
- En la global de clubes solo aplica `competition`; `position`, `minAge`, `maxAge` y `maxValue` no tienen sentido para clubes y se ignoran. En las anidadas `competition` se ignora, porque la URL ya fija el padre.
- `PUT` actualiza solo los campos enviados (con `runValidators`) y da 400 si no llega ninguno válido.
- `DELETE` responde 204. Borrar un jugador borra en cascada sus valoraciones y estadísticas. Borrar un club con jugadores, o una competición con clubes, da **409**.
- Finales de línea: `.gitattributes` con `* text=auto eol=lf` y `core.autocrlf input` en el repo, para que Windows y WSL no vean cambios fantasma por CRLF.
- `asyncHandler` reenvía argumentos extra para poder usarlo en `router.param`.
- Valoraciones y estadísticas van en `routes/valuations.js` y `routes/stats.js`, no en `players.js`.
- Las pruebas vacían las colecciones con `deleteMany` (no `dropDatabase`) y se niegan a correr si la base no acaba en `_test`.

**Hecho (tanda 1):**
- Estructura de carpetas del repo (`api/`, `web/`, `ml/`, `data/`).
- `api/`: `app.js` (conexión a Atlas, CORS, manejador central de errores, `/api/health`), `bin/www`, `package.json`, `Dockerfile`.
- Los cinco modelos de Mongoose con validaciones e índices (`api/models/`).
- Utilidades `asyncHandler`, `httpError` y `pick` (`api/utils/`).
- `.env.example` (un único `.env` en la raíz), `.gitignore` y `docker-compose.yml` (`api`, `web`, `ml`).

**Decisiones tomadas en la tanda 1:**
- Índices únicos parciales sobre `externalIds.transfermarkt` y `externalIds.fbref` en `Club` y `Player`, como clave natural del ETL.
- `SeasonStat.season` valida el formato `^\d{4}-\d{2}$`; `Competition.tier` tiene mínimo 1.
- Clave duplicada (11000) responde **409**; los errores responden `{ error: "..." }`.
- Docker Compose sin servicio de Mongo (la base es Atlas).
- `ml/requirements.txt` con versiones fijadas (las últimas de PyPI a 2026-10-27; compatibilidad entre ellas sin verificar hasta construir la imagen).
- `data/` está en `.gitignore`: las muestras congeladas **no se versionan**. Hay que documentar en el README cómo obtenerlas para que el proyecto siga siendo reproducible.

**Pendiente:**
- ETL, resto del frontend (ficha, comparador, visión general, selección por arrastre, CSV) y servicio ML.
- `docker compose` aún no construye `ml`: falta `ml/serve.py` con el modelo.
- **Credenciales de Atlas**: `MONGODB_URI` (base `footboard`) y `MONGODB_URI_TEST` funcionan; las 22 pruebas pasan contra Atlas (15-11-2026).
- ETL: vaciar `footboard` y cargar LaLiga, después las cinco ligas (`npm run etl:wipe -- --force` y `npm run etl -- --leagues=...`).
- Extracción de FBref con `soccerdata` (sección 6) y tabla de equivalencias con Transfermarkt.
- Requisitos de la tutoría (sección 14): JWT (obligatorio), script de usuario simulado por la API y, como extra, simulación de partido en tiempo real.

Pendiente de confirmar con el profesor: que la temática de fútbol está aprobada
por escrito. (La autenticación ya está confirmada: JWT obligatorio, ver 14.1.)

---

## 14. Requisitos añadidos tras la tutoría (29-10-2026)

Tres peticiones del profesor que no estaban en el enunciado original.

### 14.1 Autenticación con JWT — obligatorio

Token firmado con **caducidad determinada**. Flujo estándar:

- `POST /api/auth/register` y `POST /api/auth/login` devuelven el token
- El cliente lo envía en cada petición: `Authorization: Bearer <token>`
- Un middleware lo verifica antes de las rutas protegidas y responde **401**
  si falta, es inválido o ha caducado

Implicaciones:
- Modelo `User` nuevo, con contraseña hasheada con `bcrypt`. **Nunca en claro.**
- Librería `jsonwebtoken`. El secreto va en el `.env`, no en el código.
- El cliente axios del frontend debe adjuntar el token.
- El script de usuario simulado (14.2) debe autenticarse primero.

Decidir qué rutas se protegen: como mínimo las de escritura (POST, PUT, DELETE).

### 14.2 Datos que entran por la API — confirmado el alcance

El profesor pidió que los datos entraran por la API y no directos a Mongo.
**Consultado y aceptado el enfoque mixto.** Son dos scripts distintos:

| Script | Vía | Para qué |
| --- | --- | --- |
| ETL de carga masiva | Mongoose directo, `bulkWrite` | Los ~192.000 registros reales |
| Usuario simulado | axios → endpoints de la API | Demostrar que la API es usable |

Motivo: 191.754 valoraciones una a una por HTTP serían horas, y el beneficio
(ejercitar los endpoints) se consigue igual con un subconjunto.

El script simulado debe: autenticarse con JWT, crear, consultar con filtros,
modificar y borrar. Que use **datos claramente ficticios** y limpie lo que ha
creado al terminar, para no mezclarlos con los reales de Transfermarkt.

### 14.3 Procesamiento en tiempo real — "extra importante"

El enunciado original giraba en torno a sensores que emiten continuamente. Como
el fútbol no da eso de forma natural, el profesor sugirió **simularlo**: un
script que reproduce los eventos de un partido ya jugado respetando su orden
temporal, y los va metiendo por la API como si llegaran en directo.

No es un pilar del proyecto, pero inclina la nota y es lo que más acerca la
propuesta al espíritu del enunciado. **Prioridad: por encima de la fase de
vídeo, por debajo del ETL y del modelo principal.**

Si se aborda, hace falta:
- Modelo `MatchEvent` (minuto, tipo, jugador, equipo, coordenadas)
- Endpoints para recibirlos
- Script reproductor con factor de aceleración (90 min → 90 s en la demo)
- Que el frontend se entere sin recargar: **WebSockets** (Socket.IO) antes que
  *polling*, porque es lo que de verdad parece tiempo real
- Una vista en vivo: campo con los eventos apareciendo y marcador

**Idea candidata, no decidida:** un segundo modelo que prediga el resultado del
partido en vivo a partir del estado (marcador, minuto, tiros, tarjetas,
expulsiones) y actualice la probabilidad en pantalla conforme llegan eventos.
Es un modelo distinto del de valor de mercado, aunque también XGBoost. Se puede
entrenar con eventos históricos reconstruyendo "en el minuto 60 iba 1-0 y acabó
2-1". Si se usa Football-Data, sus cuotas sirven de *baseline* para comparar.

Fuente de datos candidata para esto: eventos de StatsBomb, o el dataset de tiros
ya preparado en Hugging Face (`statsbomb-open-data-shots`), que trae coordenadas,
distancia, ángulo, parte del cuerpo y xG, con los splits hechos.
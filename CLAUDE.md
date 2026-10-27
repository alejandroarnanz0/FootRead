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

| Fuente | Qué aporta | Formato | Granularidad |
| --- | --- | --- | --- |
| Transfermarkt (dataset de dcaribou) | Jugadores, clubes, competiciones, valoraciones históricas, traspasos | CSV | Perfil estático + serie temporal |
| FBref (vía soccerdata) | Estadísticas de rendimiento por temporada | CSV extraído | Jugador × temporada |

Ambas se descargan una vez y se **congelan** en `data/`. No depender de "la última
versión disponible" de nada: el proyecto debe ser reproducible.

Las dos fuentes **no comparten identificadores**. Hace falta una tabla de
equivalencias de nombres de jugador y club, construida con normalización de
cadenas y revisión manual de los no emparejados. Es la tarea con más riesgo de
desbordarse: empezar por una sola liga.

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
foot           String, enum: ['left','right','both']
heightCm       Number, min: 140, max: 220
club           ObjectId → Club
currentValue   Number, min: 0          // euros, desnormalizado para listar rápido
contractUntil  Date
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

Scripts en `api/scripts/etl/`, uno por fuente, ejecutables de forma
independiente y en este orden: competiciones → clubes → jugadores → valoraciones
→ estadísticas.

Reglas:
- **Idempotente**: cargar con `updateOne` + `upsert: true` sobre la clave natural
  (el id externo), nunca con `insertMany` a ciegas. Relanzar el ETL no debe
  duplicar nada.
- Procesar en **lotes** con `bulkWrite`. Son decenas de miles de documentos.
- Normalizar al cargar: valores de mercado siempre en euros enteros, fechas a
  `Date`, posiciones al `enum` de cuatro valores, nombres sin acentos ni dobles
  espacios para el emparejamiento.
- Registrar un informe al terminar: cuántos documentos insertados, actualizados y
  **cuántos no se pudieron emparejar entre fuentes**. Ese último número hay que
  revisarlo a mano.
- Reutilizar los modelos de Mongoose, no escribir consultas crudas.

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
| GET/POST | `/api/competitions/:id/clubs` | Clubes de una competición |
| GET/PUT/DELETE | `/api/clubs/:id` | Ficha de club |
| GET/POST | `/api/clubs/:id/players` | Jugadores de un club |
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
- Rutas, middleware de filtros, ETL, frontend y servicio ML.
- `docker compose` solo puede construir `api`: faltan `web/package.json` y `ml/serve.py` con el modelo.
- Sin probar contra un Atlas real: falta un `MONGODB_URI` válido.

Pendiente de confirmar con el profesor: que la temática de fútbol está aprobada
por escrito, y si hay requisito de autenticación.
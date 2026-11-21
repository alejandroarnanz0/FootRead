# AGENTS.md — Footboard

Hola. Esto es una guía para orientarte a ti y a tu agente (Codex) en el
proyecto, no un reglamento. Casi todo lo que hay aquí son **sugerencias**: el
frontend es tuyo y en la API tienes mucha libertad. Solo hay unos pocos límites
(sección 3) y son por seguridad de los datos o porque tocan la parte de ML.

Para el detalle técnico de todo lo construido, `CLAUDE.md` es la referencia
(modelo de datos §7, endpoints §9, heurística §11.1, xG §11.2, tiempo real §14.3).

---

## ⚠️ Para el agente: antes de escribir frontend

**Esto es lo más importante de la guía.** La primera vez que te pidan trabajo
de frontend (una vista, un dashboard, un componente visual), **antes de escribir
código, díselo al usuario** y propón este proceso:

> "Antes de empezar: no queremos un frontend genérico de los que se generan con
> IA. Primero voy a buscar referencias y recursos para que quede a nivel
> profesional. ¿Te parece?"

Queremos un frontend **pro, bonito y con personalidad**, no el típico HTML
"vibecodeado" (tarjetas grises, degradados morados, emojis como iconos, todo
centrado e igual). Así que:

1. **Investiga a fondo en internet** antes de diseñar: dashboards deportivos y
   de datos de referencia (por ejemplo, de medios y plataformas de análisis de
   fútbol), galerías de diseño (Dribbble, Behance, Awwwards, Mobbin), sistemas
   de diseño y librerías de componentes de calidad, plantillas de dashboard,
   skills o guías de diseño para agentes, librerías de gráficos y de animación.
2. **Propón una dirección visual concreta** al usuario antes de programar:
   2-3 referencias que te inspiran, paleta, tipografía, cómo serán los gráficos y
   el campo, y qué librerías usarías. Que el usuario la apruebe.
3. **Mantén esa dirección en todas las vistas**, para que la web parezca un
   producto y no páginas sueltas.
4. Cuida los detalles que separan lo profesional de lo genérico: jerarquía
   tipográfica, espaciado consistente, buenos estados de carga y vacío,
   transiciones suaves, gráficos legibles (ejes discretos, etiquetas claras,
   colores con significado), modo claro y oscuro, y que funcione en móvil.

---

## 1. El proyecto en un minuto

**Footboard** es una herramienta de scouting con dos partes:

1. **Valor de mercado:** ~11.800 jugadores de las cinco grandes ligas
   (Transfermarkt). Para cada jugador en activo calculamos una **referencia por
   comparables** (`predictedValue`): lo que valen jugadores parecidos (misma
   posición, edad, minutos, producción). Si cuesta menos que su referencia,
   quizá está infravalorado. No es una predicción de ML, es una heurística.
2. **xG en tiempo real:** un modelo XGBoost entrenado con 88.000 tiros de
   StatsBomb, servido por un servicio Python. Un script **reproduce** un partido
   ya jugado enviando sus eventos a la API como si pasara en directo, y la API
   calcula el xG de cada tiro al llegar.

La entrega es un **vídeo el 18-12-2026**. Lo que más pesa en el vídeo es ver un
partido "en directo" en la web.

**Quién hace qué:**
- **Tú:** todo el frontend, Socket.IO (tiempo real hacia la web), el usuario
  simulado y lo que necesites de la API para eso.
- **Alejandro:** el modelo de xG y su servicio (`ml/`), los datos (ETL), el
  despliegue, el vídeo y los commits a `main`.

---

## 2. Tu libertad

- **Frontend, 100 % tuyo:** qué vistas hay, cómo se ven, qué gráficos, qué
  librerías, el orden en que haces las cosas. No hace falta consultar nada. El
  único límite real son los datos disponibles (sección 6).
- **API:** puedes crear endpoints, cambiar respuestas, crear modelos de Mongo
  nuevos, corregir bugs en los existentes o tocar la autenticación si lo
  necesitas. Si cambias algo que ya usa la web o un script, revisa que no se
  rompa (los tests ayudan: `cd api && npm test`).
- **Decisiones de diseño:** tuyas. Si algo de esta guía no te convence, haz lo
  que creas mejor.

Solo avisa a Alejandro si el cambio es **drástico** (por ejemplo, rehacer cómo
se guardan los jugadores) o toca lo de la sección 3.

**Mantén `CLAUDE.md` al día (para el agente).** Es la documentación común del
proyecto: Alejandro trabaja con ella y su agente la lee al empezar. Cada vez que
termines algo relevante, actualízala en el mismo commit:
- **§13 Estado actual:** qué has hecho y qué queda (breve, sin historial).
- La sección que corresponda si cambia algo de fondo: modelos de Mongo (§7),
  endpoints (§9), vistas (§10), tiempo real / Socket.IO (§14.3).
- Si tomas una decisión que afecta a otros (un contrato de Socket.IO, un
  endpoint nuevo, una librería importante), apúntala con una línea de por qué.

No hace falta documentar detalles de diseño visual ni cada componente.

---

## 3. Los pocos límites

1. **No toques `ml/` ni la conexión con el servicio de xG.** Eso es:
   - todo `ml/`,
   - `api/utils/mlClient.js` y `api/routes/predictions.js`,
   - la parte de `api/routes/matches.js` que pide el xG (`xgFor`) y
     `toRawShot` en `api/utils/statsbombEvent.js`.

   Puedes **usarlo** todo lo que quieras (sección 5). Si necesitas que cambie
   algo (otro dato del modelo, otro formato), habla con Alejandro.
2. **No cambies la estructura de carpetas** del proyecto (mover `api/`, `web/`,
   `ml/`, reorganizar `api/routes`, etc.). Dentro de `web/src/` organiza tus
   componentes como quieras.
3. **Base de datos:** `footboard` es la base **real** (los datos cargados a mano
   durante horas). Léela sin problema, pero tus pruebas que **escriben** van a
   `footboard_test` (sección 4.3). No lances los scripts de `api/scripts/etl/`
   ni `api/scripts/value/run.js`: reescriben la base real.
4. **Secretos:** `.env` nunca va a git. Las credenciales de Mongo te las pasa
   Alejandro por privado.

---

## 4. Puesta en marcha

### 4.1 Una vez

Necesitas Node.js 20+, Git y Docker Desktop (abierto; en WSL, activa
*Settings → Resources → WSL integration*).

```bash
git clone https://github.com/alejandroarnanz0/FootRead.git
cd FootRead
cp .env.example .env        # rellénalo: cada campo está explicado dentro
cd api && npm install && cd ..
cd web && npm install && cd ..
ml/run.sh build             # imagen Docker del servicio de xG (unos minutos)
```

Pídele a Alejandro (no están en git):
- las dos cadenas de Mongo para `.env`,
- la carpeta del modelo `ml/OUTPUT_AI/<run>/` (la que diga `MODEL_RUN` en `.env`),
- `data/statsbomb_open_data/` (o descárgala con los comandos de `data/README.md`).

Crea tu usuario en la web (http://localhost:5173 → "Regístrate") y pon ese
email y contraseña en `REPLAY_EMAIL` / `REPLAY_PASSWORD` del `.env`.

### 4.2 Cada día

```bash
cd api && npm run dev       # API      http://localhost:3000/api   (lee footboard)
cd web && npm run dev       # Web      http://localhost:5173
ml/run.sh serve             # Servicio de xG  http://localhost:8000/health
cd api && npm run replay -- --match=3869685 --reset   # un partido "en directo"
```

`ml/run.sh` funciona en Git Bash y WSL. Partidos disponibles: `3869685`
Argentina-Francia (final del Mundial 2022, prórroga y penaltis), `2302764`
Milan-Liverpool (final de Champions 2005), `3825700` Real Madrid 10-2 Rayo.
`--speed=60` (por defecto) = un minuto de partido por segundo; `--speed=20` va
más despacio; `--reset` borra la reproducción anterior de ese partido.

### 4.3 Probar cosas que escriben

```bash
cd api && npm run start:test   # API contra footboard_test, puerto 3001
```

`GET /api/health` devuelve `{"status":"ok","db":"footboard_test"}`. Es buena
idea que cualquier script que escriba compruebe ese `db` antes de empezar. Los
tests (`npm test`) ya usan `footboard_test` solos.

---

## 5. Cómo funciona el tiempo real (y el xG)

Esto es lo que más vas a tocar indirectamente, así que conviene entenderlo bien.

```
replay.js ──POST /api/matches/:id/events──► API (matches.js)
  (evento crudo de StatsBomb)                 │ si es un tiro:
                                              ├──POST /predict──► servicio xG (serve.py, :8000)
                                              │◄── { xg, ... } ───┘
                                              ├── guarda MatchEvent (con xg) en Mongo
                                              └── responde 201 con el evento guardado
web ──GET /api/matches/:id/events | /state──► API   (hoy: la web tendría que preguntar)
```

**Lo que falta, y es tuyo:** que la web no tenga que preguntar. Con Socket.IO,
la API puede **avisar** a la web cada vez que guarda un evento. Algunas pistas,
por si te sirven:
- El servidor HTTP se crea en `api/bin/www`: ahí se puede enganchar Socket.IO.
- El momento natural para avisar es en `POST /api/matches/:id/events`, justo
  después de guardar (respuesta 201; un 200 significa que ya existía). Puedes
  añadir ahí la emisión sin tocar la parte del xG.
- Una sala por partido (p. ej. `match:<matchId>`) evita mandar eventos a quien
  mira otro partido.
- El socket también debería pedir el token JWT (la API entera lo pide).
- Si la conexión se corta, la web puede recuperar lo perdido con
  `GET /api/matches/:id/events?after=<último sequence>`.
- Antes de que empiece un partido no hay eventos: un estado vacío que explique
  cómo arrancarlo ayuda mucho en el vídeo.

**El servicio de xG** (`ml/serve.py`, solo para usar, no modificar):
- `GET /health` → `{"status":"ok","run":"2026-11-20_1949","features":33}`.
- `POST /predict` con un tiro **en bruto** → su xG. La web no lo llama
  directamente: usa el proxy de la API, `POST /api/predictions/xg` (con token).
- `POST /predict/batch` con `{ "shots": [...] }` (máx. 500).
- Si está apagado, la API sigue funcionando: los tiros se guardan con
  `xg: null` y `POST /api/predictions/xg` responde 503.

Ejemplo real, `POST /api/predictions/xg`:
```json
{ "x": 108, "y": 40, "body_part": "Right Foot", "technique": "Normal",
  "shot_type": "Open Play", "play_pattern": "Regular Play", "under_pressure": false }
```
→ 200 (`shapValues` recortado a 4 de 33)
```json
{ "xg": 0.2289, "xgRaw": 0.2228,
  "shapValues": { "distance": 0.298, "angle": 0.3505, "lateral_offset": -0.2488, "in_box": 0.0297 },
  "baseValue": -2.1959, "penalty": false, "run": "2026-11-20_1949" }
```
- `xg` es la probabilidad de gol (0-1). `xgRaw`, antes de calibrar.
- `shapValues`: cuánto empuja cada característica del tiro el xG hacia arriba o
  hacia abajo (en log-odds). Sirve para **explicar** un tiro.
- Penaltis: xG fijo de 0,7333 (`penalty: true`).

**Coordenadas de StatsBomb:** campo de 120 × 80 yardas. Cada evento viene
orientado hacia la portería que ataca **su** equipo, así que los dos equipos
"atacan hacia x = 120". Para pintarlos en un mismo campo, refleja uno:
`x' = 120 − x`, `y' = 80 − y`.

**Marcador:** `GET /state` ya lo calcula (goles en propia puerta incluidos). La
tanda de penaltis (`period` 5) va aparte en `shootout` y no cuenta en el
marcador ni en el xG acumulado.

---

## 6. Datos disponibles

| Colección | Qué hay | Endpoint |
| --- | --- | --- |
| Competition, Club | 5 ligas, ~176 clubes | `/api/competitions`, `/api/clubs` |
| Player | ~11.800 jugadores, `currentValue`, `predictedValue` (referencia) | `/api/players` (filtros: `position`, `minAge`, `maxAge`, `competition`, `maxValue`, `sort`, `page`, `limit`) |
| Valuation | Histórico de valor de cada jugador | `/api/players/:id/valuations` |
| SeasonStat | Minutos, goles, asistencias por temporada (liga) | `/api/players/:id/stats` |
| — | Comparables de un jugador | `/api/players/:id/comparables` |
| — | Infravalorados y resumen | `/api/aggregates/undervalued`, `/api/aggregates/summary` |
| Match | 445 partidos StatsBomb (3 reproducibles) | `/api/matches` |
| MatchEvent | Eventos de los partidos reproducidos | `/api/matches/:id/events`, `/state` |
| Shot | 88.023 tiros históricos de StatsBomb (posición, distancia, ángulo, xG de StatsBomb, gol) | **ninguno todavía**: si te sirve, créalo |
| User | Usuarios de la web | `/api/auth/register`, `/login`, `/me` |

Todas las rutas salvo `/api/health` y `/api/auth/*` piden
`Authorization: Bearer <token>`. Las listas responden
`{ data, page, limit, total, totalPages }`. Lista completa de endpoints en
`CLAUDE.md` §9; para ver una respuesta, pruébala tú:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"TU_EMAIL","password":"TU_CLAVE"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/matches/3869685/state
```

Dos respuestas reales de las que más vas a usar:

`GET /api/matches/3869685/state` (final del Mundial, terminado):
```json
{ "matchId": "3869685", "homeTeam": "Argentina", "awayTeam": "France",
  "score": { "home": 3, "away": 3 },
  "xgAccumulated": { "home": 3.067, "away": 1.963 },
  "xgStatsbombAccumulated": { "home": 2.758, "away": 2.273 },
  "shots": { "home": 20, "away": 10 }, "shotsWithoutXg": 0,
  "shootout": { "home": 4, "away": 2 },
  "minute": 125, "second": 57, "period": 5 }
```

Un evento de tiro (lo que devuelve `POST /events` y lo que trae `GET /events`):
```json
{ "matchId": "3869685", "sequence": 1178, "period": 1, "minute": 35, "second": 22,
  "type": "Shot", "team": "Argentina", "playerName": "Ángel Fabián Di María Hernández",
  "x": 111.8, "y": 32.1, "shotOutcome": "Goal", "shotType": "Open Play", "isGoal": true,
  "xg": 0.299, "xgStatsbomb": 0.30340916, "_id": "6b00b9199a4da84e3c329bd7",
  "receivedAt": "2026-11-20T21:18:17.223Z" }
```
Otros tipos que llegan: `Foul Committed`, `Bad Behaviour` (con `card`),
`Substitution` (con `replacement`, el que entra), `Pass` (solo el pase previo a
un tiro), `Own Goal For` / `Own Goal Against`.

---

## 7. Ideas de trabajo

Sin orden: empieza por lo que te apetezca. Hay tres cosas que **la entrega
necesita sí o sí** (las marca el enunciado y la tutoría); el resto son ideas
para que el vídeo luzca, cógelas, cámbialas o haz otras.

**Necesarias para la entrega**
- **Tiempo real en la web** con Socket.IO: un partido reproduciéndose y la web
  actualizándose sola. Es lo central del vídeo.
- **Usuario simulado:** un script que use la API como lo haría una persona: se
  registra o entra, crea datos (claramente de prueba), consulta con filtros,
  modifica y borra lo que creó. Contra `npm run start:test`.
- **Manipulación directa:** al menos una interacción donde el usuario actúe
  sobre la visualización (arrastrar, seleccionar, hacer clic en un punto…).

**Ideas**
- **Vista de partido en vivo:** campo con los tiros (tamaño según xG), marcador,
  xG acumulado de cada equipo, línea de tiempo con goles, tarjetas y cambios,
  comparación con el xG de StatsBomb.
- **"Carrera de xG":** gráfico del xG acumulado minuto a minuto de los dos equipos.
- **Simulador de tiro:** haces clic en un punto del campo y ves el xG que daría
  el modelo (`POST /api/predictions/xg`). Muy visual y es manipulación directa.
- **Explicar un tiro:** al pinchar un tiro, mostrar por qué tiene ese xG con
  sus `shapValues`.
- **Mapa de tiros históricos:** la colección `Shot` (88.000 tiros) no tiene
  endpoint; con uno puedes pintar mapas de calor por competición, parte del
  cuerpo, etc.
- **Ficha de jugador:** valor, referencia por comparables, evolución del valor,
  estadísticas por temporada y sus comparables (con clic para saltar a ellos).
- **Visión general / dashboard** del mercado: ligas, posiciones, infravalorados.
- **Comparador** de jugadores.
- **Explorador:** seleccionar una zona del gráfico para filtrar, exportar a CSV.
- **Lista de seguimiento:** jugadores favoritos por usuario (un modelo de Mongo nuevo).
- **El modelo de xG explicado:** Alejandro ha generado gráficas que pueden ser
  interesantes para reutilizar en la web (mapa de calor del xG en el campo,
  importancia de cada característica, calibración, comparación con StatsBomb).
  Están en `ml/OUTPUT_AI/<run>/plots/*.png`, con las métricas en
  `metrics.json`. Tenlo en cuenta por si encajan; úsalas o no, como veas.

---

## 8. Consejos

- La web ya tiene una base: cliente axios único con el token
  (`web/src/api/client.js`, que ante un 401 manda a `/login`), `useApi` para
  carga y error, `useFilters` para filtros compartidos, tema claro/oscuro con
  variables en `index.css` y Recharts instalado. Aprovéchalo o cámbialo.
- El token dura 1 hora: si un script largo recibe 401, que vuelva a hacer login
  (`replay.js` ya lo hace, puedes copiar la idea).
- Para tests de API hay ayudantes en `api/test/helpers/` (arrancar la API
  contra `footboard_test`, simular el servicio de xG). `test/matches.test.js` es
  un buen ejemplo.
- `predictedValue` es una referencia por comparables, no una predicción: mejor
  no llamarla "predicción" en la interfaz.
- Código y commits en inglés; la interfaz, en español.
- Trabaja en ramas propias y abre PR a `main`; Alejandro se encarga de fusionar.

---

## 9. Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| La web no conecta con la API | API apagada u otro puerto: `cd api && npm run dev`, `curl http://localhost:3000/api/health` |
| *blocked by CORS policy* | Abre la web en `http://localhost:5173` (el origen de `CORS_ORIGIN`), o cambia `CORS_ORIGIN` y reinicia la API. Si es Socket.IO, su servidor necesita su propio `cors` |
| 401 `Token expired` / te manda a `/login` | El token dura 1 h: vuelve a entrar |
| 503 `xG service unavailable`, tiros con `xg: null` | El servicio de xG no está arrancado: `ml/run.sh serve` con Docker Desktop abierto. En Render puede estar "dormido" y tardar en despertar |
| `Port 3000 is already in use` | Hay otra API abierta. Windows: `netstat -ano \| findstr :3000` y `taskkill /PID <pid> /F`. Linux/WSL: `lsof -i :3000` y `kill <pid>` |
| `Port 8000 is already allocated` | El servicio de xG ya está corriendo: usa ese |
| `/usr/bin/docker: Input/output error` en WSL | Docker Desktop cerrado o sin WSL integration |
| `No trained run in .../OUTPUT_AI` | Falta la carpeta del modelo (pídesela a Alejandro) |
| `MONGODB_URI is not set` | El `.env` va en la raíz (`FootRead/.env`), no en `api/` |
| Tests: `must point to a database whose name ends in _test` | `MONGODB_URI_TEST` tiene que apuntar a `footboard_test` |
| Cambias `VITE_API_URL` y no hace caso | Reinicia `npm run dev` de la web |
| Eventos sin `card` / `replacement` | Son de una reproducción antigua: vuelve a reproducir con `--reset` |

---

## 10. Dudas típicas

**¿Tengo que consultarle todo a Alejandro?** No. Solo lo de la sección 3 o un
cambio muy drástico. Lo demás, decide tú.

**¿Puedo añadir librerías?** Sí, en la web las que quieras. En la API, con
cabeza (cada dependencia es algo más que mantener).

**¿Puedo añadir un endpoint o un modelo de Mongo?** Sí. Un test que lo cubra
contra `footboard_test` es buena idea.

**¿El reproductor lo lanza la web?** No hace falta: es un script de terminal
que hace de "emisor en directo". Si quieres un botón en la web que lo lance,
adelante, pero el vídeo funciona igual con la terminal al lado.

**¿Puedo borrar datos de `footboard_test`?** Sí, es desechable.

**Codex propone reorganizar carpetas o tocar `ml/`.** Eso no (sección 3).

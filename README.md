# Footboard (FootRead)

Aplicación de scouting y analítica de fútbol con datos de Transfermarkt y StatsBomb.

- **Visión general** (`/overview`): KPIs, distribución por posición y edad, y rankings de valor de mercado y oportunidades de scouting. Cada ranking carga más jugadores al desplazarse. La referencia por comparables es una heurística de mercado, no una predicción de ML.
- **Partidos** (`/matches`): catálogo de replays con búsqueda por equipo, filtros por competición y eventos, y orden por fecha.
- **Centro de partido** (`/live/:matchId`): marcador, cronología, mapa de tiros y evolución del xG cuando hay eventos registrados. Se actualiza mediante consultas REST periódicas. Socket.IO queda pendiente.

Consulta [CLAUDE.md](CLAUDE.md) para la arquitectura y los endpoints, y [AGENTS.md](AGENTS.md) para la puesta en marcha local y las pruebas.

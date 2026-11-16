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

## FBref

Pendiente. Se extraerá con `soccerdata` y se congelará aquí (ver CLAUDE.md §6).

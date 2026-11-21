// Loads the StatsBomb shots dataset into Shot, for the dashboard.
// Reads data/statsbomb_shots/shots.csv, written by the ML pipeline
// (ml/BaselineModel) with its split (grouped by match) and with distance and
// angle already computed by features.py. Usage: npm run etl:shots
const path = require('path');
const Shot = require('../../models/Shot');
const { readCsv, Loader, runStandalone } = require('./lib/common');
const n = require('./lib/normalize');

const DEFAULT_DIR = path.join(__dirname, '..', '..', '..', 'data', 'statsbomb_shots');

async function loadShots({ shotsDir = DEFAULT_DIR } = {}) {
  const dataDir = shotsDir;
  const loader = new Loader('shots', Shot);
  // No shot id in the dataset: the key is match + player + location, plus a
  // counter for the rare identical shots (same player, same spot, same match).
  const seen = new Map();
  for await (const row of readCsv(dataDir, 'shots.csv')) {
    loader.read++;
    const x = Number(row.x);
    const y = Number(row.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      loader.discard('missing location');
      continue;
    }
    const base = `${row.match_id}:${row.player}:${x}:${y}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    const shotKey = `${base}:${count}`;
    await loader.upsert(
      { shotKey },
      {
        shotKey,
        matchId: n.blank(row.match_id),
        competition: n.cleanName(row.competition_name),
        season: n.blank(row.season_name),
        matchDate: n.toDate(row.match_date),
        team: n.cleanName(row.team),
        playerName: n.cleanName(row.player),
        x,
        y: Math.min(y, 80),
        distanceToGoal: Number(row.distance),
        angleToGoal: Number(row.angle_deg),
        underPressure: row.under_pressure === 'True',
        outcome: n.blank(row.shot_outcome_name),
        bodyPart: n.blank(row.body_part),
        technique: n.blank(row.technique),
        shotType: n.blank(row.shot_type),
        playPattern: n.blank(row.play_pattern),
        xgStatsbomb: row.xg_statsbomb === '' ? null : Number(row.xg_statsbomb),
        isGoal: row.is_goal === '1',
        split: n.blank(row.split),
      }
    );
  }
  await loader.flush();
  loader.report();
  return loader;
}

module.exports = loadShots;
if (require.main === module) runStandalone(() => loadShots());

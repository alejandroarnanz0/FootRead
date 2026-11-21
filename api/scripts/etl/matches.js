// Loads StatsBomb Open Data matches into Match.
// Reads every data/statsbomb_open_data/matches/<competition>/<season>.json and
// flags as available the ones whose events file (events/<match_id>.json) is
// also there. Usage: npm run etl:matches   (add --test-db for footboard_test)
const fs = require('fs');
const path = require('path');
const Match = require('../../models/Match');
const { Loader, runStandalone } = require('./lib/common');
const n = require('./lib/normalize');

const DEFAULT_DIR = path.join(__dirname, '..', '..', '..', 'data', 'statsbomb_open_data');

function matchFiles(dir) {
  const root = path.join(dir, 'matches');
  if (!fs.existsSync(root)) throw new Error(`No matches folder in ${dir}`);
  return fs
    .readdirSync(root)
    .flatMap((comp) => fs.readdirSync(path.join(root, comp)).map((f) => path.join(root, comp, f)))
    .filter((f) => f.endsWith('.json'));
}

async function loadMatches({ openDataDir = DEFAULT_DIR } = {}) {
  const loader = new Loader('matches', Match);
  for (const file of matchFiles(openDataDir)) {
    for (const m of JSON.parse(fs.readFileSync(file, 'utf8'))) {
      loader.read++;
      const matchId = String(m.match_id);
      await loader.upsert(
        { matchId },
        {
          matchId,
          competition: n.cleanName(m.competition?.competition_name),
          season: n.blank(m.season?.season_name),
          matchDate: n.toDate(m.match_date),
          homeTeam: n.cleanName(m.home_team?.home_team_name),
          awayTeam: n.cleanName(m.away_team?.away_team_name),
          available: fs.existsSync(path.join(openDataDir, 'events', `${matchId}.json`)),
        }
      );
    }
  }
  await loader.flush();
  loader.report();
  return loader;
}

module.exports = loadMatches;
if (require.main === module) runStandalone(() => loadMatches());

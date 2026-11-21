// Loads the selected domestic leagues from competitions.csv.
const Competition = require('../../models/Competition');
const { readCsv, Loader, runStandalone } = require('./lib/common');
const { COMPETITION_NAMES, blank } = require('./lib/normalize');

async function loadCompetitions({ leagues, dataDir }) {
  const loader = new Loader('competitions', Competition);
  for await (const row of readCsv(dataDir, 'competitions.csv')) {
    loader.read++;
    const code = blank(row.competition_id);
    if (!leagues.includes(code)) {
      loader.discard('not selected');
      continue;
    }
    await loader.upsert(
      { code },
      { code, name: COMPETITION_NAMES[code], country: blank(row.country_name), tier: 1 }
    );
  }
  await loader.flush();
  loader.report();
}

module.exports = loadCompetitions;
if (require.main === module) runStandalone(loadCompetitions);

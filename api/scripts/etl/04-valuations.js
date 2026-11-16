// Loads the market value history of the players loaded by 03-players.
const Player = require('../../models/Player');
const Valuation = require('../../models/Valuation');
const { readCsv, Loader, idMap, runStandalone } = require('./lib/common');
const n = require('./lib/normalize');

async function loadValuations({ dataDir }) {
  const players = await idMap(Player);
  if (!players.size) throw new Error('No players loaded: run 03-players first');

  const loader = new Loader('valuations', Valuation);
  // Two rows for the same player and day would collide on the unique index
  // inside one unordered batch: keep the first one.
  const seen = new Set();
  for await (const row of readCsv(dataDir, 'player_valuations.csv')) {
    loader.read++;
    const player = players.get(n.blank(row.player_id));
    if (!player) {
      loader.discard('player not loaded');
      continue;
    }
    const date = n.toDate(row.date);
    const value = n.toInt(row.market_value_in_eur);
    if (!date || value === null) {
      loader.discard('missing date or value');
      continue;
    }
    const key = `${player}|${date.getTime()}`;
    if (seen.has(key)) {
      loader.discard('duplicate player and date');
      continue;
    }
    seen.add(key);
    await loader.upsert({ player, date }, { player, date, value });
  }
  await loader.flush();
  loader.report();
}

module.exports = loadValuations;
if (require.main === module) runStandalone(loadValuations);

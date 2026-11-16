// Loads the players whose current club was loaded by 02-clubs. Retired players
// are kept (lastSeason tells them apart): they are useful to train the model.
// predictedValue is never touched here; the offline scoring job writes it.
const Club = require('../../models/Club');
const Player = require('../../models/Player');
const { readCsv, Loader, idMap, runStandalone } = require('./lib/common');
const n = require('./lib/normalize');

async function loadPlayers({ dataDir }) {
  const clubs = await idMap(Club);
  if (!clubs.size) throw new Error('No clubs loaded: run 02-clubs first');

  const loader = new Loader('players', Player);
  for await (const row of readCsv(dataDir, 'players.csv')) {
    loader.read++;
    const club = clubs.get(n.blank(row.current_club_id));
    if (!club) {
      loader.discard('club not loaded');
      continue;
    }
    const position = n.position(row.position);
    if (!position) {
      loader.discard('position Missing');
      continue;
    }
    if (n.blank(row.height_in_cm) !== null && n.heightCm(row.height_in_cm) === null) {
      loader.note('height out of range, field dropped');
    }
    const tmId = n.blank(row.player_id);
    await loader.upsert(
      { 'externalIds.transfermarkt': tmId },
      {
        name: n.cleanName(row.name),
        birthDate: n.toDate(row.date_of_birth),
        position,
        subPosition: n.blank(row.sub_position),
        foot: n.foot(row.foot),
        heightCm: n.heightCm(row.height_in_cm),
        club,
        currentValue: n.toInt(row.market_value_in_eur),
        contractUntil: n.toDate(row.contract_expiration_date),
        lastSeason: n.toInt(row.last_season),
        'externalIds.transfermarkt': tmId,
      }
    );
  }
  await loader.flush();
  loader.report();
}

module.exports = loadPlayers;
if (require.main === module) runStandalone(loadPlayers);

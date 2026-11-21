// Loads the clubs whose domestic league was loaded by 01-competitions.
const Competition = require('../../models/Competition');
const Club = require('../../models/Club');
const { readCsv, Loader, runStandalone } = require('./lib/common');
const { blank, cleanName } = require('./lib/normalize');

async function loadClubs({ leagues, dataDir }) {
  const competitions = await Competition.find({ code: { $in: leagues } }).lean();
  const byCode = new Map(competitions.map((c) => [c.code, c]));
  if (!byCode.size) throw new Error('No competitions loaded: run 01-competitions first');

  const loader = new Loader('clubs', Club);
  for await (const row of readCsv(dataDir, 'clubs.csv')) {
    loader.read++;
    const competition = byCode.get(blank(row.domestic_competition_id));
    if (!competition) {
      loader.discard('competition not loaded');
      continue;
    }
    const tmId = blank(row.club_id);
    await loader.upsert(
      { 'externalIds.transfermarkt': tmId },
      {
        name: cleanName(row.name),
        competition: competition._id,
        country: competition.country,
        'externalIds.transfermarkt': tmId,
      }
    );
  }
  await loader.flush();
  loader.report();
}

module.exports = loadClubs;
if (require.main === module) runStandalone(loadClubs);

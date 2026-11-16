// Empties the five collections before a fresh ETL load (e.g. to drop the seed data).
// Usage: npm run etl:wipe -- --force
const mongoose = require('mongoose');
const { connect, readOptions } = require('./lib/common');
const Competition = require('../../models/Competition');
const Club = require('../../models/Club');
const Player = require('../../models/Player');
const Valuation = require('../../models/Valuation');
const SeasonStat = require('../../models/SeasonStat');

const MODELS = [Competition, Club, Player, Valuation, SeasonStat];

async function main() {
  const { force } = readOptions();
  await connect();
  const counts = await Promise.all(MODELS.map((m) => m.estimatedDocumentCount()));
  MODELS.forEach((m, i) => console.log(`  ${m.collection.name}: ${counts[i]}`));
  if (!force) {
    console.log('Nothing deleted. Re-run with "npm run etl:wipe -- --force" to empty these collections.');
    return;
  }
  await Promise.all(MODELS.map((m) => m.deleteMany({})));
  console.log(`Emptied the five collections of "${mongoose.connection.name}".`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

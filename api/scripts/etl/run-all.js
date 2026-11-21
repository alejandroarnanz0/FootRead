// Runs the whole Transfermarkt ETL in order.
// Usage: npm run etl -- --leagues=ES1   (default ES1; all five: ES1,GB1,IT1,L1,FR1)
const { connect, readOptions } = require('./lib/common');
const mongoose = require('mongoose');

const STEPS = [
  require('./01-competitions'),
  require('./02-clubs'),
  require('./03-players'),
  require('./04-valuations'),
  require('./05-stats'),
];

async function main() {
  const options = readOptions();
  console.log(`Leagues: ${options.leagues.join(', ')} · data: ${options.dataDir}`);
  await connect();
  const start = Date.now();
  for (const step of STEPS) await step(options);
  console.log(`Done in ${((Date.now() - start) / 1000).toFixed(1)} s`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

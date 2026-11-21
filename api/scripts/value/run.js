// Writes Player.predictedValue with the comparables heuristic (CLAUDE.md 11.1).
// Usage: npm run value            (writes)
//        npm run value -- --dry-run (only prints the report)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const Player = require('../../models/Player');
const { predictValues } = require('./comparables');
const { loadPopulation, SEASON } = require('./population');


function report(population, result) {
  const scored = population.filter((p) => result.get(p.id).predicted !== null);
  const errors = scored.map((p) => Math.abs(result.get(p.id).predicted - p.value));
  const mae = errors.reduce((a, b) => a + b, 0) / errors.length;
  const levels = [0, 1, 2, 3].map((l) => scored.filter((p) => result.get(p.id).level === l).length);

  console.log(`Population: ${population.length} active players with value and ${SEASON} league minutes`);
  console.log(`Scored: ${scored.length} · without a big enough group: ${population.length - scored.length}`);
  console.log(`Group level used (0 strictest → 3 loosest): ${levels.join(' / ')}`);
  console.log(`MAE: ${(mae / 1e6).toFixed(2)} M€`);

  const top = scored
    .map((p) => ({ ...p, residual: result.get(p.id).predicted - p.value }))
    .sort((a, b) => b.residual - a.residual)
    .slice(0, 10);
  console.log('Top 10 undervalued (predicted − value):');
  for (const p of top) {
    console.log(
      `  ${p.name} (${p.subPosition}, ${p.age}, ${p.league}, ${p.minutes} min, ${p.goals}G ${p.assists}A): ` +
        `${(p.value / 1e6).toFixed(1)} → ${(result.get(p.id).predicted / 1e6).toFixed(1)} M€`
    );
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to database "${mongoose.connection.name}"${dryRun ? ' (dry run)' : ''}`);

  const population = await loadPopulation();
  const { result } = predictValues(population);
  report(population, result);
  if (dryRun) return;

  // Clear old predictions first: players outside the population get none.
  await Player.updateMany({ predictedValue: { $exists: true } }, { $unset: { predictedValue: '' } });
  const ops = population
    .filter((p) => result.get(p.id).predicted !== null)
    .map((p) => ({
      updateOne: {
        filter: { _id: p.id },
        update: { $set: { predictedValue: result.get(p.id).predicted } },
      },
    }));
  for (let i = 0; i < ops.length; i += 1000) {
    await Player.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
  }
  console.log(`Wrote predictedValue for ${ops.length} players.`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

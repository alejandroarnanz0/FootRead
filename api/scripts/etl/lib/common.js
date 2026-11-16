// Shared plumbing for the ETL scripts: flags, connection, CSV streaming,
// batched upserts and the final report.
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '..', '.env') });

const mongoose = require('mongoose');
const { parse } = require('csv-parse');

const BATCH_SIZE = 1000;
const ALL_LEAGUES = ['ES1', 'GB1', 'IT1', 'L1', 'FR1'];

// --leagues=ES1,GB1 (default ES1) and --data-dir=<path>.
function readOptions(argv = process.argv.slice(2)) {
  const get = (name) => {
    const arg = argv.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.slice(name.length + 3) : null;
  };
  const leagues = (get('leagues') || 'ES1')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const unknown = leagues.filter((l) => !ALL_LEAGUES.includes(l));
  if (unknown.length) {
    throw new Error(`Unknown league(s): ${unknown.join(', ')}. Allowed: ${ALL_LEAGUES.join(', ')}`);
  }
  const dataDir = path.resolve(
    get('data-dir') || path.join(__dirname, '..', '..', '..', '..', 'data', 'data_from_transfermarkt')
  );
  return { leagues, dataDir, force: argv.includes('--force') };
}

async function connect() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to database "${mongoose.connection.name}"`);
}

// Streams a CSV row by row (appearances.csv has ~1.9M rows).
function readCsv(dataDir, file) {
  const fullPath = path.join(dataDir, file);
  if (!fs.existsSync(fullPath)) throw new Error(`CSV not found: ${fullPath}`);
  return fs.createReadStream(fullPath).pipe(parse({ columns: true, skip_empty_lines: true }));
}

// Collects upserts, validates each document with its Mongoose model (bulkWrite
// skips validators) and flushes them in batches.
class Loader {
  constructor(name, Model) {
    this.name = name;
    this.Model = Model;
    this.ops = [];
    this.read = 0;
    this.inserted = 0;
    this.updated = 0;
    this.unchanged = 0;
    this.discarded = {}; // rows not loaded, by reason
    this.notes = {}; // rows loaded with a field dropped, by reason
  }

  discard(reason) {
    this.discarded[reason] = (this.discarded[reason] || 0) + 1;
  }

  note(reason) {
    this.notes[reason] = (this.notes[reason] || 0) + 1;
  }

  async upsert(filter, doc) {
    const error = new this.Model(doc).validateSync();
    if (error) {
      this.discard('validation');
      if (this.discarded.validation <= 3) {
        console.warn(`  [${this.name}] invalid ${JSON.stringify(filter)}: ${error.message}`);
      }
      return;
    }
    this.ops.push({ updateOne: { filter, update: { $set: doc }, upsert: true } });
    if (this.ops.length >= BATCH_SIZE) await this.flush();
  }

  async flush() {
    if (!this.ops.length) return;
    const ops = this.ops;
    this.ops = [];
    const res = await this.Model.bulkWrite(ops, { ordered: false });
    this.inserted += res.upsertedCount;
    this.updated += res.modifiedCount;
    this.unchanged += res.matchedCount - res.modifiedCount;
  }

  report() {
    const list = (counts) =>
      Object.entries(counts)
        .map(([reason, n]) => `${reason} ${n}`)
        .join(' · ') || 'none';
    console.log(
      `${this.name}: ${this.read} read · ${this.inserted} inserted · ${this.updated} updated · ` +
        `${this.unchanged} unchanged`
    );
    console.log(`  discarded: ${list(this.discarded)}`);
    if (Object.keys(this.notes).length) console.log(`  notes: ${list(this.notes)}`);
  }
}

// externalIds.transfermarkt -> _id for every document of a model.
async function idMap(Model, filter = {}) {
  const docs = await Model.find(
    { ...filter, 'externalIds.transfermarkt': { $type: 'string' } },
    { 'externalIds.transfermarkt': 1 }
  ).lean();
  return new Map(docs.map((d) => [d.externalIds.transfermarkt, d._id]));
}

// Runs a script's main when executed directly (node 01-competitions.js).
function runStandalone(main) {
  connect()
    .then(() => main(readOptions()))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = { ALL_LEAGUES, readOptions, connect, readCsv, Loader, idMap, runStandalone };

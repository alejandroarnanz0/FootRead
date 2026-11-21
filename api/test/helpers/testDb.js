// Shared setup for integration tests: point everything at the disposable
// database (name must end in _test) before any app or model is loaded.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const testUri = process.env.MONGODB_URI_TEST;
const dbName = testUri && new URL(testUri).pathname.slice(1);
if (!dbName || !dbName.endsWith('_test')) {
  throw new Error('MONGODB_URI_TEST must point to a database whose name ends in _test');
}
process.env.MONGODB_URI = testUri;
process.env.NODE_ENV = 'test';

const mongoose = require('mongoose');

async function connectTestDb() {
  if (mongoose.connection.readyState === 0) await mongoose.connect(testUri);
  await mongoose.connection.asPromise();
  if (!mongoose.connection.name.endsWith('_test')) throw new Error('Not a _test database');
}

async function wipe(...models) {
  if (!mongoose.connection.name.endsWith('_test')) throw new Error('Refusing to wipe a non _test database');
  await Promise.all(models.map((m) => m.deleteMany({})));
  await Promise.all(models.map((m) => m.createIndexes()));
}

module.exports = { connectTestDb, wipe, mongoose };

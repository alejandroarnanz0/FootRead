// Shared setup for integration tests: point everything at a disposable
// database (name must end in _test) before any app or model is loaded.
//
// Two disposable databases, so the automated tests never empty the one you
// test by hand:
//   automated tests (npm test)        -> <name>_ci_test, e.g. footboard_ci_test
//   npm run start:test / --test-db    -> MONGODB_URI_TEST as is (footboard_test)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const manualUri = process.env.MONGODB_URI_TEST;
const manualName = manualUri && new URL(manualUri).pathname.slice(1);
if (!manualName || !manualName.endsWith('_test')) {
  throw new Error('MONGODB_URI_TEST must point to a database whose name ends in _test');
}

function ciUri(uri) {
  const url = new URL(uri);
  url.pathname = `/${url.pathname.slice(1).replace(/_test$/, '_ci_test')}`;
  return url.toString();
}

const manual = process.env.FOOTBOARD_TEST_DB === 'manual';
const testUri = manual ? manualUri : ciUri(manualUri);
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

module.exports = { connectTestDb, wipe, mongoose, testUri };

// Starts the API against the DISPOSABLE database (footboard_test) on port 3001
// (TEST_API_PORT to change it). Use it for anything that writes through the API:
// the simulated user, manual tests, experiments. The real API (npm start) reads
// and writes footboard.
//
//   npm run start:test        ->  http://localhost:3001/api
require('../test/helpers/testDb'); // points MONGODB_URI at MONGODB_URI_TEST (refuses if not *_test)
process.env.NODE_ENV = 'development'; // keep the request log on
process.env.PORT = process.env.TEST_API_PORT || '3001';
console.log('Test API: database footboard_test (writes are safe here)');
require('../bin/www');

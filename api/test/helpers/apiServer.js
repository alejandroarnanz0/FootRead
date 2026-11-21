// Starts the real Express app on a random port against footboard_test and
// registers a user, so tests can call the API with a valid JWT.
const http = require('http');
const { connectTestDb, mongoose } = require('./testDb'); // must load before the app

async function startApi() {
  const app = require('../../app');
  await connectTestDb();
  const server = http.createServer(app).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let token = null;

  const api = async (method, url, body, { auth = true } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (auth && token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(base + url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };

  const User = require('../../models/User');
  await User.deleteMany({ email: 'helper@example.com' });
  const reg = await api('POST', '/api/auth/register', { email: 'helper@example.com', password: 'helper-pass' });
  token = reg.body.token;

  return {
    base,
    api,
    get token() {
      return token;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await User.deleteMany({ email: 'helper@example.com' });
      await mongoose.disconnect();
    },
  };
}

module.exports = { startApi };

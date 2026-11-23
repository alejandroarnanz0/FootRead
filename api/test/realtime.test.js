const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { io } = require('socket.io-client');
const { startApi } = require('./helpers/apiServer');
const { wipe } = require('./helpers/testDb');
const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');

const first = '7101';
const second = '7102';
const eventPath = (id) => `/api/matches/${id}/events`;
const card = (index) => ({
  index, period: 1, minute: index, type: { name: 'Bad Behaviour' },
  team: { name: 'Home FC' }, bad_behaviour: { card: { name: 'Yellow Card' } },
});

function next(socket, event) {
  return new Promise((resolve, reject) => {
    const receive = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      socket.off(event, receive);
      reject(new Error(`No ${event} received`));
    }, 5000);
    socket.once(event, receive);
  });
}

const join = (socket, matchId) => socket.timeout(3000).emitWithAck('match:join', { matchId });
const leave = (socket, matchId) => socket.timeout(3000).emitWithAck('match:leave', { matchId });
const sync = (socket) => leave(socket, '99998');

describe('match realtime', () => {
  let srv;
  let closed = false;

  before(async () => {
    srv = await startApi({ realtime: true });
    await wipe(Match, MatchEvent);
    await Match.create([first, second].map((matchId) => ({
      matchId, homeTeam: 'Home FC', awayTeam: 'Away FC', available: true,
    })));
  });

  after(async () => {
    if (!closed) {
      await wipe(Match, MatchEvent);
      await srv.close();
    }
  });

  function makeClient(t, token, options = {}) {
    const socket = io(srv.base, {
      autoConnect: false, forceNew: true, auth: { token }, timeout: 1500, reconnection: false,
      ...options,
    });
    t.after(() => socket.disconnect());
    return socket;
  }

  async function connect(t, options) {
    const socket = makeClient(t, srv.token, options);
    const ready = next(socket, 'connect');
    socket.connect();
    await ready;
    return socket;
  }

  it('rejects missing, invalid and expired tokens', async (t) => {
    const expired = jwt.sign({ sub: 'test-user' }, process.env.JWT_SECRET, { expiresIn: -1 });
    for (const [token, code] of [[undefined, 'TOKEN_REQUIRED'], ['invalid', 'INVALID_TOKEN'], [expired, 'TOKEN_EXPIRED']]) {
      const socket = makeClient(t, token);
      const rejected = next(socket, 'connect_error');
      socket.connect();
      assert.equal((await rejected).data.code, code);
      assert.equal(socket.connected, false);
    }
  });

  it('validates match IDs and joins, switches and leaves existing rooms', async (t) => {
    const socket = await connect(t);
    assert.deepEqual(await join(socket, 'no such match'), { ok: false, code: 'INVALID_MATCH_ID' });
    assert.deepEqual(await join(socket, 7101), { ok: false, code: 'INVALID_MATCH_ID' });
    assert.deepEqual(await join(socket, '99999'), { ok: false, code: 'MATCH_NOT_FOUND' });
    assert.deepEqual(await join(socket, first), { ok: true, matchId: first });
    const serverSocket = srv.io.sockets.sockets.get(socket.id);
    assert.ok(serverSocket.rooms.has(`match:${first}`));
    await join(socket, second);
    assert.ok(!serverSocket.rooms.has(`match:${first}`));
    assert.ok(serverSocket.rooms.has(`match:${second}`));
    assert.deepEqual(await leave(socket, second), { ok: true, matchId: second });
    assert.ok(!serverSocket.rooms.has(`match:${second}`));
  });

  it('notifies only subscribers after successful writes, including concurrent duplicate ingestion', async (t) => {
    const [a, b, c] = await Promise.all([connect(t), connect(t), connect(t)]);
    const seen = [[], [], []];
    [a, b, c].forEach((socket, index) => socket.on('match:changed', (data) => seen[index].push(data)));
    await Promise.all([join(a, first), join(b, first), join(c, second)]);

    const results = await Promise.all([1, 2].map(() => srv.api('POST', eventPath(first), card(10))));
    assert.deepEqual(results.map(({ status }) => status).sort(), [200, 201]);
    await Promise.all([sync(a), sync(b), sync(c)]);
    const notice = { matchId: first, reason: 'event' };
    assert.deepEqual(seen, [[notice], [notice], []]);
    assert.equal((await srv.api('GET', eventPath(first))).body.total, 1);

    assert.equal((await srv.api('POST', eventPath(first), {})).status, 400);
    // Valid shape, rejected by the persistence schema.
    assert.equal((await srv.api('POST', eventPath(first), { ...card(11), period: 9 })).status, 400);
    assert.equal((await srv.api('POST', eventPath(first), card(11), { auth: false })).status, 401);
    assert.equal((await srv.api('POST', eventPath(first), card(10))).status, 200);
    await Promise.all([sync(a), sync(b), sync(c)]);
    assert.deepEqual(seen, [[notice], [notice], []]);

    await leave(b, first);
    assert.equal((await srv.api('DELETE', eventPath(first))).status, 204);
    await Promise.all([sync(a), sync(b), sync(c)]);
    assert.deepEqual(seen, [[notice, { matchId: first, reason: 'reset' }], [notice], []]);
    assert.equal((await srv.api('GET', eventPath(first))).body.total, 0);
  });

  it('preserves successful REST responses and logs only context when publishing throws', async (t) => {
    const app = require('../app');
    const logs = t.mock.method(console, 'error', () => {});
    const publish = app.locals.publishMatchChange;
    app.locals.publishMatchChange = () => { throw new Error('Test publisher failure'); };
    try {
      const stored = await srv.api('POST', eventPath(second), card(10));
      assert.equal(stored.status, 201);
      assert.equal(stored.body.sequence, 10);
      assert.equal(stored.body.raw, undefined);
      assert.equal((await srv.api('DELETE', eventPath(second))).status, 204);
      assert.deepEqual(logs.mock.calls.map(({ arguments: args }) => args), [
        [`Unable to publish match update for ${second} (event)`],
        [`Unable to publish match update for ${second} (reset)`],
      ]);
    } finally {
      app.locals.publishMatchChange = publish;
    }
  });

  it('rejoins after transport loss and recovers missed, out-of-order and reset events through REST', async (t) => {
    const socket = await connect(t, { reconnection: true, reconnectionDelay: 700, randomizationFactor: 0 });
    await join(socket, first);
    await srv.api('POST', eventPath(first), card(20));
    const lost = next(socket, 'disconnect');
    const reconnected = next(socket, 'connect');
    srv.io.sockets.sockets.get(socket.id).conn.close();
    await lost;
    const missed = await srv.api('POST', eventPath(first), card(5));
    assert.equal(missed.status, 201);
    await reconnected;
    await join(socket, first);
    const snapshot = await srv.api('GET', eventPath(first));
    assert.deepEqual(snapshot.body.data.map(({ sequence }) => sequence), [5, 20]);

    await srv.api('DELETE', eventPath(first));
    await srv.api('POST', eventPath(first), card(5));
    const reset = await srv.api('GET', eventPath(first));
    assert.equal(reset.body.total, 1);
    assert.equal(reset.body.data[0].sequence, 5);
    assert.notEqual(reset.body.data[0]._id, missed.body._id);
  });

  it('disconnects a subscribed client when its JWT expires', async (t) => {
    const token = jwt.sign({ sub: 'test-user' }, process.env.JWT_SECRET, { expiresIn: 2 });
    const socket = makeClient(t, token);
    const ready = next(socket, 'connect');
    socket.connect();
    await ready;
    assert.equal((await join(socket, first)).ok, true);
    const id = socket.id;
    assert.equal(await next(socket, 'disconnect'), 'io server disconnect');
    assert.ok(!srv.io.sockets.sockets.has(id));
  });

  it('closes the server while an authenticated client is still connected', async (t) => {
    const socket = await connect(t);
    const disconnected = next(socket, 'disconnect');
    await wipe(Match, MatchEvent);
    await srv.close();
    closed = true;
    await disconnected;
    assert.equal(socket.connected, false);
  });
});

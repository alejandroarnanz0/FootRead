// Web-controlled replay, end to end against footboard_test: a viewer socket
// sends play / pause / speed / restart, the API relays them to the replayer
// agent (its own JWT, role "replayer"), and the agent posts the events by REST.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io } = require('socket.io-client');

const { startApi } = require('./helpers/apiServer');
const { startMlStub } = require('./helpers/mlStub');
const { wipe } = require('./helpers/testDb');
const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');
const { ApiClient, ReplayAgent, ReplaySession } = require('../scripts/replay');

const MATCH = '8801';
const NO_FILE = '8802';
const HOME = 'Home FC';
const AWAY = 'Away FC';
const shot = (index, minute, team, outcome) => ({
  index, period: 1, minute, second: 0, type: { name: 'Shot' }, team: { name: team },
  location: [110, 40], play_pattern: { name: 'Regular Play' },
  shot: { outcome: { name: outcome }, type: { name: 'Open Play' }, body_part: { name: 'Right Foot' }, technique: { name: 'Normal' } },
});
// One useful event per game minute: at x120 each gap lasts half a second.
const EVENTS = [
  { index: 1, period: 1, minute: 0, second: 0, type: { name: 'Half Start' }, team: { name: HOME } },
  shot(2, 1, HOME, 'Saved'),
  shot(3, 2, AWAY, 'Goal'),
  shot(4, 3, HOME, 'Off T'),
  shot(5, 4, HOME, 'Goal'),
  shot(6, 5, AWAY, 'Blocked'),
];
const USEFUL = EVENTS.length - 1;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, { timeout = 8000, every = 25 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error('Condition not met in time');
    await wait(every);
  }
}
const stored = () => MatchEvent.countDocuments({ matchId: MATCH });

describe('web-controlled replay', () => {
  let srv;
  let ml;
  let dir;
  let agent;

  before(async () => {
    ml = await startMlStub();
    ml.up();
    srv = await startApi({ realtime: true });
    await wipe(Match, MatchEvent);
    await Match.create([MATCH, NO_FILE].map((matchId) => ({ matchId, homeTeam: HOME, awayTeam: AWAY, available: true })));
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'footboard-replay-'));
    fs.writeFileSync(path.join(dir, `${MATCH}.json`), JSON.stringify(EVENTS));
  });

  after(async () => {
    await agent?.close();
    await wipe(Match, MatchEvent);
    await srv.close();
    await ml.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // A logged-in web client subscribed to MATCH, recording every replay:state.
  async function viewer(t) {
    const socket = io(srv.base, { forceNew: true, reconnection: false, auth: { token: srv.token } });
    t.after(() => socket.disconnect());
    const states = [];
    socket.on('replay:state', (state) => states.push(state));
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    assert.deepEqual(await socket.timeout(3000).emitWithAck('match:join', { matchId: MATCH }), { ok: true, matchId: MATCH });
    const command = (payload) => socket.timeout(8000).emitWithAck('replay:command', { matchId: MATCH, ...payload });
    return { socket, states, command, last: () => states.at(-1) };
  }

  async function startAgent() {
    const client = new ApiClient(`${srv.base}/api`, { email: 'helper@example.com', password: 'helper-pass' });
    agent = await new ReplayAgent({ api: `${srv.base}/api`, client, eventsDir: dir, log: () => {}, tickMs: 10 }).start();
    return agent;
  }

  it('rejects commands while no replayer is connected, and bad commands', async (t) => {
    const web = await viewer(t);
    await until(() => web.last());
    assert.equal(web.last().online, false);
    assert.equal(web.last().status, 'idle');
    assert.deepEqual(await web.command({ action: 'play' }), { ok: false, code: 'REPLAYER_OFFLINE' });
    assert.deepEqual(await web.command({ action: 'rewind' }), { ok: false, code: 'INVALID_ACTION' });
    assert.deepEqual(await web.command({ action: 'speed', speed: 5000 }), { ok: false, code: 'INVALID_SPEED' });
    assert.deepEqual(await web.command({ action: 'play', matchId: 'x' }), { ok: false, code: 'INVALID_MATCH_ID' });
  });

  it('tells viewers when the replayer connects', async (t) => {
    const web = await viewer(t);
    await startAgent();
    await until(() => web.last()?.online === true);
  });

  it('plays a whole match from a web command and marks it finished', async (t) => {
    const web = await viewer(t);
    const changes = [];
    web.socket.on('match:changed', (change) => changes.push(change.reason));

    const answer = await web.command({ action: 'play', speed: 240 });
    assert.equal(answer.ok, true);
    assert.equal(answer.state.status, 'playing');
    await until(() => web.last()?.status === 'finished');

    assert.equal(await stored(), USEFUL);
    assert.equal(web.last().sent, USEFUL);
    assert.equal(web.last().total, USEFUL);
    assert.ok(web.states.some((state) => state.status === 'playing' && state.online));
    assert.equal(changes[0], 'reset'); // a fresh session starts from an empty match
    assert.equal(changes.filter((reason) => reason === 'event').length, USEFUL);
    const match = await until(async () => (await Match.findOne({ matchId: MATCH }).lean())?.finishedAt && true);
    assert.ok(match);
    const shots = await MatchEvent.find({ matchId: MATCH, type: 'Shot' }).lean();
    assert.ok(shots.every((event) => event.xg !== null), 'every shot got its xG from the ML service');
  });

  it('pauses, resumes, changes speed and restarts', async (t) => {
    const web = await viewer(t);
    assert.equal((await web.command({ action: 'restart', speed: 120 })).ok, true);
    assert.equal((await Match.findOne({ matchId: MATCH }).lean()).finishedAt, null, 'a reset clears the end');
    await until(async () => (await stored()) >= 2);

    assert.equal((await web.command({ action: 'pause' })).state.status, 'paused');
    const paused = await stored();
    await wait(1200); // two game gaps at x120
    assert.equal(await stored(), paused, 'nothing is sent while paused');

    const fast = await web.command({ action: 'speed', speed: 240 });
    assert.equal(fast.state.speed, 240);
    assert.equal(fast.state.status, 'paused');

    assert.equal((await web.command({ action: 'play' })).state.status, 'playing');
    await until(() => web.last()?.status === 'finished');
    assert.equal(await stored(), USEFUL);
    assert.equal(await MatchEvent.countDocuments({ matchId: MATCH, sequence: 3 }), 1, 'no duplicates');
  });

  it('answers when the match has no events file', async (t) => {
    const web = await viewer(t);
    const answer = await web.socket.timeout(8000)
      .emitWithAck('replay:command', { matchId: NO_FILE, action: 'play' });
    assert.deepEqual(answer, { ok: false, code: 'NO_EVENTS_FILE' });
  });

  it('ignores replay states sent by a viewer', async (t) => {
    const web = await viewer(t);
    await MatchEvent.deleteMany({ matchId: NO_FILE });
    await Match.updateOne({ matchId: NO_FILE }, { $set: { finishedAt: null } });
    web.socket.emit('replay:state', { matchId: NO_FILE, status: 'finished', sent: 9, total: 9 });
    await wait(300);
    assert.equal((await Match.findOne({ matchId: NO_FILE }).lean()).finishedAt, null);
  });

  it('tells viewers when the replayer goes away', async (t) => {
    const web = await viewer(t);
    await until(() => web.last()?.online === true);
    await agent.close();
    agent = null;
    await until(() => web.last()?.online === false);
  });
});

describe('replay session clock', () => {
  it('keeps the game gaps, never negative, and reports its progress', async () => {
    const posted = [];
    const client = { request: async (method, url, body) => { if (method === 'POST') posted.push(body.index); return { data: {} }; } };
    const states = [];
    const events = [
      { index: 1, period: 1, minute: 0, type: { name: 'Shot' }, team: { name: 'A' } },
      { index: 2, period: 1, minute: 47, type: { name: 'Shot' }, team: { name: 'A' } }, // added time
      { index: 3, period: 2, minute: 45, type: { name: 'Shot' }, team: { name: 'A' } }, // clock goes back
    ];
    const session = new ReplaySession({ matchId: '1', events, client, speed: 6000, tickMs: 5, onState: (s) => states.push(s) });
    await session.play();
    await until(() => session.status === 'finished');
    assert.deepEqual(posted, [1, 2, 3]);
    assert.equal(states.at(-1).sent, 3);
    assert.equal(states.at(-1).duration, 45 * 60);
  });
});

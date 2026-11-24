// Replays a match that was already played, sending its events through the API
// as if they were happening live (CLAUDE.md 14.3).
//
//   node scripts/replay.js --match=3869685 [--speed=60] [--reset]
//
// --speed   acceleration factor: 60 plays 90 minutes in 90 seconds (default 60)
// --reset   clears the match's stored events before starting
// --api     API base URL (default API_URL env, or http://localhost:<PORT|3000>/api)
// --file    events JSON (default data/statsbomb_open_data/events/<match>.json)
//
// Logs in with REPLAY_EMAIL / REPLAY_PASSWORD from the root .env. Logs in again
// only when the API answers 401 (the token lasts one hour).
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// CLAUDE.md 14.3 / plan 6.4: only the useful event types travel.
const USEFUL_TYPES = new Set([
  'Shot',
  'Own Goal For',
  'Own Goal Against',
  'Foul Committed',
  'Bad Behaviour',
  'Substitution',
]);

function isUseful(event) {
  const type = event.type?.name;
  if (USEFUL_TYPES.has(type)) return true;
  return type === 'Pass' && Boolean(event.pass?.shot_assist || event.pass?.goal_assist);
}

// Useful events in StatsBomb order (its `index`).
function selectEvents(events) {
  return events.filter(isUseful).sort((a, b) => a.index - b.index);
}

// StatsBomb minutes run on across periods (2nd half starts at 45, extra time at
// 90 and 105, the shoot-out at 120), so this is a single match clock.
const gameSeconds = (e) => e.minute * 60 + (e.second || 0);

// Real waiting time before each event: the game gap divided by the speed.
// Stoppage time makes the clock go back at the start of a period: never negative.
function delaysMs(events, speed) {
  return events.map((e, i) => (i === 0 ? 0 : (Math.max(0, gameSeconds(e) - gameSeconds(events[i - 1])) * 1000) / speed));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class ApiClient {
  constructor(base, { email, password, token = null }) {
    this.base = base.replace(/\/$/, '');
    this.email = email;
    this.password = password;
    this.token = token;
    this.logins = 0;
  }

  async login() {
    if (!this.email || !this.password) {
      throw new Error('Set REPLAY_EMAIL and REPLAY_PASSWORD in the .env (a user registered in the app)');
    }
    const res = await fetch(`${this.base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });
    if (!res.ok) throw new Error(`Login failed (${res.status}): check REPLAY_EMAIL / REPLAY_PASSWORD`);
    this.token = (await res.json()).token;
    this.logins++;
  }

  // One request; on 401 logs in again and retries once. Network errors are
  // retried a few times; any other non-2xx stops the replay.
  async request(method, url, body, { retried = false, attempt = 1 } = {}) {
    if (!this.token) await this.login();
    let res;
    try {
      res = await fetch(this.base + url, {
        method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      if (attempt >= 3) throw new Error(`Cannot reach the API at ${this.base}: ${err.message}`);
      await sleep(500 * attempt);
      return this.request(method, url, body, { retried, attempt: attempt + 1 });
    }
    if (res.status === 401 && !retried) {
      await this.login();
      return this.request(method, url, body, { retried: true });
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${data?.error || res.statusText}`);
    return { status: res.status, data };
  }
}

const describe = (e, stored) => {
  const clock = `${String(e.minute).padStart(3)}:${String(e.second || 0).padStart(2, '0')}`;
  const what = e.type.name === 'Shot' ? `Shot ${stored?.shotOutcome || ''} xG ${stored?.xg ?? 'n/a'}` : e.type.name;
  return `${clock} P${e.period} ${e.team.name.padEnd(16)} ${what}${e.player ? ` (${e.player.name})` : ''}`;
};

async function replay({ matchId, events, speed = 60, reset = false, client, wait = sleep, log = console.log }) {
  const selected = selectEvents(events);
  const delays = delaysMs(selected, speed);
  log(`Match ${matchId}: ${selected.length} of ${events.length} events, speed x${speed}`);
  if (reset) {
    await client.request('DELETE', `/matches/${matchId}/events`);
    log('Stored events cleared');
  }
  let created = 0;
  for (let i = 0; i < selected.length; i++) {
    if (delays[i]) await wait(delays[i]);
    // Wait for each answer before the next one: events must arrive in order.
    const { status, data } = await client.request('POST', `/matches/${matchId}/events`, selected[i]);
    if (status === 201) created++;
    log(describe(selected[i], data));
  }
  const { data: state } = await client.request('GET', `/matches/${matchId}/state`);
  log(
    `Final: ${state.homeTeam} ${state.score.home}-${state.score.away} ${state.awayTeam}` +
      (state.shootout ? ` (penalties ${state.shootout.home}-${state.shootout.away})` : '') +
      ` · xG ${state.xgAccumulated.home}-${state.xgAccumulated.away}`
  );
  return { sent: selected.length, created, state };
}

// ---------------------------------------------------------------------------
// Agent mode: the replayer stays connected to the API through Socket.IO (with
// its JWT, role "replayer") and obeys the commands the web sends: play, pause,
// speed and restart. Events still travel by REST POST, exactly as above.
// ---------------------------------------------------------------------------

const TICK_MS = 100;
const STATE_EVERY_MS = 1000;
const DEFAULT_EVENTS_DIR = path.join(__dirname, '..', '..', 'data', 'statsbomb_open_data', 'events');

// One controllable replay of one match. Keeps the original rhythm: before each
// event it waits the game gap to the previous one (never negative), on a
// virtual clock that runs `speed` times faster than real time and can pause.
class ReplaySession {
  constructor({ matchId, events, client, speed = 60, onState = () => {}, log = () => {}, tickMs = TICK_MS }) {
    this.matchId = matchId;
    this.events = selectEvents(events);
    this.times = this.events.map(gameSeconds);
    this.client = client;
    this.speed = speed;
    this.onState = onState;
    this.log = log;
    this.tickMs = tickMs;
    this.status = 'idle';
    this.cursor = 0; // next event to send
    this.waited = 0; // game seconds waited since the last event sent
    this.generation = 0;
    this.loop = null;
  }

  get clock() {
    if (!this.cursor) return this.waited;
    return this.times[this.cursor - 1] + this.waited;
  }

  state() {
    return {
      matchId: this.matchId,
      status: this.status,
      speed: this.speed,
      clock: Math.round(this.clock),
      duration: this.times.at(-1) ?? 0,
      sent: this.cursor,
      total: this.events.length,
    };
  }

  report() {
    this.lastReport = Date.now();
    this.onState(this.state());
  }

  setSpeed(speed) {
    if (Number.isFinite(speed) && speed > 0) this.speed = speed;
  }

  async play(speed) {
    this.setSpeed(speed);
    if (this.status === 'playing') return this.report();
    // A fresh session or a finished one starts over from an empty match.
    if (this.status === 'idle' || this.status === 'finished') return this.restart();
    await this.stop(); // the paused loop may still be finishing its last POST
    this.status = 'playing';
    this.start();
  }

  async pause() {
    if (this.status !== 'playing') return this.report();
    this.status = 'paused';
    this.report();
  }

  async restart(speed) {
    this.setSpeed(speed);
    await this.stop(); // no POST in flight when the events are deleted
    await this.client.request('DELETE', `/matches/${this.matchId}/events`);
    this.cursor = 0;
    this.waited = 0;
    this.status = 'playing';
    this.start();
  }

  async stop() {
    this.generation++;
    const running = this.loop;
    if (running) await running.catch(() => {});
  }

  start() {
    this.report();
    const generation = ++this.generation;
    this.loop = this.run(generation).catch((err) => {
      this.log(`Replay of ${this.matchId} stopped: ${err.message}`);
      if (generation === this.generation) {
        this.status = 'paused';
        this.report();
      }
    });
  }

  async run(generation) {
    const alive = () => generation === this.generation && this.status === 'playing';
    let last = Date.now();
    while (alive() && this.cursor < this.events.length) {
      const gap = this.cursor ? Math.max(0, this.times[this.cursor] - this.times[this.cursor - 1]) : 0;
      if (this.waited < gap) {
        await sleep(this.tickMs);
        const now = Date.now();
        if (alive()) this.waited += ((now - last) / 1000) * this.speed;
        last = now;
        if (now - this.lastReport >= STATE_EVERY_MS) this.report();
        continue;
      }
      const event = this.events[this.cursor];
      const { data } = await this.client.request('POST', `/matches/${this.matchId}/events`, event);
      // Stored: advance even if a command arrived meanwhile, so it is never sent twice.
      this.log(describe(event, data));
      this.cursor++;
      this.waited = Math.max(0, this.waited - gap);
      last = Date.now();
      if (generation !== this.generation) return;
      this.report();
    }
    if (alive() && this.cursor >= this.events.length) {
      this.status = 'finished';
      this.waited = 0;
      this.log(`Match ${this.matchId}: finished`);
      this.report();
    }
  }
}

// Connects as "replayer", keeps one session per match and answers commands.
class ReplayAgent {
  constructor({ api, client, eventsDir = DEFAULT_EVENTS_DIR, speed = 20, log = console.log, connect, tickMs }) {
    this.api = api;
    this.client = client;
    this.eventsDir = eventsDir;
    this.speed = speed;
    this.log = log;
    this.tickMs = tickMs;
    this.sessions = new Map();
    this.connect = connect ?? ((url, options) => require('socket.io-client').io(url, options));
  }

  async start({ attempts = 10, retryMs = 1000 } = {}) {
    // The API may still be starting: retry network errors, never bad credentials.
    for (let attempt = 1; ; attempt++) {
      try {
        await this.client.login();
        break;
      } catch (err) {
        if (/Login failed/.test(err.message) || attempt >= attempts) throw err;
        this.log(`API not reachable at ${this.api} (${err.message}); retrying…`);
        await sleep(retryMs);
      }
    }
    const socket = this.connect(new URL(this.api).origin, {
      auth: (done) => done({ token: this.client.token, role: 'replayer' }),
      reconnectionDelayMax: 5000,
    });
    this.socket = socket;
    socket.on('connect', () => {
      this.log(`Replayer connected to ${this.api}: waiting for commands from the web`);
      for (const session of this.sessions.values()) session.report();
    });
    // An expired token closes the socket: log in again and reconnect.
    const renew = async () => {
      try {
        await this.client.login();
        socket.connect();
      } catch (err) {
        this.log(`Cannot log in again: ${err.message}`);
      }
    };
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') renew();
    });
    socket.on('connect_error', (err) => {
      if (String(err.data?.code).startsWith('TOKEN')) renew();
    });
    socket.on('replay:command', (command, ack) => {
      this.handle(command).then(ack, (err) => ack({ ok: false, code: 'REPLAY_FAILED', error: err.message }));
    });
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', (err) => (String(err.data?.code).startsWith('TOKEN') ? null : reject(err)));
    });
    return this;
  }

  session(matchId) {
    if (this.sessions.has(matchId)) return this.sessions.get(matchId);
    const file = path.join(this.eventsDir, `${matchId}.json`);
    if (!/^\d+$/.test(matchId) || !fs.existsSync(file)) return null;
    const session = new ReplaySession({
      matchId,
      events: JSON.parse(fs.readFileSync(file, 'utf8')),
      client: this.client,
      speed: this.speed,
      tickMs: this.tickMs,
      log: this.log,
      onState: (state) => this.socket?.connected && this.socket.emit('replay:state', state),
    });
    this.sessions.set(matchId, session);
    return session;
  }

  async handle({ matchId, action, speed } = {}) {
    const session = this.session(String(matchId));
    if (!session) return { ok: false, code: 'NO_EVENTS_FILE' };
    this.log(`Command for ${matchId}: ${action}${speed ? ` x${speed}` : ''}`);
    if (action === 'play') await session.play(speed);
    else if (action === 'pause') await session.pause();
    else if (action === 'restart') await session.restart(speed);
    else if (action === 'speed') {
      session.setSpeed(speed);
      session.report();
    } else return { ok: false, code: 'INVALID_ACTION' };
    return { ok: true, state: session.state() };
  }

  async close() {
    for (const session of this.sessions.values()) await session.stop();
    this.socket?.close();
  }
}

function parseArgs(argv) {
  const get = (name) => {
    const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (i === -1) return null;
    return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
  };
  const agent = argv.includes('--agent');
  const matchId = get('match');
  if (!matchId && !agent) {
    throw new Error('Usage: node scripts/replay.js --match=<match_id> [--speed=60] [--reset]  |  --agent [--speed=20]');
  }
  const speed = Number(get('speed') || (agent ? 20 : 60));
  if (!(speed > 0)) throw new Error('--speed must be a positive number');
  const api = get('api') || process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
  const eventsDir = get('events-dir') || DEFAULT_EVENTS_DIR;
  const file = get('file') || path.join(eventsDir, `${matchId}.json`);
  return { matchId, speed, reset: argv.includes('--reset'), api, file, agent, eventsDir };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.agent) {
    const client = new ApiClient(args.api, { email: process.env.REPLAY_EMAIL, password: process.env.REPLAY_PASSWORD });
    const agent = await new ReplayAgent({ api: args.api, client, eventsDir: args.eventsDir, speed: args.speed }).start();
    const shutdown = () => agent.close().then(() => process.exit(0));
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    return;
  }
  if (!fs.existsSync(args.file)) throw new Error(`No events file: ${args.file} (see data/README.md)`);
  const events = JSON.parse(fs.readFileSync(args.file, 'utf8'));
  const client = new ApiClient(args.api, {
    email: process.env.REPLAY_EMAIL,
    password: process.env.REPLAY_PASSWORD,
  });
  await replay({ ...args, events, client });
}

module.exports = {
  selectEvents, delaysMs, gameSeconds, ApiClient, replay, parseArgs, USEFUL_TYPES, ReplaySession, ReplayAgent,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

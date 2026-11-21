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

function parseArgs(argv) {
  const get = (name) => {
    const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    if (i === -1) return null;
    return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
  };
  const matchId = get('match');
  if (!matchId) throw new Error('Usage: node scripts/replay.js --match=<match_id> [--speed=60] [--reset]');
  const speed = Number(get('speed') || 60);
  if (!(speed > 0)) throw new Error('--speed must be a positive number');
  const api = get('api') || process.env.API_URL || `http://localhost:${process.env.PORT || 3000}/api`;
  const file =
    get('file') || path.join(__dirname, '..', '..', 'data', 'statsbomb_open_data', 'events', `${matchId}.json`);
  return { matchId, speed, reset: argv.includes('--reset'), api, file };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.file)) throw new Error(`No events file: ${args.file} (see data/README.md)`);
  const events = JSON.parse(fs.readFileSync(args.file, 'utf8'));
  const client = new ApiClient(args.api, {
    email: process.env.REPLAY_EMAIL,
    password: process.env.REPLAY_PASSWORD,
  });
  await replay({ ...args, events, client });
}

module.exports = { selectEvents, delaysMs, gameSeconds, ApiClient, replay, parseArgs, USEFUL_TYPES };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

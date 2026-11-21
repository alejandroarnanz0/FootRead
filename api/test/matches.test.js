// Integration tests of match ingestion and live state, with a fake ML service.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startApi } = require('./helpers/apiServer');
const { startMlStub } = require('./helpers/mlStub');
const { wipe } = require('./helpers/testDb');
const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');

const ID = '1001';
const HOME = 'Home FC';
const AWAY = 'Away FC';

// Minimal StatsBomb-shaped events.
let index = 0;
const ev = (type, team, extra = {}) => ({
  index: ++index,
  period: 1,
  minute: index,
  second: 0,
  type: { name: type },
  team: { name: team },
  player: { name: `${team} player` },
  play_pattern: { name: 'Regular Play' },
  location: [100, 40],
  ...extra,
});
const shot = (team, outcome, extra = {}) =>
  ev('Shot', team, {
    shot: {
      outcome: { name: outcome },
      type: { name: 'Open Play' },
      body_part: { name: 'Right Foot' },
      technique: { name: 'Normal' },
      statsbomb_xg: 0.2,
    },
    ...extra,
  });

describe('matches', () => {
  let srv;
  let ml;
  const post = (body, opts) => srv.api('POST', `/api/matches/${ID}/events`, body, opts);

  before(async () => {
    ml = await startMlStub();
    ml.up();
    srv = await startApi();
    await wipe(Match, MatchEvent);
    await Match.create([
      { matchId: ID, homeTeam: HOME, awayTeam: AWAY, competition: 'Test League', available: true },
      { matchId: '1002', homeTeam: AWAY, awayTeam: HOME, available: false },
    ]);
  });

  after(async () => {
    await wipe(Match, MatchEvent);
    await srv.close();
    await ml.close();
  });

  it('lists only replayable matches and shows one', async () => {
    const list = await srv.api('GET', '/api/matches');
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.data.map((m) => m.matchId), [ID]);
    const one = await srv.api('GET', `/api/matches/${ID}`);
    assert.equal(one.body.homeTeam, HOME);
    assert.equal((await srv.api('GET', '/api/matches/999')).status, 404);
  });

  it('stores an event (201) with the xG of the ML service, and never duplicates it', async () => {
    const goal = shot(HOME, 'Goal', { location: [115, 40] });
    const first = await post(goal);
    assert.equal(first.status, 201);
    assert.equal(first.body.xg, 0.5);
    assert.equal(first.body.isGoal, true);
    assert.equal(first.body.raw, undefined);
    // The service received the raw shot, not features.
    assert.deepEqual(ml.calls.at(-1).body, {
      x: 115, y: 40, under_pressure: false, body_part: 'Right Foot',
      technique: 'Normal', shot_type: 'Open Play', play_pattern: 'Regular Play',
    });

    const calls = ml.calls.length;
    const again = await post(goal);
    assert.equal(again.status, 200);
    assert.equal(ml.calls.length, calls); // not recomputed
    assert.equal(await MatchEvent.countDocuments({ matchId: ID }), 1);
  });

  it('keeps ingesting with xg: null when the ML service is down', async () => {
    ml.down();
    const res = await post(shot(AWAY, 'Saved'));
    ml.up();
    assert.equal(res.status, 201);
    assert.equal(res.body.xg, null);
  });

  it('rejects writes without a token (401), bad events (400) and unknown matches (404)', async () => {
    assert.equal((await post(shot(HOME, 'Off T'), { auth: false })).status, 401);
    assert.equal((await srv.api('DELETE', `/api/matches/${ID}/events`, undefined, { auth: false })).status, 401);
    assert.equal((await post({ index: 99 })).status, 400);
    assert.equal((await srv.api('POST', '/api/matches/999/events', shot(HOME, 'Goal'))).status, 404);
  });

  it('keeps the card of a booking and the player coming on in a substitution', async () => {
    const booking = await post(ev('Bad Behaviour', AWAY, { bad_behaviour: { card: { name: 'Yellow Card' } } }));
    assert.equal(booking.body.card, 'Yellow Card');
    const foul = await post(ev('Foul Committed', HOME, { foul_committed: { card: { name: 'Red Card' } } }));
    assert.equal(foul.body.card, 'Red Card');
    const sub = await post(ev('Substitution', HOME, { substitution: { replacement: { name: 'New Player' } } }));
    assert.equal(sub.body.playerName, `${HOME} player`);
    assert.equal(sub.body.replacement, 'New Player');
  });

  it('computes the score: own goals count, the shoot-out does not', async () => {
    await post(ev('Foul Committed', AWAY));
    await post(shot(AWAY, 'Goal')); // away 1, xg 0.1
    await post(ev('Own Goal Against', AWAY)); // the conceding side: not a goal by itself
    await post(ev('Own Goal For', HOME)); // home 2
    await post(shot(HOME, 'Goal', { period: 5, minute: 121, shot: { outcome: { name: 'Goal' }, type: { name: 'Penalty' } } }));
    await post(shot(AWAY, 'Saved', { period: 5, minute: 121, shot: { outcome: { name: 'Saved' }, type: { name: 'Penalty' } } }));

    const state = (await srv.api('GET', `/api/matches/${ID}/state`)).body;
    assert.deepEqual(state.score, { home: 2, away: 1 });
    assert.deepEqual(state.shootout, { home: 1, away: 0 });
    // Shoot-out penalties (0.73 each) stay out of the accumulated xG.
    assert.deepEqual(state.xgAccumulated, { home: 0.5, away: 0.1 });
    assert.equal(state.shotsWithoutXg, 1); // the one stored while the service was down
    assert.equal(state.period, 5);
    assert.equal(state.homeTeam, HOME);
  });

  it('returns the events in order, or only the newer ones, and clears the match', async () => {
    const all = (await srv.api('GET', `/api/matches/${ID}/events`)).body;
    const seq = all.data.map((e) => e.sequence);
    assert.deepEqual(seq, [...seq].sort((a, b) => a - b));
    assert.equal(all.data[0].raw, undefined);
    const newer = (await srv.api('GET', `/api/matches/${ID}/events?after=${seq[2]}`)).body;
    assert.equal(newer.total, all.total - 3);
    assert.equal((await srv.api('GET', `/api/matches/${ID}/events?raw=true`)).body.data[0].raw.index, seq[0]);

    assert.equal((await srv.api('DELETE', `/api/matches/${ID}/events`)).status, 204);
    const empty = (await srv.api('GET', `/api/matches/${ID}/state`)).body;
    assert.deepEqual(empty.score, { home: 0, away: 0 });
    assert.equal(empty.shootout, null);
  });
});

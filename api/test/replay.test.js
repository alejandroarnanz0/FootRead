// Tests of the match replayer: event filtering and timing, and a full replay
// through the real API (footboard_test) with a fake ML service.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startApi } = require('./helpers/apiServer');
const { startMlStub } = require('./helpers/mlStub');
const { wipe } = require('./helpers/testDb');
const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');
const { selectEvents, delaysMs, parseArgs, ApiClient, replay } = require('../scripts/replay');

const HOME = 'Home FC';
const AWAY = 'Away FC';
const e = (index, minute, type, team, extra = {}) => ({
  index, period: minute >= 120 ? 5 : minute >= 45 ? 2 : 1, minute, second: 0,
  type: { name: type }, team: { name: team }, location: [110, 40], play_pattern: { name: 'Regular Play' }, ...extra,
});
const shot = (index, minute, team, outcome) =>
  e(index, minute, 'Shot', team, {
    shot: { outcome: { name: outcome }, type: { name: 'Open Play' }, body_part: { name: 'Head' }, technique: { name: 'Normal' } },
  });

const EVENTS = [
  e(1, 0, 'Half Start', HOME),
  e(2, 1, 'Ball Receipt*', HOME),
  e(3, 2, 'Pass', HOME, { pass: {} }), // plain pass: dropped
  e(4, 3, 'Pass', HOME, { pass: { shot_assist: true } }), // key pass: kept
  shot(5, 3, HOME, 'Goal'),
  e(6, 10, 'Carry', AWAY),
  e(7, 12, 'Foul Committed', AWAY),
  e(8, 20, 'Bad Behaviour', AWAY),
  e(9, 50, 'Substitution', HOME),
  e(10, 60, 'Own Goal For', AWAY),
  e(11, 60, 'Own Goal Against', HOME),
  shot(12, 120, AWAY, 'Goal'), // shoot-out
];

describe('replay', () => {
  it('keeps only the useful event types, in index order', () => {
    const shuffled = [...EVENTS].reverse();
    assert.deepEqual(selectEvents(shuffled).map((x) => x.index), [4, 5, 7, 8, 9, 10, 11, 12]);
  });

  it('waits the game gap divided by the speed, never negative', () => {
    const evs = [{ minute: 0 }, { minute: 1 }, { minute: 1, second: 30 }, { minute: 0, second: 50 }];
    assert.deepEqual(delaysMs(evs, 60), [0, 1000, 500, 0]);
  });

  it('reads its arguments', () => {
    const a = parseArgs(['--match=42', '--speed', '120', '--reset']);
    assert.equal(a.matchId, '42');
    assert.equal(a.speed, 120);
    assert.equal(a.reset, true);
    assert.match(a.file, /events[\\/]42\.json$/);
    assert.throws(() => parseArgs([]), /Usage/);
  });

  describe('through the API', () => {
    let srv;
    let ml;

    before(async () => {
      ml = await startMlStub();
      ml.up();
      srv = await startApi();
      await wipe(Match, MatchEvent);
      await Match.create({ matchId: '777', homeTeam: HOME, awayTeam: AWAY, available: true });
    });

    after(async () => {
      await wipe(Match, MatchEvent);
      await srv.close();
      await ml.close();
    });

    it('sends every useful event, logging in again only after a 401', async () => {
      // Starts with an invalid token: the first request gets 401 and triggers one login.
      const client = new ApiClient(`${srv.base}/api`, {
        email: 'helper@example.com',
        password: 'helper-pass',
        token: 'expired.or.invalid',
      });
      const run = await replay({ matchId: '777', events: EVENTS, speed: 1e6, reset: true, client, log: () => {} });

      assert.equal(client.logins, 1);
      assert.equal(run.sent, 8);
      assert.equal(run.created, 8);
      assert.deepEqual(run.state.score, { home: 1, away: 1 }); // own goal for AWAY, shoot-out ignored
      assert.deepEqual(run.state.shootout, { home: 0, away: 1 });

      // Replaying again with --reset gives the same result, without duplicates.
      const again = await replay({ matchId: '777', events: EVENTS, speed: 1e6, reset: true, client, log: () => {} });
      assert.equal(again.created, 8);
      assert.equal(await MatchEvent.countDocuments({ matchId: '777' }), 8);
      assert.equal(client.logins, 1);
    });

    it('stops with a clear error when the credentials are wrong', async () => {
      const client = new ApiClient(`${srv.base}/api`, { email: 'helper@example.com', password: 'wrong-pass' });
      await assert.rejects(
        replay({ matchId: '777', events: EVENTS, speed: 1e6, client, log: () => {} }),
        /Login failed \(401\)/
      );
    });
  });
});

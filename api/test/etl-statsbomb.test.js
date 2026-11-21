// Integration tests of the StatsBomb ETLs (Shot, Match) against footboard_test.
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { connectTestDb, wipe, mongoose } = require('./helpers/testDb');
const Shot = require('../models/Shot');
const Match = require('../models/Match');
const loadShots = require('../scripts/etl/shots');
const loadMatches = require('../scripts/etl/matches');

const FIXTURES = path.join(__dirname, 'fixtures');
const quiet = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
};

describe('StatsBomb ETLs', () => {
  before(async () => {
    await connectTestDb();
    await wipe(Shot, Match);
  });

  after(async () => {
    await wipe(Shot, Match);
    await mongoose.disconnect();
  });

  it('loads shots with the distance and angle exported by Python, and is idempotent', async () => {
    const first = await quiet(() => loadShots({ shotsDir: path.join(FIXTURES, 'statsbomb_shots') }));
    assert.equal(first.inserted, 3);
    const goal = await Shot.findOne({ playerName: 'Ana Test' }).lean();
    assert.equal(goal.isGoal, true);
    assert.equal(goal.distanceToGoal, 6.977); // from the CSV, never recomputed in Node
    assert.equal(goal.angleToGoal, 56.62);
    assert.equal(goal.split, 'test');
    // Two identical rows (same player, same spot) get distinct keys.
    assert.equal(await Shot.countDocuments({ playerName: 'Bea Test' }), 2);

    const second = await quiet(() => loadShots({ shotsDir: path.join(FIXTURES, 'statsbomb_shots') }));
    assert.equal(second.inserted, 0);
    assert.equal(await Shot.countDocuments(), 3);
  });

  it('loads matches with home and away teams, flagging the ones with events as available', async () => {
    const res = await quiet(() => loadMatches({ openDataDir: path.join(FIXTURES, 'open_data') }));
    assert.equal(res.inserted, 2);
    const withEvents = await Match.findOne({ matchId: '1001' }).lean();
    assert.equal(withEvents.homeTeam, 'Home FC');
    assert.equal(withEvents.awayTeam, 'Away FC');
    assert.equal(withEvents.available, true);
    assert.equal((await Match.findOne({ matchId: '1002' }).lean()).available, false);

    const again = await quiet(() => loadMatches({ openDataDir: path.join(FIXTURES, 'open_data') }));
    assert.equal(again.inserted, 0);
  });
});

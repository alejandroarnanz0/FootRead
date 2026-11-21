// Integration test of GET /api/players/:id/comparables against footboard_test.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startApi } = require('./helpers/apiServer');
const { wipe } = require('./helpers/testDb');
const Competition = require('../models/Competition');
const Club = require('../models/Club');
const Player = require('../models/Player');
const SeasonStat = require('../models/SeasonStat');

describe('player comparables', () => {
  let srv;
  const ids = {};

  before(async () => {
    srv = await startApi();
    await wipe(Competition, Club, Player, SeasonStat);
    const comp = await Competition.create({ code: 'ES1', name: 'LaLiga', tier: 1 });
    const club = await Club.create({ name: 'Test CF', competition: comp._id });
    // Twelve 25-year-old starting centre-backs, worth 5..16 M€, plus one retired player.
    const born = new Date(Date.UTC(2000, 5, 1));
    const players = await Player.create(
      Array.from({ length: 12 }, (_, i) => ({
        name: `CB ${i}`, position: 'DF', subPosition: 'Centre-Back', birthDate: born,
        club: club._id, currentValue: (5 + i) * 1e6, lastSeason: 2025,
      })).concat([{ name: 'Retired', position: 'DF', subPosition: 'Centre-Back', birthDate: born, club: club._id, currentValue: 1e6, lastSeason: 2019 }])
    );
    ids.first = String(players[0]._id);
    ids.retired = String(players[12]._id);
    await SeasonStat.create(
      players.slice(0, 12).map((p) => ({ player: p._id, season: '2025-26', competition: comp._id, minutes: 3000, goals: 1, assists: 0 }))
    );
  });

  after(async () => {
    await wipe(Competition, Club, Player, SeasonStat);
    await srv.close();
  });

  it('lists the comparables used for the reference value, never the player himself', async () => {
    const res = await srv.api('GET', `/api/players/${ids.first}/comparables`);
    assert.equal(res.status, 200);
    assert.equal(res.body.inPopulation, true);
    assert.equal(res.body.groupSize, 11);
    assert.equal(res.body.comparables.length, 11);
    assert.ok(!res.body.comparables.some((c) => c._id === ids.first));
    assert.equal(res.body.comparables[0].club.name, 'Test CF');
    assert.ok(res.body.referenceValue > 0);
    assert.deepEqual(res.body.criteria, ['subPosition', 'ageBand', 'minutesBand', 'productionBand']);
    // Closest in value first: the 6 M€ centre-back for a 5 M€ player.
    assert.equal(res.body.comparables[0].currentValue, 6e6);
  });

  it('explains when a player is outside the population, and 404s an unknown one', async () => {
    const res = await srv.api('GET', `/api/players/${ids.retired}/comparables`);
    assert.equal(res.status, 200);
    assert.equal(res.body.inPopulation, false);
    assert.deepEqual(res.body.comparables, []);
    assert.equal((await srv.api('GET', '/api/players/aaaaaaaaaaaaaaaaaaaaaaaa/comparables')).status, 404);
  });
});

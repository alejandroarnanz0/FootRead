// Unit tests for the comparables heuristic. No database needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const c = require('../scripts/value/comparables');

test('median handles odd, even and empty lists', () => {
  assert.equal(c.median([3, 1, 2]), 2);
  assert.equal(c.median([4, 1, 3, 2]), 2.5);
  assert.equal(c.median([]), null);
});

test('bands', () => {
  assert.equal(c.ageBand(19), '<=21');
  assert.equal(c.ageBand(26), '25-27');
  assert.equal(c.minutesBand(38 * 90, 'ES1'), 'key');
  assert.equal(c.minutesBand(300, 'ES1'), 'bench');
  assert.equal(c.productionBand({ subPosition: 'Centre-Back', minutes: 3000, goals: 5, assists: 0 }), null);
  assert.equal(c.productionBand({ subPosition: 'Left Winger', minutes: 300, goals: 5, assists: 0 }), null);
  assert.equal(c.productionBand({ subPosition: 'Centre-Forward', minutes: 900, goals: 6, assists: 0 }), '0.6+');
});

function makePlayer(id, value, overrides = {}) {
  return {
    id: String(id),
    position: 'DF',
    subPosition: 'Centre-Back',
    age: 25,
    minutes: 3000,
    goals: 0,
    assists: 0,
    league: 'ES1',
    value,
    ...overrides,
  };
}

test('prices a player by the median of his comparables, never himself', () => {
  // 11 comparables worth 10 M€ and one outlier worth 1 M€.
  const players = Array.from({ length: 11 }, (_, i) => makePlayer(i, 10e6));
  players.push(makePlayer('cheap', 1e6));
  const { result } = c.predictValues(players);
  const cheap = result.get('cheap');
  assert.equal(cheap.level, 0);
  assert.equal(cheap.groupSize, 11);
  assert.equal(cheap.predicted, 10e6); // relative 1.0 × league median 10 M€
});

test('relaxes the group when it is too small, and gives up when nothing fits', () => {
  // Ten 25-year-olds and one 23-year-old: the 23-year-old needs the wide age band.
  const players = Array.from({ length: 10 }, (_, i) => makePlayer(i, 5e6));
  players.push(makePlayer('young', 5e6, { age: 24 }));
  const { result } = c.predictValues(players);
  assert.equal(result.get('young').level, 2);

  const alone = c.predictValues([makePlayer('a', 1e6), makePlayer('b', 2e6)]).result;
  assert.equal(alone.get('a').predicted, null);
});

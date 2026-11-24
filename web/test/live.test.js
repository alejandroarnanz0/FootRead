// Model reading of a live match: xG bands, the six verdicts and the scorecard.
// Run from the repo root: node --test web/test/live.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BAND_LIMITS, formatPct, gameSeconds, modelReport, shotVerdict, VERDICTS, xgBand,
} from '../src/components/live/matchData.js';

const match = { homeTeam: 'Home', awayTeam: 'Away' };
const shot = (xg, isGoal, team = 'Home', extra = {}) => ({ type: 'Shot', period: 1, minute: 10, team, xg, isGoal, ...extra });

test('bands split at 10 % and 30 %, inclusive on the lower limit', () => {
  assert.equal(xgBand(0.0999), 'unlikely');
  assert.equal(xgBand(BAND_LIMITS.possible), 'possible');
  assert.equal(xgBand(0.2999), 'possible');
  assert.equal(xgBand(BAND_LIMITS.clear), 'clear');
  assert.equal(xgBand(0.76), 'clear');
  assert.equal(xgBand(null), null);
});

test('each band and result maps to one of six verdicts; only two are model errors', () => {
  assert.equal(shotVerdict(shot(0.45, true)), 'expected-goal');
  assert.equal(shotVerdict(shot(0.2, true)), 'possible-goal');
  assert.equal(shotVerdict(shot(0.04, true)), 'unexpected-goal');
  assert.equal(shotVerdict(shot(0.62, false)), 'missed-chance');
  assert.equal(shotVerdict(shot(0.15, false)), 'normal-miss');
  assert.equal(shotVerdict(shot(0.03, false)), 'expected-miss');
  assert.equal(shotVerdict(shot(null, true)), null, 'no xG, no verdict');
  assert.equal(shotVerdict({ type: 'Foul Committed', xg: 0.5 }), null);
  const errors = Object.entries(VERDICTS).filter(([, v]) => v.error).map(([key]) => key).sort();
  assert.deepEqual(errors, ['missed-chance', 'unexpected-goal']);
});

test('percentages out of 100 in Spanish format', () => {
  assert.equal(formatPct(0.341).replace(/\s/g, ' '), '34 %');
  assert.equal(formatPct(0.003), '<1 %');
  assert.equal(formatPct(0).replace(/\s/g, ' '), '0 %');
  assert.equal(formatPct(undefined), '—');
});

test('game clock in seconds across periods', () => {
  assert.equal(gameSeconds({ minute: 47, second: 12 }), 47 * 60 + 12);
  assert.equal(gameSeconds({ minute: 45 }), 2700);
});

test('the scorecard compares the model with always saying "no goal"', () => {
  const events = [
    shot(0.5, true), // expected goal
    shot(0.05, true, 'Away'), // unexpected goal: error
    shot(0.7, false), // missed chance: error
    shot(0.02, false, 'Away'),
    shot(0.03, false),
    shot(0.12, false, 'Away'),
    shot(0.9, true, 'Away', { period: 5 }), // shoot-out: left out
    shot(null, false), // no xG: left out
    { type: 'Foul Committed', team: 'Home', period: 1, minute: 3 },
  ];
  const report = modelReport(match, events);
  assert.equal(report.total, 6);
  assert.equal(report.goals, 2);
  assert.equal(report.errors, 2);
  assert.equal(report.accuracy, 4 / 6);
  assert.equal(report.reference, 4 / 6, '"never goal" misses the 2 goals');
  assert.equal(report.counts['missed-chance'], 1);
  assert.equal(report.teams.home.goals, 1);
  assert.equal(report.teams.away.shots, 3);
  assert.ok(Math.abs(report.teams.home.xg - 1.23) < 1e-9);
  assert.equal(report.surprise.xg, 0.05);
  assert.equal(report.miss.xg, 0.7);
});

test('an empty match has no scorecard yet', () => {
  const report = modelReport(match, []);
  assert.equal(report.accuracy, null);
  assert.equal(report.surprise, null);
});

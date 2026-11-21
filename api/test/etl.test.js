// Unit tests for the ETL normalization helpers. No database needed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const n = require('../scripts/etl/lib/normalize');

test('maps Transfermarkt positions to the four-value enum', () => {
  assert.equal(n.position('Goalkeeper'), 'GK');
  assert.equal(n.position('Defender'), 'DF');
  assert.equal(n.position('Midfield'), 'MF');
  assert.equal(n.position('Attack'), 'FW');
  assert.equal(n.position('Missing'), null);
  assert.equal(n.position(''), null);
});

test('drops absurd heights', () => {
  assert.equal(n.heightCm('17'), null);
  assert.equal(n.heightCm('139'), null);
  assert.equal(n.heightCm('185'), 185);
  assert.equal(n.heightCm('230'), null);
  assert.equal(n.heightCm(''), null);
});

test('turns the start year into a season string', () => {
  assert.equal(n.season('2009'), '2009-10');
  assert.equal(n.season('1999'), '1999-00');
  assert.equal(n.season(''), null);
});

test('parses Transfermarkt dates as UTC midnight', () => {
  assert.equal(n.toDate('1978-06-09 00:00:00').toISOString(), '1978-06-09T00:00:00.000Z');
  assert.equal(n.toDate('2012-07-03').toISOString(), '2012-07-03T00:00:00.000Z');
  assert.equal(n.toDate(''), null);
  assert.equal(n.toDate('nonsense'), null);
});

test('cleans names and empty values', () => {
  assert.equal(n.cleanName('  Vinicius   Junior '), 'Vinicius Junior');
  assert.equal(n.blank('   '), null);
  assert.equal(n.foot('Left'), 'left');
  assert.equal(n.foot('unknown'), null);
  assert.equal(n.toInt('1500000.0'), 1500000);
  assert.equal(n.toInt(''), null);
});

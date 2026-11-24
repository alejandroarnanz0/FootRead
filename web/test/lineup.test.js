import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { indexFormations, roleFit } from '../src/lineup/formations.js';
import { assignedSlot, lineupPayload, lineupReducer as reduce, loadLineup, newLineup, proposeFormation as propose, selectedPlayerFilter } from '../src/lineup/lineupReducer.js';
import { parseBudget, summarizeBudget } from '../src/lineup/budget.js';

const keeper = { _id: 'keeper', subPosition: 'Goalkeeper', currentValue: 5 };
const winger = { _id: 'winger', subPosition: 'Left Winger', currentValue: 15 };
const striker = { _id: 'striker', subPosition: 'Centre-Forward', currentValue: 30 };
const place = (lineup, player, slotId, replace) => lineupReducer(lineup, { type: 'place', player, slotId, replace });
const seed = () => place(place(newLineup(), keeper, 'GK'), winger, 'LW');

const lines = {
  '3-1-4-2': '3/1/4/2', '3-4-1-2': '3/4/1/2', '3-4-2-1': '3/4/2/1', '3-4-3': '3/4/3', '3-5-2': '3/5/2',
  '4-1-2-1-2': '4/1/2/1/2', '4-1-2-1-2 (2)': '4/1/2/1/2', '4-1-3-2': '4/1/3/2', '4-1-4-1': '4/1/4/1',
  '4-2-1-3': '4/2/1/3', '4-2-2-2': '4/2/2/2', '4-2-3-1': '4/2/3/1', '4-2-3-1 (2)': '4/2/3/1',
  '4-2-4': '4/2/4', '4-3-1-2': '4/3/1/2', '4-3-2-1': '4/3/2/1',
  '4-3-3': '4/3/3', '4-3-3 (2)': '4/1/2/3', '4-3-3 (3)': '4/2/1/3', '4-3-3 (4)': '4/2/1/3',
  '4-4-1-1 (2)': '4/4/1/1', '4-4-2': '4/4/2', '4-4-2 (2)': '4/4/2', '4-5-1': '4/3/2/1', '4-5-1 (2)': '4/5/1',
  '5-2-1-2': '5/2/1/2', '5-2-3': '5/2/3', '5-3-2': '5/3/2', '5-4-1': '5/4/1',
};

test('all 29 formations define distinct shapes or tactical roles with eleven valid slots', () => {
  assert.deepEqual(Object.keys(formations), Object.keys(lines));
  const signatures = new Set();
  for (const { key, slots, defenders } of Object.values(formations)) {
    assert.equal(slots.length, 11);
    assert.equal(new Set(slots.map(({ id }) => id)).size, 11);
    assert.equal(new Set(slots.map(({ x, y }) => `${x},${y}`)).size, 11);
    assert.deepEqual(slots.filter(({ role }) => role === 'GK').map(({ id }) => id), ['GK']);
    assert.ok(slots.every(({ x, y, label, name, side }) => x > 0 && y > 0 && x < 100 && y < 100
      && label && name && ['left', 'center', 'right'].includes(side)));
    const rows = slots.filter((slot) => slot.line > 0)
      .reduce((result, slot) => result.set(slot.line, (result.get(slot.line) ?? 0) + 1), new Map());
    assert.equal([...rows.values()].join('/'), lines[key]);
    assert.equal(rows.get(1), defenders);
    signatures.add(slots.map(({ role, x, line }) => `${role}:${x}:${line}`).join('|'));
  }
  assert.equal(signatures.size, 29);
});

test('retains all identifiers from the three original formations', () => {
  const legacy = {
    '4-3-3': 'GK LB CB_L CB_R RB CDM CM_L CM_R LW ST RW',
    '4-4-2': 'GK LB CB_L CB_R RB LM CM_L CM_R RM ST_L ST_R',
    '3-5-2': 'GK CB_L CB CB_R LWB CDM CM_L CM_R RWB ST_L ST_R',
  };
  for (const [key, ids] of Object.entries(legacy)) {
    assert.deepEqual(new Set(formations[key].slots.map(({ id }) => id)), new Set(ids.split(' ')));
  }
});

test('adds, moves and exchanges players without duplicating them or changing their combined value', () => {
  const initial = seed();
  assert.equal(Object.keys(initial.assignments).length, 2);
  const moved = place(initial, winger, 'RW');
  assert.equal(moved.assignments.LW, undefined);
  assert.equal(assignedSlot(moved.assignments, winger._id), 'RW');
  const exchanged = place(moved, keeper, 'RW');
  assert.equal(exchanged.assignments.GK, winger);
  assert.equal(exchanged.assignments.RW, keeper);
  assert.equal(summarizeBudget(exchanged.assignments, null).subtotal, 20);
});

test('requires confirmation for replacements and cancels invalid or redundant drops', () => {
  const initial = seed();
  assert.equal(place(initial, striker, 'LW'), initial);
  assert.equal(place(initial, keeper, 'GK'), initial);
  assert.equal(place(initial, striker, 'unknown'), initial);
  const replaced = place(initial, striker, 'LW', true);
  assert.equal(replaced.assignments.LW, striker);
  assert.equal(assignedSlot(replaced.assignments, winger._id), undefined);
  const removed = lineupReducer(replaced, { type: 'remove', slotId: 'LW' });
  assert.deepEqual(removed.assignments, { GK: keeper });
  assert.deepEqual(lineupReducer(removed, { type: 'clear' }).assignments, {});
});

test('proposes a side-specific reassignment while preserving players without a destination', () => {
  const initial = place(seed(), striker, 'ST');
  const preview = proposeFormation(initial, '4-4-2');
  assert.deepEqual(preview.assignments, { GK: keeper, LM: winger });
  assert.deepEqual(preview.unresolved.map(({ player }) => player), [striker]);
  assert.equal(initial.formation, '4-3-3');
  const applied = lineupReducer(initial, { type: 'formation', proposal: {
    ...preview, assignments: { ...preview.assignments, LM: winger, ST_L: striker },
  } });
  assert.equal(applied.formation, '4-4-2');
  assert.equal(applied.assignments.LM, winger);
  assert.equal(applied.assignments.ST_L, striker);
  assert.equal(roleFit(winger, 'LM'), 'related');
  assert.equal(roleFit(winger, 'LW'), 'exact');
  assert.equal(roleFit(winger, 'RW'), 'outside');
  assert.equal(roleFit({}, 'GK'), 'unknown');
  assert.equal(proposeFormation(applied, '3-5-2').assignments.ST_L, striker);
});

test('family changes keep every player in the draft or preview and preserve the budget after manual placement', () => {
  const transitions = [
    ['4-3-3', '4-2-3-1'], ['4-4-2', '3-5-2'], ['3-5-2', '5-3-2'],
    ['4-1-2-1-2', '4-3-3'], ['5-4-1', '4-2-4'],
  ];
  const registered = {
    CB: 'Centre-Back', LB: 'Left-Back', RB: 'Right-Back', LM: 'Left Midfield', RM: 'Right Midfield',
    CM: 'Central Midfield', CDM: 'Defensive Midfield', CAM: 'Attacking Midfield', ST: 'Centre-Forward',
    LW: 'Left Winger', RW: 'Right Winger', LWB: 'Left-Back', RWB: 'Right-Back', GK: 'Goalkeeper',
  };
  for (const [from, to] of transitions) {
    const lineup = { ...newLineup(from), budgetEuros: 66 };
    for (const [index, slot] of formations[from].slots.entries()) {
      lineup.assignments[slot.id] = { _id: slot.id, subPosition: registered[slot.role], currentValue: index + 1 };
    }
    const original = structuredClone(lineup);
    const proposal = proposeFormation(lineup, to);
    assert.deepEqual(proposal, proposeFormation(lineup, to));
    assert.deepEqual(lineup, original);
    assert.equal(proposal.assignments.GK._id, 'GK');
    const all = [...Object.values(proposal.assignments), ...proposal.unresolved.map(({ player }) => player)];
    assert.equal(all.length, 11);
    assert.equal(new Set(all.map(({ _id }) => _id)).size, 11);
    const remaining = formations[to].slots.filter(({ id }) => !proposal.assignments[id]);
    for (const [index, { player }] of proposal.unresolved.entries()) {
      proposal.assignments[remaining[index].id] = player;
    }
    const next = lineupReducer(lineup, { type: 'formation', proposal });
    assert.deepEqual(summarizeBudget(next.assignments, next.budgetEuros), summarizeBudget(lineup.assignments, lineup.budgetEuros));
  }
});

test('restores persisted fields and flags catalog references that disappeared', () => {
  const lineup = loadLineup({ _id: 'id', revision: 2, name: 'Once', formation: '4-3-3', budgetEuros: 10, slots: [
    { slotId: 'GK', playerId: keeper._id, player: keeper },
    { slotId: 'ST', playerId: striker._id, player: null },
  ] });
  assert.equal(lineup.assignments.ST.unavailable, true);
  assert.deepEqual(lineupPayload(lineup), { name: 'Once', formation: '4-3-3', budgetEuros: 10, revision: 2,
    slots: [{ slotId: 'GK', playerId: keeper._id }, { slotId: 'ST', playerId: striker._id }] });
});

test('parses exact euros and rejects rounding, invalid, zero and unsafe input', () => {
  assert.equal(parseBudget('100,012001', 'millions'), 100012001);
  assert.equal(parseBudget('0,000001', 'millions'), 1);
  for (const text of ['0', '-1', 'foo', '1,23', '1e2', 'Infinity', '9007199254740992']) {
    assert.equal(parseBudget(text, 'euros'), null);
  }
  assert.equal(parseBudget('1.0000001', 'millions'), null);
});

test('prices a partial XI, reports exact and exceeded budgets, and never uses comparable values', () => {
  const { assignments } = seed();
  assert.deepEqual(summarizeBudget(assignments, null), { state: 'off', known: 2, unknown: 0, subtotal: 20 });
  assert.equal(summarizeBudget(assignments, 20).state, 'within');
  assert.equal(summarizeBudget(assignments, 20).delta, 0);
  assert.equal(summarizeBudget(assignments, 19).state, 'over');
  assert.equal(summarizeBudget({}, 20).state, 'empty');
  assert.equal(summarizeBudget(assignments, undefined).state, 'invalid');
  const mixed = { ...assignments, ST: { _id: 'unknown', currentValue: 0, predictedValue: 90 }, RW: winger };
  assert.deepEqual(summarizeBudget(mixed, 25), { state: 'partial', known: 2, unknown: 1, subtotal: 20, delta: 5, progress: 80 });
  assert.equal(summarizeBudget(mixed, 10).state, 'over');
});

test('search exclusion follows confirmed placement, moves, exchanges, replacement and removal', () => {
  const excluded = (lineup) => selectedPlayerFilter(lineup.assignments);
  const initial = seed();
  assert.equal(excluded(newLineup()), '');
  assert.equal(excluded(initial), 'keeper,winger');
  const moved = place(initial, winger, 'RW');
  assert.equal(excluded(moved), excluded(initial));
  const exchanged = place(moved, keeper, 'RW');
  assert.equal(excluded(exchanged), excluded(initial));
  assert.equal(excluded(place(exchanged, striker, 'RW')), excluded(initial));
  assert.equal(excluded(place(exchanged, striker, 'outside')), excluded(initial));
  const replacement = place(exchanged, striker, 'RW', true);
  assert.equal(excluded(replacement), 'striker,winger');
  assert.equal(excluded(lineupReducer(replacement, { type: 'remove', slotId: 'RW' })), 'winger');
  assert.equal(excluded(lineupReducer(replacement, { type: 'clear' })), '');
});

test('search exclusion changes only when a formation proposal is applied or a lineup is opened', () => {
  const saved = loadLineup({
    _id: 'saved', revision: 1, name: 'XI', formation: '4-3-3', budgetEuros: null,
    slots: [{ slotId: 'GK', playerId: keeper._id, player: keeper }, { slotId: 'ST', playerId: striker._id, player: striker }],
  });
  const opened = lineupReducer(newLineup(), { type: 'load', lineup: saved });
  const proposal = proposeFormation(opened, '4-4-2');
  assert.equal(proposal.unresolved[0].player, striker);
  assert.equal(selectedPlayerFilter(opened.assignments), 'keeper,striker');
  const applied = lineupReducer(opened, { type: 'formation', proposal });
  assert.equal(selectedPlayerFilter(applied.assignments), 'keeper');
  const copy = lineupReducer(newLineup(), { type: 'load', lineup: { ...saved, id: null, revision: null } });
  assert.equal(selectedPlayerFilter(copy.assignments), 'keeper,striker');
});
const require = createRequire(import.meta.url);
const formations = indexFormations(require('../../api/models/lineupCatalog'));
const lineupReducer = (state, action) => reduce(state, action, formations);
const proposeFormation = (state, key) => propose(state, key, formations);

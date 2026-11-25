const test = require('node:test');
const assert = require('node:assert/strict');
const { generate, band } = require('../services/games/questions');
const { star, known, recognition } = require('../services/games/recognition');
const { createState, applyAction, publicState, summary, ROUND_MS } = require('../services/games/session');

const reference = new Date('2026-11-25');
const ids = [...Object.keys(star), ...Object.keys(known)];
const players = ids.map((id, i) => ({
  _id: i, externalIds: { transfermarkt: id }, name: 'Player ' + i,
  birthDate: new Date(Date.UTC(1982 + i % 25, i % 12, 1)),
  league: 'LaLiga', position: ['GK', 'DF', 'MF', 'FW'][i % 4],
  group: '2026-06-11', season: '2025-26', value: i + 1,
}));

test('editorial recognition uses stable IDs and preserves the intended groups', () => {
  assert.ok(Object.keys(star).length >= 40);
  assert.ok(Object.keys(known).length >= 80);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(recognition(players[0]), 'star');
  assert.equal(recognition(players[Object.keys(star).length]), 'known');
  assert.equal(recognition({ externalIds: { transfermarkt: 'other' } }), 'general');
});

test('easy excludes general players, medium admits known players, and hard admits the full pool', () => {
  const starPlayer = { ...players[0], value: 100 };
  const knownPlayer = { ...players[Object.keys(star).length], value: 140 };
  const generalPlayer = { ...players[1], _id: 'general', name: 'General',
    externalIds: { transfermarkt: 'other' }, value: 110 };
  assert.deepEqual(generate('value', 'easy', [starPlayer, generalPlayer], reference, 1), []);
  assert.equal(generate('value', 'medium', [starPlayer, knownPlayer], reference, 1).length, 1);
  assert.deepEqual(generate('value', 'medium', [starPlayer, generalPlayer], reference, 1), []);
  assert.equal(generate('value', 'hard', [starPlayer, generalPlayer], reference, 1).length, 1);
});

test('market bands and date matching exclude ties and other reference dates', () => {
  assert.equal(band('value', 100, 200), 'easy');
  assert.equal(band('value', 100, 125), 'medium');
  assert.equal(band('value', 100, 124), 'hard');
  assert.equal(band('value', 100, 100), null);
  assert.deepEqual(generate('value', 'easy', [players[0], { ...players[10], group: '2001-01-01' }]), []);
  const rounds = generate('value', 'easy', players, reference);
  assert.equal(rounds.length, 10);
  assert.ok(rounds.every((q) => q.context.date === '2026-06-11' && q.options.find((o) => o.id === q.correct).fact
    === Math.max(...q.options.map((o) => o.fact))));
  assert.equal(new Set(rounds.flatMap((q) => q.options.map((o) => o.name))).size, 20);
});

test('age picks the later calendar date and rejects future or identical dates', () => {
  const [question] = generate('age', 'easy', [players[0], players[20]], reference, 1);
  assert.equal(question.options.find((o) => o.id === question.correct).name, players[20].name);
  assert.deepEqual(generate('age', 'hard', [players[0], { ...players[1], birthDate: players[0].birthDate },
    { ...players[2], birthDate: new Date('2027-01-01') }], reference, 1), []);
  assert.equal(band('age', 0, 5 * 365.25 * 86400000), 'easy');
  assert.equal(band('age', 0, 2 * 365.25 * 86400000), 'medium');
  assert.equal(band('age', 0, 365 * 86400000), 'hard');
});

test('goals require the exact league-season group and preserve the season in feedback', () => {
  const [a, b] = players;
  assert.deepEqual(generate('goals', 'hard', [a, { ...b, group: 'other-season' }], reference, 1), []);
  const [q] = generate('goals', 'hard', [a, b], reference, 1);
  assert.equal(q.difference, 1);
  assert.deepEqual(q.context, { league: 'LaLiga', season: '2025-26' });
  const old = [{ ...a, value: 0, season: '2023-24', group: 'league:2023-24' },
    { ...b, value: 6, season: '2023-24', group: 'league:2023-24' }];
  assert.deepEqual(generate('goals', 'easy', old, reference, 1), []);
  assert.equal(generate('goals', 'easy', old.map((p) => ({ ...p, season: '2024-25',
    group: 'league:2024-25' })), reference, 1).length, 1);
});

test('guess uses unique options, a shared position and a unique final birth-date clue', () => {
  const rounds = generate('guess', 'hard', players, reference, 3);
  assert.equal(rounds.length, 3);
  for (const q of rounds) {
    const options = q.options.map((option) => players.find((p) => p.name === option.name));
    assert.equal(options.length, 4);
    assert.equal(new Set(options).size, 4);
    assert.ok(options.every((p) => p.position === options.find((o, i) => q.options[i].id === q.correct).position
      && p.league === 'LaLiga'));
    const matching = q.options.filter((o, i) => options[i].birthDate.toISOString().slice(0, 10) === q.clues[3].value);
    assert.deepEqual(matching.map((o) => o.id), [q.correct]);
  }
});

test('all games and difficulties generate ten disjoint rounds from permitted recognition groups', () => {
  for (const game of ['value', 'age', 'goals', 'guess']) {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      const rounds = generate(game, difficulty, players, reference);
      assert.equal(rounds.length, 10, `${game}/${difficulty}`);
      const all = rounds.flatMap((q) => q.options);
      assert.equal(new Set(all.map((o) => o.name)).size, all.length, `${game}/${difficulty} repeats a player`);
      for (const question of rounds) {
        const selected = question.options.map((o) => players.find((p) => p.name === o.name));
        assert.ok(selected.every((p) => difficulty === 'easy' ? recognition(p) === 'star'
          : difficulty === 'medium' ? recognition(p) !== 'general' : true));
        assert.ok(question.options.some((o) => o.id === question.correct));
        if (game === 'guess') {
          const correct = selected[question.options.findIndex((o) => o.id === question.correct)];
          const samePosition = selected.filter((p) => p.position === correct.position).length;
          assert.equal(samePosition, difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 4);
          assert.equal(selected.filter((p) => p.birthDate.toISOString().slice(0, 10)
            === question.clues.at(-1).value).length, 1);
        } else {
          assert.equal(question.options.length, 2);
          assert.equal(selected[0].group, selected[1].group);
          assert.equal(band(game, game === 'age' ? +selected[0].birthDate : selected[0].value,
            game === 'age' ? +selected[1].birthDate : selected[1].value), difficulty);
          if (game === 'value') assert.equal(question.context.date, selected[0].group);
          if (game === 'goals') assert.deepEqual(question.context, { league: 'LaLiga', season: '2025-26' });
        }
      }
    }
  }
});

test('public state hides facts and future clues, and the server scores hints and retries once', () => {
  const [q] = generate('guess', 'easy', players, reference, 1);
  const state = createState('guess', 'easy', [q], 1000);
  const view = () => publicState({ _id: 'test', revision: 0, state }, 1001);
  const input = { questionId: q.id, optionId: q.correct, points: 90000, remainingMs: 90000 };
  assert.equal(view().question.clues.length, 1);
  assert.equal(view().feedback, null);
  assert.equal('correct' in view().question, false);
  assert.equal('difference' in view().question, false);
  assert.ok(view().question.options.every((o) => Object.keys(o).length === 2));
  assert.throws(() => applyAction(state, 'next', input, 2000), /still open/);
  assert.throws(() => applyAction(state, 'answer', { ...input, optionId: 'invalid' }, 2000), /Invalid option/);
  assert.equal(applyAction(state, 'hint', input, 2000), true);
  assert.equal(view().question.clues.length, 2);
  assert.equal(applyAction(state, 'answer', input, 6000), true);
  assert.equal(applyAction(state, 'answer', input, 6001), false);
  assert.equal(state.score, 110);
  assert.equal(view().feedback.correctId, q.correct);
  assert.equal(applyAction(state, 'next', input, 6500), true);
  assert.equal(summary(state).correct, 1);
});

test('a late answer is timed out, and the next deadline only starts at explicit advance', () => {
  const questions = generate('age', 'easy', players, reference, 2);
  const state = createState('age', 'hard', questions, 1000);
  const first = { questionId: questions[0].id, optionId: questions[0].correct };
  assert.equal(applyAction(state, 'timeout', first, 30999), false);
  assert.equal(applyAction(state, 'answer', first, 31000), true);
  assert.equal(state.answers[0].status, 'timeout');
  assert.equal(state.score, 0);
  assert.equal(applyAction(state, 'next', first, 50000), true);
  assert.equal(state.deadline, 50000 + ROUND_MS);
  assert.equal(applyAction(state, 'next', first, 50001), false);
});

test('REST stats require JWT and authenticated session reads are scoped by owner', async (t) => {
  const express = require('express');
  const app = express();
  const { signToken } = require('../middleware/auth');
  const model = require('../models/GameSession');
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'games-test-only-secret-with-32-characters';
  t.after(() => {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  });
  const owner = '111111111111111111111111';
  const other = '222222222222222222222222';
  const id = '333333333333333333333333';
  const session = { _id: id, revision: 0, state: createState('age', 'easy', generate('age', 'easy', players, reference, 1), Date.now()) };
  t.mock.method(model, 'findOne', (filter) => ({ lean: async () =>
    filter.owner === owner && filter._id === id ? structuredClone(session) : null }));
  const writes = t.mock.method(model, 'updateOne', async (filter, { $set }) => {
    if (filter.revision !== session.revision) return { modifiedCount: 0 };
    Object.assign(session, $set);
    return { modifiedCount: 1 };
  });
  const stats = t.mock.method(model, 'aggregate', async () => [{ totals: [], recent: [] }]);
  app.use(express.json());
  app.use('/games', require('../routes/games'));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const read = (path, userId) => fetch('http://127.0.0.1:' + server.address().port + '/games' + path, {
    headers: userId ? { Authorization: 'Bearer ' + signToken({ _id: userId }) } : {},
  });
  assert.equal((await read('/stats')).status, 401);
  assert.equal(stats.mock.callCount(), 0);
  assert.equal((await read('/stats', owner)).status, 200);
  assert.equal(String(stats.mock.calls[0].arguments[0][0].$match.owner), owner);
  assert.equal((await read('/sessions/' + id, other)).status, 404);
  assert.equal((await read('/sessions/' + id, owner)).status, 200);
  const question = session.state.questions[0];
  const act = (action, revision, userId = owner) => fetch(
    'http://127.0.0.1:' + server.address().port + '/games/sessions/' + id + '/actions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + signToken({ _id: userId }), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, revision, questionId: question.id, optionId: question.correct, score: 100000 }),
    },
  );
  assert.equal((await act('answer', 0, other)).status, 404);
  await Promise.all([act('answer', 0), act('answer', 0)]);
  assert.equal(session.state.answers.length, 1);
  assert.ok(session.state.score >= 100 && session.state.score <= 130);
  assert.ok(writes.mock.calls.every((call) => call.arguments[0].owner === owner));
  const result = await (await act('next', 1)).json();
  assert.equal(result.summary.correct, 1);
  assert.equal(session.expiresAt, null);
});

test('guest and persisted sessions cancel idempotently without entering completed stats', async () => {
  const { connectTestDb, mongoose } = require('./helpers/testDb');
  const Player = require('../models/Player');
  const Valuation = require('../models/Valuation');
  const GameSession = require('../models/GameSession');
  const { signToken } = require('../middleware/auth');
  const express = require('express');
  await connectTestDb();
  assert.match(mongoose.connection.name, /_test$/);
  const owner = new mongoose.Types.ObjectId().toString();
  const stranger = new mongoose.Types.ObjectId().toString();
  const fixture = new mongoose.Types.ObjectId().toString();
  const playerIds = [];
  const sessionIds = [];
  const app = express();
  app.use(express.json());
  app.use('/games', require('../routes/games'));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const request = async (method, route, body, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/games${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  };
  try {
    const playersToCreate = Array.from({ length: 20 }, (_, i) => ({
      _id: new mongoose.Types.ObjectId(), name: `Cancellation fixture ${fixture} ${i}`,
      position: 'FW', lastSeason: 2025,
      birthDate: new Date(Date.UTC(1995, 0, 1 + i * 10)),
      externalIds: { transfermarkt: `games-cancel-${fixture}-${i}` },
    }));
    playerIds.push(...playersToCreate.map((player) => player._id));
    const docs = await Player.insertMany(playersToCreate);
    await Valuation.insertMany(docs.map((doc, i) => ({ player: doc._id,
      date: new Date('2026-05-01'), value: 10000000 + i * 100000 })));

    const guest = await request('POST', '/sessions', { game: 'age', difficulty: 'hard' });
    assert.equal(guest.status, 201);
    const guestPath = `/sessions/${guest.data.id}`;
    const guestHeaders = { 'X-Game-Token': guest.data.guestToken };
    assert.equal((await request('POST', guestPath + '/cancel', {},
      { 'X-Game-Token': '0'.repeat(64) })).status, 404);
    assert.equal((await request('POST', guestPath + '/cancel', {}, guestHeaders)).status, 204);
    assert.equal((await request('POST', guestPath + '/cancel', {}, guestHeaders)).status, 204);
    assert.equal((await request('GET', guestPath, undefined, guestHeaders)).status, 404);
    assert.equal((await request('POST', guestPath + '/actions', { action: 'answer', revision: 0,
      questionId: guest.data.question.id, optionId: guest.data.question.options[0].id }, guestHeaders)).status, 404);
    const nextGame = await request('POST', '/sessions', { game: 'value', difficulty: 'hard' });
    assert.equal(nextGame.status, 201);
    assert.notEqual(nextGame.data.id, guest.data.id);
    assert.equal((await request('POST', `/sessions/${nextGame.data.id}/cancel`, {},
      { 'X-Game-Token': nextGame.data.guestToken })).status, 204);
    const advanced = await request('POST', '/sessions', { game: 'age', difficulty: 'hard' });
    assert.equal(advanced.status, 201);
    const advancedHeaders = { 'X-Game-Token': advanced.data.guestToken };
    let current = advanced.data;
    for (let i = 0; i < 4; i++) {
      const path = `/sessions/${current.id}/actions`;
      const answered = await request('POST', path, { action: 'answer', revision: current.revision,
        questionId: current.question.id, optionId: current.question.options[0].id }, advancedHeaders);
      assert.equal(answered.status, 200);
      const next = await request('POST', path, { action: 'next', revision: answered.data.revision,
        questionId: answered.data.question.id }, advancedHeaders);
      assert.equal(next.status, 200);
      current = next.data;
    }
    assert.equal(current.index, 4);
    const fifth = await request('POST', `/sessions/${current.id}/actions`, { action: 'answer',
      revision: current.revision, questionId: current.question.id,
      optionId: current.question.options[0].id }, advancedHeaders);
    assert.equal(fifth.status, 200);
    assert.ok(fifth.data.feedback);
    assert.equal((await request('POST', `/sessions/${current.id}/cancel`, {}, advancedHeaders)).status, 204);
    const restarted = await request('POST', '/sessions', { game: 'age', difficulty: 'hard' });
    assert.equal(restarted.status, 201);
    assert.notEqual(restarted.data.id, current.id);
    assert.equal(restarted.data.index, 0);
    assert.equal(restarted.data.score, 0);
    assert.ok(restarted.data.deadline - restarted.data.serverNow <= ROUND_MS);
    assert.ok(restarted.data.deadline - restarted.data.serverNow > ROUND_MS - 2000);
    const restored = await request('GET', `/sessions/${restarted.data.id}`, undefined,
      { 'X-Game-Token': restarted.data.guestToken });
    assert.equal(restored.status, 200);
    assert.equal(restored.data.id, restarted.data.id);
    assert.equal(restored.data.deadline, restarted.data.deadline);
    assert.equal((await request('POST', `/sessions/${restarted.data.id}/cancel`, {},
      { 'X-Game-Token': restarted.data.guestToken })).status, 204);

    const auth = { Authorization: 'Bearer ' + signToken({ _id: owner }) };
    const other = { Authorization: 'Bearer ' + signToken({ _id: stranger }) };
    const saved = await request('POST', '/sessions', { game: 'age', difficulty: 'hard' }, auth);
    assert.equal(saved.status, 201);
    sessionIds.push(saved.data.id);
    const savedPath = `/sessions/${saved.data.id}`;
    assert.equal((await request('POST', savedPath + '/cancel', {}, other)).status, 404);
    const stored = await GameSession.findById(saved.data.id).lean();
    const answer = { action: 'answer', revision: 0, questionId: stored.state.questions[0].id,
      optionId: stored.state.questions[0].correct };
    const [cancelResponse, answerResponse] = await Promise.all([
      request('POST', savedPath + '/cancel', {}, auth),
      request('POST', savedPath + '/actions', answer, auth),
    ]);
    assert.equal(cancelResponse.status, 204);
    assert.ok([200, 404].includes(answerResponse.status));
    assert.equal((await request('POST', savedPath + '/cancel', {}, auth)).status, 204);
    assert.equal((await request('POST', savedPath + '/actions', answer, auth)).status, 404);
    assert.equal((await request('GET', savedPath, undefined, auth)).status, 404);
    const cancelled = await GameSession.findById(saved.data.id).lean();
    assert.ok(cancelled.cancelledAt instanceof Date);
    assert.equal(cancelled.finishedAt, undefined);
    const stats = await request('GET', '/stats', undefined, auth);
    assert.equal(stats.status, 200);
    assert.deepEqual(stats.data.totals, []);
    assert.deepEqual(stats.data.recent, []);
    const restartedAuth = await request('POST', '/sessions', { game: 'age', difficulty: 'hard' }, auth);
    assert.equal(restartedAuth.status, 201);
    sessionIds.push(restartedAuth.data.id);
    assert.notEqual(restartedAuth.data.id, saved.data.id);
    assert.equal(restartedAuth.data.index, 0);
    assert.equal(restartedAuth.data.score, 0);
    assert.equal((await request('GET', `/sessions/${restartedAuth.data.id}`, undefined, auth)).data.id,
      restartedAuth.data.id);
    assert.equal((await request('POST', `/sessions/${restartedAuth.data.id}/cancel`, {}, auth)).status, 204);
    const expiredState = createState('age', 'easy', generate('age', 'easy', players, reference, 1), Date.now());
    expiredState.deadline = Date.now() - 1000;
    const expired = await GameSession.create({ owner, revision: 0, state: expiredState,
      expiresAt: new Date(Date.now() + 60000) });
    sessionIds.push(expired._id);
    assert.equal((await request('POST', `/sessions/${expired._id}/cancel`, {}, auth)).status, 204);
    assert.equal((await request('GET', '/stats', undefined, auth)).data.totals.length, 0);

    const finishedState = createState('age', 'easy', generate('age', 'easy', players, reference, 1), Date.now());
    finishedState.finishedAt = Date.now();
    finishedState.correct = 0;
    const completed = await GameSession.create({ owner, revision: 1, state: finishedState,
      finishedAt: new Date(finishedState.finishedAt), expiresAt: null });
    sessionIds.push(completed._id);
    assert.equal((await request('POST', `/sessions/${completed._id}/cancel`, {}, auth)).status, 409);
    assert.equal((await request('GET', '/stats', undefined, auth)).data.totals[0].games, 1);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await GameSession.deleteMany({ _id: { $in: sessionIds } });
    await Valuation.deleteMany({ player: { $in: playerIds } });
    await Player.deleteMany({ _id: { $in: playerIds } });
    await mongoose.disconnect();
  }
});

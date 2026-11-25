const express = require('express');
const { randomBytes, createHash } = require('node:crypto');
const GameSession = require('../models/GameSession');
const { requireAuth } = require('../middleware/auth');
const httpError = require('../utils/httpError');
const asyncHandler = require('../utils/asyncHandler');
const { games, difficulties, getPool, generate } = require('../services/games/questions');
const { ROUND_MS, SESSION_MS, createState, applyAction, summary, publicState } = require('../services/games/session');

const router = express.Router();
const guestSessions = new Map();
const guestBudgets = new Map();
const signedInBudgets = new Map();
const tokenHash = (value) => createHash('sha256').update(value).digest('hex');
const sessionId = () => randomBytes(12).toString('hex');
const optionalAuth = (req, res, next) => req.get('authorization') ? requireAuth(req, res, next) : next();
const view = (req, session) => ({ ...publicState(session, Date.now()), serverReceivedAt: req.gamesReceivedAt });

function limitStarts(req, now) {
  const budgets = req.user ? signedInBudgets : guestBudgets;
  for (const [key, value] of budgets) if (value.until <= now) budgets.delete(key);
  const key = req.user?.id ?? req.ip;
  if (!budgets.has(key) && budgets.size >= 2000) throw httpError(429, 'Too many game requests');
  const budget = budgets.get(key) ?? { count: 0, until: now + 60000 };
  if (budget.count >= (req.user ? 12 : 6)) throw httpError(429, 'Too many game starts');
  budget.count++;
  budgets.set(key, budget);
}

router.use((req, res, next) => {
  req.gamesReceivedAt = Date.now();
  res.set('Cache-Control', 'no-store');
  next();
});
router.get('/catalog', (req, res) => res.json({ games, difficulties, rounds: 10, roundMs: ROUND_MS }));

router.get('/stats', requireAuth, asyncHandler(async (req, res) => {
  const owner = GameSession.schema.path('owner').cast(req.user.id);
  const results = await GameSession.aggregate([
    { $match: { owner, finishedAt: { $type: 'date' } } },
    { $facet: {
      totals: [{ $group: { _id: '$state.game', games: { $sum: 1 }, best: { $max: '$state.score' },
        correct: { $sum: '$state.correct' } } }],
      recent: [{ $sort: { finishedAt: -1 } }, { $limit: 20 }, { $project: { state: 1 } }],
    } },
  ]);
  const { totals, recent } = results[0];
  res.json({ totals: totals.map(({ _id, games, best, correct }) => ({ game: _id, games, best,
    accuracy: Math.round(100 * correct / (games * 10)) })),
  recent: recent.map(({ _id, state }) => ({ id: String(_id), ...summary(state) })) });
}));

router.post('/sessions', optionalAuth, asyncHandler(async (req, res) => {
  const { game, difficulty } = req.body ?? {};
  if (!games.includes(game) || !difficulties.includes(difficulty)) throw httpError(400, 'Invalid game settings');
  limitStarts(req, Date.now());
  const questions = generate(game, difficulty, await getPool(game));
  if (questions.length !== 10) throw httpError(503, 'Not enough eligible questions');
  const now = Date.now();
  const session = { _id: sessionId(), revision: 0, state: createState(game, difficulty, questions, now),
    expiresAt: new Date(now + SESSION_MS) };
  let guestToken;
  if (req.user) {
    await GameSession.create({ ...session, owner: req.user.id });
  } else {
    for (const [id, entry] of guestSessions) if (+entry.expiresAt <= now) guestSessions.delete(id);
    if (guestSessions.size >= 1000) throw httpError(429, 'Guest capacity exceeded');
    guestToken = randomBytes(32).toString('hex');
    guestSessions.set(session._id, { ...session, guestHash: tokenHash(guestToken) });
  }
  res.status(201).json({ ...view(req, session), guestToken });
}));

function scope(req) {
  if (!/^[a-f0-9]{24}$/.test(req.params.id)) throw httpError(404, 'Game session not found');
  return { _id: req.params.id, owner: req.user?.id };
}

async function readSession(req, filter, { allowCancelled = false } = {}) {
  const token = req.get('X-Game-Token');
  const session = token ? guestSessions.get(filter._id)
    : filter.owner ? await GameSession.findOne(filter).lean() : null;
  if (!session || (token && (!/^[a-f0-9]{64}$/.test(token) || tokenHash(token) !== session.guestHash))
    || (session.expiresAt && +session.expiresAt <= Date.now())
    || (session.cancelledAt && !allowCancelled)) throw httpError(404, 'Game session not found');
  return session;
}

router.get('/sessions/:id', optionalAuth, asyncHandler(async (req, res) => {
  res.json(view(req, await readSession(req, scope(req))));
}));

router.post('/sessions/:id/cancel', optionalAuth, asyncHandler(async (req, res) => {
  const filter = scope(req);
  const session = await readSession(req, filter, { allowCancelled: true });
  if (session.cancelledAt) return res.status(204).end();
  if (session.finishedAt || session.state.finishedAt) throw httpError(409, 'Completed game cannot be cancelled');

  if (session.guestHash) {
    const latest = guestSessions.get(filter._id);
    if (!latest || latest.guestHash !== session.guestHash) throw httpError(404, 'Game session not found');
    if (latest.cancelledAt) return res.status(204).end();
    if (latest.state.finishedAt) throw httpError(409, 'Completed game cannot be cancelled');
    guestSessions.set(filter._id, { ...latest, cancelledAt: new Date(), revision: latest.revision + 1 });
    return res.status(204).end();
  }

  const now = new Date();
  const result = await GameSession.updateOne({ ...filter, cancelledAt: null, finishedAt: null,
    expiresAt: { $gt: now } }, { $set: { cancelledAt: now }, $inc: { revision: 1 } });
  if (result.modifiedCount) return res.status(204).end();
  const latest = await readSession(req, filter, { allowCancelled: true });
  if (latest.cancelledAt) return res.status(204).end();
  if (latest.finishedAt || latest.state.finishedAt) throw httpError(409, 'Completed game cannot be cancelled');
  throw httpError(409, 'Game session changed; retry cancellation');
}));

router.post('/sessions/:id/actions', optionalAuth, asyncHandler(async (req, res) => {
  const { action, revision, questionId, optionId } = req.body ?? {};
  if (!['answer', 'timeout', 'hint', 'next'].includes(action) || !Number.isSafeInteger(revision)
      || revision < 0 || typeof questionId !== 'string' || questionId.length !== 36)
    throw httpError(400, 'Invalid game action');
  const filter = scope(req);
  const original = await readSession(req, filter);
  const session = { ...original, state: structuredClone(original.state) };
  const now = Date.now();
  if (revision !== session.revision || !applyAction(session.state, action, { questionId, optionId }, now))
    return res.json(view(req, original));

  session.revision++;
  if (original.guestHash) {
    const latest = guestSessions.get(filter._id);
    if (latest !== original) return res.json(view(req, latest));
    guestSessions.set(filter._id, session);
  } else {
    const { state } = session;
    const updates = { revision: session.revision, state };
    if (state.finishedAt) {
      state.correct = summary(state).correct;
      updates.finishedAt = new Date(state.finishedAt);
      updates.expiresAt = null;
    }
    const result = await GameSession.updateOne({ ...filter, revision, cancelledAt: null,
      expiresAt: { $gt: new Date(now) } }, { $set: updates });
    if (!result.modifiedCount) return res.json(view(req, await readSession(req, filter)));
  }
  return res.json(view(req, session));
}));

module.exports = router;

// Replayable matches and their live events (CLAUDE.md 14.3).
const express = require('express');

const Match = require('../models/Match');
const MatchEvent = require('../models/MatchEvent');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { parseFilters, pageResponse } = require('../middleware/filters');
const { toMatchEvent, toRawShot } = require('../utils/statsbombEvent');
const { predictXg } = require('../utils/mlClient');

const router = express.Router();

const SHOOTOUT = 5;
const LIST_SELECT = 'matchId competition season matchDate homeTeam awayTeam';

router.param(
  'matchId',
  asyncHandler(async (req, res, next, matchId) => {
    const match = await Match.findOne({ matchId }).select('-__v -_id').lean();
    if (!match) throw httpError(404, 'Match not found');
    req.match = match;
    next();
  })
);

// Matches that can be replayed (their events file is loaded).
router.get(
  '/',
  parseFilters,
  asyncHandler(async (req, res) => {
    const f = req.filters;
    const filter = { available: true };
    const [data, total] = await Promise.all([
      Match.find(filter).select(LIST_SELECT).sort({ matchDate: -1, matchId: 1 }).skip(f.skip).limit(f.limit).lean(),
      Match.countDocuments(filter),
    ]);
    // The replay file flag does not indicate whether a replay has recorded events.
    const counts = data.length ? await MatchEvent.aggregate([
      { $match: { matchId: { $in: data.map((match) => match.matchId) } } },
      { $group: { _id: '$matchId', count: { $sum: 1 } } },
    ]) : [];
    const byMatch = new Map(counts.map(({ _id, count }) => [_id, count]));
    const catalog = data.map((match) => ({ ...match, eventCount: byMatch.get(match.matchId) ?? 0 }));
    res.json(pageResponse(catalog, total, f));
  })
);

router.get('/:matchId', (req, res) => res.json(req.match));

// xG of a shot from the ML service. Never blocks ingestion: any failure -> null.
async function xgFor(raw) {
  try {
    const { xg } = await predictXg(toRawShot(raw));
    return typeof xg === 'number' ? xg : null;
  } catch (err) {
    console.warn(`xG unavailable for event ${raw.index}: ${err.message}`);
    return null;
  }
}

router
  .route('/:matchId/events')
  // Events so far, in order. ?after=<sequence> for only the newer ones;
  // ?raw=true to include the original StatsBomb event.
  .get(
    asyncHandler(async (req, res) => {
      const filter = { matchId: req.match.matchId };
      if (req.query.after !== undefined) {
        const after = Number(req.query.after);
        if (!Number.isInteger(after)) throw httpError(400, 'after must be an integer sequence');
        filter.sequence = { $gt: after };
      }
      const select = req.query.raw === 'true' ? '-__v' : '-__v -raw';
      const data = await MatchEvent.find(filter).select(select).sort({ sequence: 1 }).lean();
      res.json({ data, total: data.length });
    })
  )
  // Receives one raw StatsBomb event. 201 when new, 200 when it was already
  // stored (idempotent by sequence; its xG is not recomputed).
  .post(
    asyncHandler(async (req, res) => {
      const event = toMatchEvent(req.body, req.match.matchId);
      const key = { matchId: event.matchId, sequence: event.sequence };
      const existing = await MatchEvent.findOne(key).select('-__v -raw').lean();
      if (existing) return res.status(200).json(existing);

      if (event.type === 'Shot') event.xg = await xgFor(req.body);
      try {
        const created = await MatchEvent.create(event);
        const { raw, __v, ...out } = created.toObject();
        return res.status(201).json(out);
      } catch (err) {
        if (err.code !== 11000) throw err;
        // Same event sent twice at once: the other request stored it first.
        return res.status(200).json(await MatchEvent.findOne(key).select('-__v -raw').lean());
      }
    })
  )
  // Clears the match before replaying it again.
  .delete(
    asyncHandler(async (req, res) => {
      await MatchEvent.deleteMany({ matchId: req.match.matchId });
      res.status(204).end();
    })
  );

// Score and accumulated xG per team, computed in the aggregation pipeline.
// Rules (CLAUDE.md 14.3): own goals count ("Own Goal For" goes to the team
// that benefits); the penalty shoot-out (period 5) counts in neither the score
// nor the xG, and is reported apart.
router.get(
  '/:matchId/state',
  asyncHandler(async (req, res) => {
    const { matchId, homeTeam, awayTeam } = req.match;
    const isGoalExpr = {
      $or: [{ $and: [{ $eq: ['$type', 'Shot'] }, '$isGoal'] }, { $eq: ['$type', 'Own Goal For'] }],
    };
    const [byTeam, last] = await Promise.all([
      MatchEvent.aggregate([
        { $match: { matchId } },
        {
          $group: {
            _id: { team: '$team', shootout: { $eq: ['$period', SHOOTOUT] } },
            goals: { $sum: { $cond: [isGoalExpr, 1, 0] } },
            xg: { $sum: { $cond: [{ $eq: ['$type', 'Shot'] }, { $ifNull: ['$xg', 0] }, 0] } },
            xgStatsbomb: { $sum: { $cond: [{ $eq: ['$type', 'Shot'] }, { $ifNull: ['$xgStatsbomb', 0] }, 0] } },
            shots: { $sum: { $cond: [{ $eq: ['$type', 'Shot'] }, 1, 0] } },
            shotsWithoutXg: {
              $sum: { $cond: [{ $and: [{ $eq: ['$type', 'Shot'] }, { $eq: [{ $ifNull: ['$xg', null] }, null] }] }, 1, 0] },
            },
          },
        },
      ]),
      MatchEvent.findOne({ matchId }).sort({ sequence: -1 }).select('minute second period').lean(),
    ]);

    const side = (team) => (team === homeTeam ? 'home' : team === awayTeam ? 'away' : null);
    const zero = () => ({ home: 0, away: 0 });
    const state = {
      matchId,
      homeTeam,
      awayTeam,
      score: zero(),
      xgAccumulated: zero(),
      xgStatsbombAccumulated: zero(),
      shots: zero(),
      shotsWithoutXg: 0,
      shootout: null,
      minute: last ? last.minute : 0,
      second: last ? last.second || 0 : 0,
      period: last ? last.period : null,
    };
    for (const row of byTeam) {
      const s = side(row._id.team);
      if (!s) continue;
      if (row._id.shootout) {
        state.shootout = state.shootout || zero();
        state.shootout[s] += row.goals;
        continue;
      }
      state.score[s] += row.goals;
      state.xgAccumulated[s] = Math.round((state.xgAccumulated[s] + row.xg) * 1000) / 1000;
      state.xgStatsbombAccumulated[s] = Math.round((state.xgStatsbombAccumulated[s] + row.xgStatsbomb) * 1000) / 1000;
      state.shots[s] += row.shots;
      state.shotsWithoutXg += row.shotsWithoutXg;
    }
    res.json(state);
  })
);

module.exports = router;

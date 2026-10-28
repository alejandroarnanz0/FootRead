const express = require('express');

const Player = require('../models/Player');
const Valuation = require('../models/Valuation');
const SeasonStat = require('../models/SeasonStat');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const pick = require('../utils/pick');
const { parseFilters, buildSort, buildPlayerFilter, pageResponse } = require('../middleware/filters');
const valuationsRouter = require('./valuations');
const statsRouter = require('./stats');

// Mounted twice: under .../clubs/:clubId/players and /api/players.
const router = express.Router({ mergeParams: true });

// The club is never read from the body, and predictedValue is written only by
// the offline scoring job, so neither is here.
const FIELDS = [
  'name',
  'birthDate',
  'position',
  'foot',
  'heightCm',
  'currentValue',
  'contractUntil',
  'externalIds',
];
const LIST_SELECT =
  'name position foot heightCm birthDate club currentValue predictedValue contractUntil';
const SORT_FIELDS = ['name', 'position', 'birthDate', 'currentValue', 'predictedValue'];

// Creating a player needs the club of the URL (req.club).
const requireClub = (req, res, next) => (req.club ? next() : next(httpError(404, 'Not found')));

// Loads the player once per request and checks it belongs to the club in the
// URL, when there is one.
router.param(
  'playerId',
  asyncHandler(async (req, res, next, id) => {
    const player = await Player.findById(id).select('-__v').lean();
    if (!player) throw httpError(404, 'Player not found');
    if (req.club && !(player.club && player.club.equals(req.club._id))) {
      throw httpError(404, 'Player not found in this club');
    }
    req.player = player;
    next();
  })
);

router
  .route('/')
  // Under a club: that club's players. At /api/players: players of every club
  // (what the dashboard explorer filters).
  .get(
    parseFilters,
    asyncHandler(async (req, res) => {
      const f = req.filters;
      const match = await buildPlayerFilter(f, req.club ? { club: req.club._id } : {});
      const [data, total] = await Promise.all([
        Player.find(match)
          .select(LIST_SELECT)
          .sort(buildSort(f.sort, SORT_FIELDS, ['name']))
          .skip(f.skip)
          .limit(f.limit)
          .lean(),
        Player.countDocuments(match),
      ]);
      res.json(pageResponse(data, total, f));
    })
  )
  .post(
    requireClub,
    asyncHandler(async (req, res) => {
      const player = await Player.create({ ...pick(req.body, FIELDS), club: req.club._id });
      res.status(201).json(player.toObject({ versionKey: false }));
    })
  );

router
  .route('/:playerId')
  .get((req, res) => {
    res.json(req.player);
  })
  .put(
    asyncHandler(async (req, res) => {
      const data = pick(req.body, FIELDS);
      if (Object.keys(data).length === 0) throw httpError(400, 'No valid fields to update');
      const updated = await Player.findByIdAndUpdate(
        req.player._id,
        { $set: data },
        { new: true, runValidators: true }
      )
        .select('-__v')
        .lean();
      if (!updated) throw httpError(404, 'Player not found');
      res.json(updated);
    })
  )
  .delete(
    asyncHandler(async (req, res) => {
      // Valuations and stats mean nothing without the player.
      await Promise.all([
        Valuation.deleteMany({ player: req.player._id }),
        SeasonStat.deleteMany({ player: req.player._id }),
      ]);
      await Player.deleteOne({ _id: req.player._id });
      res.status(204).end();
    })
  );

router.use('/:playerId/valuations', valuationsRouter);
router.use('/:playerId/stats', statsRouter);

module.exports = router;

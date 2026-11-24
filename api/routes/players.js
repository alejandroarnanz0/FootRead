const express = require('express');

const Player = require('../models/Player');
const Valuation = require('../models/Valuation');
const SeasonStat = require('../models/SeasonStat');
const Club = require('../models/Club');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const pick = require('../utils/pick');
const playerNameSearch = require('../utils/playerNameSearch');
const { parseFilters, buildSort, buildPlayerFilter, pageResponse } = require('../middleware/filters');
const valuationsRouter = require('./valuations');
const statsRouter = require('./stats');
const comparablesRouter = require('./comparables');

// Mounted twice: under .../clubs/:clubId/players and /api/players.
const router = express.Router({ mergeParams: true });

// The club is never read from the body, and predictedValue is written only by
// the offline scoring job, so neither is here.
const FIELDS = [
  'name',
  'birthDate',
  'position',
  'subPosition',
  'foot',
  'heightCm',
  'currentValue',
  'contractUntil',
  'lastSeason',
  'externalIds',
];
const LIST_SELECT =
  'name position subPosition foot heightCm birthDate club currentValue predictedValue contractUntil lastSeason externalIds.transfermarkt';
const SORT_FIELDS = ['name', 'position', 'birthDate', 'currentValue', 'predictedValue'];

async function applyCatalogFilters(match, { clubId, subPosition, minValue, excludeIds }, maxValue) {
  if (excludeIds !== undefined && excludeIds !== '') {
    if (typeof excludeIds !== 'string' || excludeIds.length > 274) throw httpError(400, 'Invalid excludeIds');
    const ids = excludeIds.split(',');
    if (ids.length > 11 || ids.some((id) => !/^[a-f0-9]{24}$/i.test(id))) throw httpError(400, 'Invalid excludeIds');
    match._id = { $nin: ids };
  }
  if (clubId !== undefined) {
    if (typeof clubId !== 'string' || !/^[a-f0-9]{24}$/i.test(clubId)) throw httpError(400, 'Invalid clubId');
    const club = await Club.findById(clubId).select('_id').lean();
    const scope = match.club;
    const compatible = !scope || (scope.$in ?? [scope]).some((id) => String(id) === String(club?._id));
    match.club = club && compatible ? club._id : { $in: [] };
  }
  if (subPosition !== undefined) {
    if (typeof subPosition !== 'string' || subPosition.length > 300) throw httpError(400, 'Invalid subPosition');
    const positions = subPosition.split(',').map((value) => value.trim());
    if (positions.length > 13 || positions.some((value) => !/^[A-Za-z -]{1,40}$/.test(value))) {
      throw httpError(400, 'Invalid subPosition');
    }
    match.subPosition = { $in: positions };
  }
  if (minValue !== undefined) {
    const amount = Number(minValue);
    if (typeof minValue !== 'string' || !/^\d+$/.test(minValue) || !Number.isSafeInteger(amount)
      || (maxValue !== undefined && amount > maxValue)) throw httpError(400, 'Invalid minValue');
    match.currentValue = { ...match.currentValue, $gte: amount };
  }
}

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
      const name = playerNameSearch(req.query.q);
      const match = await buildPlayerFilter(f, req.club ? { club: req.club._id } : {});
      await applyCatalogFilters(match, req.query, f.maxValue);
      if (name) match.name = name;
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
router.use('/:playerId/comparables', comparablesRouter);

module.exports = router;

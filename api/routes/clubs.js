const express = require('express');

const Club = require('../models/Club');
const Player = require('../models/Player');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const pick = require('../utils/pick');
const { parseFilters, buildSort, buildClubFilter, pageResponse } = require('../middleware/filters');
const playersRouter = require('./players');

// Mounted twice: under /api/competitions/:competitionId/clubs and /api/clubs.
const router = express.Router({ mergeParams: true });

// The competition is never read from the body, so `competition` is not here.
const FIELDS = ['name', 'country', 'externalIds'];
const LIST_SELECT = 'name country competition externalIds';
const SORT_FIELDS = ['name', 'country'];

// Creating a club needs the competition of the URL (req.competition).
const requireCompetition = (req, res, next) =>
  req.competition ? next() : next(httpError(404, 'Not found'));

// Loads the club once per request and checks it belongs to the competition in
// the URL, when there is one.
router.param(
  'clubId',
  asyncHandler(async (req, res, next, id) => {
    const club = await Club.findById(id).select('-__v').lean();
    if (!club) throw httpError(404, 'Club not found');
    if (req.competition && !club.competition.equals(req.competition._id)) {
      throw httpError(404, 'Club not found in this competition');
    }
    req.club = club;
    next();
  })
);

router
  .route('/')
  // Under a competition: its clubs. At /api/clubs: clubs of every competition.
  .get(
    parseFilters,
    asyncHandler(async (req, res) => {
      const f = req.filters;
      const match = await buildClubFilter(f, req.competition ? { competition: req.competition._id } : {});
      const [data, total] = await Promise.all([
        Club.find(match)
          .select(LIST_SELECT)
          .sort(buildSort(f.sort, SORT_FIELDS, ['name']))
          .skip(f.skip)
          .limit(f.limit)
          .lean(),
        Club.countDocuments(match),
      ]);
      res.json(pageResponse(data, total, f));
    })
  )
  .post(
    requireCompetition,
    asyncHandler(async (req, res) => {
      const club = await Club.create({
        ...pick(req.body, FIELDS),
        competition: req.competition._id,
      });
      res.status(201).json(club.toObject({ versionKey: false }));
    })
  );

router
  .route('/:clubId')
  .get((req, res) => {
    res.json(req.club);
  })
  .put(
    asyncHandler(async (req, res) => {
      const data = pick(req.body, FIELDS);
      if (Object.keys(data).length === 0) throw httpError(400, 'No valid fields to update');
      const updated = await Club.findByIdAndUpdate(
        req.club._id,
        { $set: data },
        { new: true, runValidators: true }
      )
        .select('-__v')
        .lean();
      if (!updated) throw httpError(404, 'Club not found');
      res.json(updated);
    })
  )
  .delete(
    asyncHandler(async (req, res) => {
      if (await Player.exists({ club: req.club._id })) {
        throw httpError(409, 'Club still has players');
      }
      await Club.deleteOne({ _id: req.club._id });
      res.status(204).end();
    })
  );

router.use('/:clubId/players', playersRouter);

module.exports = router;

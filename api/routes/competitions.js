const express = require('express');

const Competition = require('../models/Competition');
const Club = require('../models/Club');
const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const pick = require('../utils/pick');
const { parseFilters, buildSort, pageResponse } = require('../middleware/filters');
const clubsRouter = require('./clubs');

const router = express.Router();

const FIELDS = ['code', 'name', 'country', 'tier'];
const LIST_SELECT = 'code name country tier';
const SORT_FIELDS = ['code', 'name', 'tier'];

// Loads the competition once per request; every route below sees req.competition.
router.param(
  'competitionId',
  asyncHandler(async (req, res, next, id) => {
    const competition = await Competition.findById(id).select('-__v').lean();
    if (!competition) throw httpError(404, 'Competition not found');
    req.competition = competition;
    next();
  })
);

router
  .route('/')
  .get(
    parseFilters,
    asyncHandler(async (req, res) => {
      const f = req.filters;
      const [data, total] = await Promise.all([
        Competition.find()
          .select(LIST_SELECT)
          .sort(buildSort(f.sort, SORT_FIELDS, ['code']))
          .skip(f.skip)
          .limit(f.limit)
          .lean(),
        Competition.countDocuments(),
      ]);
      res.json(pageResponse(data, total, f));
    })
  )
  .post(
    asyncHandler(async (req, res) => {
      const competition = await Competition.create(pick(req.body, FIELDS));
      res.status(201).json(competition.toObject({ versionKey: false }));
    })
  );

router
  .route('/:competitionId')
  .get((req, res) => {
    res.json(req.competition);
  })
  .put(
    asyncHandler(async (req, res) => {
      const data = pick(req.body, FIELDS);
      if (Object.keys(data).length === 0) throw httpError(400, 'No valid fields to update');
      const updated = await Competition.findByIdAndUpdate(
        req.competition._id,
        { $set: data },
        { new: true, runValidators: true }
      )
        .select('-__v')
        .lean();
      if (!updated) throw httpError(404, 'Competition not found');
      res.json(updated);
    })
  )
  .delete(
    asyncHandler(async (req, res) => {
      if (await Club.exists({ competition: req.competition._id })) {
        throw httpError(409, 'Competition still has clubs');
      }
      await Competition.deleteOne({ _id: req.competition._id });
      res.status(204).end();
    })
  );

router.use('/:competitionId/clubs', clubsRouter);

module.exports = router;

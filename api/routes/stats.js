const express = require('express');

const SeasonStat = require('../models/SeasonStat');
const asyncHandler = require('../utils/asyncHandler');
const { parseFilters, buildSort, pageResponse } = require('../middleware/filters');

// Only mounted under /players/:playerId, which loads req.player.
const router = express.Router({ mergeParams: true });

const SELECT = 'season competition minutes goals assists shots passesCompleted tackles -_id';
const SORT_FIELDS = ['season', 'minutes', 'goals', 'assists'];

router.get(
  '/',
  parseFilters,
  asyncHandler(async (req, res) => {
    const f = req.filters;
    const match = { player: req.player._id };
    const [data, total] = await Promise.all([
      SeasonStat.find(match)
        .select(SELECT)
        .populate('competition', 'code name -_id')
        .sort(buildSort(f.sort, SORT_FIELDS, ['season']))
        .skip(f.skip)
        .limit(f.limit)
        .lean(),
      SeasonStat.countDocuments(match),
    ]);
    res.json(pageResponse(data, total, f));
  })
);

module.exports = router;

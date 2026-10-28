const express = require('express');

const Valuation = require('../models/Valuation');
const asyncHandler = require('../utils/asyncHandler');
const { parseFilters, buildSort, pageResponse } = require('../middleware/filters');

// Only mounted under /players/:playerId, which loads req.player.
const router = express.Router({ mergeParams: true });

const SORT_FIELDS = ['date', 'value'];

router.get(
  '/',
  parseFilters,
  asyncHandler(async (req, res) => {
    const f = req.filters;
    const match = { player: req.player._id };
    const [data, total] = await Promise.all([
      Valuation.find(match)
        .select('date value -_id')
        .sort(buildSort(f.sort, SORT_FIELDS, ['date']))
        .skip(f.skip)
        .limit(f.limit)
        .lean(),
      Valuation.countDocuments(match),
    ]);
    res.json(pageResponse(data, total, f));
  })
);

module.exports = router;

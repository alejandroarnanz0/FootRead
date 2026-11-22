const express = require('express');

const Player = require('../models/Player');
const Club = require('../models/Club');
const asyncHandler = require('../utils/asyncHandler');
const { parseFilters, buildSort, buildPlayerFilter, pageResponse } = require('../middleware/filters');

const router = express.Router();

const SORT_FIELDS = ['residual', 'currentValue', 'predictedValue', 'birthDate', 'name'];
const AGE_BOUNDARIES = [0, 21, 24, 27, 30, 33];
const dateNumber = (date) => ({
  $toInt: { $dateToString: { date, format: '%Y%m%d', timezone: 'UTC' } },
});

// Players with both a market value and a comparable-based reference.
const scored = (match) => ({
  ...match,
  currentValue: { ...match.currentValue, $type: 'number' },
  predictedValue: { $type: 'number' },
});

// residual = predictedValue - currentValue; a large positive one marks an
// undervalued player. Computed in the pipeline, not in Node.
router.get(
  '/undervalued',
  parseFilters,
  asyncHandler(async (req, res) => {
    const f = req.filters;
    const match = scored(await buildPlayerFilter(f));

    const [result] = await Player.aggregate([
      { $match: match },
      { $addFields: { residual: { $subtract: ['$predictedValue', '$currentValue'] } } },
      {
        $facet: {
          data: [
            { $sort: buildSort(f.sort, SORT_FIELDS, ['-residual']) },
            { $skip: f.skip },
            { $limit: f.limit },
            {
              $lookup: {
                from: Club.collection.name,
                localField: 'club',
                foreignField: '_id',
                pipeline: [{ $project: { name: 1, 'externalIds.transfermarkt': 1 } }],
                as: 'club',
              },
            },
            { $unwind: { path: '$club', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                name: 1,
                position: 1,
                birthDate: 1,
                'externalIds.transfermarkt': 1,
                club: 1,
                currentValue: 1,
                predictedValue: 1,
                residual: 1,
              },
            },
          ],
          total: [{ $count: 'n' }],
        },
      },
    ]);

    res.json(pageResponse(result.data, result.total[0] ? result.total[0].n : 0, f));
  })
);

// KPIs and distributions over the filtered players.
router.get(
  '/summary',
  parseFilters,
  asyncHandler(async (req, res) => {
    const match = await buildPlayerFilter(req.filters);
    const isScored = {
      $and: [{ $isNumber: '$predictedValue' }, { $isNumber: '$currentValue' }],
    };
    const residual = { $subtract: ['$predictedValue', '$currentValue'] };

    const [{ totals: [r], positions, ages }] = await Player.aggregate([
      { $match: match },
      {
        $facet: {
          totals: [{
            $group: {
              _id: null,
              players: { $sum: 1 },
              totalMarketValue: { $sum: { $ifNull: ['$currentValue', 0] } },
              averageMarketValue: { $avg: '$currentValue' },
              valuedPlayers: { $sum: { $cond: [{ $isNumber: '$currentValue' }, 1, 0] } },
              scoredPlayers: { $sum: { $cond: [isScored, 1, 0] } },
              absResidualSum: { $sum: { $cond: [isScored, { $abs: residual }, 0] } },
              residualSum: { $sum: { $cond: [isScored, residual, 0] } },
            },
          }],
          positions: [{ $group: { _id: '$position', count: { $sum: 1 } } }],
          ages: [
            { $match: { birthDate: { $type: 'date', $lte: new Date() } } },
            {
              // Subtract YYYYMMDD values before dividing to account for birthdays.
              $bucket: {
                groupBy: { $floor: { $divide: [{ $subtract: [dateNumber('$$NOW'), dateNumber('$birthDate')] }, 10000] } },
                boundaries: AGE_BOUNDARIES,
                default: 33,
              },
            },
          ],
        },
      },
    ]);

    const scoredPlayers = r ? r.scoredPlayers : 0;
    res.json({
      players: r ? r.players : 0,
      scoredPlayers,
      totalMarketValue: r ? r.totalMarketValue : 0,
      averageMarketValue: r?.averageMarketValue ?? null,
      valuedPlayers: r?.valuedPlayers ?? 0,
      positions: Object.fromEntries(positions.map(({ _id, count }) => [_id, count])),
      ageDistribution: AGE_BOUNDARIES.map((min, index) => ({
        min,
        max: AGE_BOUNDARIES[index + 1] ? AGE_BOUNDARIES[index + 1] - 1 : null,
        count: ages.find(({ _id }) => _id === min)?.count ?? 0,
      })),
      maeEuros: scoredPlayers ? r.absResidualSum / scoredPlayers : null,
      meanResidual: scoredPlayers ? r.residualSum / scoredPlayers : null,
    });
  })
);

module.exports = router;

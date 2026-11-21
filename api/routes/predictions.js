const express = require('express');

const asyncHandler = require('../utils/asyncHandler');
const httpError = require('../utils/httpError');
const { predictXg, predictXgBatch } = require('../utils/mlClient');

const router = express.Router();

// Stub kept for the old market value endpoint: the value is a heuristic now
// (CLAUDE.md 11.1) and lives in Player.predictedValue.
const STUB_VALUE = 10000000;

router.post('/value', (req, res) => {
  res.json({ predictedValue: STUB_VALUE, shapValues: {}, stub: true });
});

// Proxy to the xG service. Body: one raw shot { x, y, body_part, technique,
// shot_type, play_pattern, under_pressure } or { shots: [ ... ] } for a batch.
// 503 when the service is down, 400 when it rejects the shot.
router.post(
  '/xg',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (Array.isArray(body.shots)) {
      if (!body.shots.length) throw httpError(400, 'shots must not be empty');
      return res.json(await predictXgBatch(body.shots));
    }
    if (typeof body.x !== 'number' || typeof body.y !== 'number') {
      throw httpError(400, 'A shot needs numeric x and y');
    }
    return res.json(await predictXg(body));
  })
);

module.exports = router;

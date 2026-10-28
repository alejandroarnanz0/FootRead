const express = require('express');

const router = express.Router();

// Stub: the ML service does not exist yet. It will become a proxy to
// ML_SERVICE_URL/predict and keep this response shape.
const STUB_VALUE = 10000000;

router.post('/value', (req, res) => {
  res.json({ predictedValue: STUB_VALUE, shapValues: {}, stub: true });
});

module.exports = router;

// Client of the Python xG service (ml/serve.py). Shared by the
// /api/predictions/xg proxy and by match event ingestion.
// URL and timeout are read on every call, so tests and deploys can change them.
const httpError = require('./httpError');

const baseUrl = () => (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, '');
const timeoutMs = () => Number(process.env.ML_TIMEOUT_MS) || 3000;

// The raw shot fields the service accepts (see ml/serve.py RawShot).
const SHOT_FIELDS = ['x', 'y', 'under_pressure', 'body_part', 'technique', 'shot_type', 'play_pattern'];

async function call(path, body) {
  let res;
  try {
    res = await fetch(baseUrl() + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (err) {
    throw httpError(503, `xG service unavailable (${err.name === 'TimeoutError' ? 'timeout' : err.message})`);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 422) throw httpError(400, `Invalid shot: ${JSON.stringify(data.detail || data)}`);
  if (!res.ok) throw httpError(502, `xG service answered ${res.status}`);
  return data;
}

const pickShot = (shot) => Object.fromEntries(SHOT_FIELDS.filter((f) => shot[f] !== undefined).map((f) => [f, shot[f]]));

const predictXg = (shot) => call('/predict', pickShot(shot));
const predictXgBatch = (shots) => call('/predict/batch', { shots: shots.map(pickShot) });

module.exports = { predictXg, predictXgBatch, SHOT_FIELDS };

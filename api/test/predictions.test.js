// Integration tests of the xG proxy (POST /api/predictions/xg) with a fake ML service.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { startApi } = require('./helpers/apiServer');
const { startMlStub } = require('./helpers/mlStub');

const SHOT = { x: 115, y: 40, body_part: 'Head', technique: 'Normal', shot_type: 'Open Play', play_pattern: 'From Corner' };

describe('xG proxy', () => {
  let srv;
  let ml;

  before(async () => {
    ml = await startMlStub();
    ml.up();
    srv = await startApi();
  });

  after(async () => {
    await srv.close();
    await ml.close();
  });

  it('forwards a raw shot and returns the service answer', async () => {
    const res = await srv.api('POST', '/api/predictions/xg', { ...SHOT, junk: 'dropped' });
    assert.equal(res.status, 200);
    assert.equal(res.body.xg, 0.5);
    assert.deepEqual(ml.calls.at(-1).body, SHOT); // only the raw shot fields travel
  });

  it('forwards batches', async () => {
    const res = await srv.api('POST', '/api/predictions/xg', { shots: [SHOT, { ...SHOT, x: 100 }] });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.predictions.map((p) => p.xg), [0.5, 0.1]);
  });

  it('answers 400 on a malformed shot, 401 without token and 503 when the service is down', async () => {
    assert.equal((await srv.api('POST', '/api/predictions/xg', { y: 40 })).status, 400);
    assert.equal((await srv.api('POST', '/api/predictions/xg', SHOT, { auth: false })).status, 401);
    ml.down();
    const down = await srv.api('POST', '/api/predictions/xg', SHOT);
    ml.up();
    assert.equal(down.status, 503);
    assert.match(down.body.error, /unavailable/);
  });
});

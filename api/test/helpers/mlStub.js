// A fake xG service for tests: answers like ml/serve.py without Python.
// xg = 0.5 for shots inside the six-yard box (x >= 114), 0.1 otherwise;
// penalties 0.73. Can be switched to "down" to test resilience.
const http = require('http');

function fakePrediction(shot) {
  if (shot.shot_type === 'Penalty') return { xg: 0.73, shapValues: {}, penalty: true };
  return { xg: shot.x >= 114 ? 0.5 : 0.1, shapValues: { distance: -0.3 }, penalty: false };
}

async function startMlStub() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      calls.push({ path: req.url, body });
      res.setHeader('content-type', 'application/json');
      if (req.url === '/predict') {
        if (typeof body.x !== 'number') {
          res.statusCode = 422;
          return res.end(JSON.stringify({ detail: 'x missing' }));
        }
        return res.end(JSON.stringify(fakePrediction(body)));
      }
      if (req.url === '/predict/batch') {
        return res.end(JSON.stringify({ predictions: body.shots.map(fakePrediction) }));
      }
      res.statusCode = 404;
      return res.end('{}');
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    calls,
    // Point the API at the stub, or at a closed port to simulate the service being down.
    up: () => (process.env.ML_SERVICE_URL = url),
    down: () => (process.env.ML_SERVICE_URL = 'http://127.0.0.1:1'),
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { startMlStub };

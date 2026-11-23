const { Server } = require('socket.io');
const Match = require('../models/Match');
const { verifyToken } = require('../middleware/auth');

const room = (matchId) => `match:${matchId}`;
const validId = (value) => typeof value === 'string' && /^\d{1,32}$/.test(value);
const acknowledge = (callback, response) => {
  if (typeof callback === 'function') callback(response);
};

function rejectConnection(next, code) {
  next(Object.assign(new Error('Unauthorized'), { data: { code } }));
}

function authenticate(socket, next) {
  const token = socket.handshake.auth?.token;
  if (typeof token !== 'string' || !token) return rejectConnection(next, 'TOKEN_REQUIRED');
  try {
    const claims = verifyToken(token);
    if (!claims.sub || !Number.isFinite(claims.exp)) return rejectConnection(next, 'INVALID_TOKEN');
    socket.data.expiresAt = claims.exp * 1000;
    next();
  } catch (error) {
    rejectConnection(next, error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN');
  }
}

function handleMatchSocket(socket) {
  let timer;
  let pending;
  let joined;
  const remaining = () => socket.data.expiresAt - Date.now();

  function expireOnTime() {
    const delay = remaining();
    if (delay <= 0) {
      socket.disconnect(true);
      return;
    }
    timer = setTimeout(expireOnTime, Math.min(delay, 2 ** 31 - 1));
  }

  socket.once('disconnect', () => clearTimeout(timer));
  socket.on('match:join', async (payload, ack) => {
    const matchId = payload?.matchId;
    if (!validId(matchId)) return acknowledge(ack, { ok: false, code: 'INVALID_MATCH_ID' });
    const request = { matchId };
    pending = request;
    try {
      const exists = await Match.exists({ matchId });
      if (!socket.connected) return;
      if (remaining() <= 0) return socket.disconnect(true);
      if (pending !== request) return acknowledge(ack, { ok: false, code: 'SUBSCRIPTION_CANCELLED' });
      if (!exists) return acknowledge(ack, { ok: false, code: 'MATCH_NOT_FOUND' });

      // The in-memory adapter changes room membership synchronously.
      if (joined && joined !== matchId) socket.leave(room(joined));
      socket.join(room(matchId));
      joined = matchId;
      acknowledge(ack, { ok: true, matchId });
    } catch {
      console.error(`Unable to subscribe to updates for match ${matchId}`);
      acknowledge(ack, { ok: false, code: 'SUBSCRIPTION_FAILED' });
    } finally {
      if (pending === request) pending = null;
    }
  });

  socket.on('match:leave', (payload, ack) => {
    const matchId = payload?.matchId;
    if (!validId(matchId)) return acknowledge(ack, { ok: false, code: 'INVALID_MATCH_ID' });
    if (pending?.matchId === matchId) pending = null;
    if (joined === matchId) {
      socket.leave(room(matchId));
      joined = null;
    }
    acknowledge(ack, { ok: true, matchId });
  });
  expireOnTime();
}

function attachMatchRealtime(server, app) {
  if (app.locals.publishMatchChange) throw new Error('Match realtime already attached');
  const origin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const io = new Server(server, {
    cors: { origin },
    allowRequest: (req, done) => done(null, !req.headers.origin || req.headers.origin === origin),
    maxHttpBufferSize: 16 * 1024,
  });
  io.use(authenticate);
  io.on('connection', handleMatchSocket);
  app.locals.publishMatchChange = (matchId, reason) => {
    io.to(room(matchId)).emit('match:changed', { matchId, reason });
  };
  server.once('close', () => { delete app.locals.publishMatchChange; });
  return io;
}

module.exports = { attachMatchRealtime };

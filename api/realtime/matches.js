const { Server } = require('socket.io');
const Match = require('../models/Match');
const { verifyToken } = require('../middleware/auth');

// Two kinds of authenticated sockets share the server:
// - viewers (the web): subscribe to one match room and may send replay commands;
// - replayers (scripts/replay.js --agent): receive those commands and report
//   their progress. Both prove who they are with the same JWT as REST.
const room = (matchId) => `match:${matchId}`;
const REPLAYERS = 'replayers';
const ACTIONS = new Set(['play', 'pause', 'speed', 'restart']);
const STATUSES = new Set(['idle', 'playing', 'paused', 'finished']);
const SPEED = { min: 1, max: 240 };
const COMMAND_TIMEOUT = 5000;

const validId = (value) => typeof value === 'string' && /^\d{1,32}$/.test(value);
const validSpeed = (value) => Number.isFinite(value) && value >= SPEED.min && value <= SPEED.max;
const count = (value) => (Number.isFinite(value) && value >= 0 ? value : 0);
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
    socket.data.role = socket.handshake.auth?.role === 'replayer' ? 'replayer' : 'viewer';
    next();
  } catch (error) {
    rejectConnection(next, error.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN');
  }
}

// Disconnects the socket when its JWT expires (both roles).
function expireOnTime(socket) {
  let timer;
  const check = () => {
    const delay = socket.data.expiresAt - Date.now();
    if (delay <= 0) return socket.disconnect(true);
    timer = setTimeout(check, Math.min(delay, 2 ** 31 - 1));
  };
  socket.once('disconnect', () => clearTimeout(timer));
  check();
}

// Last progress reported by the replayer for each match, in memory (one instance).
function createReplayStates(io) {
  const states = new Map();
  const online = () => (io.sockets.adapter.rooms.get(REPLAYERS)?.size ?? 0) > 0;
  const snapshot = (matchId) => ({
    matchId, status: 'idle', speed: null, clock: 0, duration: 0, sent: 0, total: 0,
    ...states.get(matchId),
    online: online(),
  });
  const broadcast = (matchId) => io.to(room(matchId)).emit('replay:state', snapshot(matchId));
  const broadcastAll = () => {
    for (const name of io.sockets.adapter.rooms.keys()) {
      if (name.startsWith('match:')) broadcast(name.slice('match:'.length));
    }
  };
  return { states, online, snapshot, broadcast, broadcastAll };
}

function handleViewer(socket, io, replay) {
  let pending;
  let joined;
  const remaining = () => socket.data.expiresAt - Date.now();

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
      socket.emit('replay:state', replay.snapshot(matchId));
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

  // Web -> API -> replayer. The answer of the replayer goes back to the web.
  socket.on('replay:command', async (payload, ack) => {
    const matchId = payload?.matchId;
    const action = payload?.action;
    const speed = payload?.speed === undefined ? undefined : Number(payload.speed);
    if (!validId(matchId)) return acknowledge(ack, { ok: false, code: 'INVALID_MATCH_ID' });
    if (!ACTIONS.has(action)) return acknowledge(ack, { ok: false, code: 'INVALID_ACTION' });
    if ((action === 'speed' || speed !== undefined) && !validSpeed(speed)) {
      return acknowledge(ack, { ok: false, code: 'INVALID_SPEED' });
    }
    if (!replay.online()) return acknowledge(ack, { ok: false, code: 'REPLAYER_OFFLINE' });
    try {
      if (!(await Match.exists({ matchId }))) return acknowledge(ack, { ok: false, code: 'MATCH_NOT_FOUND' });
      const answers = await io.to(REPLAYERS).timeout(COMMAND_TIMEOUT)
        .emitWithAck('replay:command', { matchId, action, ...(speed !== undefined && { speed }) });
      acknowledge(ack, answers.find((answer) => answer?.ok) ?? answers[0] ?? { ok: false, code: 'REPLAYER_OFFLINE' });
    } catch {
      acknowledge(ack, { ok: false, code: 'REPLAYER_TIMEOUT' });
    }
  });
}

function handleReplayer(socket, replay) {
  // A (re)connected replayer announces its sessions again right after this.
  replay.states.clear();
  socket.join(REPLAYERS);
  replay.broadcastAll();
  socket.once('disconnect', () => replay.broadcastAll());

  socket.on('replay:state', async (payload) => {
    const matchId = payload?.matchId;
    if (!validId(matchId) || !STATUSES.has(payload.status)) return;
    const previous = replay.states.get(matchId);
    replay.states.set(matchId, {
      status: payload.status,
      speed: validSpeed(payload.speed) ? payload.speed : null,
      clock: count(payload.clock),
      duration: count(payload.duration),
      sent: count(payload.sent),
      total: count(payload.total),
    });
    replay.broadcast(matchId);
    if (payload.status === 'finished' && previous?.status !== 'finished') {
      try {
        await Match.updateOne({ matchId }, { $set: { finishedAt: new Date() } });
      } catch {
        console.error(`Unable to mark match ${matchId} as finished`);
      }
    }
  });
}

function attachMatchRealtime(server, app) {
  if (app.locals.publishMatchChange) throw new Error('Match realtime already attached');
  const origin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const io = new Server(server, {
    cors: { origin },
    // Browsers must come from the web origin; scripts (no Origin header) are allowed.
    allowRequest: (req, done) => done(null, !req.headers.origin || req.headers.origin === origin),
    maxHttpBufferSize: 16 * 1024,
  });
  const replay = createReplayStates(io);
  io.use(authenticate);
  io.on('connection', (socket) => {
    expireOnTime(socket);
    if (socket.data.role === 'replayer') handleReplayer(socket, replay);
    else handleViewer(socket, io, replay);
  });
  app.locals.publishMatchChange = (matchId, reason) => {
    io.to(room(matchId)).emit('match:changed', { matchId, reason });
  };
  server.once('close', () => { delete app.locals.publishMatchChange; });
  return io;
}

module.exports = { attachMatchRealtime };

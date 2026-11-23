import { io } from 'socket.io-client';
import { getToken, LOGOUT_EVENT } from './token.js';

const JOIN_TIMEOUT = 3500;
let socket;

function getSocket() {
  if (!socket) {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (!apiUrl) throw new Error('VITE_API_URL is not configured');
    socket = io(new URL(apiUrl, window.location.href).origin, {
      autoConnect: false,
      auth: (done) => done({ token: getToken() }),
    });
  }
  return socket;
}

// The protected match route owns the subscription. The client itself is reused.
export function subscribeToMatch(matchId, { onStatus, onChange }) {
  const client = getSocket();
  let joinTimer;
  let generation = 0;
  let sessionToken = getToken();
  let active = true;

  function invalidateJoin() {
    generation++;
    clearTimeout(joinTimer);
  }

  function join() {
    invalidateJoin();
    const current = generation;
    client.timeout(JOIN_TIMEOUT).emit('match:join', { matchId }, (error, result) => {
      if (!active || !client.connected || generation !== current) return;
      if (!error && result?.ok && result.matchId === matchId) {
        onStatus('connected');
        return;
      }
      if (error || result?.code === 'SUBSCRIPTION_FAILED') {
        onStatus('fallback');
        joinTimer = setTimeout(join, JOIN_TIMEOUT);
      } else {
        onStatus('error');
      }
    });
  }

  function disconnected(reason) {
    invalidateJoin();
    if (!active) return;
    onStatus('reconnecting');
    // A server disconnect is not retried by Socket.IO. Let the handshake
    // validate the current token again while REST can report an expired session.
    if (reason === 'io server disconnect' && getToken()) client.connect();
  }

  function connectionError(error) {
    invalidateJoin();
    if (active) onStatus(error.data?.code?.includes('TOKEN') ? 'error' : 'fallback');
  }

  function changed(update) {
    if (active && update?.matchId === matchId &&
        (update.reason === 'event' || update.reason === 'reset')) onChange(update.reason);
  }

  function stop() {
    if (!active) return;
    active = false;
    invalidateJoin();
    client.off('connect', join);
    client.off('disconnect', disconnected);
    client.off('connect_error', connectionError);
    client.off('match:changed', changed);
    window.removeEventListener(LOGOUT_EVENT, stop);
    window.removeEventListener('storage', sessionChanged);
    if (client.connected) client.emit('match:leave', { matchId });
    client.disconnect();
  }

  function sessionChanged() {
    const nextToken = getToken();
    if (nextToken === sessionToken) return;
    sessionToken = nextToken;
    if (!nextToken) {
      stop();
      window.dispatchEvent(new Event(LOGOUT_EVENT));
      return;
    }
    client.disconnect();
    client.connect();
  }

  client.on('connect', join);
  client.on('disconnect', disconnected);
  client.on('connect_error', connectionError);
  client.on('match:changed', changed);
  window.addEventListener(LOGOUT_EVENT, stop);
  window.addEventListener('storage', sessionChanged);
  client.connect();
  return stop;
}

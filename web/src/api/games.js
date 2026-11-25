import client from './client.js';

export const gameCatalog = (signal) => client.get('/games/catalog', { signal }).then(({ data }) => data);
export const gameStats = (signal) => client.get('/games/stats', { signal }).then(({ data }) => data);

async function timed(request) {
  const sent = performance.now();
  const { data } = await request;
  const received = performance.now();
  const processing = data.serverNow - data.serverReceivedAt;
  const transit = Number.isFinite(processing) ? Math.max(0, received - sent - processing) / 2 : 0;
  return { ...data, clockAnchor: received, serverAtAnchor: data.serverNow + transit };
}

const options = (session, signal) => ({
  signal, headers: session.token ? { 'X-Game-Token': session.token } : {},
});

export const startGame = (game, difficulty) => timed(client.post('/games/sessions', { game, difficulty }));
export const readGame = (session, signal) => timed(client.get('/games/sessions/' + session.id, options(session, signal)));
export const gameAction = (session, state, action, optionId, signal) => timed(client.post(
  '/games/sessions/' + session.id + '/actions',
  { action, optionId, revision: state.revision, questionId: state.question.id },
  options(session, signal),
));

export const cancelGame = (session) => client.post('/games/sessions/' + session.id + '/cancel', {},
  options(session));

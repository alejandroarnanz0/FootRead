import client from './client.js';

const matchPath = (matchId) => `/matches/${encodeURIComponent(matchId)}`;

export const getMatch = (matchId, signal) =>
  client.get(matchPath(matchId), { signal }).then(({ data }) => data);

export const getMatchEvents = (matchId, signal) =>
  client.get(`${matchPath(matchId)}/events`, { signal }).then(({ data }) => data.data);

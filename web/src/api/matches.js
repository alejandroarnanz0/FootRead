import client from './client.js';

const matchPath = (matchId) => `/matches/${encodeURIComponent(matchId)}`;

export async function listReplayMatches(signal) {
  // Filters in the catalog need the full dataset, not just the first API page.
  const loadPage = (page) => client.get('/matches', { params: { page, limit: 200 }, signal }).then(({ data }) => data);
  const first = await loadPage(1);
  const matches = new Map(first.data.map((match) => [match.matchId, match]));
  for (let page = 2; page <= first.totalPages; page++) {
    const { data } = await loadPage(page);
    for (const match of data) matches.set(match.matchId, match);
  }
  return [...matches.values()];
}

export const getMatch = (matchId, signal) =>
  client.get(matchPath(matchId), { signal }).then(({ data }) => data);

export const getMatchEvents = (matchId, signal) =>
  client.get(`${matchPath(matchId)}/events`, { signal }).then(({ data }) => data.data);

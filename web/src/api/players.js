import client from './client.js';
import { toQuery } from './params.js';

export const listPlayers = (filters, { page = 1, limit = 50, sort } = {}, signal) =>
  client
    .get('/players', { params: { ...toQuery(filters), page, limit, sort }, signal })
    .then((res) => res.data);

export const getPlayer = (id, signal) => client.get(`/players/${id}`, { signal }).then((res) => res.data);

const SEARCH_PAGE_SIZE = 20;

export const searchPlayers = (q, page, signal, filters = {}, limit = SEARCH_PAGE_SIZE) =>
  client.get('/players', { params: { ...filters, q, page, limit, sort: '-currentValue' }, signal })
    .then((res) => res.data);

// Fetch the same prefix after the exclusion filter shifts every page boundary.
export async function refreshPlayerSearch(q, pages, signal, filters) {
  const count = pages * SEARCH_PAGE_SIZE;
  const limit = Math.min(count, 200);
  const first = await searchPlayers(q, 1, signal, filters, limit);
  const players = [...first.data];
  const last = Math.min(first.totalPages, Math.ceil(count / limit));
  for (let page = 2; page <= last; page++) {
    const next = await searchPlayers(q, page, signal, filters, limit);
    players.push(...next.data);
  }
  return { players: players.slice(0, count), hasMore: count < first.total };
}

export const getValuations = (id, signal) =>
  client.get(`/players/${id}/valuations`, { params: { limit: 200 }, signal }).then((res) => res.data);

export const getStats = (id, signal) =>
  client.get(`/players/${id}/stats`, { params: { limit: 200 }, signal }).then((res) => res.data);

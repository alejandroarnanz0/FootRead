import client from './client.js';
import { toQuery } from './params.js';

export const listPlayers = (filters, { page = 1, limit = 50, sort } = {}, signal) =>
  client
    .get('/players', { params: { ...toQuery(filters), page, limit, sort }, signal })
    .then((res) => res.data);

export const getPlayer = (id, signal) => client.get(`/players/${id}`, { signal }).then((res) => res.data);

export const getValuations = (id, signal) =>
  client.get(`/players/${id}/valuations`, { params: { limit: 200 }, signal }).then((res) => res.data);

export const getStats = (id, signal) =>
  client.get(`/players/${id}/stats`, { params: { limit: 200 }, signal }).then((res) => res.data);

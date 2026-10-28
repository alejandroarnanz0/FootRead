import client from './client.js';
import { toQuery } from './params.js';

// The API caps a page at 200 players.
export const MAX_PLAYERS = 200;

export const getUndervalued = (filters, signal) =>
  client
    .get('/aggregates/undervalued', { params: { ...toQuery(filters), limit: MAX_PLAYERS }, signal })
    .then((res) => res.data);

export const getSummary = (filters, signal) =>
  client.get('/aggregates/summary', { params: toQuery(filters), signal }).then((res) => res.data);

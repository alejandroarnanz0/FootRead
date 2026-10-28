import client from './client.js';

export const listCompetitions = (signal) =>
  client.get('/competitions', { params: { limit: 200, sort: 'name' }, signal }).then((res) => res.data);

import client from './client.js';

export const listCompetitions = (signal) =>
  client.get('/competitions', { params: { limit: 200, sort: 'name' }, signal }).then((res) => res.data);

export const getCompetition = (id, signal) => client.get(`/competitions/${id}`, { signal }).then((res) => res.data);

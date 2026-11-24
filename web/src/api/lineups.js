import client from './client.js';

export const listFormations = (signal) =>
  client.get('/lineups/formations', { signal }).then(({ data }) => data.data);

export const listLineups = (signal) =>
  client.get('/lineups', { signal }).then(({ data }) => data.data);
export const getLineup = (id) => client.get(`/lineups/${id}`).then(({ data }) => data);
export const saveLineup = (id, body) =>
  (id ? client.patch(`/lineups/${id}`, body) : client.post('/lineups', body)).then(({ data }) => data);
export const deleteLineup = (id, revision) =>
  client.delete(`/lineups/${id}`, { data: { revision } });

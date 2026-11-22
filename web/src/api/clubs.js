import client from './client.js';

export const getClub = (id, signal) => client.get(`/clubs/${id}`, { signal }).then((res) => res.data);

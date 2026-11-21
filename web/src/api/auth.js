import client from './client.js';

export async function login(email, password) {
  const { data } = await client.post('/auth/login', { email, password });
  return data; // { token, user }
}

export async function register(email, password, name) {
  const { data } = await client.post('/auth/register', { email, password, name });
  return data;
}

export async function fetchMe() {
  const { data } = await client.get('/auth/me');
  return data;
}

import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL;

// The only axios instance in the app. Every resource module uses it.
const client = axios.create({ baseURL, timeout: 15000 });

// Fail loudly when the base URL is missing instead of hitting the wrong host.
client.interceptors.request.use((config) => {
  if (!baseURL) throw new Error('VITE_API_URL no está definida en el .env');
  return config;
});

// axios rejects any non-2xx response. Turn every failure into an Error whose
// message can be shown to the user as is.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);
    if (error.response) {
      const apiMessage = error.response.data && error.response.data.error;
      error.message = `Error ${error.response.status}: ${apiMessage || error.response.statusText}`;
    } else if (error.request) {
      error.message = `No se pudo conectar con la API (${baseURL})`;
    }
    return Promise.reject(error);
  }
);

export default client;

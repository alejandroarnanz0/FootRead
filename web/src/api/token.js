// Where the JWT lives between page loads. Kept apart from React so the axios
// client can read it without importing the auth context.
const KEY = 'footboard.token';

export const LOGOUT_EVENT = 'footboard:logout';

export function getToken() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the session just will not survive a reload.
  }
}

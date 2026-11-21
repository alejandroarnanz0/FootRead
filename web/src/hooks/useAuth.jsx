import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import * as authApi from '../api/auth.js';
import { LOGOUT_EVENT, getToken, setToken } from '../api/token.js';

const AuthContext = createContext(null);

// Session state shared by the whole app: the logged-in user (or null).
export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(() => Boolean(getToken()));

  // On load, a stored token is checked against the API (it may have expired).
  useEffect(() => {
    if (!getToken()) return;
    authApi
      .fetchMe()
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

  // The axios client fires this when the API rejects our token.
  useEffect(() => {
    const onLogout = () => {
      setUser(null);
      navigate('/login', { state: { expired: true } });
    };
    window.addEventListener(LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(LOGOUT_EVENT, onLogout);
  }, [navigate]);

  const start = useCallback(({ token, user: u }) => {
    setToken(token);
    setUser(u);
  }, []);

  const value = useMemo(
    () => ({
      user,
      checking,
      login: async (email, password) => start(await authApi.login(email, password)),
      register: async (email, password, name) => start(await authApi.register(email, password, name)),
      logout: () => {
        setToken(null);
        setUser(null);
      },
    }),
    [user, checking, start]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

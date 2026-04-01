import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AUTH_UNAUTHORIZED_EVENT, api, setAuthToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      setChecking(false);
      return;
    }

    api.auth.me()
      .then((res) => setUser(res.user))
      .catch(() => {
        setAuthToken('');
        setUser(null);
      })
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      setAuthToken('');
      setUser(null);
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  const value = useMemo(() => ({
    user,
    checking,
    isAuthenticated: !!user,
    async login(email, password) {
      const res = await api.auth.login({ email, password });
      setAuthToken(res.token);
      setUser(res.user);
      return res.user;
    },
    async registerAdmin(name, email, password) {
      const res = await api.auth.registerAdmin({ name, email, password });
      setAuthToken(res.token);
      setUser(res.user);
      return res.user;
    },
    async logout() {
      try {
        await api.auth.logout();
      } catch {
        // swallow network/auth errors on logout
      }
      setAuthToken('');
      setUser(null);
    },
  }), [user, checking]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { api, setAccessToken } from '../api/client.js';

const AuthContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On boot, try to silently exchange the httpOnly refresh cookie for a
  // fresh access token — this is what makes the session survive a page
  // reload despite the access token only living in memory.
  useEffect(() => {
    (async () => {
      try {
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
        setAccessToken(data.accessToken);
        const me = await api.get('/auth/me');
        setUser(me.data);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loginWithGithub = useCallback(() => {
    window.location.href = `${API_URL}/auth/github`;
  }, []);

  // Called by the /auth/callback route after GitHub redirects back with
  // the access token in the URL fragment.
  const completeLogin = useCallback(async (token) => {
    setAccessToken(token);
    const me = await api.get('/auth/me');
    setUser(me.data);
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGithub, completeLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

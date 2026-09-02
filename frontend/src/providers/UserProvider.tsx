'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import apiFetch from '../lib/api-clients';
import { UNAUTHENTICATED_EVENT } from '../lib/errors';

export type User = {
  name: string;
  role: 'admin' | 'user';
};

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

type UserCtx = {
  user: User | null;
  /** checking = the session probe has not answered yet; anonymous = no valid session cookie. */
  status: AuthStatus;
  setUser: (u: User | null) => void;
  /** Re-run the session probe (after login/logout). */
  refresh: () => Promise<void>;
};

const Ctx = createContext<UserCtx | null>(null);

export function useUser() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}

type Me = { username?: string; role?: string };

export function toUser(me: Me | null | undefined): User | null {
  if (!me?.username) return null;
  return { name: me.username, role: String(me.role ?? '').toLowerCase() === 'admin' ? 'admin' : 'user' };
}

/**
 * The single source of truth for "who is signed in". The role comes from /auth/me only: it is
 * never cached in localStorage, so it cannot be edited by the user to reveal admin navigation
 * (the API enforces roles regardless, but the UI should not lie).
 */
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');

  const refresh = useCallback(async () => {
    try {
      const me = await apiFetch<Me>('/auth/me');
      const u = toUser(me);
      setUserState(u);
      setStatus(u ? 'authenticated' : 'anonymous');
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      if (code === 401 || code === 403) {
        setUserState(null);
        setStatus('anonymous');
      } else {
        // gateway unreachable: keep whatever we know; pages will surface the fetch errors
        setStatus((s) => (s === 'checking' ? 'anonymous' : s));
      }
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // any 401 from any page (expired cookie, revoked session) sends the user to sign in
  useEffect(() => {
    const onUnauth = () => { setUserState(null); setStatus('anonymous'); };
    window.addEventListener(UNAUTHENTICATED_EVENT, onUnauth);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onUnauth);
  }, []);

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    setStatus(u ? 'authenticated' : 'anonymous');
  }, []);

  const value = useMemo(() => ({ user, status, setUser, refresh }), [user, status, setUser, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

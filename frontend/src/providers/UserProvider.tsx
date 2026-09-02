'use client';

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import apiFetch from '../lib/api-clients';

export type User = {
  name: string;
  role: 'admin' | 'user';
};

type UserCtx = {
  user: User | null;
  setUser: (u: User | null) => void;
};

const Ctx = createContext<UserCtx | null>(null);

export function useUser() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}

const DEV_DEFAULT: User = { name: 'Admin', role: 'admin' };

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    try {
      const n = localStorage.getItem('cortex_user_name');
      const r = (localStorage.getItem('cortex_user_role') as User['role']) || undefined;
      if (n) {
        setUser({ name: n, role: (r || 'admin') as User['role'] });
      }
    } catch {
      // ignore
    }
    // Try to hydrate from backend session (dev cookie) using gateway client
    (async () => {
      try {
        const data = await apiFetch<any>('/auth/me');
        if (data && data.username) {
          setUser({ name: data.username, role: (String(data.role).toLowerCase() === 'admin' ? 'admin' : 'user') });
        }
      } catch (e: any) {
        // Only a definite 401 means "no session". A network failure (gateway
        // unreachable) must not wipe the locally remembered user, and neither
        // must a slow /auth/me that resolves after a successful login.
        if (e && typeof e.code === 'number' && e.code === 401) {
          try { localStorage.removeItem('cortex_user_name'); localStorage.removeItem('cortex_user_role'); } catch {}
        }
      }
    })();
  }, []);

  const value = useMemo(() => ({ user, setUser }), [user]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}



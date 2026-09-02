'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: string; title: string; description?: string; kind?: ToastKind; durationMs?: number };

type ToastContextValue = {
  addToast: (t: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
};

const ToastCtx = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `toast-${Date.now().toString(36)}-${counter}`;
}

const DEFAULT_MS: Record<ToastKind, number> = { success: 4000, info: 5000, error: 8000 };

/**
 * Toasts are announced through an aria-live region, every toast can be
 * dismissed by hand, and auto-dismiss timers are cleared on unmount.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const addToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = nextId();
    setToasts((prev) => [...prev, { id, ...t }]);
    const ms = t.durationMs ?? DEFAULT_MS[t.kind ?? 'info'];
    timers.current.set(id, setTimeout(() => removeToast(id), ms));
  }, [removeToast]);

  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach((t) => clearTimeout(t)); map.clear(); };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ addToast, removeToast }), [addToast, removeToast]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md" aria-live="polite" aria-atomic="false" role="status">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : undefined}
            className={`px-4 py-3 pr-9 relative rounded-lg shadow-lg text-sm border ${t.kind === 'error' ? 'bg-red-600/90 border-red-500/50' : t.kind === 'success' ? 'bg-emerald-600/90 border-emerald-500/50' : 'bg-gray-700/90 border-gray-500/50'}`}
          >
            <div className="font-semibold text-white">{t.title}</div>
            {t.description && (
              <div className={`mt-1 text-xs break-words ${t.kind === 'error' ? 'text-red-100' : t.kind === 'success' ? 'text-emerald-100' : 'text-gray-200'}`}>
                {t.description}
              </div>
            )}
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="absolute top-2 right-2 p-1 rounded text-white/70 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Dismiss notification"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

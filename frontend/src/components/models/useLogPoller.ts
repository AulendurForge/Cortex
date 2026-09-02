'use client';

import React from 'react';
import apiFetch from '@/lib/api-clients';

type Options = {
  /** Model whose container logs are shown (uses the shared API client with ?tail=). */
  modelId?: number;
  /** Optional override of the log source (tests, non-model logs). */
  fetcher?: (tail: number) => Promise<string>;
  tail: number;
  live: boolean;
  pollMs: number;
  /** Polling stops (single fetch only) once the model is stopped. */
  modelState?: string;
  /** Called after every successful load (e.g. to follow the tail). */
  onLoaded?: () => void;
};

/**
 * Polls the log endpoint. The fetcher and onLoaded callbacks are kept in refs so parent
 * re-renders never restart the interval; `retry()` forces a refetch after an error.
 */
export function useLogPoller({ modelId, fetcher, tail, live, pollMs, modelState, onLoaded }: Options) {
  const [text, setText] = React.useState<string>('');
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<number>(0);
  const [reloadTick, setReloadTick] = React.useState<number>(0);

  const fetcherRef = React.useRef<(tail: number) => Promise<string>>(async () => '');
  fetcherRef.current = fetcher ?? (async (n: number) => {
    if (modelId === undefined) return '';
    const r: unknown = await apiFetch(`/admin/models/${modelId}/logs?tail=${n}`);
    if (typeof r === 'string') return r;
    if (r && typeof r === 'object' && typeof (r as { logs?: unknown }).logs === 'string') return (r as { logs: string }).logs;
    return '';
  });
  const onLoadedRef = React.useRef(onLoaded);
  onLoadedRef.current = onLoaded;

  React.useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const loadOnce = async () => {
      try {
        const t = (await fetcherRef.current(tail)) || '';
        if (stop) return;
        setText(t);
        setError(null);
        setLastUpdated(Date.now());
        onLoadedRef.current?.();
      } catch (e) {
        if (!stop) setError((e as { message?: string })?.message || 'Failed to load logs');
      } finally {
        if (!stop) setLoading(false);
      }
    };
    setLoading(true);
    void loadOnce();
    if (live && modelState !== 'stopped') timer = setInterval(() => { void loadOnce(); }, Math.max(750, pollMs));
    return () => { stop = true; if (timer) clearInterval(timer); };
  }, [modelId, live, pollMs, tail, reloadTick, modelState]);

  const retry = React.useCallback(() => setReloadTick((n) => n + 1), []);
  return { text, loading, error, lastUpdated, retry };
}

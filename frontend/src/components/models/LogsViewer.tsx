'use client';

import React from 'react';
import { useToast } from '@/providers/ToastProvider';
import { safeCopyToClipboard } from '@/lib/clipboard';
import { LOG_SEVERITIES, filterBySeverity, findMatches, findSeveritySpans, mergeHighlightSpans, severityClass } from './logHighlight';
import { useLogPoller } from './useLogPoller';

const LOG_TAIL_OPTIONS = [200, 1000, 5000, 20000] as const;

type Props = {
  /** Model whose container logs are shown (uses the shared API client with ?tail=). */
  modelId?: number;
  /** Optional override of the log source (tests, non-model logs). */
  fetcher?: (tail: number) => Promise<string>;
  onClose?: () => void;
  pollMs?: number;
  modelName?: string;
  modelState?: string;
  stateReason?: string | null;
  initialTail?: number;
};

/**
 * Live container log viewer.  Polling lives in useLogPoller (parent re-renders
 * never restart the interval; "Retry" refetches); the tail size is requested
 * from the backend (10..20000 lines) instead of trimming a full dump
 * client-side; text helpers live in logHighlight.ts.
 */
export function LogsViewer({ modelId, fetcher, onClose, pollMs = 2000, modelName, modelState, stateReason, initialTail = 1000 }: Props) {
  const { addToast } = useToast();
  const [live, setLive] = React.useState<boolean>(true);
  const [tail, setTail] = React.useState<number>(initialTail);
  const [atBottom, setAtBottom] = React.useState<boolean>(true);
  const preRef = React.useRef<HTMLPreElement | null>(null);
  const atBottomRef = React.useRef(true);

  // Search state
  const [query, setQuery] = React.useState<string>('');
  const [caseSensitive, setCaseSensitive] = React.useState<boolean>(false);
  const [useRegex, setUseRegex] = React.useState<boolean>(false);
  const [activeMatch, setActiveMatch] = React.useState<number>(0);
  const [wrap, setWrap] = React.useState<boolean>(true);
  const [activeSev, setActiveSev] = React.useState<Set<string>>(new Set());

  React.useEffect(() => { atBottomRef.current = atBottom; }, [atBottom]);

  const { text, loading, error, lastUpdated, retry } = useLogPoller({
    modelId, fetcher, tail, live, pollMs, modelState,
    onLoaded: () => {
      if (atBottomRef.current) {
        requestAnimationFrame(() => { try { preRef.current?.scrollTo({ top: preRef.current.scrollHeight }); } catch {} });
      }
    },
  });

  // Track scroll position for follow behavior
  React.useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    const onScroll = () => {
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
      setAtBottom(nearBottom);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const filteredText = React.useMemo(() => filterBySeverity(text, activeSev), [text, activeSev]);
  const matches = React.useMemo(() => findMatches(filteredText, query, caseSensitive, useRegex), [filteredText, query, caseSensitive, useRegex]);
  const sevSpans = React.useMemo(() => findSeveritySpans(filteredText), [filteredText]);

  // Active match clamp
  React.useEffect(() => {
    setActiveMatch(m => (matches.length ? Math.min(m, matches.length - 1) : 0));
  }, [matches.length]);

  // Scroll to active match
  React.useEffect(() => {
    const el = preRef.current;
    if (!el || !matches.length) return;
    const target = matches[activeMatch];
    if (!target) return;
    const ratio = target.start / Math.max(1, filteredText.length);
    el.scrollTo({ top: ratio * el.scrollHeight - el.clientHeight * 0.3, behavior: 'smooth' });
  }, [activeMatch, matches, filteredText.length]);

  // Render highlighted content (search matches + severity spans merged by priority)
  const content = React.useMemo(() => {
    const merged = mergeHighlightSpans(matches, activeMatch, sevSpans);
    if (!merged.length) return filteredText;
    const out: React.ReactNode[] = [];
    let cursor = 0;
    for (const s of merged) {
      if (cursor < s.start) out.push(filteredText.slice(cursor, s.start));
      if (s.type === 'match') {
        out.push(<span key={s.key} className="bg-amber-500/40 rounded px-0.5">{filteredText.slice(s.start, s.end)}</span>);
      } else if (s.type === 'active') {
        out.push(<span key={s.key} className="bg-yellow-400 text-black rounded px-0.5">{filteredText.slice(s.start, s.end)}</span>);
      } else {
        out.push(<span key={s.key} className={severityClass(s.sev)}>{filteredText.slice(s.start, s.end)}</span>);
      }
      cursor = s.end;
    }
    if (cursor < filteredText.length) out.push(filteredText.slice(cursor));
    return out;
  }, [filteredText, matches, activeMatch, sevSpans]);

  // Minimap markers
  const markers = React.useMemo(() => {
    return matches.map((m, i) => ({ key: i, topPct: (m.start / Math.max(1, filteredText.length)) * 100 }));
  }, [matches, filteredText.length]);

  const copyLogs = async () => {
    const ok = await safeCopyToClipboard(filteredText || '');
    if (ok) {
      addToast({ title: 'Logs copied', kind: 'success' });
    } else {
      addToast({ title: 'Copy failed', kind: 'error' });
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([filteredText || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.href = url;
    a.download = `logs-${modelName || 'model'}-${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmtAgo = (ts: number) => {
    if (!ts) return '';
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  };

  return (
    <div className="space-y-2">
      {(modelState || stateReason) && (
        <div className={`text-xs rounded px-3 py-2 border ${modelState === 'failed' ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-white/5 border-white/10 text-white/70'}`} data-testid="logs-state-header">
          <span className="font-semibold uppercase tracking-wider">{modelState || 'unknown'}</span>
          {stateReason && <span className="ml-2">— {stateReason}</span>}
        </div>
      )}
      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 md:gap-3">
        {/* Search group */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-white/60">Search</span>
          <input
            className="input w-56"
            placeholder="Search (text or /regex/)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={caseSensitive} onChange={e=>setCaseSensitive(e.target.checked)} />Case</label>
          <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={useRegex} onChange={e=>setUseRegex(e.target.checked)} />Regex</label>
          <div className="flex items-center gap-1 text-xs">
            <button type="button" className="btn" onClick={()=> setActiveMatch(m => matches.length ? (m - 1 + matches.length) % matches.length : 0)} disabled={!matches.length}>Prev</button>
            <button type="button" className="btn" onClick={()=> setActiveMatch(m => matches.length ? (m + 1) % matches.length : 0)} disabled={!matches.length}>Next</button>
            <span className="text-white/70">{matches.length ? `${activeMatch+1}/${matches.length}` : '0/0'}</span>
          </div>
        </div>
        {/* Actions group */}
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <span className="text-xs text-white/60 hidden md:inline">Filter</span>
          <div className="hidden md:flex items-center gap-1 text-xs">
            {LOG_SEVERITIES.map(s => (
              <button type="button" key={s} className={`btn ${activeSev.has(s) ? 'bg-white/10' : ''}`} aria-pressed={activeSev.has(s)} onClick={() => {
                const next = new Set(activeSev); next.has(s) ? next.delete(s) : next.add(s); setActiveSev(next);
              }}>{s}</button>
            ))}
          </div>
          <label className="text-xs flex items-center gap-1 whitespace-nowrap">Tail
            <select className="input py-0.5 px-2 text-xs w-24" value={tail} onChange={(e) => setTail(Number(e.target.value))} aria-label="Lines to fetch">
              {LOG_TAIL_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <span className="text-xs text-white/60 hidden md:inline">View</span>
          <label className="text-xs flex items-center gap-1 whitespace-nowrap"><input type="checkbox" checked={wrap} onChange={e=>setWrap(e.target.checked)} />Wrap</label>
          <button type="button" className="btn whitespace-nowrap" onClick={()=>setLive(v=>!v)} aria-pressed={live} title={live ? 'Pause live updates' : 'Resume live updates'}>
            {live ? 'Pause stream' : 'Resume stream'}
          </button>
          <button type="button" className="btn whitespace-nowrap" onClick={copyLogs}>Copy</button>
          <button type="button" className="btn whitespace-nowrap" onClick={downloadLogs}>Download</button>
          {onClose && (<button type="button" className="btn whitespace-nowrap" onClick={onClose}>Close</button>)}
        </div>
      </div>

      {/* Status row */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {loading && <span className="animate-pulse text-white/70">Loading…</span>}
          {!loading && (
            <span className="text-white/60">{live ? 'Live updating' : 'Paused'} · Updated {fmtAgo(lastUpdated)}</span>
          )}
          {error && (
            <span className="text-red-300" role="alert">{error} <button type="button" className="btn ml-2" onClick={retry}>Retry</button></span>
          )}
        </div>
        {!atBottom && (
          <button type="button" className="btn" onClick={()=>{ try { preRef.current?.scrollTo({ top: preRef.current.scrollHeight, behavior: 'smooth' }); } catch{} }}>Jump to latest</button>
        )}
      </div>

      {/* Log area with minimap */}
      <div className="relative">
        <pre
          ref={preRef}
          className={`glass rounded p-3 max-h-[60vh] overflow-auto text-xs ${wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'}`}
        >{content || '—'}</pre>
        {/* Minimap markers */}
        <div className="absolute top-2 right-1 h-[calc(100%-1rem)] w-1.5">
          {markers.map(m => (
            <div key={m.key} title={`Match #${m.key+1}`}
              className="absolute left-0 right-0 h-0.5 bg-amber-400/80 cursor-pointer"
              style={{ top: `${m.topPct}%` }}
              onClick={() => setActiveMatch(m.key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}


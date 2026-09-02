'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/UI';
import { cn } from '@/lib/cn';
import { fieldsFor, flagFor, type EngineType, type FieldSpec } from '@/lib/engine-spec';
import { useEngineSpec } from '@/hooks/useEngineSpec';
import { GuideRenderer, type CustomBlocks } from '@/guide/GuideRenderer';
import { Inline } from '@/guide/primitives';
import { manageModels, SPEC_FLAG_TIPS } from '@/guide/content';

/**
 * Manage Models: sub-tab switcher plus the widgets the data content cannot express — the
 * Models/Health buttons and the per-flag reference generated live from the engine spec
 * (so the guide can never drift from backend/src/engines/spec.py).
 */
export default function ManageModelsTab() {
  const subTabs = manageModels.tabs;
  const [activeId, setActiveId] = useState(subTabs[0]?.id ?? 'overview');
  const searchParams = useSearchParams();

  // Sync with the URL hash for deep linking: on mount, whenever the query changes and on
  // hashchange. Next's soft navigation does not emit hashchange for a hash-only change, so
  // in-guide links dispatch one themselves (announceHash in the primitives).
  useEffect(() => {
    const sync = (e?: HashChangeEvent) => {
      let hash = window.location.hash;
      if (e?.newURL) {
        try { hash = new URL(e.newURL).hash; } catch { /* keep the current hash */ }
      }
      hash = hash.replace('#', '');
      if (hash && subTabs.some((t) => t.id === hash)) setActiveId(hash);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [searchParams, subTabs]);

  const handleTabChange = useCallback((id: string) => {
    setActiveId(id);
    window.history.replaceState(null, '', `#${id}`);
  }, []);

  const active = subTabs.find((t) => t.id === activeId) ?? subTabs[0];

  const customBlocks: CustomBlocks = {
    'models-cta': <ModelsCta />,
    'spec-flags:vllm': <SpecFlags engine="vllm" />,
    'spec-flags:llamacpp': <SpecFlags engine="llamacpp" />,
  };

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label="Model Management Sections"
        className="flex flex-wrap items-center gap-1.5 bg-gradient-to-r from-emerald-500/5 via-cyan-500/5 to-blue-500/5 p-1.5 rounded-xl border border-white/10"
      >
        {subTabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300',
                isActive ? 'bg-white/15 text-white shadow-inner border border-white/10' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              )}
              type="button"
            >
              {tab.icon ? <span className="text-sm" aria-hidden="true">{tab.icon}</span> : null}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sr-only sm:hidden">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {active ? (
        <div id={`panel-${active.id}`} role="tabpanel" aria-labelledby={`tab-${active.id}`} className="slide-in-from-bottom-1 duration-300">
          <GuideRenderer tab={active} customBlocks={customBlocks} />
        </div>
      ) : null}
    </div>
  );
}

function ModelsCta() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/models" className="btn btn-cyan btn-sm text-[11px]">Open Models Page <span aria-hidden="true">→</span></Link>
      <Link href="/health" className="btn btn-sm text-[11px]">Check GPU Health</Link>
    </div>
  );
}

/** Groups expanded by default; the rest start collapsed so the reference stays scannable. */
const OPEN_GROUPS = new Set(['placement', 'memory', 'throughput']);

function formatDefault(f: FieldSpec): string {
  const d = f.default;
  if (d === undefined || d === null || d === '') return 'engine default';
  if (typeof d === 'boolean') return d ? 'on' : 'off';
  if (typeof d === 'object') return JSON.stringify(d);
  return String(d);
}

function formatRange(f: FieldSpec): string | null {
  if (f.min == null && f.max == null) return null;
  return `${f.min ?? '…'} – ${f.max ?? '…'}`;
}

/**
 * Every field of the engine spec that applies to `engine`, grouped like the Add Model form:
 * label, CLI flag (or env var), kind and range, default, choices, the spec's own help text and
 * the curated tip from SPEC_FLAG_TIPS.
 */
function SpecFlags({ engine }: { engine: EngineType }) {
  const { spec, isFallback } = useEngineSpec();
  const fields = fieldsFor(spec, engine).filter((f) => f.form !== 'internal');
  const known = new Set(spec.groups.map((g) => g.key));
  const groups = [
    ...spec.groups.map((g) => ({ key: g.key, label: g.label, fields: fields.filter((f) => f.group === g.key) })),
    { key: 'other', label: 'Other', fields: fields.filter((f) => !f.group || !known.has(f.group)) },
  ].filter((g) => g.fields.length > 0);
  const engineLabel = engine === 'vllm' ? 'vLLM' : 'llama.cpp';

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-white/50">
        {fields.length} {engineLabel} settings from the engine spec{isFallback ? ' (bundled copy — the gateway has not answered yet)' : ''}.
      </p>
      {groups.map((g) => (
        <details key={g.key} open={OPEN_GROUPS.has(g.key)} className="rounded-xl border border-white/10 bg-white/[0.02]">
          <summary className="cursor-pointer select-none px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
            {g.label} <span className="font-normal normal-case text-white/40">({g.fields.length})</span>
          </summary>
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 list-none m-0 p-3 pt-0">
            {g.fields.map((f) => (
              <li key={f.name} className="min-w-0">
                <SpecFlagCard field={f} engine={engine} />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

function SpecFlagCard({ field: f, engine }: { field: FieldSpec; engine: EngineType }) {
  const flag = flagFor(f, engine);
  const range = formatRange(f);
  const tip = SPEC_FLAG_TIPS[f.name];
  return (
    <div className="h-full p-3 bg-black/20 rounded-lg border border-white/5 space-y-1.5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <span className="text-[12px] font-semibold text-white">{f.label ?? f.name}</span>
        <span className="text-[9px] text-white/40 flex items-center gap-1.5">
          Default: <Badge className="bg-white/10 text-white/70 border-white/10 text-[9px] normal-case">{formatDefault(f)}</Badge>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
        {flag ? <code className="text-cyan-300 bg-black/30 px-1 rounded break-all">{flag}</code> : null}
        {f.env ? <code className="text-amber-300 bg-black/30 px-1 rounded break-all">env {f.env}</code> : null}
        <span className="text-white/40">{f.kind}{range ? ` · ${range}` : ''}</span>
      </div>
      {f.help ? <p className="text-[11px] text-white/60 leading-relaxed">{f.help}</p> : null}
      {f.choices?.length ? (
        <div className="flex flex-wrap gap-1">
          {f.choices.map((c) => <Badge key={c} className="bg-white/5 text-white/50 border-white/5 text-[9px] normal-case">{c}</Badge>)}
        </div>
      ) : null}
      {tip ? <p className="text-[10px] text-cyan-300/70 italic"><span aria-hidden="true">💡 </span><Inline md={tip} /></p> : null}
    </div>
  );
}

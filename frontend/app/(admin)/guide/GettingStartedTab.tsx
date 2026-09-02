'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge, Card } from '@/components/UI';
import { HostIpDisplay } from '@/components/HostIpDisplay';
import { cn } from '@/lib/cn';
import cortexLogo from '@/assets/cortex logo white.PNG';
import { GuideRenderer, type CustomBlocks } from '@/guide/GuideRenderer';
import { CopyButton, useFacts, Inline, announceHash } from '@/guide/primitives';
import { gettingStarted, STARTER_MODELS, starterModelFacts, DIAGNOSTIC_CHECKS, TUTORIAL_HREF, type StarterModelId } from '@/guide/content';

/**
 * Getting Started: sub-tab switcher plus the handful of interactive widgets the data content
 * cannot express (logo hero, host banner, tutorial button, starter-model picker, diagnostic grid).
 */
export default function GettingStartedTab() {
  const subTabs = gettingStarted.tabs;
  const [activeId, setActiveId] = useState(subTabs[0]?.id ?? 'welcome');
  const [starter, setStarter] = useState<StarterModelId>('phi-2');
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
  const starterModel = STARTER_MODELS.find((m) => m.id === starter) ?? STARTER_MODELS[0];
  const facts = useMemo(() => (starterModel ? starterModelFacts(starterModel) : {}), [starterModel]);

  const customBlocks: CustomBlocks = {
    'welcome-hero': <WelcomeHero />,
    'host-ip-banner': <HostIpDisplay variant="banner" className="py-3" />,
    'tutorial-cta': <TutorialCta />,
    'model-picker': <StarterModelPicker value={starter} onChange={setStarter} />,
    'diagnostic-checks': <DiagnosticChecks />,
  };

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label="Getting Started Sections"
        className="flex flex-wrap items-center gap-1.5 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-cyan-500/5 p-1.5 rounded-xl border border-white/10"
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
                'flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300',
                isActive ? 'bg-white/15 text-white shadow-inner border border-white/10' : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              )}
              type="button"
            >
              {tab.icon ? <span className="text-sm" aria-hidden="true">{tab.icon}</span> : null}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {active ? (
        <div id={`panel-${active.id}`} role="tabpanel" aria-labelledby={`tab-${active.id}`} className="slide-in-from-bottom-1 duration-300">
          <GuideRenderer tab={active} customBlocks={customBlocks} facts={facts} />
        </div>
      ) : null}
    </div>
  );
}

function WelcomeHero() {
  const facts = useFacts();
  return (
    <Card className="p-5 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-cyan-500/10 border-white/10 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-20 pointer-events-none">
        <Image src={cortexLogo} alt="" width={112} height={112} className="w-28 h-28 object-contain" />
      </div>
      <div className="space-y-3 relative z-10">
        <div className="flex items-center gap-3">
          <Badge className="bg-indigo-500/20 text-indigo-200 border-indigo-500/30 text-[10px]">v{facts.VERSION}</Badge>
          <span className="text-white/50 text-xs" aria-hidden="true">•</span>
          <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="text-white/70 text-xs font-medium hover:text-white/90 hover:underline transition-colors">By Aulendur Labs</a>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-emerald-500/10 text-emerald-200 border-emerald-500/20">Self-Hosted</Badge>
          <Badge className="bg-blue-500/10 text-blue-200 border-blue-500/20">OpenAI-Compatible API</Badge>
          <Badge className="bg-purple-500/10 text-purple-200 border-purple-500/20">Multi-GPU Support</Badge>
          <Badge className="bg-cyan-500/10 text-cyan-200 border-cyan-500/20">Air-Gap Ready</Badge>
        </div>
      </div>
    </Card>
  );
}

function TutorialCta() {
  const router = useRouter();
  const goToTutorial = () => {
    router.push(TUTORIAL_HREF);
    announceHash(TUTORIAL_HREF);
  };
  return (
    <div className="flex flex-wrap gap-3">
      <button type="button" className="btn btn-cyan btn-sm text-[11px]" onClick={goToTutorial}>
        Start Tutorial <span aria-hidden="true">→</span>
      </button>
      <Link href="/health" className="btn btn-sm text-[11px]">Check System Health First</Link>
    </div>
  );
}

function StarterModelPicker({ value, onChange }: { value: StarterModelId; onChange: (id: StarterModelId) => void }) {
  return (
    <fieldset className="m-0 p-0 border-0">
      <legend className="sr-only">Starter model</legend>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {STARTER_MODELS.map((m) => {
          const selected = m.id === value;
          return (
            <label
              key={m.id}
              className={cn(
                'card p-4 cursor-pointer transition-all duration-300 border-2 block',
                selected ? 'bg-cyan-500/10 border-cyan-500/50' : 'bg-white/[0.02] border-white/5 hover:border-white/20'
              )}
            >
              <div className="flex items-start justify-between mb-3 gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-white">{m.name}</div>
                  <div className="text-[11px] text-white/60 font-mono break-all">{m.hfRepo}</div>
                </div>
                <input
                  type="radio"
                  name="starter-model"
                  value={m.id}
                  checked={selected}
                  onChange={() => onChange(m.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-cyan-400"
                />
              </div>
              <p className="text-[12px] text-white/70 leading-relaxed mb-3">{m.description}</p>
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-white/10 text-white/80 border-white/10 text-[10px]">{m.params}</Badge>
                <Badge className="bg-white/10 text-white/80 border-white/10 text-[10px]">{m.vram}</Badge>
                <Badge className={cn('text-[10px]', m.gated ? 'bg-amber-500/10 text-amber-200 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-200 border-emerald-500/20')}>
                  {m.gated ? 'Gated Access' : 'Open Access'}
                </Badge>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function DiagnosticChecks() {
  const facts = useFacts();
  return (
    <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4 list-none m-0 p-0">
      {DIAGNOSTIC_CHECKS.map((c) => {
        const command = c.command.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (w, k: string) => facts[k] ?? w);
        return (
          <li key={c.title} className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-bold text-white">{c.title}</div>
              <CopyButton text={command} label={c.title} />
            </div>
            <pre tabIndex={0} className="text-[12px] text-cyan-300 bg-black/50 p-2 rounded font-mono overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"><code>{command}</code></pre>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] m-0">
              <div><dt className="sr-only">Success looks like</dt><dd className="m-0 text-emerald-300"><span aria-hidden="true">✓ </span><Inline md={c.ok} /></dd></div>
              <div><dt className="sr-only">Failure looks like</dt><dd className="m-0 text-red-300"><span aria-hidden="true">✗ </span><Inline md={c.fail} /></dd></div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

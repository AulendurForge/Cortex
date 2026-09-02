'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';

// Sub-section imports
import WelcomeToCortex from './gettingStarted/WelcomeToCortex';
import FirstModelTutorial from './gettingStarted/FirstModelTutorial';
import EnvironmentDiagnostics from './gettingStarted/EnvironmentDiagnostics';

type SubTab = {
  id: string;
  label: string;
  icon: string;
  content: React.ReactNode;
};

const SUB_TABS: SubTab[] = [
  { id: 'welcome', label: 'Welcome', icon: '👋', content: <WelcomeToCortex /> },
  { id: 'first-model', label: 'First Model', icon: '🚀', content: <FirstModelTutorial /> },
  { id: 'diagnostics', label: 'Environment', icon: '🔧', content: <EnvironmentDiagnostics /> },
];

export default function GettingStarted() {
  const [activeTab, setActiveTab] = useState('welcome');

  const searchParams = useSearchParams();

  // Sync with the URL hash for deep linking: on mount, whenever the query changes and on
  // hashchange. Next's soft navigation does not emit hashchange for a hash-only change, so
  // in-guide links dispatch one themselves (see WelcomeToCortex).
  useEffect(() => {
    const sync = (e?: HashChangeEvent) => {
      let hash = window.location.hash;
      if (e?.newURL) {
        try { hash = new URL(e.newURL).hash; } catch { /* keep the current hash */ }
      }
      hash = hash.replace('#', '');
      if (hash && SUB_TABS.find((t) => t.id === hash)) setActiveTab(hash);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [searchParams]);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
    window.history.replaceState(null, '', `#${tabId}`);
  }, []);

  const activeContent = SUB_TABS.find(t => t.id === activeTab)?.content;

  return (
    <section className="space-y-4 duration-700">
      <header className="space-y-2 text-center md:text-left">
        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Getting Started</h1>
        <p className="text-white/60 text-sm leading-relaxed max-w-3xl">
          Your guide to deploying and managing LLMs with Cortex. Start here to understand the platform, 
          spin up your first model, and verify your environment is properly configured.
        </p>
      </header>

      {/* Sub-tab Navigation */}
      <nav 
        role="tablist" 
        aria-label="Getting Started Sections" 
        className="flex flex-wrap items-center gap-1.5 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-cyan-500/5 p-1.5 rounded-xl border border-white/10"
      >
        {SUB_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
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
                isActive 
                  ? 'bg-white/15 text-white shadow-inner border border-white/10' 
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              )}
              type="button"
            >
              <span className="text-sm" aria-hidden="true">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Content Panel */}
      <div 
        id={`panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab}`}
        className="slide-in-from-bottom-1 duration-300"
      >
        {activeContent}
      </div>
    </section>
  );
}

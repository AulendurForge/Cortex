'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/cn';

// Sub-section imports
import ModelsOverview from './models/ModelsOverview';
import EngineGuide from './models/EngineGuide';
import AddingModels from './models/AddingModels';
import ConfigurationGuide from './models/ConfigurationGuide';
import ModelOperations from './models/ModelOperations';
import RecipesGuide from './models/RecipesGuide';
import TroubleshootingGuide from './models/TroubleshootingGuide';

type SubTab = {
  id: string;
  label: string;
  icon: string;
  content: React.ReactNode;
};

const SUB_TABS: SubTab[] = [
  { id: 'overview', label: 'Overview', icon: '📋', content: <ModelsOverview /> },
  { id: 'engines', label: 'Engines', icon: '⚙️', content: <EngineGuide /> },
  { id: 'adding', label: 'Adding Models', icon: '➕', content: <AddingModels /> },
  { id: 'config', label: 'Configuration', icon: '🔧', content: <ConfigurationGuide /> },
  { id: 'operations', label: 'Operations', icon: '🎮', content: <ModelOperations /> },
  { id: 'recipes', label: 'Recipes', icon: '📜', content: <RecipesGuide /> },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: '🔍', content: <TroubleshootingGuide /> },
];

export default function ManageModels() {
  const [activeTab, setActiveTab] = useState('overview');

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
        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Model Management</h1>
        <p className="text-white/60 text-sm leading-relaxed max-w-3xl">
          Deploy, configure, and manage models with Cortex. This guide covers everything 
          from choosing the right inference engine to optimizing performance for your workloads.
        </p>
      </header>

      {/* Sub-tab Navigation */}
      <nav 
        role="tablist" 
        aria-label="Model Management Sections" 
        className="flex flex-wrap items-center gap-1.5 bg-gradient-to-r from-emerald-500/5 via-cyan-500/5 to-blue-500/5 p-1.5 rounded-xl border border-white/10"
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
                'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300',
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

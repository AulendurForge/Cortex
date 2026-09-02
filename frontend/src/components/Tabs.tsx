'use client';

import { ReactNode, useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '../lib/cn';

export type TabConfig = {
  id: string;
  label: string;
  content: ReactNode;
};

export function Tabs({ tabs, defaultId }: { tabs: TabConfig[]; defaultId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeId = useMemo(() => {
    const tabFromQuery = (searchParams as any)?.get?.('tab') as string | null | undefined;
    const firstId = tabs.length > 0 ? (tabs[0]?.id ?? '') : '';
    return tabFromQuery || defaultId || firstId;
  }, [searchParams, defaultId, tabs]);

  const onSelect = useCallback(
    (id: string) => {
      const base = (searchParams as any)?.toString?.() || '';
      const params = new URLSearchParams(base);
      params.set('tab', id);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Sections" className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 glass shadow-lg w-fit overflow-x-auto max-w-full no-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              className={cn(
                'px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-300 whitespace-nowrap',
                isActive 
                  ? 'bg-white/15 text-white shadow-inner border border-white/10' 
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              )}
              onClick={() => onSelect(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="glass rounded-3xl p-5 shadow-2xl border-white/5 bg-white/[0.02]">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              id={`panel-${tab.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${tab.id}`}
              hidden={!isActive}
              className="focus:outline-none duration-500"
            >
              {isActive && tab.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}



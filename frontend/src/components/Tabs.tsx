'use client';

import { ReactNode, useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '../lib/cn';

export type TabConfig = {
  id: string;
  label: string;
  content: ReactNode;
};

/**
 * URL-driven tabs (`?tab=<id>`). An unknown id falls back to the first tab instead of an empty
 * panel; arrow keys move between tabs (roving tabindex), Home/End jump to the ends.
 * Needs a Suspense boundary in the page (useSearchParams).
 */
export function Tabs({ tabs, defaultId }: { tabs: TabConfig[]; defaultId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listRef = useRef<HTMLDivElement | null>(null);

  const activeId = useMemo(() => {
    const wanted = searchParams?.get('tab') || defaultId || tabs[0]?.id || '';
    return tabs.some((t) => t.id === wanted) ? wanted : (tabs[0]?.id ?? '');
  }, [searchParams, defaultId, tabs]);

  const onSelect = useCallback(
    (id: string) => {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('tab', id);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex((t) => t.id === activeId);
    if (idx < 0) return;
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    const id = tabs[next]?.id;
    if (!id) return;
    onSelect(id);
    listRef.current?.querySelector<HTMLButtonElement>(`#tab-${CSS.escape(id)}`)?.focus();
  };

  return (
    <div className="flex flex-col gap-6">
      <div ref={listRef} role="tablist" aria-label="Sections" onKeyDown={onKeyDown} className="flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10 glass shadow-lg w-fit overflow-x-auto max-w-full no-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                'px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-300 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60',
                isActive ? 'bg-white/15 text-white shadow-inner border border-white/10' : 'text-white/50 hover:text-white/80 hover:bg-white/5',
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
            <div key={tab.id} id={`panel-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`} hidden={!isActive} className="focus:outline-none">
              {isActive && tab.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { cn } from '@/lib/cn';

/** Collapsible group header used for advanced sections. */
export function Collapsible({
  title,
  icon,
  color = 'blue',
  children,
  defaultOpen = false,
  count,
}: {
  title: string;
  icon?: string;
  color?: 'blue' | 'orange' | 'cyan' | 'amber' | 'green' | 'purple' | 'slate';
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  const colors: Record<string, string> = {
    blue: 'border-blue-500 text-blue-400',
    orange: 'border-orange-500 text-orange-400',
    cyan: 'border-cyan-500 text-cyan-400',
    amber: 'border-amber-500 text-amber-400',
    green: 'border-green-500 text-green-400',
    purple: 'border-purple-500 text-purple-400',
    slate: 'border-slate-500 text-slate-300',
  };
  const [border, text] = (colors[color] ?? colors.blue ?? '').split(' ');
  return (
    <details className={cn('md:col-span-2 mt-2 border-l-2 pl-4', border)} open={defaultOpen}>
      <summary className={cn('cursor-pointer text-sm flex items-center gap-2 select-none', text)}>
        {icon && <span aria-hidden>{icon}</span>} {title}
        {count !== undefined && <span className="text-[10px] text-white/40">({count} set)</span>}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

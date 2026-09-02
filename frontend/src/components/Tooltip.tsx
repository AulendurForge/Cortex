'use client';

import React, { useId, useState } from 'react';
import { cn } from '../lib/cn';

/**
 * Keyboard-reachable info tooltip: a button that shows its text on hover,
 * focus, or click, and exposes it through aria-describedby.
 */
export function Tooltip({ text, className = '', label = 'More info' }: { text: string; className?: string; label?: string }) {
  const id = useId();
  const [pinned, setPinned] = useState(false);
  return (
    <span className={cn('relative inline-block group align-middle', className)}>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-full text-white/70 hover:text-white focus:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60 align-middle"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={pinned}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPinned((p) => !p); }}
        onBlur={() => setPinned(false)}
        onKeyDown={(e) => { if (e.key === 'Escape') setPinned(false); }}
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 8.5v.01M11 11.5h1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-[100] left-1/2 -translate-x-1/2 -top-2 translate-y-[-100%] bg-black/95 text-white text-[10px] leading-snug px-3 py-2 rounded-lg shadow-2xl border border-white/10 w-48 whitespace-normal text-left backdrop-blur-md',
          pinned ? 'block' : 'hidden group-hover:block group-focus-within:block',
        )}
      >
        {text}
      </span>
    </span>
  );
}

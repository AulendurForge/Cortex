'use client';

import { cn } from '@/lib/cn';
import { safeCopyToClipboard } from '@/lib/clipboard';
import { useToast } from '@/providers/ToastProvider';
import { useInterpolate } from './FactsContext';

/** Copy `text` and announce the result through a toast. */
export function useCopy() {
  const { addToast } = useToast();
  return async (text: string, label: string) => {
    const ok = await safeCopyToClipboard(text);
    addToast(ok ? { title: `${label} copied`, kind: 'success' } : { title: 'Copy failed', kind: 'error' });
  };
}

export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const copy = useCopy();
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => void copy(text, label)}
      className={cn('shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-cyan-300 hover:text-cyan-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 transition-colors', className)}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      Copy
    </button>
  );
}

/**
 * A command or snippet. One copy button (labelled for screen readers), a focusable `<pre>` so
 * keyboard users can scroll long lines, tokens interpolated from the facts in scope.
 */
export function CodeBlock({ text, lang, label, copy = true, compact = false, className }: { text: string; lang?: string; label?: string; copy?: boolean; compact?: boolean; className?: string }) {
  const interpolate = useInterpolate();
  const resolved = interpolate(text);
  const name = label ?? (lang ? `${lang} snippet` : 'command');
  return (
    <figure className={cn('bg-black/50 rounded-lg border border-white/10 overflow-hidden my-0', className)}>
      {(label || lang || copy) && (
        <figcaption className={cn('flex items-center justify-between gap-2 px-3 bg-white/5 border-b border-white/10', compact ? 'py-1' : 'py-1.5')}>
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/60 truncate">
            {label ?? lang ?? 'Terminal'}
            {label && lang ? <span className="ml-2 font-normal normal-case tracking-normal text-white/50">{lang}</span> : null}
          </span>
          {copy ? <CopyButton text={resolved} label={name} /> : null}
        </figcaption>
      )}
      <pre tabIndex={0} className={cn('p-3 text-[12px] leading-relaxed text-white/85 font-mono overflow-x-auto whitespace-pre focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60', compact && 'py-2')}>
        <code>{resolved}</code>
      </pre>
    </figure>
  );
}

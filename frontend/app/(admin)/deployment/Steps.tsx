'use client';

import React from 'react';
import { InfoBox } from '../../../src/components/UI';
import { cn } from '../../../src/lib/cn';

/** Numbered step heading used by both wizards. */
export function StepHeader({ n, title, hint, done = false }: { n: number; title: string; hint?: React.ReactNode; done?: boolean }) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <span
        className={cn(
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border',
          done ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200' : 'bg-cyan-500/15 border-cyan-400/30 text-cyan-200'
        )}
        aria-hidden
      >
        {done ? '✓' : n}
      </span>
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-white/90">{title}</h2>
        {hint && <div className="text-[11px] text-white/50 mt-0.5 leading-relaxed">{hint}</div>}
      </div>
    </div>
  );
}

/** Checkbox row with a label and an explanation. */
export function Toggle({
  checked, onChange, label, help, disabled = false,
}: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; help?: React.ReactNode; disabled?: boolean }) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03] transition-colors',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/[0.06]'
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 accent-cyan-400"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="text-sm text-white/90">{label}</span>
        {help && <span className="block text-[11px] text-white/50 mt-0.5 leading-relaxed">{help}</span>}
      </span>
    </label>
  );
}

export function ErrorAlert({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <InfoBox variant="error" title={title} role="alert">
      <div className="break-words">{children}</div>
    </InfoBox>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-[12px] text-white/60 leading-relaxed">
      {children}
    </div>
  );
}

export function Stat({ label, value, tone = 'default' }: { label: string; value: React.ReactNode; tone?: 'default' | 'ok' | 'bad' | 'warn' }) {
  const tones = {
    default: 'text-white/90',
    ok: 'text-emerald-200',
    bad: 'text-red-200',
    warn: 'text-amber-200',
  };
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">{label}</div>
      <div className={cn('text-sm font-semibold', tones[tone])}>{value}</div>
    </div>
  );
}

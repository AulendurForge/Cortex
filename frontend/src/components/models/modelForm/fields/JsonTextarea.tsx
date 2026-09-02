'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/cn';
import { EngineDefaultMark, FieldShell } from './FieldShell';

function jsonError(text: string | undefined): string | null {
  if (!text || !text.trim()) return null;
  try {
    const v: unknown = JSON.parse(text);
    if (!v || typeof v !== 'object') return 'Must be a JSON object or array';
    return null;
  } catch (e) {
    return `Invalid JSON: ${(e as Error).message}`;
  }
}

/** Textarea for JSON-valued fields with inline validation. */
export function JsonTextarea({
  label,
  value,
  onChange,
  placeholder,
  help,
  tooltip,
  rows = 4,
  className = '',
}: {
  label: React.ReactNode;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  help?: React.ReactNode;
  tooltip?: string;
  rows?: number;
  className?: string;
}) {
  const id = useId();
  const err = jsonError(value);
  return (
    <FieldShell label={label} help={help} tooltip={tooltip} htmlFor={id} className={className} badge={<EngineDefaultMark value={value} />}>
      <textarea
        id={id}
        className={cn('input font-mono text-xs min-h-[70px]', err && 'border-red-500/50')}
        rows={rows}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        aria-invalid={!!err}
        spellCheck={false}
      />
      {err && <div className="text-[11px] text-red-300 mt-1" role="alert">{err}</div>}
    </FieldShell>
  );
}

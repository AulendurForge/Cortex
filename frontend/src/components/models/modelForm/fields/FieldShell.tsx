'use client';

import React from 'react';
import { Tooltip } from '@/components/Tooltip';
import { cn } from '@/lib/cn';

/** Label + optional help/tooltip wrapper used by every form field. */
export function FieldShell({
  label,
  help,
  tooltip,
  children,
  className = '',
  htmlFor,
  badge,
}: {
  label: React.ReactNode;
  help?: React.ReactNode;
  tooltip?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className={cn('text-sm', className)}>
      <div className="flex items-center gap-1.5 text-white/80">
        <label htmlFor={htmlFor}>{label}</label>
        {badge}
      </div>
      <div className="mt-1">{children}</div>
      {(help || tooltip) && (
        <p className="text-[11px] text-white/50 mt-1">
          {help}{help && tooltip ? ' ' : ''}{tooltip && <Tooltip text={tooltip} />}
        </p>
      )}
    </div>
  );
}

export function EngineDefaultMark({ value, engineDefault }: { value: unknown; engineDefault?: unknown }) {
  if (value !== undefined && value !== null && value !== '') return null;
  return (
    <span className="text-[10px] text-cyan-300/80 italic whitespace-nowrap">
      (engine default{engineDefault !== undefined && engineDefault !== null ? `: ${String(engineDefault)}` : ''})
    </span>
  );
}

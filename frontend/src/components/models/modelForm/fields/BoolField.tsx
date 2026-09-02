'use client';

import React, { useId } from 'react';
import { Tooltip } from '@/components/Tooltip';
import { cn } from '@/lib/cn';

/**
 * Boolean input.  `tri` renders unset / on / off (for negatable flags where
 * "unset" means the engine default); otherwise a plain checkbox where unset
 * is the same as off.
 */
export function BoolField({
  label,
  value,
  onChange,
  tri = false,
  help,
  tooltip,
  disabled,
  className = '',
  engineDefault,
}: {
  label: React.ReactNode;
  value: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
  tri?: boolean;
  help?: React.ReactNode;
  tooltip?: string;
  disabled?: boolean;
  className?: string;
  engineDefault?: unknown;
}) {
  const id = useId();
  if (!tri) {
    return (
      <div className={cn('text-sm', className)}>
        <label htmlFor={id} className="inline-flex items-center gap-2 text-white/80">
          <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
          <span>{label}</span>
          {tooltip && <Tooltip text={tooltip} />}
        </label>
        {help && <p className="text-[11px] text-white/50 mt-1 ml-6">{help}</p>}
      </div>
    );
  }
  const state = value === undefined ? 'default' : value ? 'on' : 'off';
  const btn = (key: 'default' | 'on' | 'off', text: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={state === key}
      disabled={disabled}
      onClick={() => onChange(key === 'default' ? undefined : key === 'on')}
      className={cn(
        'px-2 py-0.5 text-[11px] rounded border transition-colors',
        state === key ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-100' : 'bg-white/5 border-white/10 text-white/50 hover:text-white/80',
      )}
    >
      {text}
    </button>
  );
  return (
    <div className={cn('text-sm', className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-white/80">{label}</span>
        {tooltip && <Tooltip text={tooltip} />}
        <div role="radiogroup" aria-label={typeof label === 'string' ? label : undefined} className="inline-flex gap-1">
          {btn('default', engineDefault !== undefined && engineDefault !== null ? `Default (${engineDefault ? 'on' : 'off'})` : 'Default')}
          {btn('on', 'On')}
          {btn('off', 'Off')}
        </div>
      </div>
      {help && <p className="text-[11px] text-white/50 mt-1">{help}</p>}
    </div>
  );
}

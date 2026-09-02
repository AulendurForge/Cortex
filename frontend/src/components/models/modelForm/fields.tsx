'use client';

import React, { useId } from 'react';
import { NumberField } from '../../NumberField';
import { Tooltip } from '../../Tooltip';
import { cn } from '../../../lib/cn';

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

/**
 * A range slider paired with a NumberField.  Unset stays unset: the slider
 * only commits a value when the admin drags it, and a Reset control clears it
 * back to "engine default".
 */
export function SliderNumber({
  label,
  value,
  onChange,
  min,
  max,
  step,
  integer = false,
  engineDefault,
  help,
  tooltip,
  unit,
  className = '',
}: {
  label: React.ReactNode;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  engineDefault?: number | string;
  help?: React.ReactNode;
  tooltip?: string;
  unit?: string;
  className?: string;
}) {
  const id = useId();
  const sliderValue = value ?? (typeof engineDefault === 'number' ? engineDefault : min);
  return (
    <FieldShell label={label} help={help} tooltip={tooltip} htmlFor={id} className={className} badge={<EngineDefaultMark value={value} engineDefault={engineDefault} />}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={sliderValue}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-cyan-400"
          aria-label={typeof label === 'string' ? `${label} slider` : 'slider'}
        />
        <NumberField
          id={id}
          className="w-28 text-xs"
          min={min}
          max={max}
          step={step}
          integer={integer}
          value={value}
          placeholder={engineDefault !== undefined ? `default ${engineDefault}` : 'default'}
          onChange={onChange}
        />
        {unit && <span className="text-[10px] text-white/40">{unit}</span>}
        {value !== undefined && (
          <button type="button" className="text-[10px] text-white/50 hover:text-white underline" onClick={() => onChange(undefined)}>
            Reset
          </button>
        )}
      </div>
    </FieldShell>
  );
}

export type SelectOption = { value: string; label: string };

/** Select whose empty option maps to undefined (engine default), never ''. */
export function SelectField({
  label,
  value,
  onChange,
  options,
  emptyLabel = 'engine default',
  allowEmpty = true,
  help,
  tooltip,
  disabled,
  className = '',
  badge,
  engineDefault,
}: {
  label: React.ReactNode;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: ReadonlyArray<SelectOption | string>;
  emptyLabel?: string;
  allowEmpty?: boolean;
  help?: React.ReactNode;
  tooltip?: string;
  disabled?: boolean;
  className?: string;
  badge?: React.ReactNode;
  engineDefault?: unknown;
}) {
  const id = useId();
  const opts: SelectOption[] = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <FieldShell label={label} help={help} tooltip={tooltip} htmlFor={id} className={className} badge={badge ?? (allowEmpty ? <EngineDefaultMark value={value} engineDefault={engineDefault} /> : null)}>
      <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)} disabled={disabled}>
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {opts.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </FieldShell>
  );
}

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

export function jsonError(text: string | undefined): string | null {
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

/** Plain text input whose empty value maps to undefined. */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  help,
  tooltip,
  disabled,
  className = '',
  mono = false,
  readOnly = false,
}: {
  label: React.ReactNode;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  help?: React.ReactNode;
  tooltip?: string;
  disabled?: boolean;
  className?: string;
  mono?: boolean;
  readOnly?: boolean;
}) {
  const id = useId();
  return (
    <FieldShell label={label} help={help} tooltip={tooltip} htmlFor={id} className={className} badge={<EngineDefaultMark value={value} />}>
      <input
        id={id}
        className={cn('input', mono && 'font-mono text-xs')}
        value={value ?? ''}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      />
    </FieldShell>
  );
}

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

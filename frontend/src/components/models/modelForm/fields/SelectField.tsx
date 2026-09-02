'use client';

import React, { useId } from 'react';
import { EngineDefaultMark, FieldShell } from './FieldShell';

type SelectOption = { value: string; label: string };

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

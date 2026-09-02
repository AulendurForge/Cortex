'use client';

import React, { useId } from 'react';
import { cn } from '@/lib/cn';
import { EngineDefaultMark, FieldShell } from './FieldShell';

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

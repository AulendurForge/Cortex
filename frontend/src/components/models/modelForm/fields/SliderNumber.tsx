'use client';

import React, { useId } from 'react';
import { NumberField } from '@/components/NumberField';
import { EngineDefaultMark, FieldShell } from './FieldShell';

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

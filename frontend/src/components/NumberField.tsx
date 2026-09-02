'use client';

import React from 'react';
import { cn } from '../lib/cn';

export type NumberFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max' | 'step'> & {
  /** Current numeric value; undefined/null renders an empty field. */
  value: number | null | undefined;
  /** Called with the parsed number, or undefined when the field is cleared. */
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  /** When false, clearing the field restores the previous value on blur. Default true. */
  allowEmpty?: boolean;
  /** Round committed values to integers. */
  integer?: boolean;
  /** Shown as placeholder when the field is empty (e.g. the engine default). */
  placeholder?: string;
};

const PARTIAL = /^-?\d*\.?\d*$/;

function isPartial(text: string): boolean {
  // Intermediate states while typing a number: "", "-", ".", "-.", "1.", "-0."
  return text === '' || text === '-' || text === '.' || text === '-.' || text.endsWith('.');
}

/**
 * A number input that lets the user clear the field, type a leading "-",
 * or type "0." without the value snapping back to a default.
 *
 * The text the user is typing is kept locally; the numeric value is committed
 * to the parent as soon as the text parses, and cleared (undefined) when the
 * field is emptied.  On blur, an unparsable draft is dropped and the field
 * shows the last committed value (clamped to min/max when given).
 */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  allowEmpty = true,
  integer = false,
  placeholder,
  className = '',
  onBlur,
  onFocus,
  ...rest
}: NumberFieldProps) {
  const format = (v: number | null | undefined) => (v === undefined || v === null || Number.isNaN(v) ? '' : String(v));
  const [draft, setDraft] = React.useState<string>(format(value));
  const [focused, setFocused] = React.useState(false);
  const lastCommitted = React.useRef<number | undefined>(value ?? undefined);

  // Reflect external changes while the user is not editing.
  React.useEffect(() => {
    if (!focused) {
      setDraft(format(value));
      lastCommitted.current = value ?? undefined;
    }
  }, [value, focused]);

  const commit = (n: number | undefined) => {
    lastCommitted.current = n;
    onChange(n);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value.replace(/,/g, '.');
    if (!PARTIAL.test(text)) return; // ignore letters and other junk
    setDraft(text);
    if (text === '') {
      if (allowEmpty) commit(undefined);
      return;
    }
    if (isPartial(text)) return; // wait for more input
    const n = Number(text);
    if (Number.isFinite(n)) commit(integer ? Math.round(n) : n);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    let n: number | undefined = lastCommitted.current;
    const parsed = Number(draft);
    if (draft !== '' && Number.isFinite(parsed) && !isPartial(draft)) n = integer ? Math.round(parsed) : parsed;
    if (n === undefined && !allowEmpty) n = value ?? undefined;
    if (n !== undefined) {
      if (min !== undefined && n < min) n = min;
      if (max !== undefined && n > max) n = max;
    }
    if (n !== lastCommitted.current || draft !== format(n)) commit(n);
    setDraft(format(n));
    onBlur?.(e);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    onFocus?.(e);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={cn('input', className)}
      value={draft}
      placeholder={placeholder}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      data-min={min}
      data-max={max}
      data-step={step}
    />
  );
}

export default NumberField;

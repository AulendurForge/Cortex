'use client';

import React from 'react';
import { RangeSlider } from '../RangeSlider';
import { cn } from '../../lib/cn';

export type RangeStop = { label: string; value: number };

const DEFAULT_STOPS: RangeStop[] = [
  { label: '15m', value: 15 },
  { label: '1h', value: 60 },
  { label: '3h', value: 180 },
  { label: '6h', value: 360 },
  { label: '12h', value: 720 },
  { label: '24h', value: 1440 },
];

export function TimeRangeControls({
  minutes,
  onChange,
  live,
  onToggleLive,
  stops = DEFAULT_STOPS,
  className = '',
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  live: boolean;
  onToggleLive: (next: boolean) => void;
  stops?: RangeStop[];
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <RangeSlider
        stops={stops.map((s) => ({ label: s.label, value: s.value }))}
        value={minutes}
        onChange={(v) => onChange(v)}
        className="w-72"
      />
      <button type="button" aria-pressed={live} className={cn('btn text-xs', live ? 'bg-emerald-500/20 border border-emerald-400/30' : '')} onClick={() => onToggleLive(!live)}>{live ? 'Live: On' : 'Live: Off'}</button>
    </div>
  );
}

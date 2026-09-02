'use client';

import type { StepItem } from '../types';
import { Inline } from './inline';
import { useInterpolate } from './FactsContext';
import { CodeBlock } from './CodeBlock';

/** Numbered steps; each step may carry a description and one command with a copy button. */
export function Steps({ items }: { items: StepItem[] }) {
  const interpolate = useInterpolate();
  return (
    <ol className="space-y-4 list-none m-0 p-0">
      {items.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden="true" className="shrink-0 w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-[11px] font-bold text-blue-200">{i + 1}</span>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="text-[13px] font-bold text-white"><span className="sr-only">Step {i + 1}: </span>{interpolate(step.title)}</div>
            {step.md ? <p className="text-[12px] text-white/75 leading-relaxed max-w-3xl"><Inline md={step.md} /></p> : null}
            {step.code ? <CodeBlock text={step.code} label={interpolate(step.title)} compact /> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

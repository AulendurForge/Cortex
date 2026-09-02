'use client';

import React from 'react';
import { cn } from '../../../../lib/cn';
import type { StepConfig } from './types';

function getGemBg(hex: string, active: boolean, disabled: boolean) {
  if (disabled) return 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${active ? 0.12 : 0.04})`;
}

/**
 * One accordion column of the workflow.  Columns behave as tabs: keyboard
 * reachable, Enter/Space activate, aria-selected/aria-disabled announced.
 */
export function WorkflowStepColumn({
  step,
  idx,
  isActive,
  isPast,
  isDisabled,
  onSelect,
  header,
  children,
}: {
  step: StepConfig;
  idx: number;
  isActive: boolean;
  isPast: boolean;
  isDisabled: boolean;
  onSelect: () => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const panelId = `workflow-step-${step.type}`;
  return (
    <div
      role="tab"
      id={`${panelId}-tab`}
      aria-selected={isActive}
      aria-disabled={isDisabled}
      aria-controls={panelId}
      tabIndex={isDisabled ? -1 : 0}
      className={cn(
        'relative transition-all duration-500 ease-in-out border-r border-white/5 flex flex-col focus:outline-none',
        isActive ? 'flex-[10] opacity-100' : 'flex-1 cursor-pointer hover:opacity-100 focus-visible:ring-2 focus-visible:ring-cyan-400/60',
        isDisabled ? 'cursor-not-allowed opacity-40' : 'opacity-80',
      )}
      style={{ backgroundColor: getGemBg(step.gemColor, isActive, isDisabled), borderLeft: isActive ? `4px solid ${step.gemColor}` : 'none' }}
      onClick={() => !isDisabled && !isActive && onSelect()}
      onKeyDown={(e) => {
        if (isDisabled || isActive) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      }}
    >
      {!isActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 h-full w-full pointer-events-none overflow-hidden">
          <div className="rotate-180 flex flex-col items-center gap-6" style={{ writingMode: 'vertical-rl' }}>
            <span className="text-sm font-black uppercase tracking-[0.2em] whitespace-nowrap" style={{ color: isDisabled ? 'rgba(255,255,255,0.3)' : step.gemColor }}>
              Step 0{idx + 1}
            </span>
            <span className={cn('text-xl font-extrabold whitespace-nowrap drop-shadow-sm', isDisabled ? 'text-white/40' : 'text-white')}>
              {step.title}
            </span>
          </div>
          {isPast && <div className="mt-6 text-emerald-400 font-bold text-xl" aria-label="completed">✓</div>}
        </div>
      )}

      {isActive && (
        <div id={panelId} role="tabpanel" aria-labelledby={`${panelId}-tab`} className="p-4 overflow-y-auto h-full flex flex-col relative custom-scrollbar" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <header className="sticky top-0 z-20 -mx-4 -mt-4 px-4 py-3 border-b border-white/5 bg-black/40 backdrop-blur-md flex items-center justify-between shrink-0 mb-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wider border-white/20 text-white/80" style={{ backgroundColor: getGemBg(step.gemColor, true, false), color: step.gemColor }}>
                  STEP 0{idx + 1}
                </span>
                {isPast && <span className="text-emerald-400 text-[10px] font-bold ml-1">✓ COMPLETED</span>}
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">{step.title}</h2>
            </div>
            <div className="flex items-center gap-2">{header}</div>
          </header>
          <div className="flex-1 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">{children}</div>
        </div>
      )}
    </div>
  );
}

'use client';

import React from 'react';
import type { GGUFGroup } from './inspectTypes';
import { MetadataBadges } from './MetadataBadges';
import { getQuantInfo } from './quantInfo';

interface GGUFGroupSelectorProps {
  groups: GGUFGroup[];
  selectedGroup: string;
  onSelectGroup: (quantType: string, firstFile: string) => void;
  onShowMergeHelp: () => void;
}

// Static classes so Tailwind's JIT can see every variant.
const SELECTED_BORDER = {
  emerald: 'border-emerald-400',
  blue: 'border-blue-400',
  amber: 'border-amber-400',
} as const;

function QualityBars({ value, max = 5, type }: { value: number; max?: number; type: 'quality' | 'speed' }) {
  const activeColor = type === 'quality' ? 'bg-emerald-400' : 'bg-blue-400';
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <div key={i} className={`w-1.5 h-3 rounded-sm ${i < value ? activeColor : 'bg-white/20'}`} />
      ))}
    </div>
  );
}

function QuantizationBadge({ quantType }: { quantType: string }) {
  const info = getQuantInfo(quantType);
  if (!info) return null;

  return (
    <div className="flex items-center gap-3 text-[10px] text-white/70 mt-1">
      <div className="flex items-center gap-1" title={`Quality: ${info.quality}/5 - Higher = better output quality`}>
        <span className="text-white/50">Quality:</span>
        <QualityBars value={info.quality} type="quality" />
      </div>
      <div className="flex items-center gap-1" title={`Speed: ${info.speed}/5 - Higher = faster inference`}>
        <span className="text-white/50">Speed:</span>
        <QualityBars value={info.speed} type="speed" />
      </div>
      <span className="text-white/40">~{info.bits} bits/weight</span>
    </div>
  );
}

export function GGUFGroupSelector({ groups, selectedGroup, onSelectGroup, onShowMergeHelp }: GGUFGroupSelectorProps) {
  if (!groups || groups.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-white/90">Select Quantization Level</div>
        <div className="flex items-center gap-3 text-[10px] text-white/50">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-emerald-400"></span>
            Quality
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-blue-400"></span>
            Speed
          </span>
        </div>
      </div>
      {groups.map((group) => {
        const isSelected = selectedGroup === group.quant_type;
        // Allow selection if: ready, OR complete multi-part (will auto-merge)
        const canSelect = group.can_use || group.status === 'complete_but_needs_merge';
        const isDisabled = group.status === 'incomplete' || group.status === 'merged_available';
        const statusColor = group.can_use ? 'emerald' : group.status === 'complete_but_needs_merge' ? 'blue' : 'amber';
        const borderClass = isSelected
          ? SELECTED_BORDER[statusColor]
          : canSelect
            ? 'border-white/10 hover:border-white/30'
            : 'border-amber-500/30';
        const quantInfo = getQuantInfo(group.quant_type);

        return (
          <label
            key={group.quant_type}
            className={`block p-3 rounded border-2 ${borderClass} ${
              canSelect ? 'cursor-pointer bg-white/5 hover:bg-white/10' : 'cursor-not-allowed bg-white/5 opacity-70'
            } transition-all`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="gguf_group"
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => onSelectGroup(group.quant_type, group.files[0] || '')}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-white">{group.display_name}</span>
                  {group.is_recommended && (
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-medium rounded border border-emerald-500/40">
                      RECOMMENDED
                    </span>
                  )}
                  {group.can_use ? (
                    <span className="text-emerald-300 text-xs">✓ Ready</span>
                  ) : (
                    <span className="text-amber-300 text-xs">⚠ {group.status.replace(/_/g, ' ')}</span>
                  )}
                </div>

                <QuantizationBadge quantType={group.quant_type} />
                <MetadataBadges metadata={group.metadata} />
                {quantInfo && <div className="text-[10px] text-white/50 mt-0.5 italic">{quantInfo.description}</div>}

                <div className="text-xs text-white/60 mt-1 space-y-0.5">
                  {group.is_multipart ? (
                    <div>Multi-part: {group.actual_parts} files{group.expected_parts && ` (${group.actual_parts}/${group.expected_parts})`}</div>
                  ) : (
                    <div>File: {group.files[0]}</div>
                  )}
                  <div>Size: {group.total_size_mb.toFixed(0)} MB</div>
                </div>

                {group.warning && (
                  <div className="text-[11px] text-amber-300 mt-2 flex items-start gap-1">
                    <span>⚠</span>
                    <span>{group.warning}</span>
                    {group.status === 'complete_but_needs_merge' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onShowMergeHelp();
                        }}
                        className="ml-2 underline hover:text-amber-200"
                      >
                        How to merge?
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}

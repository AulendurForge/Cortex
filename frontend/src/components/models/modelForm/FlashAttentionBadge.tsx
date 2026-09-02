'use client';

import React from 'react';
import type { GpuInfo } from '../../../lib/validators';

/** Compact FA2 capability badge for the primary GPU (SM 80+ required). */
export function FlashAttentionBadge({ gpu }: { gpu: GpuInfo | undefined }) {
  if (!gpu) return null;
  if (gpu.flash_attention_supported === true) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 border border-green-500/30 whitespace-nowrap">FA2 ✓ {gpu.architecture || ''}</span>;
  }
  if (gpu.flash_attention_supported === false) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">FA2 ✗ {gpu.architecture || ''}</span>;
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-300 border border-gray-500/30 whitespace-nowrap" title="GPU compute capability unknown. FA2 requires SM 80+ (Ampere/Ada/Hopper).">
      FA2 ?
    </span>
  );
}

export function FlashAttentionWarning({ gpu, active }: { gpu: GpuInfo | undefined; active: boolean }) {
  if (!active || !gpu || gpu.flash_attention_supported !== false) return null;
  return (
    <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 mt-1 md:col-span-3">
      ⚠️ {gpu.name || gpu.architecture || 'This GPU'} does not support Flash Attention 2 (needs SM 80+: Ampere/Ada/Hopper). Use auto or another backend.
    </div>
  );
}

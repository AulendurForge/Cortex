'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';

interface GpuInfo {
  index: number;
  name?: string | null;
  mem_total_mb?: number | null;
  mem_used_mb?: number | null;
}

interface GpuSelectorProps {
  selectedGpus: number[];
  onGpuSelectionChange: (gpuIndices: number[]) => void;
  gpuInfo?: GpuInfo[];
  engineType: 'vllm' | 'llamacpp';
  /** Number of GPU slots to render. Defaults to what discovery reports. */
  maxGpus?: number;
}

const HARD_MAX = 16;

/**
 * How many GPU slots to show: whatever discovery reports, but never fewer
 * than the highest GPU already selected (so a saved multi-GPU configuration
 * stays visible even when Prometheus/NVML is unavailable).
 */
export function visibleGpuSlots(gpuInfo: GpuInfo[] | undefined, selected: number[], hint?: number): number {
  const discovered = gpuInfo && gpuInfo.length > 0 ? Math.max(...gpuInfo.map(g => g.index + 1), gpuInfo.length) : 0;
  const highestSelected = selected.length > 0 ? Math.max(...selected) + 1 : 0;
  return Math.max(1, discovered, highestSelected, hint || 0);
}

export function GpuSelector({
  selectedGpus,
  onGpuSelectionChange,
  gpuInfo = [],
  engineType,
  maxGpus,
}: GpuSelectorProps) {
  const discoveryAvailable = gpuInfo.length > 0;
  const [extraSlots, setExtraSlots] = React.useState(0);
  const slots = Math.min(HARD_MAX, visibleGpuSlots(gpuInfo, selectedGpus, maxGpus) + extraSlots);

  const emit = (indices: number[]) => {
    onGpuSelectionChange(Array.from(new Set(indices)).sort((a, b) => a - b));
  };

  const handleGpuToggle = (gpuIndex: number) => {
    if (selectedGpus.includes(gpuIndex)) {
      emit(selectedGpus.filter(i => i !== gpuIndex));
    } else {
      emit([...selectedGpus, gpuIndex]);
    }
  };

  const handleSelectAll = () => {
    const available = discoveryAvailable ? gpuInfo.map(g => g.index) : Array.from({ length: slots }, (_, i) => i);
    emit(available);
  };

  const handleSelectNone = () => emit([]);

  const getGpuDisplayName = (index: number) => {
    const gpu = gpuInfo.find(g => g.index === index);
    return gpu?.name ? `GPU ${index} • ${gpu.name}` : `GPU ${index}`;
  };

  const getGpuMemoryInfo = (index: number) => {
    const gpu = gpuInfo.find(g => g.index === index);
    if (gpu?.mem_total_mb) {
      const totalGb = (gpu.mem_total_mb / 1024).toFixed(1);
      const usedGb = gpu.mem_used_mb ? (gpu.mem_used_mb / 1024).toFixed(1) : '0.0';
      return `${usedGb}/${totalGb} GiB`;
    }
    return '';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-white/70">
          GPU Selection
          <Tooltip text={
            engineType === 'vllm'
              ? 'Select which GPUs to use for tensor parallelism. The model will be split across selected GPUs.'
              : 'Select which GPUs to use for model distribution. llama.cpp will distribute the model across selected GPUs.'
          } />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-xs px-2 py-1 bg-blue-500/20 border border-blue-500/40 rounded hover:bg-blue-500/30"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={handleSelectNone}
            disabled={selectedGpus.length === 0}
            className="text-xs px-2 py-1 bg-gray-500/20 border border-gray-500/40 rounded hover:bg-gray-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Select None
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Array.from({ length: slots }, (_, index) => {
          const isSelected = selectedGpus.includes(index);
          const memoryInfo = getGpuMemoryInfo(index);
          return (
            <label
              key={index}
              className={`
                flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors
                ${isSelected
                  ? 'bg-green-500/20 border-green-500/40 text-green-200'
                  : 'bg-gray-800/50 border-gray-600/40 text-white hover:bg-gray-700/50'
                }
              `}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleGpuToggle(index)}
                className="rounded border-gray-400 text-green-600 focus:ring-green-500"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{getGpuDisplayName(index)}</div>
                {memoryInfo && <div className="text-xs text-white/60">{memoryInfo}</div>}
              </div>
            </label>
          );
        })}
      </div>

      <div className="text-xs text-white/60 flex items-center gap-2 flex-wrap">
        <span>
          Selected: {selectedGpus.length} GPU{selectedGpus.length !== 1 ? 's' : ''}
          {selectedGpus.length > 0 && <span className="ml-2">({selectedGpus.join(', ')})</span>}
        </span>
        {!discoveryAvailable && slots < HARD_MAX && (
          <button
            type="button"
            onClick={() => setExtraSlots(n => n + 1)}
            className="text-[11px] px-2 py-0.5 bg-white/5 border border-white/10 rounded hover:bg-white/10"
            title="GPU discovery is unavailable (no Prometheus/DCGM or NVML). Add a slot to select a GPU index manually."
          >
            + Add GPU slot
          </button>
        )}
      </div>

      {!discoveryAvailable && (
        <div className="text-[11px] text-amber-200/80 bg-amber-500/10 border border-amber-500/20 rounded p-2">
          GPU discovery is unavailable, so names and memory are not shown. Slots reflect your saved selection; add slots to pick higher GPU indices.
        </div>
      )}

      {selectedGpus.length === 0 && (
        <div className="text-[11px] text-red-200 bg-red-500/10 border border-red-500/30 rounded p-2">
          No GPU selected. {engineType === 'vllm' ? 'Set device to CPU or select at least one GPU.' : 'Set GPU layers (ngl) to 0 for CPU-only or select at least one GPU.'}
        </div>
      )}

      {engineType === 'vllm' && selectedGpus.length > 1 && (
        <div className="text-xs text-blue-200 bg-blue-500/10 border border-blue-500/30 rounded p-2">
          <div className="font-medium">Tensor Parallelism Active</div>
          <div>Model will be split across {selectedGpus.length} GPUs for improved memory efficiency and potential speedup.</div>
        </div>
      )}

      {engineType === 'llamacpp' && selectedGpus.length > 1 && (
        <div className="text-xs text-green-200 bg-green-500/10 border border-green-500/30 rounded p-2">
          <div className="font-medium">Multi-GPU Distribution Active</div>
          <div>Model will be distributed across {selectedGpus.length} GPUs using tensor split.</div>
        </div>
      )}
    </div>
  );
}

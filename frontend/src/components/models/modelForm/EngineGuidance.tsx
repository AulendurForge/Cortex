'use client';

import React from 'react';
import type { EngineRecommendation } from './inspectTypes';

interface EngineGuidanceProps {
  engineType: 'vllm' | 'llamacpp' | undefined;
  recommendation: EngineRecommendation | null | undefined;
  useGguf: boolean;
  onSwitchEngine: (engine: 'vllm' | 'llamacpp') => void;
  onSwitchToSafeTensors: () => void;
  onShowMergeHelp: () => void;
}

/**
 * Contextual engine guidance from the folder inspection.  Policy: GGUF files
 * are always served by llama.cpp; SafeTensors folders are recommended for vLLM.
 */
export function EngineGuidance({ engineType, recommendation, useGguf, onSwitchEngine, onSwitchToSafeTensors, onShowMergeHelp }: EngineGuidanceProps) {
  if (!recommendation) return null;
  const { has_multipart_gguf, has_safetensors, has_gguf } = recommendation;

  // vLLM with GGUF is not allowed (gguf_requires_llamacpp).
  if (engineType === 'vllm' && has_gguf && useGguf) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3" role="alert" data-testid="guidance-gguf-vllm">
        <div className="flex items-start gap-3">
          <span className="text-amber-400 text-xl flex-shrink-0">⚠️</span>
          <div className="space-y-1">
            <p className="text-amber-200 font-medium">GGUF files are served by llama.cpp</p>
            <p className="text-amber-200/70 text-sm">vLLM's GGUF loader is not supported by Cortex; the gateway rejects vLLM + GGUF (gguf_requires_llamacpp).</p>
          </div>
        </div>
        <div className="space-y-2 ml-8">
          <button type="button" onClick={() => onSwitchEngine('llamacpp')} className="w-full text-left px-4 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition">
            <div className="flex items-center gap-2"><span className="text-emerald-400 font-medium">✓ Recommended</span><span className="text-white/90">Switch to llama.cpp</span></div>
            <p className="text-emerald-300/60 text-xs mt-1">Native GGUF support{has_multipart_gguf ? ', loads multi-part files directly' : ''}.</p>
          </button>
          {has_safetensors && (
            <button type="button" onClick={onSwitchToSafeTensors} className="w-full text-left px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 transition">
              <div className="flex items-center gap-2"><span className="text-blue-400 font-medium">○ Alternative</span><span className="text-white/90">Use the SafeTensors weights with vLLM</span></div>
              <p className="text-blue-300/60 text-xs mt-1">Highest throughput for standard architectures.</p>
            </button>
          )}
        </div>
      </div>
    );
  }

  // llama.cpp chosen for a SafeTensors-only folder.
  if (engineType === 'llamacpp' && has_safetensors && !has_gguf) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3" role="alert" data-testid="guidance-safetensors-llamacpp">
        <p className="text-amber-200 text-sm"><strong>No GGUF in this folder.</strong> llama.cpp needs a .gguf file; this folder holds SafeTensors, which vLLM serves.</p>
        <button type="button" onClick={() => onSwitchEngine('vllm')} className="text-blue-300 hover:text-blue-200 underline text-sm mt-1">Switch to vLLM</button>
      </div>
    );
  }

  // llama.cpp with GGUF when SafeTensors are also present: informational.
  if (engineType === 'llamacpp' && has_safetensors && has_gguf && useGguf) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-lg p-3">
        <p className="text-white/60 text-xs">
          SafeTensors weights are also in this folder. For maximum throughput consider{' '}
          <button type="button" onClick={onSwitchToSafeTensors} className="text-blue-400 hover:text-blue-300 underline">vLLM with SafeTensors</button>.
          {has_multipart_gguf && <> Multi-part GGUF loads natively in llama.cpp; <button type="button" onClick={onShowMergeHelp} className="underline text-white/70">merging</button> is optional.</>}
        </p>
      </div>
    );
  }

  if (engineType === 'llamacpp' && has_multipart_gguf && useGguf) {
    return (
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
        <p className="text-emerald-200/80 text-xs">Multi-part GGUF detected — llama.cpp loads the split files directly; point it at the first part (done automatically).</p>
      </div>
    );
  }

  return null;
}

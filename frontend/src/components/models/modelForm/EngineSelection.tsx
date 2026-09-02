'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';
import type { EngineRecommendation } from './inspectTypes';

interface EngineSelectionProps {
  engineType: 'vllm' | 'llamacpp' | undefined;
  onChange: (engineType: 'vllm' | 'llamacpp') => void;
  mode: 'online' | 'offline';
  onModeChange: (mode: 'offline') => void;
  modeLocked?: boolean;
  engineRecommendation?: EngineRecommendation | null;
  /** The inspected folder holds GGUF only: vLLM is not selectable. */
  ggufOnly?: boolean;
  ggufEngine?: 'vllm' | 'llamacpp';
}

export function EngineSelection({ engineType, onChange, mode, onModeChange, modeLocked, engineRecommendation, ggufOnly = false, ggufEngine = 'llamacpp' }: EngineSelectionProps) {
  if (modeLocked) return null;
  const vllmDisabled = ggufOnly && ggufEngine === 'llamacpp';
  const rec = engineRecommendation;

  return (
    <div className={`md:col-span-2 p-4 rounded-lg border transition-colors ${vllmDisabled ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-blue-500/5 border-blue-500/20'}`}>
      <label className="text-sm font-medium flex items-center gap-2" htmlFor="engine-select">
        <span className="text-blue-400">Step 1:</span> Choose Inference Engine
        <Tooltip text="vLLM serves SafeTensors / Hugging Face checkpoints with the highest throughput. llama.cpp serves GGUF files (any quantization, CPU+GPU hybrid, multi-part files)." />
      </label>
      <select
        id="engine-select"
        className="input mt-2 font-medium"
        value={engineType || ''}
        onChange={(e) => {
          const next = e.target.value as 'vllm' | 'llamacpp';
          onChange(next);
          if (next === 'llamacpp' && mode === 'online') onModeChange('offline');
        }}
      >
        <option value="" disabled>Select an engine to begin...</option>
        <option value="vllm" disabled={vllmDisabled}>vLLM — SafeTensors / Hugging Face models (best throughput){vllmDisabled ? ' — not available for GGUF' : ''}</option>
        <option value="llamacpp">llama.cpp — GGUF models (offline only)</option>
      </select>

      {vllmDisabled && (
        <p className="mt-2 text-xs text-emerald-200/90" data-testid="gguf-policy-note">
          This folder contains GGUF files only. GGUF is always served by llama.cpp, so vLLM is disabled.
        </p>
      )}

      {rec && mode === 'offline' && !vllmDisabled && (
        <div className="mt-2">
          {rec.recommended === 'llamacpp' && engineType !== 'llamacpp' && (
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
              <span className="text-amber-200 text-xs">💡 {rec.has_multipart_gguf ? 'Multi-part GGUF detected — llama.cpp required' : 'GGUF folder — llama.cpp required'}</span>
              <button type="button" onClick={() => onChange('llamacpp')} className="text-amber-300 hover:text-amber-200 underline text-xs ml-1">Switch</button>
            </div>
          )}
          {rec.recommended === 'vllm' && engineType !== 'vllm' && rec.has_safetensors && (
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20">
              <span className="text-blue-200 text-xs">💡 SafeTensors available — vLLM recommended for best performance</span>
              <button type="button" onClick={() => onChange('vllm')} className="text-blue-300 hover:text-blue-200 underline text-xs ml-1">Switch</button>
            </div>
          )}
        </div>
      )}

      <details className="text-[11px] text-white/60 mt-2">
        <summary className="cursor-pointer hover:text-white/80 font-medium">📖 How to choose the right engine</summary>
        <div className="mt-3 space-y-3 bg-white/5 p-3 rounded border border-white/10">
          <div>
            <div className="text-emerald-300 font-medium mb-1">✅ Choose vLLM when you have:</div>
            <ul className="list-disc pl-5 space-y-1">
              <li>A SafeTensors checkpoint (Hugging Face repo or local folder): Llama, Mistral, Qwen, Phi, Gemma, Nemotron, …</li>
              <li>Many concurrent users and a need for maximum throughput</li>
              <li>Tensor / pipeline / expert parallelism across several GPUs</li>
            </ul>
          </div>
          <div>
            <div className="text-emerald-300 font-medium mb-1">✅ Choose llama.cpp when you have:</div>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong className="text-cyan-300">GGUF files</strong> (single or multi-part) — always served by llama.cpp</li>
              <li>Aggressive quantization needs (Q4_K_M, Q5_K_M) for tight VRAM</li>
              <li>CPU+GPU hybrid inference or CPU-only hosts (MoE experts on CPU)</li>
              <li>Architectures vLLM cannot load (e.g. GPT-OSS Harmony)</li>
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}

'use client';

import React from 'react';
import { TextField } from '../fields';
import { EngineImageFields } from './EngineStep';
import type { WorkflowCtx } from './types';

function Row({ label, value, mono = true }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 text-xs">
      <span className="w-28 shrink-0 text-white/40 uppercase tracking-wider text-[10px]">{label}</span>
      <span className={mono ? 'font-mono text-white/80 break-all' : 'text-white/80'}>{value ?? '—'}</span>
    </div>
  );
}

/**
 * Configure mode: read-only source (engine, mode, path/repo, image) plus the
 * few source-level fields that stay editable after creation.
 */
export function SourcePanel({ ctx }: { ctx: WorkflowCtx }) {
  const { values, set, spec } = ctx;
  const engine = values.engine_type || 'vllm';
  const image = values.engine_image || spec.images[engine] || '(system default)';
  return (
    <div className="space-y-4">
      <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/90">Source (read-only)</h3>
          <span className="text-[10px] text-white/40">Engine, mode and path are fixed after creation — delete and re-add to change them.</span>
        </div>
        <Row label="Engine" value={engine === 'llamacpp' ? 'llama.cpp' : 'vLLM'} mono={false} />
        <Row label="Mode" value={values.mode === 'online' ? 'Online (Hugging Face)' : 'Offline (local folder)'} mono={false} />
        {values.mode === 'online' ? <Row label="Repo" value={values.repo_id} /> : <Row label="Path" value={`${ctx.baseDir ? ctx.baseDir.replace(/\/$/, '') + '/' : ''}${values.local_path || ''}`} />}
        <Row label="Image" value={image} />
        <Row label="Task" value={values.task} mono={false} />
      </div>

      <EngineImageFields ctx={ctx} />

      {engine === 'vllm' && (
        <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
          <h3 className="text-sm font-semibold text-white/90 mb-2">Tokenizer & config overrides (optional)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextField label="Tokenizer (HF repo or path)" value={values.tokenizer} onChange={(v) => set('tokenizer', v)} placeholder="engine default (from the model)" mono help="--tokenizer. Only needed when the checkpoint ships without a usable tokenizer." />
            <TextField label="HF config path" value={values.hf_config_path} onChange={(v) => set('hf_config_path', v)} placeholder="engine default" mono help="--hf-config-path. A folder with a compatible config.json." />
          </div>
        </div>
      )}
    </div>
  );
}

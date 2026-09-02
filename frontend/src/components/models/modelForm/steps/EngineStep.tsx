'use client';

import React from 'react';
import { NumberField } from '../../../NumberField';
import { EngineSelection } from '../EngineSelection';
import { ModeSelection } from '../ModeSelection';
import { FieldShell, TextField } from '../fields';
import type { WorkflowCtx } from './types';

/** Engine image / version / startup timeout — shared by the Add engine step and the Configure source panel. */
export function EngineImageFields({ ctx }: { ctx: WorkflowCtx }) {
  const { values, set, spec } = ctx;
  const engine = values.engine_type || 'vllm';
  const defaultImage = spec.images[engine] || (engine === 'vllm' ? 'vllm/vllm-openai:<pinned>' : 'ghcr.io/ggml-org/llama.cpp:server-cuda');
  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-amber-400" aria-hidden>🐳</span>
        <h3 className="text-sm font-semibold text-white/90">Engine image & startup</h3>
      </div>
      <p className="text-xs text-white/60 mb-3">
        Leave the image blank to use the pinned system default (<code className="bg-white/10 px-1 rounded">{defaultImage}</code>).
        Override it for models that need a newer engine build.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TextField
          label="Docker image"
          value={values.engine_image}
          onChange={(v) => set('engine_image', v)}
          placeholder={defaultImage}
          mono
          help="Must be pulled or pre-loaded on this host; the dry run checks the cache."
        />
        <TextField
          label="Version tag (reference)"
          value={values.engine_version}
          onChange={(v) => set('engine_version', v)}
          placeholder="e.g. v0.28.0"
          help="Documentation only; not used to start the container."
        />
        <FieldShell label="Startup timeout (s)" help="How long the model may take to become ready before it is marked failed.">
          <NumberField integer min={30} value={values.startup_timeout_sec} onChange={(v) => set('startup_timeout_sec', v)} placeholder="system default" aria-label="Startup timeout seconds" />
        </FieldShell>
      </div>
      {engine === 'vllm' && (
        <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-200">
          <strong>Tip:</strong> Nemotron, newer Qwen and other recent architectures may need a vLLM build newer than the pinned default.
        </div>
      )}
    </div>
  );
}

/** Step 1 of the Add workflow: engine, source mode, image override. */
export function EngineStep({ ctx }: { ctx: WorkflowCtx }) {
  const { values, set, spec, specIsFallback, switchEngine, inspect, ggufOnly, modeLocked } = ctx;
  return (
    <div className="space-y-4">
      {specIsFallback && (
        <div className="text-[11px] text-amber-200/80 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2">
          Using the bundled engine spec: the gateway spec could not be loaded yet. Options will refresh when it is reachable.
        </div>
      )}
      <EngineSelection
        engineType={values.engine_type}
        onChange={switchEngine}
        mode={values.mode}
        onModeChange={(m) => set('mode', m)}
        modeLocked={modeLocked}
        engineRecommendation={inspect?.engine_recommendation ?? null}
        ggufOnly={ggufOnly}
        ggufEngine={spec.policies.gguf_engine ?? 'llamacpp'}
      />
      <ModeSelection mode={values.mode} onChange={(m) => set('mode', m)} engineType={values.engine_type} modeLocked={modeLocked} />
      {values.engine_type && <EngineImageFields ctx={ctx} />}
    </div>
  );
}

'use client';

import React from 'react';
import { BasicModelInfo } from '../BasicModelInfo';
import { VLLMConfiguration } from '../VLLMConfiguration';
import { LlamaCppConfiguration } from '../LlamaCppConfiguration';
import type { WorkflowCtx } from './types';

/** Core settings: identity + engine-specific configuration. */
export function CoreStep({ ctx }: { ctx: WorkflowCtx }) {
  const { values, set, spec, gpus, gpuCount, modeLocked } = ctx;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
      <BasicModelInfo
        name={values.name}
        servedModelName={values.served_model_name}
        task={values.task}
        engineType={values.engine_type}
        onNameChange={(v) => set('name', v)}
        onServedModelNameChange={(v) => set('served_model_name', v)}
        onTaskChange={(v) => set('task', v)}
        modeLocked={modeLocked}
      />
      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-2 border-t border-white/5 pt-3">
        {values.engine_type === 'vllm' ? (
          <VLLMConfiguration values={values} onChange={set} spec={spec} gpus={gpus} gpuCount={gpuCount} />
        ) : (
          <LlamaCppConfiguration values={values} onChange={set} spec={spec} gpus={gpus} gpuCount={gpuCount} />
        )}
      </div>
    </div>
  );
}

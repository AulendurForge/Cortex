'use client';

import React from 'react';
import { CustomArgsEditor } from '../CustomArgsEditor';
import type { WorkflowCtx } from './types';

/** Custom startup args and environment variables (Plane B). */
export function StartupStep({ ctx }: { ctx: WorkflowCtx }) {
  return (
    <div className="space-y-4 h-full">
      <CustomArgsEditor
        args={ctx.customArgs}
        envVars={ctx.customEnv}
        onArgsChange={ctx.setCustomArgs}
        onEnvVarsChange={ctx.setCustomEnv}
        engineType={ctx.values.engine_type || 'vllm'}
        spec={ctx.spec}
      />
    </div>
  );
}

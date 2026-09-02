'use client';

import React, { useMemo, useState } from 'react';
import { Button, PrimaryButton } from '../../UI';
import { EngineSpec, EngineType } from '../../../lib/engine-spec';
import { cn } from '../../../lib/cn';
import { ArgIssue, CustomEnvVar, PROTECTED_ENV, analyzeCustomEnv, isProtectedEnv } from '../customArgs';
import { IssueList } from './CustomArgsEditor';

type Draft = { index: number; key: string; value: string };

/** Environment variables tab of the custom startup editor. */
export function CustomEnvEditor({ envVars, onEnvVarsChange, engineType, spec }: { envVars: CustomEnvVar[]; onEnvVarsChange: (env: CustomEnvVar[]) => void; engineType: EngineType; spec: EngineSpec }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const issues = useMemo(() => analyzeCustomEnv(envVars, engineType, spec), [envVars, engineType, spec]);
  const byRow = useMemo(() => {
    const m = new Map<number, ArgIssue[]>();
    for (const i of issues) m.set(i.index, [...(m.get(i.index) ?? []), i]);
    return m;
  }, [issues]);

  const save = () => {
    if (!draft) return;
    const key = draft.key.trim();
    if (!key) return setDraftError('Variable name is required.');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return setDraftError('Use letters, digits and underscores only.');
    if (isProtectedEnv(key)) return setDraftError(`${key} is managed by Cortex.`);
    const dup = envVars.findIndex((e, i) => i !== draft.index && e.key === key);
    if (dup >= 0) return setDraftError(`${key} is already set (row ${dup + 1}).`);
    const next = { key, value: draft.value };
    if (draft.index === -1) onEnvVarsChange([...envVars, next]);
    else onEnvVarsChange(envVars.map((e, i) => (i === draft.index ? next : e)));
    setDraft(null);
    setDraftError(null);
  };

  return (
    <>
      <div className="mb-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded text-xs">
        <div className="font-medium text-purple-200 mb-1">💡 Common use cases</div>
        <ul className="text-white/70 space-y-1 list-disc pl-4">
          <li><strong>FlashInfer MoE FP8</strong>: <code>VLLM_USE_FLASHINFER_MOE_FP8=1</code> (see presets)</li>
          <li><strong>Attention backend via env</strong>: <code>VLLM_ATTENTION_BACKEND=FLASHINFER</code></li>
          <li><strong>llama.cpp CUDA tuning</strong>: <code>GGML_CUDA_FORCE_MMQ=1</code></li>
        </ul>
      </div>

      {envVars.length > 0 && (
        <div className="space-y-2 mb-3">
          {envVars.map((env, index) => {
            const rowIssues = byRow.get(index) ?? [];
            return (
              <div key={`${env.key}-${index}`} className={cn('p-2 bg-white/5 border rounded', rowIssues.some((i) => i.severity === 'error') ? 'border-red-500/40' : rowIssues.length ? 'border-amber-500/40' : 'border-white/10')}>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-purple-300 font-mono break-all">{env.key}={env.value}</code>
                  <button type="button" onClick={() => { setDraft({ index, key: env.key, value: env.value }); setDraftError(null); }} className="text-xs px-2 py-0.5 bg-blue-500/20 border border-blue-500/40 rounded hover:bg-blue-500/30">Edit</button>
                  <button type="button" onClick={() => onEnvVarsChange(envVars.filter((_, i) => i !== index))} className="text-xs px-2 py-0.5 bg-red-500/20 border border-red-500/40 rounded hover:bg-red-500/30" aria-label={`Delete ${env.key}`}>Delete</button>
                </div>
                <IssueList issues={rowIssues} />
              </div>
            );
          })}
        </div>
      )}

      {draft ? (
        <div className="space-y-3 p-3 bg-white/10 border border-white/20 rounded">
          <div className="text-sm font-medium text-white/90">{draft.index === -1 ? 'Add Environment Variable' : 'Edit Environment Variable'}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">Name <span className="text-red-400">*</span>
              <input className="input mt-1 font-mono text-xs" placeholder="VLLM_USE_FLASHINFER_MOE_FP8" value={draft.key} onChange={(e) => { setDraft({ ...draft, key: e.target.value }); setDraftError(null); }} aria-label="Variable name" />
            </label>
            <label className="text-sm">Value
              <input className="input mt-1" placeholder="1" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} aria-label="Variable value" />
              <p className="text-[10px] text-white/50 mt-1">Empty string allowed.</p>
            </label>
          </div>
          {draftError && <div className="text-xs text-red-300" role="alert">{draftError}</div>}
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => { setDraft(null); setDraftError(null); }}>Cancel</Button>
            <PrimaryButton type="button" onClick={save}>{draft.index === -1 ? 'Add Variable' : 'Save Changes'}</PrimaryButton>
          </div>
        </div>
      ) : (
        <Button type="button" onClick={() => { setDraft({ index: -1, key: '', value: '' }); setDraftError(null); }}>+ Add Environment Variable</Button>
      )}

      <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-white/70">
        <div className="font-medium text-amber-200 mb-1">Protected variables</div>
        Managed by Cortex: {PROTECTED_ENV.map((k) => <code key={k} className="mr-1">{k}</code>)}<code>NCCL_*</code>.
      </div>
    </>
  );
}

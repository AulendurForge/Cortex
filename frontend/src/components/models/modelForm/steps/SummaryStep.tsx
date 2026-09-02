'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import apiFetch, { ApiError } from '../../../../lib/api-clients';
import { cn } from '../../../../lib/cn';
import { DryRunResult, DryRunResultSchema } from '../../../../lib/validators';
import { Button } from '../../../UI';
import { renderArg } from '../../customArgs';
import { toDryRunPayload } from '../../modelFormValues';
import { hasErrors } from '../../validateFormValues';
import type { WorkflowCtx } from './types';

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('p-3 bg-white/5 rounded-lg border border-white/10', className)}>
      <h3 className="text-[10px] font-bold text-white/40 uppercase mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  if (v === undefined || v === null || v === '') return null;
  return <div className="text-[11px] text-white/70"><span className="text-white/40">{k}: </span><span className="font-mono break-all">{v}</span></div>;
}

/**
 * Summary & Launch: identity/source/engine/compute recap, the local
 * validation issue list, and the live dry run (auto-run on open, re-runnable,
 * gating the submit unless the admin explicitly starts anyway).
 */
export function SummaryStep({ ctx }: { ctx: WorkflowCtx }) {
  const { assembled: v, spec, issues, customArgs, customEnv, modelId, source, values, inspect } = ctx;
  const engine = v.engine_type || 'vllm';
  const localErrors = hasErrors(issues);
  const payload = useMemo(() => toDryRunPayload(v, { modelId, spec }), [v, modelId, spec]);
  const payloadKey = JSON.stringify(payload);
  const lastRunKey = useRef<string | null>(null);

  // Plain local state (not useMutation): the request is tiny and this avoids observer/re-render
  // edge cases inside the modal; every run is tagged so a stale response can never overwrite a newer one.
  const [dryRun, setDryRun] = React.useState<{ status: 'idle' | 'pending' | 'success' | 'error'; data?: DryRunResult; error?: ApiError }>({ status: 'idle' });
  const runSeq = useRef(0);
  const runDryRun = React.useCallback(async (body: Record<string, unknown>) => {
    const seq = ++runSeq.current;
    setDryRun({ status: 'pending' });
    try {
      const raw = await apiFetch('/admin/models/dry-run', { method: 'POST', body: JSON.stringify(body) });
      const parsed = DryRunResultSchema.parse(raw);
      if (seq !== runSeq.current) return;
      setDryRun({ status: 'success', data: parsed });
      ctx.setDryRunValid(parsed.valid);
    } catch (e) {
      if (seq !== runSeq.current) return;
      const err = (e && typeof e === 'object' && 'message' in e) ? (e as ApiError) : ({ code: 0, message: String(e) } as ApiError);
      setDryRun({ status: 'error', error: err });
      ctx.setDryRunValid(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.setDryRunValid]);

  useEffect(() => {
    if (localErrors) return;
    if (lastRunKey.current === payloadKey) return;
    lastRunKey.current = payloadKey;
    void runDryRun(payload);
  }, [payloadKey, localErrors, runDryRun, payload]);

  const stale = dryRun.data && lastRunKey.current !== payloadKey;
  const result = dryRun.data;
  const isPending = dryRun.status === 'pending';
  const image = v.engine_image || result?.image || spec.images[engine];
  const gpus = v.selected_gpus ?? [];
  const cpuMode = engine === 'vllm' ? v.device === 'cpu' : gpus.length === 0 || v.ngl === 0;
  const ggufFile = source.useGguf && inspect ? (inspect.gguf_groups.find((g) => g.quant_type === source.selectedGgufGroup)?.files[0] || source.selectedGguf) : (/\.gguf$/i.test(values.local_path || '') ? values.local_path : undefined);

  return (
    <div className="space-y-4 flex flex-col h-full">
      <div className="grid grid-cols-2 gap-3">
        <Panel title="Identity">
          <div className="text-sm font-semibold">{v.name || <span className="text-red-300">(no name)</span>}</div>
          <div className="text-[11px] font-mono text-emerald-400">{v.served_model_name}</div>
          <div className="text-[10px] text-white/60 uppercase">{v.task} · {engine === 'llamacpp' ? 'llama.cpp' : 'vLLM'}</div>
        </Panel>
        <Panel title="Source">
          <Line k="Mode" v={v.mode} />
          {v.mode === 'online' ? <Line k="Repo" v={v.repo_id} /> : <Line k="Path" v={v.local_path} />}
          <Line k="GGUF file" v={ggufFile} />
          <Line k="Tokenizer" v={engine === 'vllm' ? v.tokenizer : undefined} />
          <Line k="HF config" v={engine === 'vllm' ? v.hf_config_path : undefined} />
        </Panel>
        <Panel title="Engine">
          <Line k="Image" v={image} />
          <Line k="Version" v={v.engine_version} />
          <Line k="Startup timeout" v={v.startup_timeout_sec !== undefined ? `${v.startup_timeout_sec}s` : undefined} />
          {result && result.image_cached === false && <div className="text-[11px] text-amber-300 mt-1">Image not cached on this host.</div>}
        </Panel>
        <Panel title="Compute">
          <Line k="GPUs" v={gpus.length > 0 ? `${gpus.length} (${gpus.join(', ')})` : cpuMode ? 'CPU mode' : 'none selected'} />
          {engine === 'vllm' ? (
            <>
              <Line k="TP × PP" v={`${v.tp_size ?? 1} × ${v.pipeline_parallel_size ?? 1}${(v.data_parallel_size ?? 1) > 1 ? ` × DP ${v.data_parallel_size}` : ''}`} />
              <Line k="DType" v={v.dtype} />
              <Line k="Max len" v={v.max_model_len ?? 'model default'} />
              <Line k="GPU mem util" v={v.gpu_memory_utilization ?? 'engine default'} />
            </>
          ) : (
            <>
              <Line k="Context" v={v.context_size ?? 'engine default'} />
              <Line k="Slots" v={v.parallel_slots ?? 'auto'} />
              <Line k="GPU layers" v={v.ngl ?? 'auto'} />
              <Line k="Flash attn" v={v.flash_attn ?? 'auto'} />
              <Line k="Draft model" v={v.draft_model_path} />
            </>
          )}
        </Panel>
        <Panel title="Startup config" className="col-span-2">
          <div className="text-[11px] text-white/70">{customArgs.length} custom arg{customArgs.length === 1 ? '' : 's'} · {customEnv.length} env var{customEnv.length === 1 ? '' : 's'}</div>
          {customArgs.length > 0 && <pre className="text-[10px] font-mono text-cyan-200/80 mt-1 whitespace-pre-wrap">{customArgs.map(renderArg).join('\n')}</pre>}
          {customEnv.length > 0 && <pre className="text-[10px] font-mono text-purple-200/80 mt-1 whitespace-pre-wrap">{customEnv.map((e) => `${e.key}=${e.value}`).join('\n')}</pre>}
        </Panel>
      </div>

      {issues.length > 0 && (
        <div className="space-y-1" role="alert" data-testid="validation-issues">
          <h3 className="text-[10px] font-bold text-white/40 uppercase">Checks</h3>
          {issues.map((i, n) => (
            <div key={n} className={cn('text-[11px] p-1.5 rounded border', i.severity === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-amber-500/10 border-amber-500/30 text-amber-200')}>
              {i.field && <span className="font-mono text-white/50 mr-1">{i.field}:</span>}{i.message}{i.fix && <span className="text-white/60"> — {i.fix}</span>}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto p-3 bg-black/40 rounded-lg border border-white/10 space-y-2" data-testid="dry-run-panel">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-bold text-white/40 uppercase">
            Dry run{result ? (result.valid ? <span className="text-emerald-300 ml-2">✓ valid</span> : <span className="text-red-300 ml-2">✗ errors</span>) : null}
            {stale && <span className="text-amber-300 ml-2">(configuration changed — re-run)</span>}
          </h3>
          <Button type="button" size="sm" onClick={() => { lastRunKey.current = payloadKey; void runDryRun(payload); }} disabled={isPending || localErrors} className="bg-cyan-500/10 border-cyan-500/30 text-cyan-200">
            {isPending ? 'Validating…' : result ? '🔄 Re-run' : '🔍 Run dry run'}
          </Button>
        </div>
        {localErrors && <div className="text-[11px] text-white/50">Fix the errors above to run the dry run.</div>}
        {dryRun.status === 'error' && dryRun.error && <div className="text-[11px] text-red-300">Dry run request failed: {dryRun.error.message}{dryRun.error.request_id ? ` (request ${dryRun.error.request_id})` : ''}</div>}
        {result?.warnings.map((w, i) => (
          <div key={i} className={cn('text-[11px] p-1.5 rounded border', w.severity === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-amber-500/10 border-amber-500/30 text-amber-200')}>
            <strong>{w.title || w.category || w.severity}:</strong> {w.message}{w.fix && <span className="text-white/60"> — {w.fix}</span>}
          </div>
        ))}
        {result?.vram_estimate && typeof result.vram_estimate.required_vram_gb !== 'undefined' && (
          <div className="text-[11px] text-cyan-300 font-mono">Estimated VRAM: {String(result.vram_estimate.required_vram_gb)} GB per GPU</div>
        )}
        {result && (
          <>
            <pre className="text-[9px] text-white/50 overflow-x-auto pt-1 border-t border-white/5 whitespace-pre-wrap break-all">{result.command_str || '(no command)'}</pre>
            {Object.keys(result.env).length > 0 && (
              <pre className="text-[9px] text-purple-200/60 whitespace-pre-wrap break-all">{Object.entries(result.env).map(([k, val]) => `${k}=${val}`).join('\n')}</pre>
            )}
          </>
        )}
        {result && !result.valid && (
          <label className="inline-flex items-center gap-2 text-[11px] text-amber-200 mt-1">
            <input type="checkbox" checked={ctx.acknowledgeDryRun} onChange={(e) => ctx.setAcknowledgeDryRun(e.target.checked)} />
            I understand the dry run reported errors — {modelId ? 'save' : 'launch'} anyway
          </label>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-4 border-t border-white/10 pt-4">
        <div className="text-[11px] text-white/50">
          {!ctx.canSubmit && (localErrors ? 'Resolve the errors above to continue.' : result && !result.valid && !ctx.acknowledgeDryRun ? 'Dry run reported errors; tick the box to proceed anyway.' : isPending ? 'Waiting for the dry run…' : '')}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={ctx.onCancel}>Cancel</Button>
          <Button type="button" size="sm" variant="primary" className="px-8 shadow-lg shadow-indigo-500/20" onClick={ctx.onSubmit} disabled={!ctx.canSubmit || ctx.submitPending} aria-busy={ctx.submitPending}>
            {ctx.submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

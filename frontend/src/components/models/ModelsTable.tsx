'use client';

import React from 'react';
import { Badge, Button, Table, InfoBox } from '../UI';
import { Tooltip } from '../Tooltip';
import { cn } from '../../lib/cn';
import type { ApiError } from '../../lib/api-clients';
import type { ModelItem } from '../../lib/validators';
import { safeCopyToClipboard } from '../../lib/clipboard';
import { useToast } from '../../providers/ToastProvider';

type ModelActions = {
  onLogs: (id: number) => void;
  onRecipe: (id: number) => void;
  onTest: (id: number) => void;
  onStart: (id: number) => void;
  onStop: (id: number) => void;
  onConfig: (id: number) => void;
  onArchive: (id: number) => void;
  onDelete: (id: number) => void;
};

type ModelPending = {
  startingId: number | null;
  stoppingId: number | null;
  testingId: number | null;
};

const STATE_CLASSES: Record<string, string> = {
  running: 'bg-green-500/20 text-green-200',
  loading: 'bg-cyan-500/20 text-cyan-200 animate-pulse',
  starting: 'bg-amber-500/20 text-amber-200',
  stopping: 'bg-amber-500/20 text-amber-200 animate-pulse',
  failed: 'bg-red-500/20 text-red-200',
  down: 'bg-red-500/10 text-red-300',
};

export function StateBadge({ state, reason }: { state: string; reason?: string | null }) {
  const cls = STATE_CLASSES[state] ?? 'bg-white/10 text-white/40';
  return (
    <span className="inline-flex items-center gap-1">
      <Badge className={cn('text-[9px]', cls)} title={reason || undefined}>{state.toUpperCase()}</Badge>
      {reason && state === 'failed' && <Tooltip text={reason} label="Why did it fail?" />}
    </span>
  );
}

/** Error panel for the models list query (5xx / auth / schema drift are never hidden as "no models"). */
export function ModelsListError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const e = error as Partial<ApiError> | undefined;
  const message = (e && typeof e.message === 'string' && e.message) || (error instanceof Error ? error.message : 'Unknown error');
  return (
    <InfoBox variant="error" title="Could not load models" role="alert" className="py-2.5">
      <div className="text-xs">
        {message}
        {typeof e?.code === 'number' && <span className="text-white/50"> (HTTP {e.code})</span>}
        {e?.request_id && <div className="text-[10px] font-mono text-white/40 mt-1">request_id: {e.request_id}</div>}
      </div>
      <div className="mt-2"><Button size="sm" onClick={onRetry}>Retry</Button></div>
    </InfoBox>
  );
}

function ModelRow({ m, isAdmin, actions, pending }: { m: ModelItem; isAdmin: boolean; actions: ModelActions; pending: ModelPending }) {
  const { addToast } = useToast();
  const isStarting = pending.startingId === m.id || m.state === 'starting';
  const isStopping = pending.stoppingId === m.id || m.state === 'stopping';
  const gpuCount = Array.isArray(m.selected_gpus) && m.selected_gpus.length > 0
    ? m.selected_gpus.length
    : m.engine_type === 'llamacpp' && m.tensor_split ? m.tensor_split.split(',').length : (m.tp_size ?? '-');
  const active = m.state === 'running' || m.state === 'loading';
  return (
    <tr className="group">
      <td className="font-semibold text-white text-xs">{m.name}</td>
      <td className="font-mono text-[10px]">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 bg-white/5 rounded border border-white/5 group-hover:border-white/10">{m.served_model_name}</span>
          <button
            type="button"
            aria-label={`Copy served name ${m.served_model_name}`}
            onClick={async () => { const ok = await safeCopyToClipboard(m.served_model_name); addToast(ok ? { title: 'Copied!', kind: 'success' } : { title: 'Copy failed', kind: 'error' }); }}
            className="p-1 bg-emerald-500/10 text-emerald-400 rounded opacity-60 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
        </div>
      </td>
      <td><Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20 text-[9px]">{m.task}</Badge></td>
      <td>
        <Badge className={cn('text-[9px]', m.engine_type === 'llamacpp' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-blue-500/10 text-blue-300')}>
          {m.engine_type === 'llamacpp' ? 'llama.cpp' : 'vLLM'}
        </Badge>
      </td>
      {isAdmin && <td className="text-[11px]" title={Array.isArray(m.selected_gpus) ? `GPUs ${m.selected_gpus.join(', ')}` : undefined}>{gpuCount}</td>}
      {isAdmin && <td className="text-[11px]">{m.dtype ?? (m.engine_type === 'llamacpp' ? 'gguf' : '-')}</td>}
      <td><StateBadge state={m.state} reason={m.state_reason} /></td>
      {isAdmin && (
        <td className="text-right">
          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" onClick={() => actions.onLogs(m.id)} aria-label={`Logs for ${m.name}`}>Logs</Button>
            <Button size="sm" variant="purple" onClick={() => actions.onRecipe(m.id)} aria-label={`Save recipe from ${m.name}`}>Recipe</Button>
            {active && (
              <Button size="sm" variant="cyan" onClick={() => actions.onTest(m.id)} disabled={pending.testingId === m.id || m.state === 'loading'} aria-busy={pending.testingId === m.id}>
                {pending.testingId === m.id ? 'Testing…' : 'Test'}
              </Button>
            )}
            {!active ? (
              <Button size="sm" variant="primary" onClick={() => actions.onStart(m.id)} disabled={isStarting || isStopping} aria-busy={isStarting} aria-label={`Start ${m.name}`}>
                {isStarting ? '…' : 'Start'}
              </Button>
            ) : (
              <Button size="sm" variant={m.state === 'loading' ? 'default' : 'danger'} onClick={() => actions.onStop(m.id)} disabled={isStopping} aria-busy={isStopping} aria-label={`Stop ${m.name}`}>
                {isStopping ? '…' : m.state === 'loading' ? 'Cancel' : 'Stop'}
              </Button>
            )}
            <Button size="sm" onClick={() => actions.onConfig(m.id)} aria-label={`Configure ${m.name}`}>Config</Button>
            <Button size="sm" onClick={() => actions.onArchive(m.id)} disabled={!(m.state === 'stopped' || m.state === 'failed')} title={m.state === 'stopped' || m.state === 'failed' ? undefined : 'Stop the model before archiving it'} aria-label={`Archive ${m.name}`}>Archive</Button>
          </div>
        </td>
      )}
    </tr>
  );
}

export function ModelsTable({ models, isAdmin, actions, pending, isLoading }: { models: ModelItem[]; isAdmin: boolean; actions: ModelActions; pending: ModelPending; isLoading: boolean }) {
  const rows = models.filter((m) => !m.archived);
  return (
    <Table>
      <thead>
        <tr>
          <th>Model Name</th><th>Served As</th><th>Task</th><th>Engine</th>{isAdmin && (<><th>GPUs</th><th>DType</th></>)}<th>State</th>{isAdmin && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => <ModelRow key={m.id} m={m} isAdmin={isAdmin} actions={actions} pending={pending} />)}
        {rows.length === 0 && (
          <tr>
            <td colSpan={isAdmin ? 8 : 5} className="text-white/20 text-xs py-12 text-center italic font-medium uppercase tracking-[0.2em]">
              {isLoading ? 'Loading models…' : 'Zero Active Deployments'}
            </td>
          </tr>
        )}
      </tbody>
    </Table>
  );
}

export function ArchivedModelsTable({ models, actions, pending }: { models: ModelItem[]; actions: Pick<ModelActions, 'onLogs' | 'onDelete' | 'onStop'>; pending?: { stoppingId: number | null } }) {
  return (
    <Table>
      <thead>
        <tr><th>Name</th><th>Served As</th><th>Task</th><th>GPUs</th><th>DType</th><th>State</th><th></th></tr>
      </thead>
      <tbody>
        {models.map((m) => (
          <tr key={m.id}>
            <td className="text-xs text-white/60">{m.name}</td>
            <td className="font-mono text-[9px] text-white/40">{m.served_model_name}</td>
            <td><Badge className="bg-indigo-500/5 text-indigo-300/50 border-indigo-500/10 text-[8px]">{m.task}</Badge></td>
            <td className="text-[10px] text-white/40">{Array.isArray(m.selected_gpus) && m.selected_gpus.length > 0 ? m.selected_gpus.length : (m.tp_size ?? '-')}</td>
            <td className="text-[10px] text-white/40">{m.dtype ?? '-'}</td>
            <td><Badge className="text-[8px] opacity-50">{m.state}</Badge></td>
            <td className="text-right">
              <div className="flex items-center justify-end gap-1.5">
                <Button size="sm" onClick={() => actions.onLogs(m.id)}>Logs</Button>
                {(m.state === 'running' || m.state === 'loading' || m.state === 'starting') && (
                  <Button size="sm" variant="danger" onClick={() => actions.onStop(m.id)} loading={pending?.stoppingId === m.id} aria-label={`Stop ${m.name}`}>Stop</Button>
                )}
                <Button size="sm" variant="danger" onClick={() => actions.onDelete(m.id)} disabled={m.state === 'running' || m.state === 'loading' || m.state === 'starting'}>Delete</Button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

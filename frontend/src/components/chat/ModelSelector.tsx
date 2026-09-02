/**
 * ModelSelector - pick one of the running chat models.
 */

'use client';

import { useId } from 'react';
import type { RunningModel } from '../../lib/chat-client';
import { Select, Badge } from '../UI';
import { cn } from '../../lib/cn';

interface ModelSelectorProps {
  value: string;
  onChange: (modelName: string) => void;
  disabled?: boolean;
  locked?: boolean;
  models?: RunningModel[];
  isLoading?: boolean;
  error?: string | null;
}

/** Embedding models cannot chat; the API already excludes them, this keeps older gateways safe. */
export function chatCapable(models: RunningModel[] | undefined): RunningModel[] {
  return (models ?? []).filter((m) => !(m.task ?? '').toLowerCase().startsWith('embed'));
}

export function ModelSelector({ value, onChange, disabled, locked, models, isLoading, error }: ModelSelectorProps) {
  const id = useId();
  const options = chatCapable(models);
  const selected = options.find((m) => m.served_model_name === value);
  const hasOnlyEmbedding = (models?.length ?? 0) > 0 && options.length === 0;

  if (isLoading && !models) {
    return (
      <div className="flex items-center gap-2" aria-live="polite">
        <div className="h-9 w-48 bg-white/5 rounded-lg animate-pulse" />
        <span className="text-xs text-white/50">Loading models…</span>
      </div>
    );
  }
  if (error) {
    return <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 rounded-lg border border-red-500/20 text-xs text-red-300" role="alert">Could not load models: {error}</div>;
  }
  if (options.length === 0 && !value) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs text-amber-300">
        {hasOnlyEmbedding ? 'Only embedding models are running; start a chat model on the Models page.' : 'No running chat models. Start one on the Models page.'}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="text-xs font-bold text-white/50 uppercase tracking-wider">Model</label>
        {locked && (
          <span className="text-[10px] text-amber-400/90 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
            Locked
          </span>
        )}
      </div>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || locked} selectSize="sm" className={cn('min-w-[200px]', locked && 'opacity-60 cursor-not-allowed')}>
        <option value="">Select a model…</option>
        {options.map((m) => <option key={m.served_model_name} value={m.served_model_name}>{m.served_model_name}</option>)}
        {value && !selected && <option value={value}>{value} (not running)</option>}
      </Select>
      {selected && (
        <Badge className={cn('text-[9px]', selected.engine_type === 'llamacpp' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-blue-500/10 text-blue-300 border-blue-500/20')}>
          {selected.engine_type === 'llamacpp' ? 'llama.cpp' : 'vLLM'}
        </Badge>
      )}
    </div>
  );
}

export default ModelSelector;

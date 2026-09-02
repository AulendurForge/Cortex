'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';
import { useToast } from '../../../providers/ToastProvider';
import { safeCopyToClipboard } from '../../../lib/clipboard';
import { GGUFGroupSelector } from './GGUFGroupSelector';
import { SafeTensorDisplay } from './SafeTensorDisplay';
import { EngineGuidance } from './EngineGuidance';
import { TextField } from './fields';
import { GGUFValidationSummary, InspectResult, hasGguf } from './inspectTypes';
import type { SourceState } from './steps/types';

function GGUFValidationBadge({ validation }: { validation: GGUFValidationSummary | null | undefined }) {
  if (!validation) return null;
  const { total_files, valid_files, invalid_files, warnings, errors } = validation;
  if (invalid_files === 0 && errors.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
          ✓ {valid_files} GGUF file{valid_files !== 1 ? 's' : ''} validated
        </span>
        {warnings.length > 0 && <span className="text-amber-300/70" title={warnings.join('\n')}>⚠ {warnings.length} warning{warnings.length !== 1 ? 's' : ''}</span>}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-300 text-[11px]">
        ❌ {invalid_files} of {total_files} GGUF file{total_files !== 1 ? 's' : ''} failed validation
      </span>
      {errors.length > 0 && (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-red-300/80 hover:text-red-300">View validation errors</summary>
          <ul className="mt-1 space-y-0.5 pl-2 text-red-300/70 max-h-32 overflow-y-auto">{errors.map((err) => <li key={err} className="break-all">• {err}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

interface OfflineModeFieldsProps {
  baseDir: string;
  folders: string[];
  foldersLoading: boolean;
  localPath: string;
  onFolderSelect: (folder: string) => void;
  onRefreshFolders: () => void;
  inspect: InspectResult | null;
  inspectLoading: boolean;
  inspectError: string | null;
  source: SourceState;
  onSourceChange: (patch: Partial<SourceState>) => void;
  engineType: 'vllm' | 'llamacpp' | undefined;
  onSwitchEngine: (engine: 'vllm' | 'llamacpp') => void;
  onShowMergeHelp: () => void;
  tokenizer: string;
  hfConfigPath: string;
  onTokenizerChange: (value: string | undefined) => void;
  onHfConfigPathChange: (value: string | undefined) => void;
  modeLocked?: boolean;
}

/**
 * Offline source: the fixed models directory, folder pick, inspection
 * results (formats, GGUF groups, validation) and engine guidance.
 * GGUF always means llama.cpp; vLLM gets optional tokenizer/config overrides.
 */
export function OfflineModeFields({
  baseDir, folders, foldersLoading, localPath, onFolderSelect, onRefreshFolders,
  inspect, inspectLoading, inspectError, source, onSourceChange, engineType, onSwitchEngine, onShowMergeHelp,
  tokenizer, hfConfigPath, onTokenizerChange, onHfConfigPathChange, modeLocked,
}: OfflineModeFieldsProps) {
  const { addToast } = useToast();
  const gguf = hasGguf(inspect);
  const both = !!inspect && inspect.has_safetensors && gguf;
  const useGguf = source.useGguf;

  const copyPath = async () => {
    const ok = await safeCopyToClipboard(baseDir);
    addToast(ok ? { title: 'Path copied', description: baseDir, kind: 'success' } : { title: 'Copy failed', description: baseDir, kind: 'error' });
  };

  return (
    <>
      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-end">
        <label className="text-sm">Models directory
          <input className="input mt-1 font-mono text-xs opacity-80" value={baseDir || '(loading…)'} readOnly aria-readonly title="Fixed by CORTEX_MODELS_DIR" />
          <p className="text-[11px] text-white/50 mt-1">
            Fixed by <code>CORTEX_MODELS_DIR</code> and mounted into every engine container as <code>/models</code>. Drop model folders here and refresh.
            <Tooltip text="The directory cannot be changed from the UI; set CORTEX_MODELS_DIR for the gateway and restart." />
          </p>
        </label>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={onRefreshFolders} disabled={foldersLoading}>{foldersLoading ? 'Loading…' : 'Refresh'}</button>
          <button type="button" className="btn" onClick={copyPath} disabled={!baseDir} title="Copy path to clipboard">Copy path</button>
        </div>
      </div>

      <label className="text-sm md:col-span-2">Select your model folder
        <select className="input w-full mt-1" value={localPath || ''} onChange={(e) => onFolderSelect(e.target.value)} disabled={modeLocked}>
          <option value="">Select a folder…</option>
          {folders.map((f) => (<option key={f} value={f}>{f}</option>))}
        </select>
        <p className="text-[11px] text-white/50 mt-1">
          A folder with SafeTensors (vLLM) or GGUF files (llama.cpp). It is mounted as <code>/models/&lt;name&gt;</code>.
        </p>
      </label>

      {inspectLoading && (
        <div className="md:col-span-2 p-4 rounded-lg border border-cyan-500/20 bg-cyan-500/5 animate-pulse" role="status">
          <div className="flex items-center gap-3">
            <div className="animate-spin h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full" />
            <div>
              <div className="text-cyan-300 font-medium">Scanning model folder…</div>
              <div className="text-[11px] text-cyan-300/60 mt-0.5">Detecting formats, validating GGUF files and reading metadata</div>
            </div>
          </div>
        </div>
      )}
      {inspectError && !inspectLoading && (
        <div className="md:col-span-2 text-[12px] text-red-200 bg-red-500/10 border border-red-500/30 rounded p-3" role="alert">Folder inspection failed: {inspectError}</div>
      )}

      {!inspectLoading && !!inspect && (
        <div className="md:col-span-2 space-y-3 text-sm">
          {both && (
            <div className="inline-flex items-center gap-4">
              <label className="inline-flex items-center gap-2"><input type="radio" checked={!useGguf} onChange={() => { onSourceChange({ useGguf: false }); if (engineType !== 'vllm') onSwitchEngine('vllm'); }} /> Use SafeTensors (vLLM)</label>
              <label className="inline-flex items-center gap-2"><input type="radio" checked={useGguf} onChange={() => onSourceChange({ useGguf: true })} /> Use GGUF (llama.cpp)</label>
            </div>
          )}
          {!inspect.has_safetensors && gguf && (
            <div className="inline-flex items-center gap-2 text-emerald-300"><span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[10px]">✓</span> GGUF detected — served by llama.cpp</div>
          )}
          {inspect.has_safetensors && !gguf && (
            <div className="inline-flex items-center gap-2 text-emerald-300"><span className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[10px]">✓</span> SafeTensors detected — vLLM recommended</div>
          )}
          {!inspect.has_safetensors && !gguf && (
            <div className="text-amber-200 text-xs">No SafeTensors or GGUF files were found in this folder.</div>
          )}

          <EngineGuidance
            engineType={engineType}
            recommendation={inspect.engine_recommendation}
            useGguf={useGguf}
            onSwitchEngine={onSwitchEngine}
            onSwitchToSafeTensors={() => { onSourceChange({ useGguf: false }); onSwitchEngine('vllm'); }}
            onShowMergeHelp={onShowMergeHelp}
          />

          {!useGguf && inspect.has_safetensors && inspect.safetensor_info && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
              <SafeTensorDisplay info={inspect.safetensor_info} hiddenSize={inspect.hidden_size} numLayers={inspect.num_hidden_layers} numHeads={inspect.num_attention_heads} />
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50 mt-3 pt-3 border-t border-white/5">
                {(inspect.tokenizer_files || []).length > 0 && <span>✓ Tokenizer: {inspect.tokenizer_files.join(', ')}</span>}
                {(inspect.config_files || []).length > 0 && <span>✓ Config: {inspect.config_files.join(', ')}</span>}
              </div>
            </div>
          )}

          {useGguf && (
            <div className="rounded border border-white/10 bg-white/5 p-2 space-y-2">
              {!!inspect.gguf_validation && <GGUFValidationBadge validation={inspect.gguf_validation} />}
              {!!(inspect.warnings || []).length && <div className="text-[11px] text-amber-300/90">Warnings: {inspect.warnings.join(', ')}</div>}
              {inspect.gguf_groups.length > 0 ? (
                <GGUFGroupSelector groups={inspect.gguf_groups} selectedGroup={source.selectedGgufGroup} onSelectGroup={(q, f) => onSourceChange({ selectedGgufGroup: q, selectedGguf: f })} onShowMergeHelp={onShowMergeHelp} />
              ) : (
                <label className="block text-sm">Select GGUF file
                  <select className="input mt-1" value={source.selectedGguf} onChange={(e) => onSourceChange({ selectedGguf: e.target.value, selectedGgufGroup: '' })}>
                    <option value="">Select .gguf…</option>
                    {inspect.gguf_files.map((g) => (<option key={g} value={g}>{g}</option>))}
                  </select>
                </label>
              )}
              <p className="text-[11px] text-white/50">llama.cpp reads the tokenizer and chat template from the GGUF itself; no Hugging Face tokenizer is needed.</p>
            </div>
          )}

          {!useGguf && engineType === 'vllm' && inspect.has_safetensors && (
            <details className="text-sm">
              <summary className="cursor-pointer text-white/70 hover:text-white text-xs">Tokenizer & config overrides (optional)</summary>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <TextField label="Tokenizer (HF repo or path)" value={tokenizer || undefined} onChange={onTokenizerChange} placeholder="engine default (from this folder)" mono help="--tokenizer. Only when the folder lacks a usable tokenizer." />
                <TextField label="HF config path" value={hfConfigPath || undefined} onChange={onHfConfigPathChange} placeholder="engine default" mono help="--hf-config-path. Folder with a compatible config.json." />
              </div>
            </details>
          )}
        </div>
      )}
    </>
  );
}

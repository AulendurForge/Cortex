'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/cn';
import { Button, PrimaryButton } from '../UI';
import { EngineSelection } from './modelForm/EngineSelection';
import { ModeSelection } from './modelForm/ModeSelection';
import { OnlineModeFields } from './modelForm/OnlineModeFields';
import { OfflineModeFields } from './modelForm/OfflineModeFields';
import { BasicModelInfo } from './modelForm/BasicModelInfo';
import { VLLMConfiguration } from './modelForm/VLLMConfiguration';
import { LlamaCppConfiguration } from './modelForm/LlamaCppConfiguration';
import { RequestDefaultsSection } from './modelForm/RequestDefaultsSection';
import { CustomArgsEditor, type CustomArg } from './modelForm/CustomArgsEditor';
import { MergeInstructionsModal } from './modelForm/MergeInstructionsModal';
import { ModelFormValues } from './ModelForm';
import apiFetch from '../../lib/api-clients';
import { useMutation, useQueryClient } from '@tanstack/react-query';

type StepType = 'engine' | 'model' | 'core' | 'startup' | 'request' | 'summary';

interface StepConfig {
  type: StepType;
  title: string;
  color: string;
  gemColor: string;
}

const ADD_STEPS: StepConfig[] = [
  { type: 'engine', title: 'Engine & Mode', color: 'blue', gemColor: '#3b82f6' },
  { type: 'model', title: 'Model Selection', color: 'emerald', gemColor: '#10b981' },
  { type: 'core', title: 'Core Settings', color: 'amber', gemColor: '#f59e0b' },
  { type: 'startup', title: 'Startup Config', color: 'red', gemColor: '#ef4444' },
  { type: 'request', title: 'Request Defaults', color: 'purple', gemColor: '#a855f7' },
  { type: 'summary', title: 'Summary & Launch', color: 'cyan', gemColor: '#06b6d4' },
];

const CONFIG_STEPS: StepConfig[] = [
  { type: 'core', title: 'Core Settings', color: 'amber', gemColor: '#f59e0b' },
  { type: 'startup', title: 'Startup Config', color: 'red', gemColor: '#ef4444' },
  { type: 'request', title: 'Request Defaults', color: 'purple', gemColor: '#a855f7' },
  { type: 'summary', title: 'Summary & Launch', color: 'cyan', gemColor: '#06b6d4' },
];

/**
 * Helper to hex-to-rgba for gemstone backgrounds
 */
function getGemBg(hex: string, active: boolean, disabled: boolean) {
  if (disabled) return 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${active ? 0.12 : 0.04})`;
}

export function ModelWorkflowForm({ 
  onSubmit, 
  onCancel, 
  defaults, 
  fetchBaseDir, 
  saveBaseDir, 
  listLocalFolders, 
  submitLabel, 
  modeLocked = false,
  modelId
}: {
  onSubmit: (v: ModelFormValues) => void;
  onCancel: () => void;
  defaults?: Partial<ModelFormValues>;
  fetchBaseDir?: () => Promise<string>;
  saveBaseDir?: (dir: string) => Promise<void>;
  listLocalFolders?: (base: string) => Promise<string[]>;
  submitLabel?: string;
  modeLocked?: boolean;
  modelId?: number;
}) {
  const queryClient = useQueryClient();
  const currentSteps = modeLocked ? CONFIG_STEPS : ADD_STEPS;
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  
  const [values, setValues] = useState<ModelFormValues>({
    mode: defaults?.mode || 'online',
    repo_id: defaults?.repo_id || '',
    local_path: defaults?.local_path || '',
    name: defaults?.name || '',
    served_model_name: defaults?.served_model_name || '',
    task: (defaults?.task as any) || 'generate',
    dtype: defaults?.dtype || 'auto',
    tp_size: defaults?.tp_size ?? 1,
    selected_gpus: defaults?.selected_gpus ?? [0],
    gpu_memory_utilization: defaults?.gpu_memory_utilization ?? 0.9,
    max_model_len: defaults?.max_model_len ?? 8192,
    max_num_batched_tokens: defaults?.max_num_batched_tokens ?? 2048,
    kv_cache_dtype: defaults?.kv_cache_dtype || '',
    quantization: defaults?.quantization || '',
    block_size: defaults?.block_size ?? undefined,
    swap_space_gb: defaults?.swap_space_gb ?? undefined,
    enforce_eager: defaults?.enforce_eager ?? true,
    trust_remote_code: defaults?.trust_remote_code ?? false,
    hf_offline: defaults?.hf_offline ?? false,
    hf_token: (defaults as any)?.hf_token || '',
    cpu_offload_gb: (defaults as any)?.cpu_offload_gb ?? 0,
    enable_prefix_caching: (defaults as any)?.enable_prefix_caching ?? undefined,
    prefix_caching_hash_algo: (defaults as any)?.prefix_caching_hash_algo ?? '',
    enable_chunked_prefill: (defaults as any)?.enable_chunked_prefill ?? undefined,
    max_num_seqs: (defaults as any)?.max_num_seqs ?? undefined,
    cuda_graph_sizes: (defaults as any)?.cuda_graph_sizes ?? '',
    pipeline_parallel_size: (defaults as any)?.pipeline_parallel_size ?? undefined,
    device: (defaults as any)?.device ?? 'cuda',
    tokenizer: (defaults as any)?.tokenizer || '',
    hf_config_path: (defaults as any)?.hf_config_path || '',
    engine_type: (defaults as any)?.engine_type || defaults?.engine_type || 'vllm',
    ngl: (defaults as any)?.ngl ?? 999,
    tensor_split: (defaults as any)?.tensor_split ?? '',
    batch_size: (defaults as any)?.batch_size ?? 2048,
    ubatch_size: (defaults as any)?.ubatch_size ?? 2048,
    threads: (defaults as any)?.threads ?? 32,
    context_size: (defaults as any)?.context_size ?? 16384,
    parallel_slots: (defaults as any)?.parallel_slots ?? 16,
    rope_freq_base: (defaults as any)?.rope_freq_base ?? undefined,
    rope_freq_scale: (defaults as any)?.rope_freq_scale ?? undefined,
    flash_attention: (defaults as any)?.flash_attention ?? true,
    mlock: (defaults as any)?.mlock ?? true,
    no_mmap: (defaults as any)?.no_mmap ?? false,
    numa_policy: (defaults as any)?.numa_policy ?? 'isolate',
    split_mode: (defaults as any)?.split_mode ?? undefined,
    cache_type_k: (defaults as any)?.cache_type_k ?? 'q8_0',
    cache_type_v: (defaults as any)?.cache_type_v ?? 'q8_0',
    // Speculative decoding for llama.cpp (Gap #6)
    draft_model_path: (defaults as any)?.draft_model_path ?? '',
    draft_n: (defaults as any)?.draft_n ?? 16,
    draft_p_min: (defaults as any)?.draft_p_min ?? 0.5,
    repetition_penalty: (defaults as any)?.repetition_penalty ?? 1.2,
    frequency_penalty: (defaults as any)?.frequency_penalty ?? 0.5,
    presence_penalty: (defaults as any)?.presence_penalty ?? 0.5,
    temperature: (defaults as any)?.temperature ?? 0.8,
    top_k: (defaults as any)?.top_k ?? 40,
    top_p: (defaults as any)?.top_p ?? 0.9,
    custom_request_json: (defaults as any)?.custom_request_json ?? '',
    engine_startup_args_json: (defaults as any)?.engine_startup_args_json || '[]',
    engine_startup_env_json: (defaults as any)?.engine_startup_env_json || '[]',
  });

  const [baseDir, setBaseDir] = useState<string>('');
  const [folders, setFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState<boolean>(false);
  const [loadingInspect, setLoadingInspect] = useState<boolean>(false);
  const [savingBase, setSavingBase] = useState<boolean>(false);
  const [gpuCount, setGpuCount] = useState<number>(1);
  const [inspect, setInspect] = useState<any>(null);
  const [useGguf, setUseGguf] = useState<boolean>(false);
  const [selectedGguf, setSelectedGguf] = useState<string>('');
  const [selectedGgufGroup, setSelectedGgufGroup] = useState<string>('');
  const [useLocalTokenizer, setUseLocalTokenizer] = useState<boolean>(false);
  const [showGgufHelp, setShowGgufHelp] = useState<boolean>(false);
  const [showMergeHelp, setShowMergeHelp] = useState<boolean>(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);

  const dryRun = useMutation({
    mutationFn: async () => {
      if (!modelId) return null;
      return await apiFetch<any>(`/admin/models/${modelId}/dry-run`, { method: 'POST' });
    },
    onSuccess: (r) => { setDryRunResult(r); },
  });

  useEffect(() => {
    let stop = false;
    (async () => {
      if (fetchBaseDir) {
        try { const dir = await fetchBaseDir(); if (!stop) setBaseDir(dir || ''); } catch {}
      }
      try {
        const gpus: any[] = await apiFetch('/admin/system/gpus');
        if (!stop && Array.isArray(gpus) && gpus.length > 0) setGpuCount(gpus.length);
      } catch {}
    })();
    return () => { stop = true; };
  }, [fetchBaseDir]);

  const refreshFolders = React.useCallback(async () => {
    if (!listLocalFolders || !baseDir) { setFolders([]); return; }
    setLoadingFolders(true);
    try { const items = await listLocalFolders(baseDir); setFolders(items || []); } 
    catch { setFolders([]); }
    finally { setLoadingFolders(false); }
  }, [listLocalFolders, baseDir]);

  const runInspect = React.useCallback(async (folder: string) => {
    setInspect(null);
    setLoadingInspect(true);
    setUseGguf(false);
    setSelectedGguf('');
    setSelectedGgufGroup('');
    try {
      const q = new URLSearchParams({ base: baseDir, folder });
      const res: any = await apiFetch(`/admin/models/inspect-folder?${q.toString()}`);
      setInspect(res || null);
      if (res && !res.has_safetensors && ((res.gguf_files||[]).length > 0 || (res.gguf_groups||[]).length > 0)) {
        setUseGguf(true);
      }
      if (res && res.gguf_groups && res.gguf_groups.length > 0) {
        const recommended = res.gguf_groups.find((g: any) => g.is_recommended);
        if (recommended) {
          setSelectedGgufGroup(recommended.quant_type);
          setSelectedGguf(recommended.files[0] || '');
        }
      }
    } catch {}
    finally { setLoadingInspect(false); }
  }, [baseDir]);

  useEffect(() => {
    if (values.mode === 'offline' && baseDir) refreshFolders();
  }, [values.mode, baseDir, refreshFolders]);

  const set = (k: keyof ModelFormValues, v: any) => setValues(prev => ({ ...prev, [k]: v }));

  const handleStepClick = (idx: number) => {
    if (idx <= activeStepIdx || canNavigateTo(idx)) {
      setActiveStepIdx(idx);
    }
  };

  const canNavigateTo = (idx: number) => {
    const step = currentSteps[idx];
    if (!step) return false;
    
    // For Add workflow
    if (!modeLocked) {
      if (step.type === 'model') return !!values.engine_type;
      if (step.type === 'core') return !!values.engine_type && (values.mode === 'online' ? !!values.repo_id : !!values.local_path);
      if (step.type === 'startup') return !!values.name && !!values.served_model_name;
    }
    
    return true;
  };

  const handleFinalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = { ...values };
    if (useGguf && inspect) {
      let gg = selectedGguf;
      if (selectedGgufGroup) {
        const group = inspect.gguf_groups.find((g: any) => g.quant_type === selectedGgufGroup);
        if (group) gg = group.files[0] || '';
      }
      if (gg) next.local_path = `${next.local_path}/${gg}`;
      if (!next.hf_config_path && baseDir) next.hf_config_path = `/models/${values.local_path}`;
      if (useLocalTokenizer) next.tokenizer = '';
    }
    onSubmit(next);
  };

  return (
    <div className="flex h-full min-h-[600px]">
      <div className="flex flex-1 overflow-hidden h-full">
        {currentSteps.map((step, idx) => {
          const isActive = activeStepIdx === idx;
          const isPast = activeStepIdx > idx;
          const isDisabled = !canNavigateTo(idx);

          return (
            <div
              key={step.type}
              className={cn(
                "relative transition-all duration-500 ease-in-out border-r border-white/5 flex flex-col",
                isActive ? "flex-[10] opacity-100" : "flex-1 cursor-pointer hover:opacity-100",
                isDisabled ? "cursor-not-allowed opacity-40" : "opacity-80"
              )}
              style={{
                backgroundColor: getGemBg(step.gemColor, isActive, isDisabled),
                borderLeft: isActive ? `4px solid ${step.gemColor}` : 'none'
              }}
              onClick={() => !isDisabled && handleStepClick(idx)}
            >
              {/* Vertical Header for collapsed states */}
              {!isActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-2 h-full w-full pointer-events-none overflow-hidden">
                  <div className="rotate-180 flex flex-col items-center gap-6" style={{ writingMode: 'vertical-rl' }}>
                    <span className="text-sm font-black uppercase tracking-[0.2em] whitespace-nowrap" style={{ color: isDisabled ? 'rgba(255,255,255,0.3)' : step.gemColor }}>
                      Step 0{idx + 1}
                    </span>
                    <span className={cn(
                      "text-xl font-extrabold whitespace-nowrap drop-shadow-sm",
                      isDisabled ? "text-white/40" : "text-white"
                    )}>
                      {step.title}
                    </span>
                  </div>
                  {isPast && <div className="mt-6 text-emerald-400 font-bold text-xl">✓</div>}
                </div>
              )}

              {/* Active Content */}
              {isActive && (
                <div className="p-4 overflow-y-auto h-full flex flex-col relative custom-scrollbar">
                  <header className="sticky top-0 z-20 -mx-4 -mt-4 px-4 py-3 border-b border-white/5 bg-black/40 backdrop-blur-md flex items-center justify-between shrink-0 mb-6">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full border uppercase tracking-wider", `bg-${step.color}-500/20 border-${step.color}-500/40 text-${step.color}-200`)}>
                          STEP 0{idx + 1}
                        </span>
                        {isPast && <span className="text-emerald-400 text-[10px] font-bold ml-1">✓ COMPLETED</span>}
                      </div>
                      <h2 className="text-xl font-bold text-white tracking-tight">{step.title}</h2>
                    </div>

                    <div className="flex items-center gap-2">
                      {idx < currentSteps.length - 1 ? (
                        <PrimaryButton 
                          type="button"
                          size="sm"
                          className="shadow-lg shadow-indigo-500/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (canNavigateTo(idx + 1)) {
                              setActiveStepIdx(idx + 1);
                            } else {
                              alert('Please complete the required fields in this step before proceeding.');
                            }
                          }}
                        >
                          Next: {currentSteps[idx + 1]?.title} →
                        </PrimaryButton>
                      ) : (
                        <PrimaryButton 
                          type="button"
                          size="sm"
                          className="px-8 shadow-lg shadow-indigo-500/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFinalSubmit(e);
                          }}
                        >
                          {submitLabel || 'Launch Model'}
                        </PrimaryButton>
                      )}
                    </div>
                  </header>

                  <div className="flex-1 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    {step.type === 'engine' && (
                      <div className="space-y-4">
                        <EngineSelection 
                          engineType={values.engine_type} 
                          onChange={(e) => set('engine_type', e)} 
                          mode={values.mode} 
                          onModeChange={(m) => set('mode', m)} 
                          modeLocked={modeLocked} 
                        />
                        <ModeSelection 
                          mode={values.mode} 
                          onChange={(m) => set('mode', m)} 
                          engineType={values.engine_type} 
                          modeLocked={modeLocked} 
                        />
                        
                        {/* Engine Image Override - Critical for models like Nemotron that need specific vLLM versions */}
                        {values.engine_type && (
                          <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded-xl">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-amber-400">🐳</span>
                              <h3 className="text-sm font-semibold text-white/90">Engine Image (Optional)</h3>
                            </div>
                            <p className="text-xs text-white/60 mb-3">
                              Override the default Docker image. Required for some models (e.g., Nemotron needs vLLM ≥0.12.0).
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <label className="text-sm">
                                <span className="text-white/80">Docker Image</span>
                                <input
                                  className="input mt-1"
                                  type="text"
                                  placeholder={values.engine_type === 'vllm' 
                                    ? 'vllm/vllm-openai:v0.12.0' 
                                    : 'ghcr.io/ggml-org/llama.cpp:server-cuda'}
                                  value={values.engine_image || ''}
                                  onChange={(e) => set('engine_image', e.target.value)}
                                />
                                <p className="text-[10px] text-white/50 mt-1">
                                  Leave blank for system default. Examples: <code className="bg-white/10 px-1 rounded">vllm/vllm-openai:v0.12.0</code>, <code className="bg-white/10 px-1 rounded">vllm/vllm-openai:latest</code>
                                </p>
                              </label>
                              <label className="text-sm">
                                <span className="text-white/80">Version Tag (Reference)</span>
                                <input
                                  className="input mt-1"
                                  type="text"
                                  placeholder="e.g., v0.12.0"
                                  value={values.engine_version || ''}
                                  onChange={(e) => set('engine_version', e.target.value)}
                                />
                                <p className="text-[10px] text-white/50 mt-1">
                                  Optional: For tracking/documentation only.
                                </p>
                              </label>
                            </div>
                            {values.engine_type === 'vllm' && (
                              <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-200">
                                <strong>💡 Tip:</strong> Nemotron, newer Qwen models, and other recent architectures may require vLLM v0.12.0 or later.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {step.type === 'model' && (
                      <div className="space-y-4">
                        {values.mode === 'online' ? (
                          <OnlineModeFields 
                            repoId={values.repo_id || ''} 
                            hfToken={values.hf_token || ''} 
                            onRepoIdChange={(v) => set('repo_id', v)} 
                            onHfTokenChange={(v) => set('hf_token', v)} 
                            modeLocked={modeLocked} 
                          />
                        ) : (
                          <OfflineModeFields
                            baseDir={baseDir}
                            folders={folders}
                            localPath={values.local_path || ''}
                            tokenizer={values.tokenizer || ''}
                            hfConfigPath={values.hf_config_path || ''}
                            loadingFolders={loadingFolders}
                            loadingInspect={loadingInspect}
                            savingBase={savingBase}
                            inspect={inspect}
                            useGguf={useGguf}
                            selectedGguf={selectedGguf}
                            selectedGgufGroup={selectedGgufGroup}
                            useLocalTokenizer={useLocalTokenizer}
                            showGgufHelp={showGgufHelp}
                            modeLocked={modeLocked}
                            onBaseDirChange={setBaseDir}
                            onFolderSelect={(f) => { set('local_path', f); runInspect(f); if(!values.name) set('name', f); }}
                            onRefreshFolders={refreshFolders}
                            onSaveBaseDir={saveBaseDir ? async () => { setSavingBase(true); await saveBaseDir(baseDir); await refreshFolders(); setSavingBase(false); } : undefined}
                            onUseGgufChange={setUseGguf}
                            onSelectedGgufChange={setSelectedGguf}
                            onSelectedGgufGroupChange={(q, f) => { setSelectedGgufGroup(q); setSelectedGguf(f); }}
                            onUseLocalTokenizerChange={setUseLocalTokenizer}
                            onShowGgufHelpToggle={() => setShowGgufHelp(!showGgufHelp)}
                            onShowMergeHelp={() => setShowMergeHelp(true)}
                            onTokenizerChange={(v) => set('tokenizer', v)}
                            onHfConfigPathChange={(v) => set('hf_config_path', v)}
                          />
                        )}
                      </div>
                    )}

                    {step.type === 'core' && (
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
                        <div className="md:col-span-2 space-y-3 mt-2 border-t border-white/5 pt-3">
                          {values.engine_type === 'vllm' ? (
                            <VLLMConfiguration values={values} gpuCount={gpuCount} onChange={set} useGguf={useGguf} />
                          ) : (
                            <LlamaCppConfiguration values={values} onChange={set} />
                          )}
                        </div>
                      </div>
                    )}

                    {step.type === 'startup' && (
                      <div className="space-y-4 h-full">
                        <CustomArgsEditor
                          args={JSON.parse(values.engine_startup_args_json || '[]')}
                          envVars={JSON.parse(values.engine_startup_env_json || '[]')}
                          onArgsChange={(a) => set('engine_startup_args_json', JSON.stringify(a))}
                          onEnvVarsChange={(e) => set('engine_startup_env_json', JSON.stringify(e))}
                          engineType={values.engine_type || 'vllm'}
                        />
                      </div>
                    )}

                    {step.type === 'request' && (
                      <div className="space-y-4 h-full">
                        <RequestDefaultsSection values={values} onChange={set} />
                      </div>
                    )}

                    {step.type === 'summary' && (
                      <div className="space-y-4 flex flex-col h-full">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                            <h3 className="text-[10px] font-bold text-white/40 uppercase mb-2">Identity</h3>
                            <div className="space-y-0.5">
                              <div className="text-sm font-semibold">{values.name}</div>
                              <div className="text-[11px] font-mono text-emerald-400">{values.served_model_name}</div>
                              <div className="text-[10px] text-white/60 uppercase">{values.task} · {values.engine_type}</div>
                            </div>
                          </div>
                          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                            <h3 className="text-[10px] font-bold text-white/40 uppercase mb-2">Compute</h3>
                            <div className="space-y-0.5 text-xs">
                              <div>{values.tp_size || 1} GPU(s) {values.dtype && `· ${values.dtype}`}</div>
                              {values.engine_type === 'vllm' ? (
                                <div className="text-[10px] text-white/60">{values.max_model_len} tokens · {values.gpu_memory_utilization} util</div>
                              ) : (
                                <div className="text-[10px] text-white/60">{values.context_size} context · {values.parallel_slots} slots</div>
                              )}
                            </div>
                          </div>
                        </div>

                        {dryRunResult && (
                          <div className="flex-1 overflow-auto p-3 bg-black/40 rounded-lg border border-white/10 space-y-2">
                            <h3 className="text-[10px] font-bold text-white/40 uppercase">Dry Run Validation</h3>
                            {dryRunResult.warnings?.map((w: any, i: number) => (
                              <div key={i} className={cn("text-[11px] p-1.5 rounded border", w.severity === 'error' ? "bg-red-500/10 border-red-500/30 text-red-200" : "bg-amber-500/10 border-amber-500/30 text-amber-200")}>
                                <strong>{w.title}:</strong> {w.message}
                              </div>
                            ))}
                            {dryRunResult.vram_estimate && (
                              <div className="text-[11px] text-cyan-300 font-mono">
                                Required VRAM: {dryRunResult.vram_estimate.required_vram_gb} GB
                              </div>
                            )}
                            <pre className="text-[9px] text-white/40 overflow-x-auto pt-1 border-t border-white/5">
                              {dryRunResult.command_str}
                            </pre>
                          </div>
                        )}

                        <div className="mt-auto flex items-center justify-between gap-4 border-t border-white/10 pt-4">
                          <Button 
                            type="button"
                            variant="default"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); dryRun.mutate(); }} 
                            disabled={dryRun.isPending || !modelId}
                            className="bg-cyan-500/10 border-cyan-500/30 text-cyan-200"
                          >
                            {dryRun.isPending ? 'Validating...' : '🔍 Dry Run'}
                          </Button>
                          <Button type="button" size="sm" onClick={(e) => { e.stopPropagation(); onCancel(); }}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <MergeInstructionsModal open={showMergeHelp} onClose={() => setShowMergeHelp(false)} />
    </div>
  );
}

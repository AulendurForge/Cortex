'use client';

import React from 'react';
import apiFetch from '../../lib/api-clients';
import { useGpus } from '../../hooks/useGpus';
import { useBaseDir } from '../../hooks/useModelSource';
import { Card, Button, Input, Select, SectionTitle, InfoBox, FormField, Badge } from '../UI';
import { Modal } from '../Modal';
import { NumberField } from '../NumberField';
import { bytesToGiB, breakdownMemory, recommendGpuMemoryUtilization, type HardwareSnapshot, type ModelMeta, type Workload, type Choices, type Quantization, type KvDtype, type Precision } from '../../lib/model-math';
import { Tooltip } from '../Tooltip';
import { cn } from '../../lib/cn';

export type CalculatorResult = {
  applied: boolean;
  values: Partial<{
    engine_type: 'vllm';
    selected_gpus: number[];
    tp_size: number;
    dtype: Precision;
    quantization: Quantization | undefined;
    kv_cache_dtype: KvDtype | undefined;
    gpu_memory_utilization: number;
    max_model_len: number;
    max_num_batched_tokens: number;
    block_size: number;
    cpu_offload_gb: number;
  }>;
};

type HfConfigResp = { params_b?: number | null; hidden_size?: number | null; num_hidden_layers?: number | null };

export function ResourceCalculatorModal({ open, onClose, onApply }: { open: boolean; onClose: () => void; onApply: (r: CalculatorResult) => void; }) {
  const gpuQ = useGpus({ enabled: open });
  const baseDirQ = useBaseDir(open);
  const loading = gpuQ.isLoading;
  const hw = React.useMemo<HardwareSnapshot | null>(() => (gpuQ.isLoading ? null : {
    gpuCount: gpuQ.gpus.length,
    gpus: gpuQ.gpus.map((g) => ({ index: g.index, name: g.name, mem_total_mb: g.mem_total_mb, mem_used_mb: g.mem_used_mb })),
  }), [gpuQ.gpus, gpuQ.isLoading]);
  const [meta, setMeta] = React.useState<ModelMeta>({ paramsB: 7, hiddenSize: 4096, numLayers: 32 });
  const [work, setWork] = React.useState<Workload>({ seqLen: 8192, maxNumSeqs: 256, avgActiveTokens: 2048, maxBatchedTokens: 4096 });
  const [choices, setChoices] = React.useState<Choices>({ dtype: 'bfloat16', quantization: '', kvCacheDtype: '', tpSize: 1 });
  const [cpuOffloadGb, setCpuOffloadGb] = React.useState<number>(0);
  const [adjustments, setAdjustments] = React.useState<string[]>([]);
  const [repoId, setRepoId] = React.useState<string>("");
  const [folder, setFolder] = React.useState<string>("");
  const [fetchingMeta, setFetchingMeta] = React.useState<boolean>(false);
  const [metaError, setMetaError] = React.useState<string | null>(null);
  const baseDir = baseDirQ.data ?? '';

  React.useEffect(() => {
    if (open && hw && hw.gpuCount > 0) setChoices((c) => ({ ...c, tpSize: Math.min(c.tpSize, hw.gpuCount) }));
  }, [open, hw]);

  const presets: Array<{ id: string; label: string; meta: ModelMeta }> = [
    { id: 'custom', label: 'Custom', meta: meta },
    { id: '7b', label: 'Generic 7B', meta: { paramsB: 7, hiddenSize: 4096, numLayers: 32 } },
    { id: '8b', label: 'Llama‑3‑8B', meta: { paramsB: 8, hiddenSize: 4096, numLayers: 32 } },
    { id: '13b', label: 'Generic 13B', meta: { paramsB: 13, hiddenSize: 5120, numLayers: 40 } },
    { id: '20b', label: 'Generic 20B', meta: { paramsB: 20, hiddenSize: 6144, numLayers: 44 } },
    { id: '70b', label: 'Llama‑3‑70B', meta: { paramsB: 70, hiddenSize: 8192, numLayers: 80 } },
  ];
  const [presetId, setPresetId] = React.useState<string>('custom');
  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = presets.find((x)=>x.id===id);
    if (p && p.id !== 'custom') setMeta(p.meta);
  };

  const onFetchMeta = async () => {
    setFetchingMeta(true);
    setMetaError(null);
    try {
      let r: HfConfigResp | null = null;
      if (repoId) r = await apiFetch<HfConfigResp>(`/admin/models/hf-config?repo_id=${encodeURIComponent(repoId)}`);
      else if (folder) r = await apiFetch<HfConfigResp>(`/admin/models/inspect-folder?${new URLSearchParams({ folder }).toString()}`);
      if (r) {
        const next = { ...meta };
        if (typeof r.params_b === 'number' && r.params_b > 0) next.paramsB = r.params_b;
        if (typeof r.hidden_size === 'number' && r.hidden_size > 0) next.hiddenSize = r.hidden_size;
        if (typeof r.num_hidden_layers === 'number' && r.num_hidden_layers > 0) next.numLayers = r.num_hidden_layers;
        setMeta(next);
        setPresetId('custom');
      }
    } catch (e) {
      setMetaError((e as { message?: string })?.message || 'Could not fetch model metadata');
    } finally { setFetchingMeta(false); }
  };

  const onApplyClick = () => {
    const util = recommendGpuMemoryUtilization();
    onApply({ applied: true, values: {
      engine_type: 'vllm',
      selected_gpus: Array.from({ length: choices.tpSize }, (_, i) => i),
      tp_size: choices.tpSize,
      dtype: choices.dtype,
      quantization: choices.quantization || undefined,
      kv_cache_dtype: choices.kvCacheDtype || undefined,
      gpu_memory_utilization: util,
      max_model_len: work.seqLen,
      block_size: 16,
      max_num_batched_tokens: 2048,
      cpu_offload_gb: cpuOffloadGb > 0 ? Math.round(cpuOffloadGb) : 0,
    }});
  };

  const summary = React.useMemo(() => {
    if (!hw) return null;
    const br = breakdownMemory(meta, work, choices, hw);
    return br;
  }, [hw, meta, work, choices]);

  const suggestions = React.useMemo(() => {
    const items: string[] = [];
    if (!summary) return items;
    const anyOver = summary.perGpu.some((p)=>!p.fits);
    if (anyOver) {
      items.push('Consider:');
      items.push('• Enable kv_cache_dtype=fp8');
      items.push('• Use a 4-bit (AWQ/GPTQ) or FP8 checkpoint');
      items.push('• Lower max context or sequences');
      items.push('• Increase TP size');
    }
    return items;
  }, [summary]);

  const autoFit = () => {
    if (!hw) return;
    let c = { ...choices };
    let w = { ...work };
    const notes: string[] = [];
    const tryFits = () => {
      const br = breakdownMemory(meta, w, c, hw);
      const ok = br.perGpu.every((p)=>p.fits);
      return { ok, br };
    };
    let check = tryFits();
    if (!check.ok && (!c.kvCacheDtype || !String(c.kvCacheDtype).startsWith('fp8'))) {
      c.kvCacheDtype = 'fp8';
      notes.push('Set kv_cache_dtype=fp8');
      check = tryFits();
    }
    if (!check.ok && !c.quantization) {
      c.quantization = 'fp8';
      notes.push('Use FP8 quantization');
      check = tryFits();
    }
    if (!check.ok && c.quantization !== 'awq' && c.quantization !== 'gptq') {
      c.quantization = 'awq';
      notes.push('Switch to 4-bit (awq)');
      check = tryFits();
    }
    if (!check.ok && hw.gpuCount > c.tpSize) {
      for (let t = c.tpSize + 1; t <= hw.gpuCount; t++) {
        c.tpSize = t;
        notes.push(`Increase TP to ${t}`);
        check = tryFits();
        if (check.ok) break;
      }
    }
    if (!check.ok) {
      const targets = [2048, 1024, 768];
      for (const t of targets) {
        if (check.ok) break;
        const cur = w.maxBatchedTokens ?? 4096;
        if (cur > t) {
          w.maxBatchedTokens = t;
          notes.push(`Reduce batched tokens to ${t}`);
          check = tryFits();
        }
      }
    }
    if (!check.ok && (w.avgActiveTokens ?? 2048) > 1024) {
      w.avgActiveTokens = Math.max(512, Math.floor((w.avgActiveTokens ?? 2048) / 2));
      notes.push(`Reduce avg tokens to ${w.avgActiveTokens}`);
      check = tryFits();
    }
    if (!check.ok && w.maxNumSeqs > 64) {
      w.maxNumSeqs = Math.max(64, Math.floor(w.maxNumSeqs / 2));
      notes.push(`Reduce sequences to ${w.maxNumSeqs}`);
      check = tryFits();
    }
    if (!check.ok && w.seqLen > 4096) {
      w.seqLen = Math.max(4096, Math.floor(w.seqLen / 2));
      notes.push(`Reduce context to ${w.seqLen}`);
      check = tryFits();
    }
    let offload = 0;
    if (!check.ok) {
      const worst = Math.max(0, ...check.br.perGpu.map((p)=> (p.totalBytes - (p.vramFreeBytes || 0))));
      offload = worst > 0 ? Math.ceil(bytesToGiB(worst)) : 0;
      if (offload > 0) notes.push(`Suggest CPU offload ≈ ${offload} GiB`);
    }
    setChoices(c);
    setWork(w);
    setCpuOffloadGb(offload);
    setAdjustments(notes);
  };

  return (
    <Modal open={open} onClose={onClose} title="Model Resource Calculator" variant="workflow">
      <div className="p-4 space-y-4 h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto pr-2 space-y-4 custom-scrollbar">
          <section>
            <SectionTitle variant="purple">📦 Source & Presets</SectionTitle>
            <Card className="p-3 bg-white/[0.02] border-white/5 shadow-inner">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField label="Preset">
                  <Select value={presetId} onChange={(e)=>applyPreset(e.target.value)}>
                    {presets.map((p)=> (<option key={p.id} value={p.id}>{p.label}</option>))}
                  </Select>
                </FormField>
                <FormField label="Hugging Face ID">
                  <Input placeholder="owner/repo" value={repoId} onChange={(e)=>setRepoId(e.target.value)} />
                </FormField>
                <FormField label="Local folder" description={baseDir ? `under ${baseDir}` : undefined}>
                  <Input value={folder} onChange={(e)=>setFolder(e.target.value)} placeholder="model-name" />
                </FormField>
              </div>
              <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-center gap-3">
                <span className="text-[11px] text-red-300" role={metaError ? 'alert' : undefined}>{metaError}</span>
                <Button variant="cyan" size="sm" onClick={onFetchMeta} disabled={fetchingMeta || (!repoId && !folder)}>
                  {fetchingMeta ? 'Fetching...' : '🔍 Fetch Metadata'}
                </Button>
              </div>
            </Card>
          </section>

          <section>
            <SectionTitle variant="cyan">📐 Specification</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2">
              <FormField label="Params (B)"><NumberField min={0.01} allowEmpty={false} value={meta.paramsB} onChange={(v)=>setMeta({ ...meta, paramsB: v ?? meta.paramsB })} /></FormField>
              <FormField label="Hidden Size"><NumberField min={1} step={64} integer allowEmpty={false} value={meta.hiddenSize} onChange={(v)=>setMeta({ ...meta, hiddenSize: v ?? meta.hiddenSize })} /></FormField>
              <FormField label="Layers"><NumberField min={1} integer allowEmpty={false} value={meta.numLayers} onChange={(v)=>setMeta({ ...meta, numLayers: v ?? meta.numLayers })} /></FormField>
              <FormField label="Context"><NumberField min={1} step={1024} integer allowEmpty={false} value={work.seqLen} onChange={(v)=>setWork({ ...work, seqLen: v ?? work.seqLen })} /></FormField>
              <FormField label="Avg Active"><NumberField min={1} step={128} integer placeholder="2048" value={work.avgActiveTokens} onChange={(v)=>setWork({ ...work, avgActiveTokens: v })} /></FormField>
              <FormField label="Max Seqs"><NumberField min={1} integer allowEmpty={false} value={work.maxNumSeqs} onChange={(v)=>setWork({ ...work, maxNumSeqs: v ?? work.maxNumSeqs })} /></FormField>
              <FormField label="TP Size"><NumberField min={1} integer allowEmpty={false} value={choices.tpSize} onChange={(v)=>setChoices({ ...choices, tpSize: Math.max(1, v ?? choices.tpSize) })} /></FormField>
              <FormField label="DType">
                <Select value={choices.dtype} onChange={(e)=>setChoices({ ...choices, dtype: e.target.value as Precision })}>
                  <option value="auto">auto</option>
                  <option value="bfloat16">bfloat16</option>
                  <option value="float16">float16</option>
                </Select>
              </FormField>
              <FormField label="Quant">
                <Select value={choices.quantization} onChange={(e)=>setChoices({ ...choices, quantization: e.target.value as Quantization })}>
                  <option value="">None</option>
                  <option value="awq">AWQ (4-bit)</option>
                  <option value="gptq">GPTQ (4-bit)</option>
                  <option value="fp8">FP8</option>
                  <option value="compressed-tensors">compressed-tensors (W8A8)</option>
                  <option value="bitsandbytes">bitsandbytes (4-bit)</option>
                  <option value="experts_int8">experts_int8 (MoE)</option>
                </Select>
              </FormField>
              <FormField label="KV Cache">
                <Select value={choices.kvCacheDtype} onChange={(e)=>setChoices({ ...choices, kvCacheDtype: e.target.value as KvDtype })}>
                  <option value="">Auto</option>
                  <option value="fp8">FP8</option>
                </Select>
              </FormField>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section>
              <SectionTitle variant="blue">🖥️ Hardware</SectionTitle>
              <Card className="p-3 bg-white/[0.02] border-white/5 min-h-[80px] flex flex-col justify-center">
                {loading ? <div className="text-center py-2 animate-pulse text-[10px] font-bold text-white/30 uppercase">Detecting...</div> :
                 hw && hw.gpuCount > 0 ? (
                  <div className="space-y-1.5">
                    {hw.gpus.slice(0, choices.tpSize).map((g)=> (
                      <div key={g.index} className="flex items-center justify-between p-1.5 bg-black/20 rounded-xl border border-white/5">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[9px] font-bold text-emerald-400">G{g.index}</div>
                          <span className="text-[11px] font-semibold text-white/80">{g.name}</span>
                        </div>
                        <div className="text-[9px] font-mono text-emerald-300">VRAM: {((g.mem_total_mb||0)/1024).toFixed(1)} GiB</div>
                      </div>
                    ))}
                  </div>
                ) : <InfoBox variant="purple" className="text-xs">No GPUs detected.</InfoBox>}
              </Card>
            </section>

            <section>
              <SectionTitle variant="purple">📊 Projection</SectionTitle>
              {summary ? (
                <Card className="p-3 bg-white/[0.02] border-white/5 space-y-2">
                  {summary.perGpu.map((p) => (
                    <div key={p.index} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] uppercase font-black text-white/40">GPU {p.index}</span>
                        <Badge className={p.fits ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}>
                          {p.fits ? 'FITS' : 'OVERFLOW'}
                        </Badge>
                      </div>
                      <div className="h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                        <div className={cn("h-full transition-all duration-1000", p.fits ? "bg-gradient-to-r from-indigo-500 to-purple-500" : "bg-red-500")}
                             style={{ width: `${Math.min(100, (p.totalBytes / (p.vramFreeBytes ? p.vramFreeBytes + p.totalBytes : 40 * 1024 * 1024 * 1024)) * 100)}%` }} />
                      </div>
                      <div className="flex justify-between text-[9px] font-mono text-white/40">
                        <span>Weights: {bytesToGiB(p.weightsBytes).toFixed(1)}G</span>
                        <span>KV: {bytesToGiB(p.kvBytes).toFixed(1)}G</span>
                      </div>
                    </div>
                  ))}
                </Card>
              ) : <div className="text-white/20 text-xs italic text-center py-4">Configure to see projection...</div>}
            </section>
          </div>

          {(cpuOffloadGb > 0 || adjustments.length > 0) && (
            <Card className="p-3 bg-cyan-500/5 border-cyan-500/20 grid grid-cols-2 gap-4">
              {adjustments.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Adjustments</div>
                  {adjustments.map((s, i)=> <div key={i} className="text-[10px] text-white/60 flex items-center gap-1.5"><div className="w-1 h-1 rounded-full bg-cyan-400"/>{s}</div>)}
                </div>
              )}
              <div className="space-y-1.5">
                <div className="text-[9px] font-black text-purple-400 uppercase tracking-widest">Offload</div>
                <div className="flex gap-2 font-mono text-xs">
                  {cpuOffloadGb > 0 && <div className="p-1 bg-black/20 rounded border border-white/5 text-purple-300">CPU: {Math.round(cpuOffloadGb)}G</div>}
                </div>
              </div>
            </Card>
          )}
        </div>

        <footer className="mt-auto pt-3 border-t border-white/10 flex items-center justify-between -mx-4 -mb-4 px-4 pb-4 bg-black/20">
          <div className="flex gap-2">
            <Button variant="default" size="sm" onClick={autoFit}>✨ Auto-Fit</Button>
          </div>
          <div className="flex gap-2">
            <Button variant="default" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={onApplyClick} className="px-6">Apply</Button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

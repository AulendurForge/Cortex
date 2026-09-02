'use client';

import React from 'react';
import { Tooltip } from '../../../Tooltip';
import { NumberField } from '../../../NumberField';
import { GpuSelector } from '../GpuSelector';
import { BoolField, FieldShell, SelectField, SliderNumber } from '../fields';
import { EngineSectionProps, choicesOf, defaultOf } from '../sectionProps';

/** Fields rendered here (excluded from the generic spec section). */
export const VLLM_CORE_FIELDS: ReadonlyArray<string> = [
  'dtype', 'tp_size', 'pipeline_parallel_size', 'device', 'gpu_memory_utilization', 'max_model_len', 'trust_remote_code',
];

/**
 * vLLM essentials: precision, GPU placement (GPUs, TP x PP, device), memory
 * budget and context length.
 */
export function VLLMCoreSection({ values, onChange, spec, gpus, gpuCount }: EngineSectionProps) {
  const isCpu = (values.device || 'cuda') === 'cpu';
  const selected = values.selected_gpus ?? [];
  const pp = values.pipeline_parallel_size ?? 1;
  const tp = values.tp_size ?? 1;
  const product = tp * pp;
  const mismatch = !isCpu && selected.length > 0 && product !== selected.length;

  const alignTp = (gpuCountSel: number, ppSize: number) => {
    onChange('tp_size', Math.max(1, Math.floor(gpuCountSel / Math.max(1, ppSize)) || 1));
  };

  return (
    <>
      <SelectField
        label="DType"
        value={values.dtype}
        onChange={(v) => onChange('dtype', v ?? 'auto')}
        options={choicesOf(spec, 'dtype', ['auto', 'float16', 'bfloat16', 'float32'])}
        allowEmpty={false}
        help="Computation precision."
        tooltip="--dtype. 'auto' lets vLLM choose from the checkpoint; float16/bfloat16 halve VRAM versus float32."
      />

      <div className="text-sm">
        <div className="flex items-center gap-1.5 text-white/80">Device <Tooltip text="CPU mode starts the container without GPU access; throughput is far lower. Use it only for tiny models or tests." /></div>
        <div className="mt-1 inline-flex items-center gap-3">
          <label className="inline-flex items-center gap-2"><input type="radio" name="vllm-device" checked={!isCpu} onChange={() => onChange('device', 'cuda')} /> GPU</label>
          <label className="inline-flex items-center gap-2"><input type="radio" name="vllm-device" checked={isCpu} onChange={() => onChange('device', 'cpu')} /> CPU</label>
        </div>
      </div>

      <div className="md:col-span-2">
        <GpuSelector
          selectedGpus={selected}
          onGpuSelectionChange={(idx) => { onChange('selected_gpus', idx); alignTp(idx.length, pp); }}
          gpuInfo={gpus}
          engineType="vllm"
          maxGpus={gpuCount}
        />
      </div>

      <FieldShell
        label="Tensor parallel size"
        help={`Shards each layer across GPUs. TP × PP must equal the number of selected GPUs${selected.length ? ` (${selected.length})` : ''}.`}
        tooltip="--tensor-parallel-size. Emitted only when > 1."
        badge={mismatch ? <span className="text-[10px] text-red-300">TP×PP = {product} ≠ {selected.length} GPUs</span> : undefined}
      >
        <NumberField integer min={1} max={64} value={values.tp_size} onChange={(v) => onChange('tp_size', v ?? 1)} allowEmpty={false} aria-label="Tensor parallel size" disabled={isCpu} />
      </FieldShell>

      <FieldShell
        label="Pipeline parallel size"
        help="Splits layers into stages. 1 for almost every deployment."
        tooltip="--pipeline-parallel-size. Use > 1 only when a model cannot fit with TP alone or across nodes. Emitted only when > 1."
      >
        <NumberField
          integer
          min={1}
          max={16}
          value={values.pipeline_parallel_size}
          onChange={(v) => { const next = v ?? 1; onChange('pipeline_parallel_size', next); if (selected.length > 0) alignTp(selected.length, next); }}
          allowEmpty={false}
          aria-label="Pipeline parallel size"
          disabled={isCpu}
        />
      </FieldShell>

      <SliderNumber
        label="GPU memory utilization"
        value={values.gpu_memory_utilization}
        onChange={(v) => onChange('gpu_memory_utilization', v)}
        min={0.05}
        max={0.99}
        step={0.01}
        engineDefault={typeof defaultOf(spec, 'gpu_memory_utilization') === 'number' ? (defaultOf(spec, 'gpu_memory_utilization') as number) : 0.9}
        help="Share of each GPU's VRAM vLLM may reserve (weights + KV cache)."
        tooltip="--gpu-memory-utilization. Raise it for a larger KV cache; lower it when sharing the GPU. 'KV cache memory (bytes)' below overrides this when set."
      />

      <SliderNumber
        label="Max context length"
        value={values.max_model_len}
        onChange={(v) => onChange('max_model_len', v)}
        min={512}
        max={262144}
        step={512}
        integer
        engineDefault="model config"
        unit="tokens"
        help={values.task === 'embed'
          ? 'Maximum input length. Some embedding models support more than their config states (e.g. 8192 for BGE-Large).'
          : 'Upper bound of tokens per request. Empty uses the model\'s own maximum; lower it to save KV-cache VRAM.'}
        tooltip="--max-model-len. Omitted when empty so vLLM reads max_position_embeddings from the checkpoint."
      />

      <div className="md:col-span-2 flex flex-wrap gap-4 mt-1">
        <BoolField
          label="Trust remote code"
          value={values.trust_remote_code}
          onChange={(v) => onChange('trust_remote_code', v)}
          tooltip="--trust-remote-code. Required for checkpoints that ship custom model classes (Nemotron, some Qwen/DeepSeek). Only enable for sources you trust."
        />
        <BoolField
          label="HF offline"
          value={values.hf_offline}
          onChange={(v) => onChange('hf_offline', v)}
          tooltip="Sets HF_HUB_OFFLINE=1 so vLLM never contacts Hugging Face. Weights, tokenizer and config must already be local."
        />
      </div>
    </>
  );
}

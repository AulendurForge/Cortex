'use client';

import React from 'react';
import { NumberField } from '../../../NumberField';
import { GpuSelector } from '../GpuSelector';
import { BoolField, Collapsible, FieldShell, SelectField, TextField } from '../fields';
import { FlashAttentionBadge } from '../FlashAttentionBadge';
import { EngineSectionProps, choicesOf, defaultOf, primaryGpu } from '../sectionProps';

/** Fields rendered here (excluded from the generic spec section). */
export const LLAMACPP_CORE_FIELDS: ReadonlyArray<string> = [
  'context_size', 'parallel_slots', 'batch_size', 'ubatch_size', 'cache_type_k', 'cache_type_v', 'flash_attn', 'load_mode',
  'ngl', 'tensor_split', 'threads', 'numa_policy', 'main_gpu', 'split_mode', 'kv_unified', 'kv_unified_per_slot', 'fit_memory',
];

const CACHE_LABELS: Record<string, string> = {
  f32: 'f32 (4 bytes)', f16: 'f16 (2 bytes, default)', bf16: 'bf16 (2 bytes)', q8_0: 'q8_0 (1 byte, near-lossless)',
  q4_0: 'q4_0 (0.5 byte)', q4_1: 'q4_1', q5_0: 'q5_0', q5_1: 'q5_1', iq4_nl: 'iq4_nl',
};

const equalSplit = (n: number) => Array.from({ length: n }, () => (1 / n).toFixed(2)).join(',');

/**
 * llama.cpp essentials: context/slots, batching, KV cache types, flash
 * attention, load mode and GPU placement.
 */
export function LlamaCppCoreSection({ values, onChange, spec, gpus, gpuCount }: EngineSectionProps) {
  const gpu = primaryGpu(gpus);
  const selected = values.selected_gpus ?? [];
  const ctx = values.context_size;
  const slots = values.parallel_slots;
  const perSlot = ctx && slots && slots > 0 && !values.kv_unified ? Math.floor(ctx / slots) : undefined;
  const cacheChoices = choicesOf(spec, 'cache_type_k', ['f32', 'f16', 'bf16', 'q8_0', 'q4_0', 'q4_1', 'iq4_nl', 'q5_0', 'q5_1']).map((c) => ({ value: c, label: CACHE_LABELS[c] ?? c }));
  const quantizedV = !!values.cache_type_v && !['f16', 'f32', 'bf16'].includes(values.cache_type_v);

  return (
    <>
      <FieldShell
        label="Context size (-c)"
        help={perSlot !== undefined ? `${ctx?.toLocaleString()} total ÷ ${slots} slots = ${perSlot.toLocaleString()} tokens per slot.` : 'Total KV context shared by all slots. Empty = from the model (with --fit it is trimmed to VRAM).'}
        tooltip="--ctx-size. Each slot gets context ÷ slots unless the KV cache is unified. 0 = model maximum."
      >
        <NumberField integer min={0} step={512} value={values.context_size} onChange={(v) => onChange('context_size', v)} placeholder="engine default (model)" aria-label="Context size" />
      </FieldShell>

      <FieldShell label="Parallel slots (-np)" help="Concurrent request slots. Empty = auto." tooltip="--parallel. Few slots for long prompts, many for small concurrent requests.">
        <NumberField integer min={1} max={256} value={values.parallel_slots} onChange={(v) => onChange('parallel_slots', v)} placeholder="engine default (auto)" aria-label="Parallel slots" />
      </FieldShell>

      <FieldShell label="Batch size (-b)" help="Logical prompt batch." tooltip="--batch-size, default 2048.">
        <NumberField integer min={1} value={values.batch_size} onChange={(v) => onChange('batch_size', v)} placeholder={`engine default (${String(defaultOf(spec, 'batch_size') ?? 2048)})`} aria-label="Batch size" />
      </FieldShell>

      <FieldShell label="Micro-batch size (-ub)" help="Physical batch; larger = faster prefill, more VRAM." tooltip="--ubatch-size, default 512.">
        <NumberField integer min={1} value={values.ubatch_size} onChange={(v) => onChange('ubatch_size', v)} placeholder={`engine default (${String(defaultOf(spec, 'ubatch_size') ?? 512)})`} aria-label="Micro-batch size" />
      </FieldShell>

      <SelectField label="KV cache type K" value={values.cache_type_k} onChange={(v) => onChange('cache_type_k', v)} options={cacheChoices} engineDefault={defaultOf(spec, 'cache_type_k') ?? 'f16'} tooltip="--cache-type-k. q8_0 halves KV memory with negligible loss." />
      <SelectField
        label="KV cache type V"
        value={values.cache_type_v}
        onChange={(v) => onChange('cache_type_v', v)}
        options={cacheChoices}
        engineDefault={defaultOf(spec, 'cache_type_v') ?? 'f16'}
        help={quantizedV ? 'A quantized V cache requires flash attention (auto/on).' : undefined}
        tooltip="--cache-type-v. Quantized values need flash attention; keep f16 when it is off."
      />

      <SelectField
        label="Flash attention"
        value={values.flash_attn}
        onChange={(v) => onChange('flash_attn', v)}
        options={choicesOf(spec, 'flash_attn', ['auto', 'on', 'off'])}
        engineDefault={defaultOf(spec, 'flash_attn') ?? 'auto'}
        badge={<FlashAttentionBadge gpu={gpu} />}
        help="auto enables it when the backend supports it."
        tooltip="--flash-attn auto|on|off. Needed for quantized V cache; force off only on GPUs without support."
      />

      <SelectField
        label="Load mode"
        value={values.load_mode}
        onChange={(v) => onChange('load_mode', v)}
        options={choicesOf(spec, 'load_mode', ['auto', 'none', 'mmap', 'mlock', 'dio'])}
        engineDefault={defaultOf(spec, 'load_mode') ?? 'auto'}
        help="mmap = memory-map the file, mlock = pin in RAM, dio = direct I/O, none = read fully."
        tooltip="--load-mode replaces the old --mlock / --no-mmap / --direct-io switches."
      />

      <Collapsible title="GPU placement" icon="🖥️" color="green" defaultOpen>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-3">
            <GpuSelector
              selectedGpus={selected}
              onGpuSelectionChange={(idx) => {
                onChange('selected_gpus', idx);
                // Only regenerate the split when it no longer matches the GPU count; manual ratios survive.
                const parts = (values.tensor_split || '').split(',').filter((s) => s.trim()).length;
                if (idx.length > 1 && parts !== idx.length) onChange('tensor_split', equalSplit(idx.length));
                if (idx.length <= 1) onChange('tensor_split', undefined);
              }}
              gpuInfo={gpus}
              engineType="llamacpp"
              maxGpus={gpuCount}
            />
          </div>
          <FieldShell label="GPU layers (-ngl)" help="Empty = auto (engine decides), 0 = CPU only, 999 = all layers." tooltip="--n-gpu-layers.">
            <NumberField integer min={0} max={999} value={values.ngl} onChange={(v) => onChange('ngl', v)} placeholder="engine default (auto)" aria-label="GPU layers" />
          </FieldShell>
          <TextField
            label="Tensor split"
            value={values.tensor_split}
            onChange={(v) => onChange('tensor_split', v)}
            placeholder={selected.length > 1 ? equalSplit(selected.length) : 'e.g. 3,1'}
            help={selected.length > 1 ? <>Proportions per selected GPU. <button type="button" className="underline" onClick={() => onChange('tensor_split', equalSplit(selected.length))}>Equal split</button></> : 'Proportions per GPU when using more than one.'}
            tooltip="--tensor-split. One number per GPU, in selection order."
            mono
          />
          <FieldShell label="Main GPU" help="GPU holding small tensors / scratch." tooltip="--main-gpu, index within the selected GPUs.">
            <NumberField integer min={0} value={values.main_gpu} onChange={(v) => onChange('main_gpu', v)} placeholder="engine default (0)" aria-label="Main GPU" />
          </FieldShell>
          <SelectField label="Split mode" value={values.split_mode} onChange={(v) => onChange('split_mode', v)} options={choicesOf(spec, 'split_mode', ['none', 'layer', 'row', 'tensor'])} tooltip="--split-mode. layer is the default multi-GPU mode; row splits matrices (needs fast interconnect)." />
          <FieldShell label="CPU threads (-t)" help="Empty = auto." tooltip="--threads. Generation threads; typically physical cores.">
            <NumberField integer min={1} max={512} value={values.threads} onChange={(v) => onChange('threads', v)} placeholder="engine default (auto)" aria-label="CPU threads" />
          </FieldShell>
          <SelectField label="NUMA policy" value={values.numa_policy} onChange={(v) => onChange('numa_policy', v)} options={choicesOf(spec, 'numa_policy', ['distribute', 'isolate', 'numactl'])} tooltip="--numa. Only matters on multi-socket hosts." />
          <BoolField
            label="Auto-fit unset args to VRAM (--fit)"
            tri
            value={values.fit_memory}
            onChange={(v) => onChange('fit_memory', v)}
            engineDefault={defaultOf(spec, 'fit_memory') ?? true}
            className="md:col-span-3"
            help="When on (engine default) llama.cpp trims UNSET -ngl / -c to fit device memory. Turn off for fully explicit configs."
          />
          <BoolField
            label="Unified KV cache"
            tri
            value={values.kv_unified}
            onChange={(v) => onChange('kv_unified', v)}
            engineDefault={defaultOf(spec, 'kv_unified')}
            help="One shared KV pool instead of context ÷ slots; pair with 'Per-slot context limit'."
            className="md:col-span-2"
          />
          <FieldShell label="Per-slot context limit (unified KV)" tooltip="--kv-unified-per-slot.">
            <NumberField integer min={1} value={values.kv_unified_per_slot} onChange={(v) => onChange('kv_unified_per_slot', v)} placeholder="engine default" aria-label="Per-slot context limit" />
          </FieldShell>
        </div>
      </Collapsible>
    </>
  );
}

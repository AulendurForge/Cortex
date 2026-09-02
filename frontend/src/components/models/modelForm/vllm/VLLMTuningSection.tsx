'use client';

import React from 'react';
import { NumberField } from '../../../NumberField';
import { BoolField, Collapsible, FieldShell, SelectField, SliderNumber, TextField } from '../fields';
import { FlashAttentionBadge, FlashAttentionWarning } from '../FlashAttentionBadge';
import { EngineSectionProps, choicesOf, defaultOf, primaryGpu } from '../sectionProps';

/** Fields rendered here (excluded from the generic spec section). */
export const VLLM_TUNING_FIELDS: ReadonlyArray<string> = [
  'attention_backend', 'quantization', 'kv_cache_dtype', 'block_size', 'max_num_batched_tokens', 'max_num_seqs',
  'enforce_eager', 'enable_prefix_caching', 'prefix_caching_hash_algo', 'enable_chunked_prefill', 'cuda_graph_sizes',
  'cpu_offload_gb', 'entrypoint_override', 'enable_log_requests', 'disable_log_stats', 'debug_logging', 'trace_mode',
  'engine_request_timeout', 'max_log_len',
];

const QUANT_HINTS: Record<string, string> = {
  awq: 'Needs AWQ-quantized weights (e.g. "...-AWQ" repos).',
  awq_marlin: 'AWQ weights with the faster Marlin kernels (Ampere+).',
  gptq: 'Needs GPTQ-quantized weights.',
  gptq_marlin: 'GPTQ weights with Marlin kernels (Ampere+).',
  fp8: 'Dynamic FP8 for any model; fastest on Hopper/Ada (SM 8.9+).',
  'compressed-tensors': 'llm-compressor checkpoints (W8A8, W4A16, FP8...).',
  modelopt: 'NVIDIA ModelOpt FP8 checkpoints.',
  modelopt_fp4: 'NVIDIA ModelOpt NVFP4 checkpoints (Blackwell).',
  mxfp4: 'MXFP4 (e.g. gpt-oss) checkpoints.',
  torchao: 'torchao-quantized checkpoints.',
  experts_int8: 'INT8 MoE experts at load time (any MoE model).',
  bitsandbytes: 'bitsandbytes 4/8-bit at load time; slower kernels.',
};

/**
 * vLLM performance and production knobs: attention/quantization/KV cache,
 * scheduler limits, CUDA graphs, offload, entrypoint and logging.
 */
export function VLLMTuningSection({ values, onChange, spec, gpus }: EngineSectionProps) {
  const gpu = primaryGpu(gpus);
  const numDefault = (name: string, fallback: number) => (typeof defaultOf(spec, name) === 'number' ? (defaultOf(spec, name) as number) : fallback);

  return (
    <>
      <Collapsible title="Memory, quantization & attention" icon="🔧" color="blue">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SelectField
            label="Attention backend"
            value={values.attention_backend}
            onChange={(v) => onChange('attention_backend', v)}
            options={choicesOf(spec, 'attention_backend', ['FLASH_ATTN', 'FLASHINFER', 'TRITON_ATTN', 'FLEX_ATTENTION', 'TORCH_SDPA'])}
            emptyLabel="auto (engine default)"
            badge={<FlashAttentionBadge gpu={gpu} />}
            help="Force one attention implementation."
            tooltip="--attention-backend. Auto picks the best available; FLASHINFER helps long contexts and MoE; TORCH_SDPA is the broadest fallback."
          />
          <FlashAttentionWarning gpu={gpu} active={values.attention_backend === 'FLASH_ATTN'} />
          <SelectField
            label="Quantization"
            value={values.quantization}
            onChange={(v) => onChange('quantization', v)}
            options={choicesOf(spec, 'quantization')}
            emptyLabel="none (checkpoint as-is)"
            help={values.quantization ? QUANT_HINTS[values.quantization] : 'Weight quantization method; most pre-quantized checkpoints are auto-detected.'}
            tooltip="--quantization. Set it only when the checkpoint's config does not declare its method or to force a kernel."
          />
          <SelectField
            label="KV cache dtype"
            value={values.kv_cache_dtype}
            onChange={(v) => onChange('kv_cache_dtype', v)}
            options={choicesOf(spec, 'kv_cache_dtype')}
            emptyLabel="auto (engine default)"
            help="fp8 variants halve KV-cache VRAM with minor quality cost."
            tooltip="--kv-cache-dtype. nvfp4 needs Blackwell; fp8_inc is for Intel Gaudi."
          />
          <SelectField
            label="KV block size"
            value={values.block_size !== undefined ? String(values.block_size) : undefined}
            onChange={(v) => onChange('block_size', v === undefined ? undefined : Number(v))}
            options={['1', '8', '16', '32', '64', '128']}
            engineDefault={numDefault('block_size', 16)}
            help="Paging granularity of the KV cache."
            tooltip="--block-size. 16 is balanced; 8 reduces fragmentation for long contexts on tight VRAM; larger helps throughput when memory is plentiful."
          />
          <SliderNumber
            label="CPU offload (GiB per GPU)"
            value={values.cpu_offload_gb}
            onChange={(v) => onChange('cpu_offload_gb', v)}
            min={0}
            max={128}
            step={1}
            integer
            engineDefault={0}
            help="Spill part of the weights to system RAM."
            tooltip="--cpu-offload-gb. Trades latency for capacity; needs fast PCIe/NVLink."
          />
        </div>
      </Collapsible>

      <Collapsible title="Scheduling & throughput" icon="⚡" color="cyan">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <SliderNumber
            label="Max batched tokens"
            value={values.max_num_batched_tokens}
            onChange={(v) => onChange('max_num_batched_tokens', v)}
            min={256}
            max={65536}
            step={256}
            integer
            engineDefault={numDefault('max_num_batched_tokens', 2048)}
            unit="tokens"
            help="Tokens processed per scheduler step."
            tooltip="--max-num-batched-tokens. Higher raises prefill throughput and VRAM use; with chunked prefill 2048-8192 is typical."
          />
          <SliderNumber
            label="Max concurrent sequences"
            value={values.max_num_seqs}
            onChange={(v) => onChange('max_num_seqs', v)}
            min={1}
            max={2048}
            step={1}
            integer
            engineDefault={numDefault('max_num_seqs', 128)}
            help="Upper bound on simultaneously active requests."
            tooltip="--max-num-seqs. More concurrency needs more KV cache; start at 128-256."
          />
          <TextField
            label="CUDA graph capture sizes"
            value={values.cuda_graph_sizes}
            onChange={(v) => onChange('cuda_graph_sizes', v === undefined ? undefined : v.replace(/[^0-9,\s]/g, ''))}
            placeholder="e.g. 1,2,4,8,16"
            help="Comma-separated batch sizes to pre-capture."
            tooltip="--cudagraph-capture-sizes. Ignored when 'Enforce eager' is on."
          />
          <div className="md:col-span-3 flex flex-wrap gap-x-6 gap-y-2">
            <BoolField
              label="Enforce eager (no CUDA graphs / compile)"
              value={values.enforce_eager}
              onChange={(v) => onChange('enforce_eager', v)}
              tooltip="--enforce-eager. Fastest startup and easiest debugging, slower decode. Leave off for production."
            />
            <BoolField
              label="Prefix caching"
              tri
              value={values.enable_prefix_caching}
              onChange={(v) => onChange('enable_prefix_caching', v)}
              engineDefault={defaultOf(spec, 'enable_prefix_caching') ?? true}
              tooltip="--enable-prefix-caching / --no-enable-prefix-caching. Reuses KV blocks for repeated prompt prefixes."
            />
            <BoolField
              label="Chunked prefill"
              tri
              value={values.enable_chunked_prefill}
              onChange={(v) => onChange('enable_chunked_prefill', v)}
              engineDefault={defaultOf(spec, 'enable_chunked_prefill') ?? true}
              tooltip="--enable-chunked-prefill / --no-enable-chunked-prefill. Interleaves long prompts with decode steps."
            />
          </div>
          <SelectField
            label="Prefix cache hash"
            value={values.prefix_caching_hash_algo}
            onChange={(v) => onChange('prefix_caching_hash_algo', v)}
            options={choicesOf(spec, 'prefix_caching_hash_algo', ['sha256', 'sha256_cbor_64bit', 'xxhash', 'xxhash_cbor'])}
            tooltip="--prefix-caching-hash-algo. sha256 variants are reproducible across processes; xxhash is fastest."
          />
        </div>
      </Collapsible>

      <Collapsible title="Entrypoint & logging" icon="🪵" color="orange">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <TextField
            label="Entrypoint override"
            value={values.entrypoint_override}
            onChange={(v) => onChange('entrypoint_override', v)}
            placeholder="e.g. python3,-m,vllm.entrypoints.openai.api_server"
            className="md:col-span-3"
            mono
            help="Comma-separated command prefix. Leave blank to use the image entrypoint (vllm serve)."
          />
          <div className="md:col-span-3 flex flex-wrap gap-x-6 gap-y-2">
            <BoolField label="Log requests" value={values.enable_log_requests} onChange={(v) => onChange('enable_log_requests', v)} tooltip="--enable-log-requests. Logs every prompt; off by default in vLLM ≥ 0.10." />
            <BoolField label="Disable stats logging" value={values.disable_log_stats} onChange={(v) => onChange('disable_log_stats', v)} tooltip="--disable-log-stats. Quieter logs when Prometheus metrics are enough." />
            <BoolField label="Debug logging" value={values.debug_logging} onChange={(v) => onChange('debug_logging', v)} tooltip="VLLM_LOGGING_LEVEL=DEBUG." />
            <BoolField label="Trace mode (very slow)" value={values.trace_mode} onChange={(v) => onChange('trace_mode', v)} tooltip="VLLM_TRACE_FUNCTION=1. Traces every function call; debugging only." />
          </div>
          <FieldShell label="Engine iteration timeout (s)" help="VLLM_ENGINE_ITERATION_TIMEOUT_S; empty = engine default." >
            <NumberField integer min={1} value={values.engine_request_timeout} onChange={(v) => onChange('engine_request_timeout', v)} placeholder="engine default" aria-label="Engine iteration timeout" />
          </FieldShell>
          <FieldShell label="Max logged prompt chars" help="--max-log-len; empty = no truncation.">
            <NumberField integer min={0} value={values.max_log_len} onChange={(v) => onChange('max_log_len', v)} placeholder="engine default" aria-label="Max logged prompt chars" />
          </FieldShell>
        </div>
      </Collapsible>
    </>
  );
}

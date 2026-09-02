export type Precision = 'auto' | 'bfloat16' | 'float16';
export type Quantization = '' | 'awq' | 'gptq' | 'fp8' | 'compressed-tensors' | 'bitsandbytes' | 'experts_int8';
export type KvDtype = '' | 'fp8' | 'fp8_e4m3' | 'fp8_e5m2';

export type HardwareSnapshot = {
  gpuCount: number;
  gpus: Array<{ index: number; name?: string | null; mem_total_mb?: number | null; mem_used_mb?: number | null }>; 
};

export type ModelMeta = {
  paramsB: number; // billions of parameters
  hiddenSize: number; // model hidden size
  numLayers: number; // transformer layers
};

export type Workload = {
  seqLen: number; // target max context length
  maxNumSeqs: number; // concurrency (active sequences)
  avgActiveTokens?: number; // average active tokens per sequence
  maxBatchedTokens?: number; // vLLM max-num-batched-tokens equivalent
};

export type Choices = {
  dtype: Precision;
  quantization: Quantization;
  kvCacheDtype: KvDtype | '';
  tpSize: number;
};

export type MemoryBreakdown = {
  weightsBytesTotal: number;
  kvBytesTotal: number;
  overheadBytesTotal: number;
  perGpu: Array<{
    index: number;
    weightsBytes: number;
    kvBytes: number;
    overheadBytes: number;
    totalBytes: number;
    vramTotalBytes?: number;
    vramUsedBytes?: number;
    vramFreeBytes?: number;
    /** False when the GPU's capacity is unknown (no DCGM/NVML data): "fits" cannot be judged. */
    vramKnown: boolean;
    fits: boolean;
  }>;
};

export function bytesPerWeight(dtype: Precision, quant: Quantization): number {
  if (quant === 'awq') return 0.5; // typical 4-bit effective
  if (quant === 'gptq') return 0.5;
  if (quant === 'fp8') return 1.0;
  if (quant === 'compressed-tensors') return 1.0; // W8A8 typical; W4A16 checkpoints are smaller
  if (quant === 'experts_int8') return 1.0;
  if (quant === 'bitsandbytes') return 0.5; // 4-bit NF4 typical
  // unquantized
  if (dtype === 'bfloat16' || dtype === 'float16') return 2.0;
  return 2.0; // auto → assume 2 bytes
}

export function bytesPerKv(kvDtype: KvDtype | '', dtype: Precision): number {
  if (kvDtype?.startsWith('fp8')) return 1.0;
  // default to weight dtype size for fp16/bf16
  if (dtype === 'bfloat16' || dtype === 'float16') return 2.0;
  return 2.0;
}

export function computeWeightsBytes(paramsB: number, dtype: Precision, quant: Quantization): number {
  const bpw = bytesPerWeight(dtype, quant);
  return paramsB * 1e9 * bpw;
}

export function computeKvBytesTokenBudget(
  numLayers: number,
  hiddenSize: number,
  kvBytesPerElem: number,
  totalActiveTokens: number,
): number {
  const perTokenPerLayer = 2 * hiddenSize * kvBytesPerElem; // K and V
  return Math.max(0, Math.floor(totalActiveTokens)) * Math.max(1, Math.floor(numLayers)) * perTokenPerLayer;
}

export function withOverhead(bytes: number, overheadPct = 0.15): number {
  return bytes * (1 + overheadPct);
}

export function breakdownMemory(meta: ModelMeta, work: Workload, choices: Choices, hw: HardwareSnapshot, overheadPct = 0.15): MemoryBreakdown {
  const wBytes = computeWeightsBytes(meta.paramsB, choices.dtype, choices.quantization);
  const kvElem = bytesPerKv(choices.kvCacheDtype, choices.dtype);
  // Token-budget model: total_active_tokens = min(avg_active_tokens * max_num_seqs, max_batched_tokens)
  const avgActive = Math.max(1, Math.floor(work.avgActiveTokens ?? Math.min(work.seqLen, 2048)));
  const maxBatched = Math.max(256, Math.floor(work.maxBatchedTokens ?? 4096));
  const totalTokens = Math.min(avgActive * Math.max(1, work.maxNumSeqs), maxBatched);
  const kvBytes = computeKvBytesTokenBudget(meta.numLayers, meta.hiddenSize, kvElem, totalTokens);
  const tp = Math.max(1, Math.min(choices.tpSize, Math.max(1, hw.gpuCount)));
  const weightsPer = wBytes / tp;
  const kvPer = kvBytes / tp;
  const overPer = (weightsPer + kvPer) * overheadPct;
  const perGpu = hw.gpus.slice(0, tp).map((g) => {
    const total = weightsPer + kvPer + overPer;
    const vramTotalBytes = (g.mem_total_mb || 0) * 1024 * 1024;
    const vramUsedBytes = (g.mem_used_mb || 0) * 1024 * 1024;
    const vramFreeBytes = Math.max(0, vramTotalBytes - vramUsedBytes);
    const vramKnown = vramTotalBytes > 0;
    const fits = vramKnown ? total <= vramFreeBytes : false;
    return {
      index: g.index,
      weightsBytes: weightsPer,
      kvBytes: kvPer,
      overheadBytes: overPer,
      totalBytes: total,
      vramTotalBytes,
      vramUsedBytes,
      vramFreeBytes,
      vramKnown,
      fits,
    };
  });
  return {
    weightsBytesTotal: wBytes,
    kvBytesTotal: kvBytes,
    overheadBytesTotal: (wBytes + kvBytes) * overheadPct,
    perGpu,
  };
}

/**
 * vLLM's gpu_memory_utilization is the fraction of each GPU vLLM may claim. Recommend the
 * projected need plus a 5 % margin (so the KV cache is not starved), clamped to 0.5–0.95;
 * 0.9 when the capacity is unknown.
 */
export function recommendGpuMemoryUtilization(summary?: { perGpu: Array<{ totalBytes: number; vramTotalBytes?: number; vramKnown?: boolean }> } | null): number {
  const known = (summary?.perGpu ?? []).filter((p) => p.vramKnown && (p.vramTotalBytes ?? 0) > 0);
  if (known.length === 0) return 0.9;
  const need = Math.max(...known.map((p) => p.totalBytes / (p.vramTotalBytes as number)));
  return Math.round(Math.min(0.95, Math.max(0.5, need + 0.05)) * 100) / 100;
}

export function bytesToGiB(n: number): number {
  return n / (1024 ** 3);
}

export function clamp(min: number, v: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}


/** Preset model shapes offered by the resource calculator ("Custom" is the caller's own meta). */
export const MODEL_PRESETS: ReadonlyArray<{ id: string; label: string; meta: ModelMeta }> = [
  { id: '7b', label: 'Generic 7B', meta: { paramsB: 7, hiddenSize: 4096, numLayers: 32 } },
  { id: '8b', label: 'Llama‑3‑8B', meta: { paramsB: 8, hiddenSize: 4096, numLayers: 32 } },
  { id: '13b', label: 'Generic 13B', meta: { paramsB: 13, hiddenSize: 5120, numLayers: 40 } },
  { id: '20b', label: 'Generic 20B', meta: { paramsB: 20, hiddenSize: 6144, numLayers: 44 } },
  { id: '70b', label: 'Llama‑3‑70B', meta: { paramsB: 70, hiddenSize: 8192, numLayers: 80 } },
];

export type AutoFitResult = {
  choices: Choices;
  work: Workload;
  /** GiB of CPU offload suggested when nothing else made the model fit (0 otherwise). */
  cpuOffloadGb: number;
  /** Human-readable list of the adjustments applied, in order. */
  notes: string[];
};

/**
 * Walk a fixed ladder of adjustments (fp8 KV cache → FP8 weights → 4-bit weights → more TP →
 * fewer batched tokens → fewer active tokens → fewer sequences → shorter context) until the
 * projection fits every selected GPU, then fall back to suggesting CPU offload. Pure: returns
 * new objects and never mutates its inputs.
 */
export function autoFit(meta: ModelMeta, work: Workload, choices: Choices, hw: HardwareSnapshot): AutoFitResult {
  const c: Choices = { ...choices };
  const w: Workload = { ...work };
  const notes: string[] = [];
  const tryFits = () => {
    const br = breakdownMemory(meta, w, c, hw);
    return { ok: br.perGpu.every((p) => p.fits), br };
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
    for (const t of [2048, 1024, 768]) {
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
  let cpuOffloadGb = 0;
  if (!check.ok) {
    const worst = Math.max(0, ...check.br.perGpu.map((p) => p.totalBytes - (p.vramFreeBytes || 0)));
    cpuOffloadGb = worst > 0 ? Math.ceil(bytesToGiB(worst)) : 0;
    if (cpuOffloadGb > 0) notes.push(`Suggest CPU offload ≈ ${cpuOffloadGb} GiB`);
  }
  return { choices: c, work: w, cpuOffloadGb, notes };
}

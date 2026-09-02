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
    const fits = vramFreeBytes > 0 ? total <= vramFreeBytes : true; // be lenient if unknown
    return {
      index: g.index,
      weightsBytes: weightsPer,
      kvBytes: kvPer,
      overheadBytes: overPer,
      totalBytes: total,
      vramTotalBytes,
      vramUsedBytes,
      vramFreeBytes,
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

export function recommendGpuMemoryUtilization(): number {
  return 0.9; // sensible default; adjusted later by user
}

export function bytesToGiB(n: number): number {
  return n / (1024 ** 3);
}

export function clamp(min: number, v: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}



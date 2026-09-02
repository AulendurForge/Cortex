import { describe, expect, it } from 'vitest';
import { autoFit, breakdownMemory, MODEL_PRESETS, type Choices, type HardwareSnapshot, type ModelMeta, type Workload } from './model-math';

const META_7B: ModelMeta = { paramsB: 7, hiddenSize: 4096, numLayers: 32 };
const WORK: Workload = { seqLen: 8192, maxNumSeqs: 256, avgActiveTokens: 2048, maxBatchedTokens: 4096 };
const CHOICES: Choices = { dtype: 'bfloat16', quantization: '', kvCacheDtype: '', tpSize: 1 };
const gpu = (index: number, totalMb: number): HardwareSnapshot['gpus'][number] => ({ index, name: `GPU ${index}`, mem_total_mb: totalMb, mem_used_mb: 0 });

describe('autoFit', () => {
  it('leaves everything untouched when the model already fits', () => {
    const hw: HardwareSnapshot = { gpuCount: 1, gpus: [gpu(0, 80 * 1024)] };
    const r = autoFit(META_7B, WORK, CHOICES, hw);
    expect(r.notes).toEqual([]);
    expect(r.cpuOffloadGb).toBe(0);
    expect(r.choices).toEqual(CHOICES);
    expect(r.work).toEqual(WORK);
    expect(r.choices).not.toBe(CHOICES); // copies, never the caller's objects
  });

  it('tries the fp8 KV cache first and stops as soon as the projection fits', () => {
    // 7B bf16 = 14.0 GB weights; KV at 4096 tokens × 32 layers × 2 × 4096 × 2 B = 2.1 GB; +15 % = 18.6 GB.
    // With fp8 KV (1.07 GB) the total drops to 17.3 GB, so a 17 GiB (18.25 GB) card fits only after that first step.
    const hw: HardwareSnapshot = { gpuCount: 1, gpus: [gpu(0, 17 * 1024)] };
    const r = autoFit(META_7B, WORK, CHOICES, hw);
    expect(r.notes).toEqual(['Set kv_cache_dtype=fp8']);
    expect(r.choices.kvCacheDtype).toBe('fp8');
    expect(r.choices.quantization).toBe('');
    expect(breakdownMemory(META_7B, r.work, r.choices, hw).perGpu.every((p) => p.fits)).toBe(true);
    expect(CHOICES.kvCacheDtype).toBe(''); // input not mutated
  });

  it('raises the TP size across available GPUs before shrinking the workload', () => {
    // 70B in 4-bit ≈ 35 GB of weights: two 24 GB cards are needed even after quantization.
    const meta: ModelMeta = { paramsB: 70, hiddenSize: 8192, numLayers: 80 };
    const hw: HardwareSnapshot = { gpuCount: 2, gpus: [gpu(0, 24 * 1024), gpu(1, 24 * 1024)] };
    const r = autoFit(meta, WORK, CHOICES, hw);
    expect(r.choices.quantization).toBe('awq');
    expect(r.choices.tpSize).toBe(2);
    expect(r.notes).toContain('Increase TP to 2');
    expect(r.notes).not.toContain('Reduce sequences to 128');
    expect(breakdownMemory(meta, r.work, r.choices, hw).perGpu.every((p) => p.fits)).toBe(true);
  });

  it('suggests CPU offload of the worst-case overflow when nothing fits', () => {
    const meta: ModelMeta = { paramsB: 70, hiddenSize: 8192, numLayers: 80 };
    const hw: HardwareSnapshot = { gpuCount: 1, gpus: [gpu(0, 8 * 1024)] };
    const r = autoFit(meta, WORK, CHOICES, hw);
    expect(r.cpuOffloadGb).toBeGreaterThan(0);
    expect(r.notes[r.notes.length - 1]).toBe(`Suggest CPU offload ≈ ${r.cpuOffloadGb} GiB`);
    expect(r.work.seqLen).toBe(4096);
    expect(r.work.maxNumSeqs).toBe(128);
  });
});

describe('MODEL_PRESETS', () => {
  it('has unique ids and sane shapes', () => {
    expect(new Set(MODEL_PRESETS.map((p) => p.id)).size).toBe(MODEL_PRESETS.length);
    for (const p of MODEL_PRESETS) {
      expect(p.meta.paramsB).toBeGreaterThan(0);
      expect(p.meta.hiddenSize).toBeGreaterThan(0);
      expect(p.meta.numLayers).toBeGreaterThan(0);
    }
  });
});

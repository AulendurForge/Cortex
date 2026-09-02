import { describe, expect, it } from 'vitest';
import { ARCHITECTURE_COMPATIBILITY, getArchCompatibility, normalizeArchName } from './architectureCompatibility';

describe('normalizeArchName', () => {
  it('lowercases, strips vendor prefixes, suffixes and versions, then applies HF class mappings', () => {
    expect(normalizeArchName('LlamaForCausalLM')).toBe('llama');
    expect(normalizeArchName('meta-llama-3')).toBe('llama');
    expect(normalizeArchName('Qwen2ForCausalLM')).toBe('qwen2');
    expect(normalizeArchName('mistral-instruct')).toBe('mistral');
    expect(normalizeArchName('gpt-oss')).toBe('harmony');
    expect(normalizeArchName(null)).toBe('');
    expect(normalizeArchName(undefined)).toBe('');
  });
});

describe('getArchCompatibility', () => {
  it('returns the matrix entry for known architectures (via normalisation)', () => {
    expect(getArchCompatibility('LlamaForCausalLM')).toEqual(ARCHITECTURE_COMPATIBILITY.llama);
    expect(getArchCompatibility('gpt-oss')).toMatchObject({ vllm: 'none', llamacpp: 'full' });
    expect(getArchCompatibility('MixtralForMoE')).toMatchObject({ vllm: 'full', llamacpp: 'full', notes: 'MoE architecture' });
  });

  it('falls back to unknown/unknown for architectures not in the matrix', () => {
    expect(getArchCompatibility('SomethingNovelForCausalLM')).toEqual({ vllm: 'unknown', llamacpp: 'unknown' });
    expect(getArchCompatibility('')).toEqual({ vllm: 'unknown', llamacpp: 'unknown' });
  });
});

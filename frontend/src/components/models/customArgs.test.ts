import { describe, expect, it } from 'vitest';
import { STATIC_ENGINE_SPEC } from '../../lib/engine-spec';
import {
  CUSTOM_PRESETS, analyzeCustomArgs, analyzeCustomEnv, applyPreset, isForbiddenFlag, parseCustomArgs, parseCustomEnv,
  parseListValue, renderArg,
} from './customArgs';

describe('parseCustomArgs / parseCustomEnv', () => {
  it('parses a valid list and tolerates junk', () => {
    expect(parseCustomArgs('[{"flag":"--x","type":"int","value":1},{"nope":true},3]')).toEqual([{ flag: '--x', type: 'int', value: 1 }]);
    expect(parseCustomArgs('not json')).toEqual([]);
    expect(parseCustomArgs('{"flag":"--x"}')).toEqual([]);
    expect(parseCustomArgs(null)).toEqual([]);
    expect(parseCustomArgs('[{"flag":"--y","type":"bogus","value":"v"}]')[0]?.type).toBe('string');
  });
  it('parses env vars', () => {
    expect(parseCustomEnv('[{"key":"A","value":"1"},{"key":"B"}]')).toEqual([{ key: 'A', value: '1' }, { key: 'B', value: '' }]);
    expect(parseCustomEnv('{')).toEqual([]);
  });
});

describe('renderArg', () => {
  it('renders bool false as --no-<flag> and lists space-separated', () => {
    expect(renderArg({ flag: '--enable-x', type: 'bool', value: false })).toBe('--no-enable-x');
    expect(renderArg({ flag: '--enable-x', type: 'bool', value: true })).toBe('--enable-x');
    expect(renderArg({ flag: '--flag', type: 'flag', value: true })).toBe('--flag');
    expect(renderArg({ flag: '--lora-modules', type: 'string_list', value: ['a=b', 'c=d'] })).toBe('--lora-modules a=b c=d');
    expect(parseListValue(' a \n\nb\r\n')).toEqual(['a', 'b']);
  });
});

describe('analyzeCustomArgs', () => {
  it('detects duplicates including llama.cpp aliases', () => {
    const issues = analyzeCustomArgs([
      { flag: '-c', type: 'int', value: 4096 },
      { flag: '--ctx-size', type: 'int', value: 8192 },
    ], 'llamacpp', STATIC_ENGINE_SPEC);
    expect(issues.some((i) => i.kind === 'duplicate' && i.index === 1)).toBe(true);
    // both collide with the form-managed context size
    expect(issues.filter((i) => i.kind === 'collision')).toHaveLength(2);
  });

  it('flags forbidden flags and bad formats', () => {
    const issues = analyzeCustomArgs([
      { flag: '--host', type: 'string', value: '0.0.0.0' },
      { flag: '-m', type: 'string', value: 'x' },
      { flag: '--ssl-keyfile', type: 'string', value: 'k' },
      { flag: 'no-dash', type: 'flag', value: true },
    ], 'vllm', STATIC_ENGINE_SPEC);
    expect(issues.filter((i) => i.kind === 'forbidden')).toHaveLength(3);
    expect(issues.some((i) => i.kind === 'format' && i.index === 3)).toBe(true);
    expect(isForbiddenFlag('-a', 'llamacpp')).toBe(true);
    expect(isForbiddenFlag('--alias', 'vllm')).toBe(true);
  });

  it('warns on collisions with form-managed flags, including negated forms', () => {
    const issues = analyzeCustomArgs([
      { flag: '--no-enable-prefix-caching', type: 'flag', value: true },
      { flag: '--something-custom', type: 'flag', value: true },
    ], 'vllm', STATIC_ENGINE_SPEC);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe('collision');
    expect(issues[0]?.message).toMatch(/Prefix caching/);
  });
});

describe('analyzeCustomEnv', () => {
  it('flags protected, duplicate and managed env vars', () => {
    const issues = analyzeCustomEnv([
      { key: 'CUDA_VISIBLE_DEVICES', value: '0' },
      { key: 'NCCL_DEBUG', value: 'INFO' },
      { key: 'VLLM_LOGGING_LEVEL', value: 'DEBUG' },
      { key: 'MY_VAR', value: '1' },
      { key: 'MY_VAR', value: '2' },
      { key: 'bad name', value: '' },
    ], 'vllm', STATIC_ENGINE_SPEC);
    expect(issues.filter((i) => i.kind === 'protected_env')).toHaveLength(2);
    expect(issues.some((i) => i.kind === 'env_collision' && /Debug logging/.test(i.message))).toBe(true);
    expect(issues.some((i) => i.kind === 'duplicate' && i.index === 4)).toBe(true);
    expect(issues.some((i) => i.kind === 'format' && i.index === 5)).toBe(true);
  });
});

describe('presets', () => {
  it('ship the documented presets and merge without duplicating', () => {
    const ids = CUSTOM_PRESETS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['vllm-nemotron', 'vllm-flashinfer-moe-fp8', 'llamacpp-cpu-moe', 'llamacpp-long-context']));
    const nemotron = CUSTOM_PRESETS.find((p) => p.id === 'vllm-nemotron')!;
    expect(nemotron.args.map((a) => a.flag)).toEqual(['--trust-remote-code', '--mamba-ssm-cache-dtype']);
    const r = applyPreset(nemotron, [{ flag: '--mamba-ssm-cache-dtype', type: 'string', value: 'bfloat16' }, { flag: '--x', type: 'flag', value: true }], [], 'vllm');
    expect(r.args.filter((a) => a.flag === '--mamba-ssm-cache-dtype')).toHaveLength(1);
    expect(r.args.find((a) => a.flag === '--mamba-ssm-cache-dtype')?.value).toBe('float16');
    expect(r.args.some((a) => a.flag === '--x')).toBe(true);
    const fi = CUSTOM_PRESETS.find((p) => p.id === 'vllm-flashinfer-moe-fp8')!;
    expect(fi.env).toEqual([{ key: 'VLLM_USE_FLASHINFER_MOE_FP8', value: '1' }]);
    const lc = CUSTOM_PRESETS.find((p) => p.id === 'llamacpp-long-context')!;
    expect(lc.args.map(renderArg)).toEqual(['--kv-unified', '--cache-reuse 256']);
  });
});

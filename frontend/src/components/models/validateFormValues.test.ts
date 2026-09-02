import { describe, expect, it } from 'vitest';
import { buildInitialValues, ModelFormValues } from './modelFormValues';
import { hasErrors, validateFormValues, Issue } from './validateFormValues';

function base(over: Partial<ModelFormValues> = {}): ModelFormValues {
  const v = buildInitialValues({ mode: 'offline', local_path: 'llama', name: 'Llama', served_model_name: 'llama', engine_type: 'vllm', ...over }, { configure: false });
  // buildInitialValues defaults an empty GPU list to [0] in add mode; tests that want CPU mode set it explicitly.
  if (over.selected_gpus && over.selected_gpus.length === 0) v.selected_gpus = [];
  return v;
}
const fields = (issues: Issue[], sev?: Issue['severity']) => issues.filter((i) => !sev || i.severity === sev).map((i) => i.field);

describe('validateFormValues', () => {
  it('passes a plain vLLM safetensors config', () => {
    const issues = validateFormValues(base(), { mode: 'add', gpuCount: 1 });
    expect(hasErrors(issues)).toBe(false);
  });

  it('requires engine, source and identity', () => {
    const v = base({ local_path: '', name: '', served_model_name: '' });
    const issues = validateFormValues(v, { mode: 'add' });
    expect(fields(issues, 'error')).toEqual(expect.arrayContaining(['local_path', 'name', 'served_model_name']));
    const online = validateFormValues(base({ mode: 'online', repo_id: '' }), { mode: 'add' });
    expect(fields(online, 'error')).toContain('repo_id');
  });

  it('rejects vLLM for a GGUF path and llama.cpp for a non-GGUF path', () => {
    const gguf = validateFormValues(base({ local_path: 'qwen/model-Q4_K_M.gguf' }), { mode: 'add' });
    expect(gguf.find((i) => i.field === 'engine_type')?.message).toMatch(/gguf_requires_llamacpp/);
    const viaSource = validateFormValues(base(), { mode: 'add', source: { useGguf: true, ggufFile: 'a.gguf' } });
    expect(fields(viaSource, 'error')).toContain('engine_type');
    const st = validateFormValues(base({ engine_type: 'llamacpp' }), { mode: 'add' });
    expect(fields(st, 'error')).toContain('local_path');
  });

  it('requires a chosen GGUF file when GGUF is selected', () => {
    const issues = validateFormValues(base({ engine_type: 'llamacpp' }), { mode: 'add', source: { useGguf: true, ggufFile: undefined } });
    expect(issues.some((i) => i.field === 'local_path' && /quantization/.test(i.message))).toBe(true);
  });

  it('checks tp x pp (x dp) against the selected GPUs', () => {
    const bad = validateFormValues(base({ selected_gpus: [0, 1], tp_size: 1 }), { mode: 'add', gpuCount: 2 });
    expect(fields(bad, 'error')).toContain('tp_size');
    const ok = validateFormValues(base({ selected_gpus: [0, 1, 2, 3], tp_size: 2, pipeline_parallel_size: 2 }), { mode: 'add', gpuCount: 4 });
    expect(hasErrors(ok)).toBe(false);
    const dp = validateFormValues(base({ selected_gpus: [0, 1], tp_size: 1, data_parallel_size: 2 }), { mode: 'add', gpuCount: 2 });
    expect(hasErrors(dp)).toBe(false);
  });

  it('handles CPU mode for both engines', () => {
    const noGpu = validateFormValues(base({ selected_gpus: [] }), { mode: 'add' });
    expect(fields(noGpu, 'error')).toContain('selected_gpus');
    const cpu = validateFormValues(base({ selected_gpus: [], device: 'cpu' }), { mode: 'add' });
    expect(hasErrors(cpu)).toBe(false);
    const cpuWithGpus = validateFormValues(base({ selected_gpus: [0], device: 'cpu' }), { mode: 'add' });
    expect(fields(cpuWithGpus, 'warning')).toContain('device');
    const llama = validateFormValues(base({ engine_type: 'llamacpp', local_path: 'm.gguf', selected_gpus: [] }), { mode: 'add' });
    expect(hasErrors(llama)).toBe(false);
    expect(fields(llama, 'warning')).toContain('selected_gpus');
    const llamaNgl = validateFormValues(base({ engine_type: 'llamacpp', local_path: 'm.gguf', selected_gpus: [], ngl: 20 }), { mode: 'add' });
    expect(fields(llamaNgl, 'error')).toContain('selected_gpus');
  });

  it('flags a quantized V cache with flash attention off (error) or auto (warning)', () => {
    const off = validateFormValues(base({ engine_type: 'llamacpp', local_path: 'm.gguf', cache_type_v: 'q8_0', flash_attn: 'off' }), { mode: 'add' });
    expect(fields(off, 'error')).toContain('cache_type_v');
    const auto = validateFormValues(base({ engine_type: 'llamacpp', local_path: 'm.gguf', cache_type_v: 'q8_0', flash_attn: 'auto' }), { mode: 'add' });
    expect(fields(auto, 'warning')).toContain('cache_type_v');
    expect(hasErrors(auto)).toBe(false);
    const on = validateFormValues(base({ engine_type: 'llamacpp', local_path: 'm.gguf', cache_type_v: 'q8_0', flash_attn: 'on' }), { mode: 'add' });
    expect(fields(on)).not.toContain('cache_type_v');
  });

  it('warns when context size is not divisible by the slots', () => {
    const issues = validateFormValues(base({ engine_type: 'llamacpp', local_path: 'm.gguf', context_size: 10000, parallel_slots: 3 }), { mode: 'add' });
    expect(fields(issues, 'warning')).toContain('context_size');
    const unified = validateFormValues(base({ engine_type: 'llamacpp', local_path: 'm.gguf', context_size: 10000, parallel_slots: 3, kv_unified: true }), { mode: 'add' });
    expect(fields(unified)).not.toContain('context_size');
  });

  it('reports custom-arg duplicates, forbidden flags and collisions with managed flags', () => {
    const issues = validateFormValues(base(), {
      mode: 'add',
      customArgs: [
        { flag: '--max-model-len', type: 'int', value: 4096 },
        { flag: '--port', type: 'int', value: 9 },
        { flag: '--seed', type: 'int', value: 1 },
        { flag: '--seed', type: 'int', value: 2 },
      ],
    });
    const msgs = issues.filter((i) => i.field === 'engine_startup_args_json');
    expect(msgs.some((i) => i.severity === 'warning' && /Max model length/.test(i.message))).toBe(true);
    expect(msgs.some((i) => i.severity === 'error' && /--port/.test(i.message))).toBe(true);
    expect(msgs.some((i) => i.severity === 'error' && /already set/.test(i.message))).toBe(true);
  });

  it('rejects invalid JSON in *_json fields and custom_request_json', () => {
    const issues = validateFormValues(base({ hf_overrides_json: '{not json', custom_request_json: '[1,2]' }), { mode: 'add' });
    expect(fields(issues, 'error')).toEqual(expect.arrayContaining(['hf_overrides_json', 'custom_request_json']));
    const ok = validateFormValues(base({ hf_overrides_json: '{"a": 1}', custom_request_json: '{"stop": ["x"]}' }), { mode: 'add' });
    expect(hasErrors(ok)).toBe(false);
  });

  it('applies spec ranges and choices', () => {
    const issues = validateFormValues(base({ gpu_memory_utilization: 1.5, kv_cache_dtype: 'int4' }), { mode: 'add' });
    expect(fields(issues, 'error')).toEqual(expect.arrayContaining(['gpu_memory_utilization', 'kv_cache_dtype']));
  });

  it('does not check source fields in configure mode', () => {
    const issues = validateFormValues(base({ local_path: '' }), { mode: 'configure' });
    expect(fields(issues, 'error')).not.toContain('local_path');
  });
});

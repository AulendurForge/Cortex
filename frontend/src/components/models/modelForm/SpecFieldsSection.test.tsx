import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SpecFieldsSection } from './SpecFieldsSection';
import { buildInitialValues } from '../modelFormValues';
import type { EngineSpec } from '../../../lib/engine-spec';

const SPEC: EngineSpec = {
  groups: [
    { key: 'memory', label: 'Memory & KV cache' },
    { key: 'behavior', label: 'Model behaviour' },
    { key: 'custom', label: 'Custom args & environment' },
  ],
  images: { vllm: 'vllm/vllm-openai:test' },
  policies: { gguf_engine: 'llamacpp' },
  fields: [
    { name: 'kv_cache_memory_bytes', engine: 'vllm', kind: 'int', form: 'value', flag: '--kv-cache-memory-bytes', label: 'KV cache memory (bytes)', group: 'memory', min: 0, order: 1 },
    { name: 'kv_cache_dtype', engine: 'vllm', kind: 'str', form: 'value', flag: '--kv-cache-dtype', label: 'KV cache dtype', group: 'memory', default: 'auto', choices: ['auto', 'fp8'], order: 2 },
    { name: 'enable_prefix_caching', engine: 'vllm', kind: 'bool', form: 'negatable', flag: '--enable-prefix-caching', label: 'Prefix caching', group: 'behavior', default: true, order: 3 },
    { name: 'async_scheduling', engine: 'vllm', kind: 'bool', form: 'switch', flag: '--async-scheduling', label: 'Async scheduling', group: 'behavior', order: 4 },
    { name: 'hf_overrides_json', engine: 'vllm', kind: 'json', form: 'json', flag: '--hf-overrides', label: 'HF config overrides (JSON)', group: 'behavior', order: 5 },
    { name: 'chat_template_file', engine: 'llamacpp', kind: 'str', form: 'value', flag: '--chat-template-file', label: 'Chat template file', group: 'behavior', path: true, order: 6 },
    { name: 'seed', engine: 'both', kind: 'int', form: 'value', flag: { vllm: '--seed', llamacpp: '--seed' }, label: 'Seed', group: 'behavior', order: 7 },
    { name: 'engine_image', engine: 'both', kind: 'str', form: 'internal', label: 'Engine image', group: 'memory', order: 8 },
    { name: 'engine_startup_args_json', engine: 'both', kind: 'json', form: 'internal', label: 'Custom args', group: 'custom', order: 9 },
  ],
};

function setup(engine: 'vllm' | 'llamacpp', exclude: string[] = []) {
  const onChange = vi.fn();
  const values = buildInitialValues({ engine_type: engine }, { configure: false });
  render(<SpecFieldsSection spec={SPEC} engine={engine} values={values} onChange={onChange} exclude={exclude} defaultOpen />);
  return { onChange };
}

describe('SpecFieldsSection', () => {
  it('renders every applicable non-internal field grouped by spec group', () => {
    setup('vllm');
    expect(screen.getByText('Memory & KV cache')).toBeInTheDocument();
    expect(screen.getByText('Model behaviour')).toBeInTheDocument();
    expect(screen.queryByText('Custom args & environment')).not.toBeInTheDocument();
    expect(screen.getByLabelText('KV cache memory (bytes)')).toBeInTheDocument();
    expect(screen.getByLabelText('KV cache dtype')).toBeInTheDocument();
    expect(screen.getByText('Prefix caching')).toBeInTheDocument();
    expect(screen.getByLabelText('Async scheduling')).toBeInTheDocument();
    expect(screen.getByLabelText('HF config overrides (JSON)')).toBeInTheDocument();
    expect(screen.getByLabelText('Seed')).toBeInTheDocument();
    // llama.cpp-only and internal fields are not rendered for vLLM
    expect(screen.queryByLabelText('Chat template file')).not.toBeInTheDocument();
    expect(screen.queryByText('Engine image')).not.toBeInTheDocument();
  });

  it('honours the exclude list for curated fields', () => {
    setup('vllm', ['kv_cache_dtype', 'seed']);
    expect(screen.queryByLabelText('KV cache dtype')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Seed')).not.toBeInTheDocument();
    expect(screen.getByLabelText('KV cache memory (bytes)')).toBeInTheDocument();
  });

  it('renders llama.cpp path fields with the models-dir placeholder', () => {
    setup('llamacpp');
    const input = screen.getByLabelText('Chat template file') as HTMLInputElement;
    expect(input.placeholder).toMatch(/models directory/);
    expect(screen.queryByLabelText('KV cache dtype')).not.toBeInTheDocument();
  });

  it('commits typed values: number, select (empty -> undefined), tri-state bool, json', () => {
    const { onChange } = setup('vllm');
    fireEvent.change(screen.getByLabelText('KV cache memory (bytes)'), { target: { value: '1024' } });
    expect(onChange).toHaveBeenCalledWith('kv_cache_memory_bytes', 1024);

    fireEvent.change(screen.getByLabelText('KV cache dtype'), { target: { value: 'fp8' } });
    expect(onChange).toHaveBeenCalledWith('kv_cache_dtype', 'fp8');
    fireEvent.change(screen.getByLabelText('KV cache dtype'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith('kv_cache_dtype', undefined);

    const group = screen.getByRole('radiogroup', { name: 'Prefix caching' });
    fireEvent.click(within(group).getByText('Off'));
    expect(onChange).toHaveBeenCalledWith('enable_prefix_caching', false);
    fireEvent.click(within(group).getByText(/Default/));
    expect(onChange).toHaveBeenCalledWith('enable_prefix_caching', undefined);

    fireEvent.click(screen.getByLabelText('Async scheduling'));
    expect(onChange).toHaveBeenCalledWith('async_scheduling', true);

    fireEvent.change(screen.getByLabelText('HF config overrides (JSON)'), { target: { value: '{"a":' } });
    expect(onChange).toHaveBeenCalledWith('hf_overrides_json', '{"a":');
  });

  it('shows the engine default and flag in the help text', () => {
    setup('vllm');
    expect(screen.getAllByText(/engine default: auto/).length).toBeGreaterThan(0);
    expect(screen.getByText(/--kv-cache-memory-bytes/)).toBeInTheDocument();
  });
});

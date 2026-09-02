import { describe, expect, it } from 'vitest';
import {
  ADD_DEFAULTS, LLAMACPP_ONLY_FIELDS, VLLM_ONLY_FIELDS, apiItemToFormValues, buildInitialValues,
  recipeToFormValues, toDryRunPayload, toSubmitPayload,
} from './modelFormValues';
import { STATIC_ENGINE_SPEC } from '../../lib/engine-spec';

// A model item exactly as GET /admin/models returns it (after zod parsing).
const API_ITEM = {
  id: 7,
  name: 'llama-70b',
  served_model_name: 'llama-70b',
  task: 'generate',
  repo_id: null,
  local_path: 'llama-70b',
  engine_type: 'vllm',
  dtype: 'bfloat16',
  tp_size: 2,
  selected_gpus: [0, 1],
  gpu_memory_utilization: 0.85,
  max_model_len: 12288,
  max_num_seqs: null,
  enable_log_requests: true,
  hf_overrides_json: '{"rope_parameters": {"rope_type": "yarn"}}',
  temperature: 0.3,
  top_p: 0.55,
  top_k: 12,
  repetition_penalty: 1.05,
  frequency_penalty: 0.1,
  presence_penalty: -0.2,
  custom_request_json: '{"stop": ["###"]}',
  request_defaults_json: '{"stop": ["###"], "temperature": 0.3, "top_p": 0.55, "top_k": 12, "repetition_penalty": 1.05, "frequency_penalty": 0.1, "presence_penalty": -0.2}',
  engine_startup_args_json: '[{"flag":"--max-loras","type":"int","value":4}]',
  state: 'failed',
  state_reason: 'container exited (137)',
  archived: false,
  port: null,
  container_name: null,
};

const LLAMACPP_ITEM = {
  id: 9,
  name: 'qwen-gguf',
  served_model_name: 'qwen-gguf',
  task: 'generate',
  repo_id: null,
  local_path: 'qwen/qwen-Q4_K_M.gguf',
  engine_type: 'llamacpp',
  flash_attn: 'on',
  load_mode: 'mlock',
  cache_type_v: 'q8_0',
  ngl: null,
  spec_type: 'draft-simple',
  draft_n: 8,
  state: 'stopped',
  archived: false,
};

describe('apiItemToFormValues', () => {
  it('keeps the GPU selection and sampling values from the API item', () => {
    const v = apiItemToFormValues(API_ITEM);
    expect(v.selected_gpus).toEqual([0, 1]);
    expect(v.tp_size).toBe(2);
    expect(v.temperature).toBe(0.3);
    expect(v.presence_penalty).toBe(-0.2);
    expect(v.custom_request_json).toBe('{"stop": ["###"]}');
    expect(v.mode).toBe('offline');
    expect(v.enable_log_requests).toBe(true);
    expect(v.hf_overrides_json).toContain('yarn');
  });

  it('falls back to request_defaults_json when sampling fields are absent', () => {
    const { temperature, top_p, top_k, repetition_penalty, frequency_penalty, presence_penalty, custom_request_json, ...rest } = API_ITEM;
    const v = apiItemToFormValues(rest);
    expect(v.temperature).toBe(0.3);
    expect(v.top_k).toBe(12);
    expect(JSON.parse(v.custom_request_json || '{}')).toEqual({ stop: ['###'] });
  });

  it('turns nulls into undefined, drops runtime keys and never carries a token', () => {
    const v = apiItemToFormValues(API_ITEM) as Record<string, unknown>;
    expect(v.max_num_seqs).toBeUndefined();
    expect(v.hf_token).toBe('');
    expect(v.id).toBeUndefined();
    expect(v.state).toBeUndefined();
    expect(v.state_reason).toBeUndefined();
    expect(v.request_defaults_json).toBeUndefined();
  });

  it('maps the new llama.cpp fields one to one', () => {
    const v = apiItemToFormValues(LLAMACPP_ITEM);
    expect(v.flash_attn).toBe('on');
    expect(v.load_mode).toBe('mlock');
    expect(v.spec_type).toBe('draft-simple');
    expect(v.draft_n).toBe(8);
    expect(v.ngl).toBeUndefined();
  });
});

describe('recipeToFormValues', () => {
  const RECIPE = {
    id: 3,
    name: 'Prod Qwen',
    description: 'tested on 2x A6000',
    model_id: 9,
    model_name: 'qwen-gguf',
    served_model_name: 'qwen-gguf',
    task: 'generate',
    engine_type: 'llamacpp',
    mode: 'online', // wrong on purpose: llama.cpp is offline only
    repo_id: null,
    local_path: 'qwen/qwen-Q4_K_M.gguf',
    config: {
      context_size: 32768,
      parallel_slots: 4,
      flash_attn: 'auto',
      selected_gpus: [0, 1],
      tensor_split: '1,1',
      request_defaults_json: '{"temperature": 0.2, "stop": ["<|im_end|>"]}',
      engine_startup_env_json: null,
    },
  };

  it('flattens config + identity, derives mode and splits request defaults', () => {
    const v = recipeToFormValues(RECIPE) as Record<string, unknown>;
    expect(v.engine_type).toBe('llamacpp');
    expect(v.mode).toBe('offline');
    expect(v.local_path).toBe('qwen/qwen-Q4_K_M.gguf');
    expect(v.name).toBe('qwen-gguf');
    expect(v.context_size).toBe(32768);
    expect(v.selected_gpus).toEqual([0, 1]);
    expect(v.temperature).toBe(0.2);
    expect(JSON.parse(String(v.custom_request_json))).toEqual({ stop: ['<|im_end|>'] });
  });

  it('never leaks recipe metadata into the form', () => {
    const v = recipeToFormValues(RECIPE) as Record<string, unknown>;
    expect(v.id).toBeUndefined();
    expect(v.description).toBeUndefined();
    expect(v.model_id).toBeUndefined();
    expect(v.config).toBeUndefined();
    expect(v.engine_startup_env_json).toBeUndefined();
  });

  it('derives online mode for a repo-backed vLLM recipe', () => {
    const v = recipeToFormValues({ ...RECIPE, engine_type: 'vllm', mode: 'bogus', repo_id: 'org/model', local_path: null, config: { tp_size: 2 } });
    expect(v.mode).toBe('online');
    expect(v.repo_id).toBe('org/model');
    expect(v.tp_size).toBe(2);
  });
});

describe('buildInitialValues', () => {
  it('applies add-mode defaults for a new model', () => {
    const v = buildInitialValues(undefined, { configure: false });
    expect(v.selected_gpus).toEqual([0]);
    expect(v.engine_type).toBe('vllm');
    expect(v.enforce_eager).toBe(false);
    expect(v.gpu_memory_utilization).toBe(0.9);
    expect(v.max_model_len).toBeUndefined();
    expect(v.flash_attn).toBe('auto');
    expect(v.cache_type_k).toBe('f16');
    expect(v.ubatch_size).toBe(512);
    expect(v.ngl).toBeUndefined();
    expect(v.threads).toBeUndefined();
    expect(v.parallel_slots).toBeUndefined();
    expect(v.temperature).toBeUndefined();
    expect(v.engine_startup_args_json).toBe('[]');
    expect(ADD_DEFAULTS.enforce_eager).toBe(false);
  });

  it('does not overwrite stored values with defaults in configure mode', () => {
    const v = buildInitialValues(apiItemToFormValues(API_ITEM), { configure: true });
    expect(v.selected_gpus).toEqual([0, 1]);
    expect(v.tp_size).toBe(2);
    expect(v.temperature).toBe(0.3);
    expect(v.repetition_penalty).toBe(1.05);
    expect(v.max_num_seqs).toBeUndefined();
    expect(v.engine_startup_args_json).toContain('--max-loras');
  });

  it('keeps an empty GPU list (CPU mode) in configure mode', () => {
    const v = buildInitialValues({ engine_type: 'llamacpp', mode: 'offline', selected_gpus: [] }, { configure: true });
    expect(v.selected_gpus).toEqual([]);
  });
});

describe('engine field lists', () => {
  it('derive the exclusive field sets from the static spec', () => {
    expect(VLLM_ONLY_FIELDS).toContain('gpu_memory_utilization');
    expect(VLLM_ONLY_FIELDS).not.toContain('hf_offline'); // dead control removed: HF offline follows local_path
    expect(VLLM_ONLY_FIELDS).not.toContain('chat_template');
    expect(LLAMACPP_ONLY_FIELDS).toContain('flash_attn');
    expect(LLAMACPP_ONLY_FIELDS).toContain('load_mode');
    expect(LLAMACPP_ONLY_FIELDS).not.toContain('seed');
    for (const removed of ['swap_space_gb', 'gguf_weight_format', 'vllm_v1_enabled', 'disable_log_requests', 'defrag_thold', 'system_prompt', 'no_mmap', 'mlock', 'flash_attention']) {
      expect(VLLM_ONLY_FIELDS).not.toContain(removed);
      expect(LLAMACPP_ONLY_FIELDS).not.toContain(removed);
    }
  });
});

describe('toSubmitPayload', () => {
  it('omits blank hf_token and the other engine fields', () => {
    const v = buildInitialValues(apiItemToFormValues(API_ITEM), { configure: true });
    const body = toSubmitPayload(v, { configure: true });
    expect(body).not.toHaveProperty('hf_token');
    expect(body).not.toHaveProperty('ngl');
    expect(body).not.toHaveProperty('context_size');
    expect(body.selected_gpus).toEqual([0, 1]);
    expect(body.tp_size).toBe(2);
    expect(body).not.toHaveProperty('mode');
    expect(body).not.toHaveProperty('local_path');
  });

  it('sends cleared sampling fields as null on configure so the backend removes them', () => {
    const v = buildInitialValues(apiItemToFormValues(API_ITEM), { configure: true });
    v.top_k = undefined;
    const body = toSubmitPayload(v, { configure: true });
    expect(body.top_k).toBeNull();
    expect(body.temperature).toBe(0.3);
  });

  it('sends blank strings as null on configure and omits them on create', () => {
    const v = buildInitialValues(apiItemToFormValues(API_ITEM), { configure: true });
    v.tokenizer = '';
    expect(toSubmitPayload(v, { configure: true }).tokenizer).toBeNull();
    const c = buildInitialValues({ mode: 'online', repo_id: 'org/m', name: 'm', served_model_name: 'm' }, { configure: false });
    expect(toSubmitPayload(c, { configure: false })).not.toHaveProperty('tokenizer');
  });

  it('keeps a non-blank hf_token on create', () => {
    const v = buildInitialValues({ mode: 'online', repo_id: 'org/m', name: 'm', served_model_name: 'm', hf_token: 'hf_abc' }, { configure: false });
    const body = toSubmitPayload(v, { configure: false });
    expect(body.hf_token).toBe('hf_abc');
    expect(body.mode).toBe('online');
  });

  it('drops vLLM-only fields for a llama.cpp model and keeps shared ones', () => {
    const v = buildInitialValues({ engine_type: 'llamacpp', mode: 'offline', local_path: 'x.gguf', name: 'x', served_model_name: 'x', seed: 42, chat_template: 'chatml' }, { configure: false });
    const body = toSubmitPayload(v, { configure: false, spec: STATIC_ENGINE_SPEC });
    expect(body).not.toHaveProperty('gpu_memory_utilization');
    expect(body).not.toHaveProperty('tp_size');
    expect(body).not.toHaveProperty('hf_offline');
    expect(body.flash_attn).toBe('auto');
    expect(body.seed).toBe(42);
    expect(body.chat_template).toBe('chatml');
  });

  it('builds a dry-run body with the model id when configuring', () => {
    const v = buildInitialValues(apiItemToFormValues(API_ITEM), { configure: true });
    const body = toDryRunPayload(v, { modelId: 7 });
    expect(body.model_id).toBe(7);
    expect(body.mode).toBe('offline');
    expect(body.engine_type).toBe('vllm');
  });
});

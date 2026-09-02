/**
 * Single source of truth for the model form: the value type, the defaults
 * used when adding a model, how an API item / recipe is turned into form
 * values, and how form values are turned into a request body.
 *
 * The tunable field set mirrors backend/src/engines/spec.py (served at
 * GET /admin/engines/spec).  Keeping the mapping in one place is what stops
 * the Configure modal from silently falling back to defaults.
 */
import { EngineSpec, EngineType, STATIC_ENGINE_SPEC, otherEngineOnlyFields } from '../../lib/engine-spec';

export type { EngineType };

export type ModelFormValues = {
  // --- identity / source ---
  mode: 'online' | 'offline';
  repo_id?: string;
  local_path?: string;
  name: string;
  served_model_name: string;
  task: 'generate' | 'embed';
  engine_type?: EngineType;
  hf_token?: string;
  // --- common (both engines) ---
  engine_image?: string;
  engine_version?: string;
  engine_digest?: string;
  selected_gpus?: number[];
  startup_timeout_sec?: number;
  engine_startup_args_json?: string;
  engine_startup_env_json?: string;
  request_timeout_sec?: number;
  stream_timeout_sec?: number;
  seed?: number;
  chat_template?: string;
  // --- vLLM: source / tokenizer ---
  tokenizer?: string;
  hf_config_path?: string;
  tokenizer_mode?: string;
  load_format?: string;
  hf_overrides_json?: string;
  trust_remote_code?: boolean;
  // --- vLLM: placement ---
  device?: 'cuda' | 'cpu';
  tp_size?: number;
  pipeline_parallel_size?: number;
  data_parallel_size?: number;
  enable_expert_parallel?: boolean;
  distributed_executor_backend?: string;
  // --- vLLM: memory ---
  dtype?: string;
  gpu_memory_utilization?: number;
  kv_cache_memory_bytes?: number;
  max_model_len?: number;
  kv_cache_dtype?: string;
  quantization?: string;
  block_size?: number;
  cpu_offload_gb?: number;
  enable_prefix_caching?: boolean;
  prefix_caching_hash_algo?: string;
  // --- vLLM: throughput ---
  max_num_seqs?: number;
  max_num_batched_tokens?: number;
  enable_chunked_prefill?: boolean;
  enforce_eager?: boolean;
  cuda_graph_sizes?: string;
  compilation_config_json?: string;
  async_scheduling?: boolean;
  attention_backend?: string;
  enable_sleep_mode?: boolean;
  // --- vLLM: behaviour ---
  generation_config?: string;
  override_generation_config_json?: string;
  reasoning_parser?: string;
  enable_auto_tool_choice?: boolean;
  tool_call_parser?: string;
  structured_outputs_config_json?: string;
  limit_mm_per_prompt_json?: string;
  // --- vLLM: adapters / speculative ---
  enable_lora?: boolean;
  lora_modules_json?: string;
  max_loras?: number;
  max_lora_rank?: number;
  max_cpu_loras?: number;
  speculative_config_json?: string;
  // --- vLLM: logging ---
  enable_log_requests?: boolean;
  disable_log_stats?: boolean;
  max_log_len?: number;
  debug_logging?: boolean;
  trace_mode?: boolean;
  engine_request_timeout?: number;
  entrypoint_override?: string;
  // --- llama.cpp: placement / memory ---
  ngl?: number;
  main_gpu?: number;
  split_mode?: string;
  tensor_split?: string;
  load_mode?: string;
  context_size?: number;
  parallel_slots?: number;
  kv_unified?: boolean;
  kv_unified_per_slot?: number;
  fit_memory?: boolean;
  cache_type_k?: string;
  cache_type_v?: string;
  flash_attn?: string;
  batch_size?: number;
  ubatch_size?: number;
  threads?: number;
  threads_http?: number;
  cont_batching?: boolean;
  cache_reuse?: number;
  context_shift?: boolean;
  n_cpu_moe?: number;
  override_tensor?: string;
  numa_policy?: string;
  rope_freq_base?: number;
  rope_freq_scale?: number;
  // --- llama.cpp: behaviour ---
  jinja_enabled?: boolean;
  chat_template_file?: string;
  chat_template_kwargs_json?: string;
  reasoning_format?: string;
  reasoning_budget?: number;
  n_predict?: number;
  grammar_file?: string;
  enable_embeddings?: boolean;
  pooling?: string;
  rerank?: boolean;
  // --- llama.cpp: adapters / speculative / multimodal ---
  lora_adapters_json?: string;
  lora_init_without_apply?: boolean;
  draft_model_path?: string;
  spec_type?: string;
  draft_n?: number;
  spec_draft_n_min?: number;
  draft_p_min?: number;
  spec_draft_ngl?: number;
  mmproj?: string;
  mmproj_offload?: boolean;
  // --- llama.cpp: logging ---
  verbose_logging?: boolean;
  check_tensors?: boolean;
  skip_warmup?: boolean;
  // --- request defaults (Plane C) ---
  temperature?: number;
  top_p?: number;
  top_k?: number;
  repetition_penalty?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  custom_request_json?: string;
};

export type FormFieldName = keyof ModelFormValues;

export const SAMPLING_FIELDS = [
  'temperature', 'top_p', 'top_k', 'repetition_penalty', 'frequency_penalty', 'presence_penalty',
] as const;

/** Suggested sampling values shown as placeholders; nothing is sent unless the admin types a value. */
export const SUGGESTED_SAMPLING: Record<(typeof SAMPLING_FIELDS)[number], number> = {
  temperature: 0.8, top_p: 0.9, top_k: 40, repetition_penalty: 1.2, frequency_penalty: 0.5, presence_penalty: 0.5,
};

/**
 * Defaults applied when adding a new model.  Anything not listed here is left
 * unset, which means "engine default" (the flag is not emitted at all).
 */
export const ADD_DEFAULTS: Partial<ModelFormValues> = {
  mode: 'online',
  task: 'generate',
  engine_type: 'vllm',
  selected_gpus: [0],
  // vLLM
  dtype: 'auto',
  device: 'cuda',
  tp_size: 1,
  gpu_memory_utilization: 0.9,
  enforce_eager: false,
  trust_remote_code: false,
  // llama.cpp (ngl / threads / parallel_slots stay empty = auto)
  batch_size: 2048,
  ubatch_size: 512,
  cache_type_k: 'f16',
  cache_type_v: 'f16',
  flash_attn: 'auto',
};

/** Identity / create-only keys that are not engine spec fields. */
const NON_SPEC_KEYS = new Set<string>([
  'mode', 'repo_id', 'local_path', 'name', 'served_model_name', 'task', 'engine_type', 'hf_token',
  ...SAMPLING_FIELDS, 'custom_request_json',
]);

/** Static fallback lists derived from the bundled spec (the live spec wins at runtime). */
export const VLLM_ONLY_FIELDS: ReadonlyArray<string> = [
  ...otherEngineOnlyFields(STATIC_ENGINE_SPEC, 'llamacpp'),
];
export const LLAMACPP_ONLY_FIELDS: ReadonlyArray<string> = [...otherEngineOnlyFields(STATIC_ENGINE_SPEC, 'vllm')];

/** Fields the given engine must not submit (the other engine's exclusive fields). */
function fieldsToSkip(engine: EngineType, spec?: EngineSpec | null): Set<string> {
  if (spec) {
    return otherEngineOnlyFields(spec, engine);
  }
  return new Set<string>(engine === 'llamacpp' ? VLLM_ONLY_FIELDS : LLAMACPP_ONLY_FIELDS);
}

/** Names of every JSON-valued spec field (kind = json, excluding the internal custom-args blobs). */
export function jsonFieldNames(spec: EngineSpec = STATIC_ENGINE_SPEC): string[] {
  return spec.fields
    .filter((f) => f.kind === 'json' && f.name !== 'selected_gpus' && !f.name.startsWith('engine_startup_') && f.name !== 'request_defaults_json')
    .map((f) => f.name);
}

function nullToUndefined<T>(v: T | null | undefined): T | undefined {
  return v === null ? undefined : v;
}

function parseRequestDefaults(raw: unknown): { sampling: Partial<ModelFormValues>; extras: Record<string, unknown> } {
  const sampling: Record<string, unknown> = {};
  const extras: Record<string, unknown> = {};
  if (typeof raw !== 'string' || !raw.trim()) return { sampling, extras };
  try {
    const data: unknown = JSON.parse(raw);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        if ((SAMPLING_FIELDS as ReadonlyArray<string>).includes(k)) sampling[k] = v;
        else extras[k] = v;
      }
    }
  } catch {
    // malformed JSON; the editor will show it empty
  }
  return { sampling: sampling as Partial<ModelFormValues>, extras };
}

const RUNTIME_KEYS = ['id', 'state', 'state_reason', 'archived', 'port', 'container_name', 'created_at', 'updated_at', 'request_defaults_json'];

/**
 * Turn a model item from GET /admin/models into form values for the
 * Configure modal.  Nulls become undefined (so untouched fields are not sent
 * back), sampling values are taken from the individual fields with
 * request_defaults_json as a fallback, and custom extras are exposed as JSON.
 */
export function apiItemToFormValues(item: Record<string, unknown>): Partial<ModelFormValues> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item || {})) out[k] = nullToUndefined(v);
  out.mode = item?.repo_id ? 'online' : 'offline';

  const { sampling, extras } = parseRequestDefaults(item?.request_defaults_json);
  for (const f of SAMPLING_FIELDS) {
    if (out[f] === undefined && sampling[f] !== undefined) out[f] = sampling[f];
  }
  if (!out.custom_request_json && Object.keys(extras).length > 0) {
    out.custom_request_json = JSON.stringify(extras, null, 2);
  }
  // The stored token is never returned; leave the field blank (blank = unchanged on save).
  out.hf_token = '';
  for (const k of RUNTIME_KEYS) delete out[k];
  return out as Partial<ModelFormValues>;
}

/** Shape of GET /admin/recipes/{id} as far as prefill is concerned. */
type RecipeLike = {
  id?: number;
  name?: string;
  description?: string | null;
  model_id?: number | null;
  model_name?: string;
  served_model_name?: string;
  task?: string;
  engine_type?: string;
  mode?: string;
  repo_id?: string | null;
  local_path?: string | null;
  config?: Record<string, unknown> | null;
};

/**
 * Turn a recipe detail into Add-form values: flatten `config` + identity,
 * derive `mode`, and run everything through the same normalisation as an
 * API item so request_defaults_json is split and nulls are dropped.
 * Recipe metadata (recipe id/name/description/model_id) never reaches the form.
 */
export function recipeToFormValues(recipe: RecipeLike): Partial<ModelFormValues> {
  const flat: Record<string, unknown> = { ...(recipe.config || {}) };
  flat.repo_id = recipe.repo_id ?? null;
  flat.local_path = recipe.local_path ?? null;
  if (recipe.engine_type) flat.engine_type = recipe.engine_type;
  if (recipe.task) flat.task = recipe.task;
  if (recipe.model_name) flat.name = recipe.model_name;
  if (recipe.served_model_name) flat.served_model_name = recipe.served_model_name;
  for (const k of ['id', 'model_id', 'description', 'created_at', 'updated_at', 'mode']) delete flat[k];
  const out = apiItemToFormValues(flat);
  out.mode = recipe.mode === 'online' || recipe.mode === 'offline' ? recipe.mode : (recipe.repo_id ? 'online' : 'offline');
  if (out.engine_type === 'llamacpp') out.mode = 'offline';
  return out;
}

/**
 * Initial form state.  In "add" mode every unset field gets ADD_DEFAULTS; in
 * "configure" mode only the structural fields do, so a value the server
 * stored as null stays unset instead of being replaced by a UI default.
 */
export function buildInitialValues(defaults: Partial<ModelFormValues> | undefined, opts: { configure: boolean }): ModelFormValues {
  const d = defaults || {};
  const base: Partial<ModelFormValues> = opts.configure
    ? { mode: d.mode, task: d.task, engine_type: d.engine_type, dtype: d.dtype ?? 'auto', device: d.device ?? 'cuda', selected_gpus: d.selected_gpus }
    : { ...ADD_DEFAULTS };

  const merged: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined && v !== null) merged[k] = v;
  }

  const gpus = Array.isArray(merged.selected_gpus) ? (merged.selected_gpus as number[]) : undefined;
  return {
    ...merged,
    mode: (merged.mode as ModelFormValues['mode']) || 'online',
    repo_id: (merged.repo_id as string) || '',
    local_path: (merged.local_path as string) || '',
    name: (merged.name as string) || '',
    served_model_name: (merged.served_model_name as string) || '',
    task: (merged.task as ModelFormValues['task']) || 'generate',
    engine_type: (merged.engine_type as EngineType) || 'vllm',
    hf_token: (merged.hf_token as string) || '',
    tokenizer: (merged.tokenizer as string) || '',
    hf_config_path: (merged.hf_config_path as string) || '',
    selected_gpus: gpus && gpus.length > 0 ? gpus : opts.configure ? (gpus ?? []) : [0],
    custom_request_json: (merged.custom_request_json as string) || '',
    engine_startup_args_json: (merged.engine_startup_args_json as string) || '[]',
    engine_startup_env_json: (merged.engine_startup_env_json as string) || '[]',
  } as ModelFormValues;
}

/**
 * Body for POST /admin/models (create) or PATCH /admin/models/{id} (configure).
 * - Drops fields belonging to the other engine (using the live spec when given).
 * - Omits a blank hf_token (backend treats it as unchanged; on create it is simply unset).
 * - Blank strings become null on configure (clear the stored value) and are omitted on create.
 * - On configure, sampling fields the user cleared are sent as null so they are removed.
 */
export function toSubmitPayload(
  values: ModelFormValues,
  opts: { configure: boolean; spec?: EngineSpec | null },
): Record<string, unknown> {
  const engine: EngineType = values.engine_type || 'vllm';
  const skip = fieldsToSkip(engine, opts.spec);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (skip.has(k)) continue;
    if (k === 'hf_token' && !(typeof v === 'string' && v.trim())) continue;
    if (v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '' && !NON_SPEC_KEYS.has(k)) {
      if (opts.configure) out[k] = null;
      continue;
    }
    out[k] = v;
  }
  if (opts.configure) {
    for (const f of SAMPLING_FIELDS) {
      if (values[f] === undefined) out[f] = null;
    }
    if (!values.custom_request_json || !values.custom_request_json.trim()) out.custom_request_json = null;
    // Immutable after creation; the backend ignores them but keep the body honest.
    delete out.mode;
    delete out.repo_id;
    delete out.local_path;
    delete out.engine_type;
    delete out.task;
  }
  return out;
}

/** Body for POST /admin/models/dry-run: the create body plus the model id when configuring. */
export function toDryRunPayload(values: ModelFormValues, opts: { modelId?: number; spec?: EngineSpec | null }): Record<string, unknown> {
  const body = toSubmitPayload(values, { configure: false, spec: opts.spec });
  if (opts.modelId) body.model_id = opts.modelId;
  return body;
}

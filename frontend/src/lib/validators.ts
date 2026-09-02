import { z } from 'zod';

// Keys
export const KeyItemSchema = z.object({
  id: z.number(),
  prefix: z.string(),
  scopes: z.string(),
  expires_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
  disabled: z.boolean(),
  user_id: z.number().nullable().optional(),
  org_id: z.number().nullable().optional(),
  created_at: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  org_name: z.string().nullable().optional(),
});
export const KeysListSchema = z.array(KeyItemSchema);
export const CreateKeyResponseSchema = z.object({ id: z.number(), prefix: z.string(), token: z.string() });

// Usage
export const UsageItemSchema = z.object({
  id: z.number(),
  key_id: z.number().nullable(),
  model_name: z.string(),
  task: z.string(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  latency_ms: z.number(),
  status_code: z.number(),
  req_id: z.string(),
  created_at: z.number(),
});
export const UsageListSchema = z.array(UsageItemSchema);

export const UsageSeriesItemSchema = z.object({
  ts: z.number(),
  requests: z.number(),
  total_tokens: z.number(),
});
export const UsageSeriesSchema = z.array(UsageSeriesItemSchema);

// Aggregates by model (existing endpoint)
export const UsageAggItemSchema = z.object({
  model_name: z.string(),
  requests: z.number(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});
export const UsageAggListSchema = z.array(UsageAggItemSchema);

// Latency summary
export const LatencySummarySchema = z.object({ p50_ms: z.number(), p95_ms: z.number(), avg_ms: z.number() });
export const TtftSummarySchema = z.object({ p50_s: z.number(), p95_s: z.number() });


// System monitoring
export const ThroughputSummarySchema = z.object({
  req_per_sec: z.number(),
  prompt_tokens_per_sec: z.number(),
  generation_tokens_per_sec: z.number(),
  latency_p50_ms: z.number(),
  latency_p95_ms: z.number(),
  ttft_p50_ms: z.number(),
  ttft_p95_ms: z.number(),
});

export const GpuMetricsItemSchema = z.object({
  index: z.number(),
  name: z.string().nullable().optional(),
  utilization_pct: z.number().nullable().optional(),
  mem_used_mb: z.number().nullable().optional(),
  mem_total_mb: z.number().nullable().optional(),
  temperature_c: z.number().nullable().optional(),
});
export const GpuMetricsListSchema = z.array(GpuMetricsItemSchema);

// Host metrics
export const HostSummarySchema = z.object({
  cpu_util_pct: z.number(),
  load_avg_1m: z.number().nullable().optional(),
  mem_total_mb: z.number(),
  mem_used_mb: z.number(),
  disk_total_gb: z.number().nullable().optional(),
  disk_used_gb: z.number().nullable().optional(),
  disk_used_pct: z.number().nullable().optional(),
  net_rx_bps: z.number(),
  net_tx_bps: z.number(),
});

export const TimePointSchema = z.object({ ts: z.number(), value: z.number() });
export const HostTrendsSchema = z.object({
  cpu_util_pct: z.array(TimePointSchema),
  mem_used_mb: z.array(TimePointSchema),
  disk_used_pct: z.array(TimePointSchema),
  net_rx_bps: z.array(TimePointSchema),
  net_tx_bps: z.array(TimePointSchema),
  // Backend may include these keys with null when providers are unavailable (e.g., Windows psutil fallback).
  // Accept null as well as undefined to avoid parse failures that blank the System Monitor.
  cpu_per_core_pct: z
    .record(z.array(TimePointSchema))
    .nullable()
    .optional(),
  disk_rw_bps: z
    .record(z.object({ read: z.array(TimePointSchema), write: z.array(TimePointSchema) }))
    .nullable()
    .optional(),
  net_per_iface_bps: z
    .record(z.object({ rx: z.array(TimePointSchema), tx: z.array(TimePointSchema) }))
    .nullable()
    .optional(),
});

// Capabilities
export const PromTargetsSchema = z.object({
  up: z.boolean(),
  nodeExporter: z.string().nullable().optional(),
  dcgmExporter: z.string().nullable().optional(),
  cadvisor: z.string().nullable().optional(),
});

export const CapabilitiesSchema = z.object({
  os: z.string(),
  isContainer: z.boolean(),
  isWSL: z.boolean(),
  prometheus: PromTargetsSchema,
  gpu: z.object({ nvml: z.boolean(), count: z.number(), driver: z.string().nullable().optional() }),
  selectedProviders: z.object({ host: z.string(), gpu: z.string() }),
  suggestions: z.array(z.string()),
});

// Per-model vLLM metrics (Gap #16)
export const ModelMetricsSchema = z.object({
  model_id: z.number(),
  model_name: z.string(),
  served_name: z.string(),
  num_requests_running: z.number().nullable().optional(),
  num_requests_waiting: z.number().nullable().optional(),
  num_requests_swapped: z.number().nullable().optional(),
  prompt_tokens_total: z.number().nullable().optional(),
  generation_tokens_total: z.number().nullable().optional(),
  time_to_first_token_p50_ms: z.number().nullable().optional(),
  time_to_first_token_p95_ms: z.number().nullable().optional(),
  request_latency_p50_ms: z.number().nullable().optional(),
  request_latency_p95_ms: z.number().nullable().optional(),
  gpu_cache_usage_pct: z.number().nullable().optional(),
  cpu_cache_usage_pct: z.number().nullable().optional(),
  status: z.string(),
  error: z.string().nullable().optional(),
});
export const ModelMetricsListSchema = z.array(ModelMetricsSchema);


// Models. NOTE: zod strips undeclared keys, so every field the backend
// returns must be listed here or the Configure modal silently falls back to
// defaults. backend/src/tests/test_model_schema_parity.py parses this block and
// compares it with the pydantic ModelItem (generated from engines/spec.py).
const nStr = () => z.string().nullable().optional();
const nNum = () => z.number().nullable().optional();
const nBool = () => z.boolean().nullable().optional();

export const MODEL_STATES = ['stopped', 'starting', 'loading', 'running', 'stopping', 'failed'] as const;
export const ModelStateSchema = z.enum(MODEL_STATES);
export type ModelState = z.infer<typeof ModelStateSchema>;

export const ModelItemSchema = z.object({
  // --- identity ---
  id: z.number(),
  name: z.string(),
  served_model_name: z.string(),
  task: z.string(),
  repo_id: nStr(),
  local_path: nStr(),
  engine_type: z.enum(['vllm', 'llamacpp']).catch('vllm'),
  // --- common (both engines) ---
  engine_image: nStr(),
  engine_version: nStr(),
  engine_digest: nStr(),
  selected_gpus: z.array(z.number()).nullable().optional(),
  startup_timeout_sec: nNum(),
  engine_startup_args_json: nStr(),
  engine_startup_env_json: nStr(),
  request_defaults_json: nStr(),
  request_timeout_sec: nNum(),
  stream_timeout_sec: nNum(),
  seed: nNum(),
  // --- vLLM: source / tokenizer ---
  tokenizer: nStr(),
  hf_config_path: nStr(),
  tokenizer_mode: nStr(),
  load_format: nStr(),
  hf_overrides_json: nStr(),
  trust_remote_code: nBool(),
  // --- vLLM: placement / parallelism ---
  device: nStr(),
  tp_size: nNum(),
  pipeline_parallel_size: nNum(),
  data_parallel_size: nNum(),
  enable_expert_parallel: nBool(),
  distributed_executor_backend: nStr(),
  // --- vLLM: memory ---
  dtype: nStr(),
  gpu_memory_utilization: nNum(),
  kv_cache_memory_bytes: nNum(),
  max_model_len: nNum(),
  kv_cache_dtype: nStr(),
  quantization: nStr(),
  block_size: nNum(),
  cpu_offload_gb: nNum(),
  enable_prefix_caching: nBool(),
  prefix_caching_hash_algo: nStr(),
  // --- vLLM: throughput ---
  max_num_seqs: nNum(),
  max_num_batched_tokens: nNum(),
  enable_chunked_prefill: nBool(),
  enforce_eager: nBool(),
  cuda_graph_sizes: nStr(),
  compilation_config_json: nStr(),
  async_scheduling: nBool(),
  attention_backend: nStr(),
  enable_sleep_mode: nBool(),
  // --- behaviour (chat_template is shared by both engines) ---
  chat_template: nStr(),
  generation_config: nStr(),
  override_generation_config_json: nStr(),
  reasoning_parser: nStr(),
  enable_auto_tool_choice: nBool(),
  tool_call_parser: nStr(),
  structured_outputs_config_json: nStr(),
  limit_mm_per_prompt_json: nStr(),
  // --- vLLM: adapters / speculative ---
  enable_lora: nBool(),
  lora_modules_json: nStr(),
  max_loras: nNum(),
  max_lora_rank: nNum(),
  max_cpu_loras: nNum(),
  speculative_config_json: nStr(),
  // --- vLLM: logging ---
  enable_log_requests: nBool(),
  disable_log_stats: nBool(),
  max_log_len: nNum(),
  debug_logging: nBool(),
  trace_mode: nBool(),
  engine_request_timeout: nNum(),
  entrypoint_override: nStr(),
  // --- llama.cpp: placement / memory ---
  ngl: nNum(),
  main_gpu: nNum(),
  split_mode: nStr(),
  tensor_split: nStr(),
  load_mode: nStr(),
  context_size: nNum(),
  parallel_slots: nNum(),
  kv_unified: nBool(),
  kv_unified_per_slot: nNum(),
  fit_memory: nBool(),
  cache_type_k: nStr(),
  cache_type_v: nStr(),
  flash_attn: nStr(),
  batch_size: nNum(),
  ubatch_size: nNum(),
  threads: nNum(),
  threads_http: nNum(),
  cont_batching: nBool(),
  cache_reuse: nNum(),
  context_shift: nBool(),
  n_cpu_moe: nNum(),
  override_tensor: nStr(),
  numa_policy: nStr(),
  rope_freq_base: nNum(),
  rope_freq_scale: nNum(),
  // --- llama.cpp: behaviour ---
  jinja_enabled: nBool(),
  chat_template_file: nStr(),
  chat_template_kwargs_json: nStr(),
  reasoning_format: nStr(),
  reasoning_budget: nNum(),
  n_predict: nNum(),
  grammar_file: nStr(),
  enable_embeddings: nBool(),
  pooling: nStr(),
  rerank: nBool(),
  // --- llama.cpp: adapters / speculative / multimodal ---
  lora_adapters_json: nStr(),
  lora_init_without_apply: nBool(),
  draft_model_path: nStr(),
  spec_type: nStr(),
  draft_n: nNum(),
  spec_draft_n_min: nNum(),
  draft_p_min: nNum(),
  spec_draft_ngl: nNum(),
  mmproj: nStr(),
  mmproj_offload: nBool(),
  // --- llama.cpp: logging / startup ---
  verbose_logging: nBool(),
  check_tensors: nBool(),
  skip_warmup: nBool(),
  // --- request defaults (Plane C): sampling knobs + custom extras ---
  temperature: nNum(),
  top_p: nNum(),
  top_k: nNum(),
  repetition_penalty: nNum(),
  frequency_penalty: nNum(),
  presence_penalty: nNum(),
  custom_request_json: nStr(),
  // --- runtime ---
  state: ModelStateSchema.catch('stopped'),
  state_reason: nStr(),
  archived: z.boolean().optional().default(false),
  port: nNum(),
  container_name: nStr(),
  created_at: nStr(),
  updated_at: nStr(),
});
export type ModelItem = z.infer<typeof ModelItemSchema>;
export const ModelListSchema = z.array(ModelItemSchema);

// Engine spec (GET /admin/engines/spec)
export const FieldSpecSchema = z.object({
  name: z.string(),
  engine: z.enum(['vllm', 'llamacpp', 'both']),
  kind: z.enum(['int', 'float', 'str', 'bool', 'json']),
  form: z.string().optional(),
  flag: z.union([z.string(), z.record(z.string())]).nullable().optional(),
  env: z.string().nullable().optional(),
  label: z.string().optional(),
  help: z.string().optional(),
  group: z.string().optional(),
  default: z.unknown().optional(),
  choices: z.array(z.string()).nullable().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  path: z.boolean().optional(),
  emit_if: z.string().nullable().optional(),
  requires: z.record(z.unknown()).optional(),
  order: z.number().optional(),
});
export const EngineSpecSchema = z.object({
  groups: z.array(z.object({ key: z.string(), label: z.string() })),
  fields: z.array(FieldSpecSchema),
  images: z.record(z.string()).optional().default({}),
  policies: z.record(z.unknown()).optional().default({}),
});

// Dry run (POST /admin/models/dry-run and /admin/models/{id}/dry-run)
export const DryRunWarningSchema = z.object({
  severity: z.string(),
  category: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  message: z.string(),
  fix: z.string().nullable().optional(),
});
export const DryRunResultSchema = z.object({
  command: z.array(z.string()).optional().default([]),
  command_str: z.string().optional().default(''),
  env: z.record(z.string()).optional().default({}),
  image: z.string().nullable().optional(),
  image_cached: z.boolean().nullable().optional(),
  valid: z.boolean().optional().default(true),
  warnings: z.array(DryRunWarningSchema).optional().default([]),
  vram_estimate: z.record(z.unknown()).nullable().optional(),
});
export type DryRunResult = z.infer<typeof DryRunResultSchema>;
export type DryRunWarning = z.infer<typeof DryRunWarningSchema>;

// Recipes
export const RecipeItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: nStr(),
  model_id: nNum(),
  model_name: z.string(),
  served_model_name: z.string(),
  task: z.string(),
  engine_type: z.string(),
  mode: z.string(),
  created_at: nStr(),
  updated_at: nStr(),
});
export const RecipeListSchema = z.array(RecipeItemSchema);
export const RecipeDetailSchema = RecipeItemSchema.extend({
  repo_id: nStr(),
  local_path: nStr(),
  config: z.record(z.unknown()),
});
export type RecipeItem = z.infer<typeof RecipeItemSchema>;
export type RecipeDetail = z.infer<typeof RecipeDetailSchema>;

// Readiness / lifecycle responses
export const ReadinessSchema = z.object({ status: z.string(), detail: z.string().nullable().optional() });
export const GpuInfoSchema = z.object({
  index: z.number(),
  name: z.string().nullable().optional(),
  mem_total_mb: z.number().nullable().optional(),
  mem_used_mb: z.number().nullable().optional(),
  compute_capability: z.union([z.string(), z.number()]).nullable().optional(),
  architecture: z.string().nullable().optional(),
  flash_attention_supported: z.boolean().nullable().optional(),
});
export const GpuInfoListSchema = z.array(GpuInfoSchema);
export type GpuInfo = z.infer<typeof GpuInfoSchema>;

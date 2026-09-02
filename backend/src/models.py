from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, DateTime, Text, Boolean, ForeignKey, Float
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime


class Base(DeclarativeBase):
    pass


class APIKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    org_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    prefix: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    hash: Mapped[str] = mapped_column(String(256))
    scopes: Mapped[str] = mapped_column(String(128), default="chat,completions,embeddings")
    ip_allowlist: Mapped[str] = mapped_column(Text, default="")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    username: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(32), default="User")
    status: Mapped[str] = mapped_column(String(16), default="active")
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class Usage(Base):
    __tablename__ = "usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    key_id: Mapped[int | None] = mapped_column(ForeignKey("api_keys.id"), nullable=True)
    model_name: Mapped[str] = mapped_column(String(255))
    task: Mapped[str] = mapped_column(String(32))
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    status_code: Mapped[int] = mapped_column(Integer, default=0)
    req_id: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
 
class Model(Base):
    """A registered model. Identity/runtime columns are explicit; every tunable
    engine field is generated from ``engines/spec.py`` (see test_model_schema_parity)."""
    __tablename__ = "models"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    served_model_name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    repo_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    local_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    task: Mapped[str] = mapped_column(String(32), default="generate")
    engine_type: Mapped[str] = mapped_column(String(16), default="vllm")
    # Optional per-model Hugging Face access token (never returned by the API)
    hf_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    # --- engine configuration (generated from engines/spec.py) ---
    engine_image: Mapped[str | None] = mapped_column(String(512), nullable=True)  # both: Engine image
    engine_version: Mapped[str | None] = mapped_column(String(512), nullable=True)  # both: Engine version (reference)
    engine_digest: Mapped[str | None] = mapped_column(String(512), nullable=True)  # both: Engine image digest
    selected_gpus: Mapped[str | None] = mapped_column(Text, nullable=True)  # both: GPUs
    startup_timeout_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)  # both: Startup timeout (s)
    engine_startup_args_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # both: Custom startup args
    engine_startup_env_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # both: Custom environment variables
    request_defaults_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # both: Request defaults
    request_timeout_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)  # both: Request timeout (s)
    stream_timeout_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)  # both: Stream timeout (s)
    seed: Mapped[int | None] = mapped_column(Integer, nullable=True)  # both: Seed
    tokenizer: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: Tokenizer (HF repo or path)
    hf_config_path: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: HF config path
    tokenizer_mode: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: Tokenizer mode
    load_format: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: Load format
    hf_overrides_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # vllm: HF config overrides (JSON)
    trust_remote_code: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Trust remote code
    device: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: Device
    tp_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: Tensor parallel size
    pipeline_parallel_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: Pipeline parallel size
    data_parallel_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: Data parallel size
    enable_expert_parallel: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Expert parallel (MoE)
    distributed_executor_backend: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: Distributed executor
    dtype: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: DType
    gpu_memory_utilization: Mapped[float | None] = mapped_column(Float, nullable=True)  # vllm: GPU memory utilization
    kv_cache_memory_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: KV cache memory (bytes)
    max_model_len: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: Max model length
    kv_cache_dtype: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: KV cache dtype
    quantization: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: Quantization
    block_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: KV block size
    cpu_offload_gb: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: CPU offload (GiB)
    enable_prefix_caching: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Prefix caching
    prefix_caching_hash_algo: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: Prefix cache hash
    max_num_seqs: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: Max concurrent sequences
    max_num_batched_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: Max batched tokens
    enable_chunked_prefill: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Chunked prefill
    enforce_eager: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Enforce eager (no compile / CUDA graphs)
    cuda_graph_sizes: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: CUDA graph capture sizes
    compilation_config_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # vllm: Compilation config (JSON)
    async_scheduling: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Async scheduling
    attention_backend: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: Attention backend
    enable_sleep_mode: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Sleep mode
    chat_template: Mapped[str | None] = mapped_column(Text, nullable=True)  # vllm: Chat template (inline or file)
    generation_config: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: Generation config source
    override_generation_config_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # vllm: Override generation config (JSON)
    reasoning_parser: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: Reasoning parser
    enable_auto_tool_choice: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Auto tool choice
    tool_call_parser: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: Tool call parser
    structured_outputs_config_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # vllm: Structured outputs config (JSON)
    limit_mm_per_prompt_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # vllm: Multimodal limits (JSON)
    enable_lora: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Enable LoRA
    lora_modules_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # vllm: LoRA modules (JSON list of {name, path})
    max_loras: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: Max LoRAs per batch
    max_lora_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: Max LoRA rank
    max_cpu_loras: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: Max CPU LoRAs
    speculative_config_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # vllm: Speculative decoding config (JSON)
    enable_log_requests: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Log requests
    disable_log_stats: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Disable stats logging
    max_log_len: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: Max logged prompt chars
    debug_logging: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Debug logging
    trace_mode: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # vllm: Trace mode (very slow)
    engine_request_timeout: Mapped[int | None] = mapped_column(Integer, nullable=True)  # vllm: Engine iteration timeout (s)
    entrypoint_override: Mapped[str | None] = mapped_column(String(512), nullable=True)  # vllm: Entrypoint override
    ngl: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: GPU layers (-ngl)
    main_gpu: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: Main GPU
    split_mode: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: Split mode
    tensor_split: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: Tensor split
    load_mode: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: Load mode
    context_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: Context size (-c, total across slots)
    parallel_slots: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: Parallel slots (-np)
    kv_unified: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # llamacpp: Unified KV cache
    kv_unified_per_slot: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: Per-slot context limit (unified KV)
    fit_memory: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # llamacpp: Auto-fit unset args to VRAM (--fit)
    cache_type_k: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: KV cache type K
    cache_type_v: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: KV cache type V
    flash_attn: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: Flash attention
    batch_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: Batch size (-b)
    ubatch_size: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: Micro-batch size (-ub)
    threads: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: CPU threads (-t)
    threads_http: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: HTTP threads
    cont_batching: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # llamacpp: Continuous batching
    cache_reuse: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: Cache reuse (min chunk)
    context_shift: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # llamacpp: Context shift
    n_cpu_moe: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: MoE layers kept on CPU
    override_tensor: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: Override tensor placement (-ot)
    numa_policy: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: NUMA policy
    rope_freq_base: Mapped[float | None] = mapped_column(Float, nullable=True)  # llamacpp: RoPE frequency base
    rope_freq_scale: Mapped[float | None] = mapped_column(Float, nullable=True)  # llamacpp: RoPE frequency scale
    jinja_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # llamacpp: Jinja chat templates
    chat_template_file: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: Chat template file
    chat_template_kwargs_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # llamacpp: Chat template kwargs (JSON)
    reasoning_format: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: Reasoning format
    reasoning_budget: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: Reasoning budget (tokens, -1 unlimited)
    n_predict: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: Max tokens to predict (-n)
    grammar_file: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: Grammar file (GBNF)
    enable_embeddings: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # llamacpp: Enable embeddings endpoint
    pooling: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: Pooling
    rerank: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # llamacpp: Reranking endpoint
    lora_adapters_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # llamacpp: LoRA adapters (JSON list of path or {path, scale})
    lora_init_without_apply: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # llamacpp: Load LoRAs without applying
    draft_model_path: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: Draft model (GGUF)
    spec_type: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: Speculative type
    draft_n: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: Draft tokens (max)
    spec_draft_n_min: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: Draft tokens (min)
    draft_p_min: Mapped[float | None] = mapped_column(Float, nullable=True)  # llamacpp: Draft acceptance p_min
    spec_draft_ngl: Mapped[int | None] = mapped_column(Integer, nullable=True)  # llamacpp: Draft model GPU layers
    mmproj: Mapped[str | None] = mapped_column(String(512), nullable=True)  # llamacpp: Multimodal projector (GGUF)
    mmproj_offload: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # llamacpp: Offload projector to GPU
    verbose_logging: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # llamacpp: Verbose logging
    check_tensors: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # llamacpp: Check tensors on load
    skip_warmup: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # llamacpp: Skip warmup
    # --- runtime state ---
    state: Mapped[str] = mapped_column(String(16), default="stopped")
    state_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    container_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


MODEL_STATES = ("stopped", "starting", "loading", "running", "stopping", "failed")


class Recipe(Base):
    """A saved model configuration snapshot (all engine fields as one JSON blob)."""
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_id: Mapped[int | None] = mapped_column(ForeignKey("models.id", ondelete="SET NULL"), nullable=True)
    model_name: Mapped[str] = mapped_column(String(255))
    served_model_name: Mapped[str] = mapped_column(String(255))
    task: Mapped[str] = mapped_column(String(32), default="generate")
    engine_type: Mapped[str] = mapped_column(String(16), default="vllm")
    mode: Mapped[str] = mapped_column(String(16), default="offline")
    repo_id: Mapped[str | None] = mapped_column(String(512), nullable=True)
    local_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    config_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class ConfigKV(Base):
    __tablename__ = "config_kv"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class ChatSession(Base):
    """Stores chat playground sessions, scoped to individual users."""
    __tablename__ = "chat_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # UUID
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="New Chat")
    model_name: Mapped[str] = mapped_column(String(255))
    engine_type: Mapped[str] = mapped_column(String(32), default="vllm")
    constraints_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class ChatMessage(Base):
    """Stores individual messages within a chat session."""
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("chat_sessions.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))  # 'user', 'assistant', 'system'
    content: Mapped[str] = mapped_column(Text)
    metrics_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # tokens/sec, TTFT, etc.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
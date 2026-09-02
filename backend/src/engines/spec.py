"""Declarative engine configuration spec.

Every tunable model field is defined ONCE here.  From this table we derive:
- the pydantic API schemas (``schemas/models.py``),
- the per-engine field sets used to clear/ignore the other engine's fields,
- the container command line and environment (``engines/vllm.py``, ``engines/llamacpp.py``),
- validation (choices, ranges, requires),
- the JSON served to the frontend at ``GET /admin/engines/spec`` so the UI can
  render and validate advanced options without a hand-maintained copy.

Field forms (how a value becomes CLI arguments):
- ``value``      ``--flag VALUE``            (emitted when value is not None/empty)
- ``switch``     ``--flag``                  (emitted when value is truthy)
- ``negatable``  ``--flag`` / ``--no-flag``  (emitted whenever value is not None)
- ``no_only``    ``--no-flag``               (emitted only when value is False)
- ``onoff``      ``--flag on|off``           (bool rendered as on/off)
- ``csv``        ``--flag a b c``            (comma-separated string → separate args)
- ``json``       ``--flag '{...}'``          (validated JSON object/array passed verbatim)
- ``custom``     handled by the adapter (e.g. repeated ``--lora`` flags)
- ``env``        environment variable, see ``env`` / ``env_value``
- ``internal``   consumed by Cortex itself (placement, image, timeouts) - never a flag

Version notes reflect vLLM v0.28 and llama.cpp build b10731 (Sep 2026).
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Literal

Engine = Literal["vllm", "llamacpp", "both"]
Kind = Literal["int", "float", "str", "bool", "json"]
Form = Literal["value", "switch", "negatable", "no_only", "onoff", "csv", "json", "custom", "env", "internal"]


@dataclass(frozen=True)
class FieldSpec:
    name: str
    engine: Engine
    kind: Kind
    form: Form = "value"
    flag: str | dict[str, str] | None = None
    env: str | None = None
    env_value: str | None = None          # for form=env with bool kind: value to set when True
    label: str = ""
    help: str = ""
    group: str = "advanced"
    default: Any = None                   # documented engine default (informational)
    choices: tuple[str, ...] | None = None
    min: float | None = None
    max: float | None = None
    path: bool = False                    # value is a path relative to the models dir
    emit_if: str | None = None            # "gt1" → only emit when value > 1; "gt0" → > 0
    requires: dict[str, Any] = field(default_factory=dict)
    order: int = 100

    def flag_for(self, engine: str) -> str | None:
        if isinstance(self.flag, dict):
            return self.flag.get(engine)
        return self.flag

    def applies_to(self, engine: str) -> bool:
        return self.engine == "both" or self.engine == engine

    def to_json(self) -> dict[str, Any]:
        d = asdict(self)
        d["choices"] = list(self.choices) if self.choices else None
        return d


F = FieldSpec

# ---------------------------------------------------------------------------
# Common (engine-independent) fields
# ---------------------------------------------------------------------------
COMMON_FIELDS: tuple[FieldSpec, ...] = (
    F("engine_image", "both", "str", "internal", label="Engine image", group="engine", order=1,
      help="Docker image override. Leave blank for the pinned system default."),
    F("engine_version", "both", "str", "internal", label="Engine version (reference)", group="engine", order=2),
    F("engine_digest", "both", "str", "internal", label="Engine image digest", group="engine", order=3),
    F("selected_gpus", "both", "json", "internal", label="GPUs", group="placement", order=10,
      help="GPU indices exposed to the container. Empty = CPU mode (vLLM device=cpu, llama.cpp ngl=0)."),
    F("startup_timeout_sec", "both", "int", "internal", label="Startup timeout (s)", group="engine", min=30, order=20,
      help="How long the model may take to become ready before it is marked failed."),
    F("engine_startup_args_json", "both", "json", "internal", label="Custom startup args", group="custom", order=90),
    F("engine_startup_env_json", "both", "json", "internal", label="Custom environment variables", group="custom", order=91),
    F("request_defaults_json", "both", "json", "internal", label="Request defaults", group="request", order=95),
    F("request_timeout_sec", "both", "int", "internal", label="Request timeout (s)", group="request", min=1, order=96),
    F("stream_timeout_sec", "both", "int", "internal", label="Stream timeout (s)", group="request", min=1, order=97),
    F("seed", "both", "int", "value", flag={"vllm": "--seed", "llamacpp": "--seed"}, label="Seed", group="behavior", order=60,
      help="Random seed for sampling reproducibility."),
    F("chat_template", "both", "str", "value", flag={"vllm": "--chat-template", "llamacpp": "--chat-template"},
      label="Chat template (inline, preset name or file under the models dir)", group="behavior", order=62),
)

# ---------------------------------------------------------------------------
# vLLM (v0.28)
# ---------------------------------------------------------------------------
VLLM_FIELDS: tuple[FieldSpec, ...] = (
    # --- source / tokenizer ---
    F("tokenizer", "vllm", "str", "value", flag="--tokenizer", label="Tokenizer (HF repo or path)", group="source", order=5),
    F("hf_config_path", "vllm", "str", "value", flag="--hf-config-path", label="HF config path", group="source", order=6),
    F("tokenizer_mode", "vllm", "str", "value", flag="--tokenizer-mode", label="Tokenizer mode", group="source", order=7,
      choices=("auto", "hf", "slow", "mistral")),
    F("load_format", "vllm", "str", "value", flag="--load-format", label="Load format", group="source", order=8,
      choices=("auto", "safetensors", "pt", "npcache", "tensorizer", "fastsafetensors", "runai_streamer")),
    F("hf_overrides_json", "vllm", "json", "json", flag="--hf-overrides", label="HF config overrides (JSON)", group="behavior", order=61,
      help='JSON merged into the model config, e.g. {"rope_parameters": {"rope_type": "yarn", "factor": 4.0}}.'),
    F("trust_remote_code", "vllm", "bool", "switch", flag="--trust-remote-code", label="Trust remote code", group="source", order=9),
    # --- placement / parallelism ---
    F("device", "vllm", "str", "internal", label="Device", group="placement", choices=("cuda", "cpu"), default="cuda", order=11),
    F("tp_size", "vllm", "int", "value", flag="--tensor-parallel-size", emit_if="gt1", label="Tensor parallel size", group="placement", min=1, order=12),
    F("pipeline_parallel_size", "vllm", "int", "value", flag="--pipeline-parallel-size", emit_if="gt1", label="Pipeline parallel size", group="placement", min=1, order=13),
    F("data_parallel_size", "vllm", "int", "value", flag="--data-parallel-size", emit_if="gt1", label="Data parallel size", group="placement", min=1, order=14),
    F("enable_expert_parallel", "vllm", "bool", "switch", flag="--enable-expert-parallel", label="Expert parallel (MoE)", group="placement", order=15),
    F("distributed_executor_backend", "vllm", "str", "value", flag="--distributed-executor-backend", label="Distributed executor", group="placement", order=16,
      choices=("mp", "ray", "uni", "external_launcher")),
    # --- memory ---
    F("dtype", "vllm", "str", "value", flag="--dtype", label="DType", group="memory", default="auto", order=20,
      choices=("auto", "float16", "bfloat16", "float32")),
    F("gpu_memory_utilization", "vllm", "float", "value", flag="--gpu-memory-utilization", label="GPU memory utilization", group="memory", default=0.92, min=0.05, max=0.99, order=21),
    F("kv_cache_memory_bytes", "vllm", "int", "value", flag="--kv-cache-memory-bytes", label="KV cache memory (bytes)", group="memory", min=0, order=22,
      help="Explicit KV cache size; overrides gpu_memory_utilization when set."),
    F("max_model_len", "vllm", "int", "value", flag="--max-model-len", label="Max model length", group="memory", min=1, order=23),
    F("kv_cache_dtype", "vllm", "str", "value", flag="--kv-cache-dtype", label="KV cache dtype", group="memory", default="auto", order=24,
      choices=("auto", "bfloat16", "float16", "fp8", "fp8_e4m3", "fp8_e5m2", "fp8_inc", "nvfp4")),
    F("quantization", "vllm", "str", "value", flag="--quantization", label="Quantization", group="memory", order=25,
      choices=("awq", "awq_marlin", "gptq", "gptq_marlin", "fp8", "compressed-tensors", "modelopt", "modelopt_fp4", "mxfp4", "torchao", "experts_int8", "bitsandbytes")),
    F("block_size", "vllm", "int", "value", flag="--block-size", label="KV block size", group="memory", default=16, min=1, order=26),
    F("cpu_offload_gb", "vllm", "int", "value", flag="--cpu-offload-gb", emit_if="gt0", label="CPU offload (GiB)", group="memory", min=0, order=27),
    F("enable_prefix_caching", "vllm", "bool", "negatable", flag="--enable-prefix-caching", label="Prefix caching", group="throughput", default=True, order=30),
    F("prefix_caching_hash_algo", "vllm", "str", "value", flag="--prefix-caching-hash-algo", label="Prefix cache hash", group="throughput", order=31,
      choices=("sha256", "sha256_cbor_64bit", "xxhash", "xxhash_cbor")),
    # --- throughput ---
    F("max_num_seqs", "vllm", "int", "value", flag="--max-num-seqs", label="Max concurrent sequences", group="throughput", default=128, min=1, order=32),
    F("max_num_batched_tokens", "vllm", "int", "value", flag="--max-num-batched-tokens", label="Max batched tokens", group="throughput", default=2048, min=1, order=33),
    F("enable_chunked_prefill", "vllm", "bool", "negatable", flag="--enable-chunked-prefill", label="Chunked prefill", group="throughput", default=True, order=34),
    F("enforce_eager", "vllm", "bool", "switch", flag="--enforce-eager", label="Enforce eager (no compile / CUDA graphs)", group="throughput", default=False, order=35,
      help="Fastest startup, slower decode. Leave off for production."),
    F("cuda_graph_sizes", "vllm", "str", "csv", flag="--cudagraph-capture-sizes", label="CUDA graph capture sizes", group="throughput", order=36,
      help="Comma-separated batch sizes to capture, e.g. 1,2,4,8,16."),
    F("compilation_config_json", "vllm", "json", "json", flag="--compilation-config", label="Compilation config (JSON)", group="throughput", order=37),
    F("async_scheduling", "vllm", "bool", "switch", flag="--async-scheduling", label="Async scheduling", group="throughput", order=38),
    F("attention_backend", "vllm", "str", "value", flag="--attention-backend", label="Attention backend", group="throughput", order=39,
      choices=("FLASH_ATTN", "FLASHINFER", "TRITON_ATTN", "FLEX_ATTENTION", "TORCH_SDPA")),
    F("enable_sleep_mode", "vllm", "bool", "switch", flag="--enable-sleep-mode", label="Sleep mode", group="throughput", order=40),
    # --- behaviour ---
    F("generation_config", "vllm", "str", "value", flag="--generation-config", label="Generation config source", group="behavior", order=63,
      help="'auto' uses the model's generation_config.json, 'vllm' uses vLLM defaults, or a path."),
    F("override_generation_config_json", "vllm", "json", "json", flag="--override-generation-config", label="Override generation config (JSON)", group="behavior", order=64),
    F("reasoning_parser", "vllm", "str", "value", flag="--reasoning-parser", label="Reasoning parser", group="behavior", order=65,
      choices=("deepseek_r1", "deepseek_v3", "qwen3", "glm45", "granite", "hunyuan_a13b", "mistral", "gpt_oss", "step3", "minimax_m2", "olmo3", "ernie45", "seed_oss", "kimi_k2")),
    F("enable_auto_tool_choice", "vllm", "bool", "switch", flag="--enable-auto-tool-choice", label="Auto tool choice", group="behavior", order=66),
    F("tool_call_parser", "vllm", "str", "value", flag="--tool-call-parser", label="Tool call parser", group="behavior", order=67,
      choices=("hermes", "mistral", "llama3_json", "llama4_pythonic", "granite", "granite-20b-fc", "deepseek_v3", "deepseek_v31", "openai", "kimi_k2", "glm45", "glm47", "qwen3_xml", "qwen3_coder", "pythonic", "internlm", "jamba", "phi4_mini_json", "xlam", "hunyuan_a13b", "minimax", "seed_oss", "step3", "longcat", "olmo3")),
    F("structured_outputs_config_json", "vllm", "json", "json", flag="--structured-outputs-config", label="Structured outputs config (JSON)", group="behavior", order=68,
      help='e.g. {"backend": "xgrammar"}'),
    F("limit_mm_per_prompt_json", "vllm", "json", "json", flag="--limit-mm-per-prompt", label="Multimodal limits (JSON)", group="behavior", order=69,
      help='e.g. {"image": 4, "video": 1}'),
    # --- adapters / speculative ---
    F("enable_lora", "vllm", "bool", "switch", flag="--enable-lora", label="Enable LoRA", group="adapters", order=70),
    F("lora_modules_json", "vllm", "json", "custom", flag="--lora-modules", label="LoRA modules (JSON list of {name, path})", group="adapters", order=71,
      requires={"enable_lora": True}),
    F("max_loras", "vllm", "int", "value", flag="--max-loras", label="Max LoRAs per batch", group="adapters", min=1, order=72),
    F("max_lora_rank", "vllm", "int", "value", flag="--max-lora-rank", label="Max LoRA rank", group="adapters", min=1, order=73),
    F("max_cpu_loras", "vllm", "int", "value", flag="--max-cpu-loras", label="Max CPU LoRAs", group="adapters", min=1, order=74),
    F("speculative_config_json", "vllm", "json", "json", flag="--speculative-config", label="Speculative decoding config (JSON)", group="adapters", order=75,
      help='e.g. {"method": "ngram", "num_speculative_tokens": 5} or {"method": "eagle3", "model": "..."}'),
    # --- logging ---
    F("enable_log_requests", "vllm", "bool", "switch", flag="--enable-log-requests", label="Log requests", group="logging", order=80),
    F("disable_log_stats", "vllm", "bool", "switch", flag="--disable-log-stats", label="Disable stats logging", group="logging", order=81),
    F("max_log_len", "vllm", "int", "value", flag="--max-log-len", emit_if="gt0", label="Max logged prompt chars", group="logging", min=0, order=82),
    F("debug_logging", "vllm", "bool", "env", env="VLLM_LOGGING_LEVEL", env_value="DEBUG", label="Debug logging", group="logging", order=83),
    F("trace_mode", "vllm", "bool", "env", env="VLLM_TRACE_FUNCTION", env_value="1", label="Trace mode (very slow)", group="logging", order=84),
    F("engine_request_timeout", "vllm", "int", "env", env="VLLM_ENGINE_ITERATION_TIMEOUT_S", label="Engine iteration timeout (s)", group="logging", min=1, order=85),
    F("entrypoint_override", "vllm", "str", "internal", label="Entrypoint override", group="engine", order=4,
      help="Comma-separated command prefix. Leave blank to use the image entrypoint (vllm serve)."),
)

# ---------------------------------------------------------------------------
# llama.cpp (llama-server b10731)
# ---------------------------------------------------------------------------
LLAMACPP_FIELDS: tuple[FieldSpec, ...] = (
    # --- placement / memory ---
    F("ngl", "llamacpp", "int", "value", flag="--n-gpu-layers", label="GPU layers (-ngl)", group="placement", min=0, order=12,
      help="Layers to offload to GPU. Empty = auto (engine decides), 0 = CPU only, 999 = all."),
    F("main_gpu", "llamacpp", "int", "value", flag="--main-gpu", label="Main GPU", group="placement", min=0, order=13),
    F("split_mode", "llamacpp", "str", "value", flag="--split-mode", label="Split mode", group="placement", order=14,
      choices=("none", "layer", "row", "tensor")),
    F("tensor_split", "llamacpp", "str", "value", flag="--tensor-split", label="Tensor split", group="placement", order=15,
      help="Proportions per GPU, e.g. 3,1."),
    F("load_mode", "llamacpp", "str", "value", flag="--load-mode", label="Load mode", group="memory", order=20,
      choices=("auto", "none", "mmap", "mlock", "dio"), help="Replaces --mlock / --no-mmap / --direct-io."),
    F("context_size", "llamacpp", "int", "value", flag="--ctx-size", label="Context size (-c, total across slots)", group="memory", min=0, order=21,
      help="Total KV context shared by all slots unless KV is unified. 0 = from model."),
    F("parallel_slots", "llamacpp", "int", "value", flag="--parallel", label="Parallel slots (-np)", group="throughput", min=1, order=30,
      help="Empty = auto. Each slot gets context_size / slots tokens unless unified KV."),
    F("kv_unified", "llamacpp", "bool", "negatable", flag="--kv-unified", label="Unified KV cache", group="memory", order=22),
    F("kv_unified_per_slot", "llamacpp", "int", "value", flag="--kv-unified-per-slot", label="Per-slot context limit (unified KV)", group="memory", min=1, order=23),
    F("fit_memory", "llamacpp", "bool", "onoff", flag="--fit", label="Auto-fit unset args to VRAM (--fit)", group="memory", default=True, order=24,
      help="When on (engine default) llama.cpp adjusts UNSET -ngl / -c to fit device memory. Turn off for fully explicit configs."),
    F("cache_type_k", "llamacpp", "str", "value", flag="--cache-type-k", label="KV cache type K", group="memory", default="f16", order=25,
      choices=("f32", "f16", "bf16", "q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1")),
    F("cache_type_v", "llamacpp", "str", "value", flag="--cache-type-v", label="KV cache type V", group="memory", default="f16", order=26,
      choices=("f32", "f16", "bf16", "q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1"),
      help="Quantized V cache requires flash attention on."),
    F("flash_attn", "llamacpp", "str", "value", flag="--flash-attn", label="Flash attention", group="throughput", default="auto", order=31,
      choices=("auto", "on", "off")),
    F("batch_size", "llamacpp", "int", "value", flag="--batch-size", label="Batch size (-b)", group="throughput", default=2048, min=1, order=32),
    F("ubatch_size", "llamacpp", "int", "value", flag="--ubatch-size", label="Micro-batch size (-ub)", group="throughput", default=512, min=1, order=33),
    F("threads", "llamacpp", "int", "value", flag="--threads", label="CPU threads (-t)", group="throughput", min=1, order=34,
      help="Empty = auto."),
    F("threads_http", "llamacpp", "int", "value", flag="--threads-http", label="HTTP threads", group="throughput", min=1, order=35),
    F("cont_batching", "llamacpp", "bool", "no_only", flag="--cont-batching", label="Continuous batching", group="throughput", default=True, order=36),
    F("cache_reuse", "llamacpp", "int", "value", flag="--cache-reuse", label="Cache reuse (min chunk)", group="throughput", min=0, order=37),
    F("context_shift", "llamacpp", "bool", "switch", flag="--context-shift", label="Context shift", group="throughput", order=38),
    F("n_cpu_moe", "llamacpp", "int", "value", flag="--n-cpu-moe", label="MoE layers kept on CPU", group="placement", min=0, order=16),
    F("override_tensor", "llamacpp", "str", "value", flag="--override-tensor", label="Override tensor placement (-ot)", group="placement", order=17,
      help="pattern=buffer_type,... e.g. exps=CPU"),
    F("numa_policy", "llamacpp", "str", "value", flag="--numa", label="NUMA policy", group="placement", order=18,
      choices=("distribute", "isolate", "numactl")),
    F("rope_freq_base", "llamacpp", "float", "value", flag="--rope-freq-base", label="RoPE frequency base", group="behavior", order=60),
    F("rope_freq_scale", "llamacpp", "float", "value", flag="--rope-freq-scale", label="RoPE frequency scale", group="behavior", order=61),
    # --- behaviour ---
    F("jinja_enabled", "llamacpp", "bool", "negatable", flag="--jinja", label="Jinja chat templates", group="behavior", default=True, order=62),
    F("chat_template_file", "llamacpp", "str", "value", flag="--chat-template-file", path=True, label="Chat template file", group="behavior", order=64),
    F("chat_template_kwargs_json", "llamacpp", "json", "json", flag="--chat-template-kwargs", label="Chat template kwargs (JSON)", group="behavior", order=65,
      help='e.g. {"enable_thinking": false}'),
    F("reasoning_format", "llamacpp", "str", "value", flag="--reasoning-format", label="Reasoning format", group="behavior", order=66,
      choices=("auto", "none", "deepseek", "deepseek-legacy")),
    F("reasoning_budget", "llamacpp", "int", "value", flag="--reasoning-budget", label="Reasoning budget (tokens, -1 unlimited)", group="behavior", order=67),
    F("n_predict", "llamacpp", "int", "value", flag="--n-predict", label="Max tokens to predict (-n)", group="behavior", order=68),
    F("grammar_file", "llamacpp", "str", "value", flag="--grammar-file", path=True, label="Grammar file (GBNF)", group="behavior", order=69),
    F("enable_embeddings", "llamacpp", "bool", "switch", flag="--embeddings", label="Enable embeddings endpoint", group="serving", order=50),
    F("pooling", "llamacpp", "str", "value", flag="--pooling", label="Pooling", group="serving", order=51,
      choices=("none", "mean", "cls", "last", "rank")),
    F("rerank", "llamacpp", "bool", "switch", flag="--rerank", label="Reranking endpoint", group="serving", order=52),
    # --- adapters / speculative / multimodal ---
    F("lora_adapters_json", "llamacpp", "json", "custom", flag="--lora", label="LoRA adapters (JSON list of path or {path, scale})", group="adapters", order=70),
    F("lora_init_without_apply", "llamacpp", "bool", "switch", flag="--lora-init-without-apply", label="Load LoRAs without applying", group="adapters", order=71),
    F("draft_model_path", "llamacpp", "str", "value", flag="--model-draft", path=True, label="Draft model (GGUF)", group="adapters", order=72),
    F("spec_type", "llamacpp", "str", "value", flag="--spec-type", label="Speculative type", group="adapters", order=73,
      choices=("none", "draft-simple", "draft-eagle3", "draft-mtp", "draft-dflash", "draft-dspark", "ngram-simple", "ngram-map-k", "ngram-map-k4v", "ngram-mod", "ngram-cache")),
    F("draft_n", "llamacpp", "int", "value", flag="--spec-draft-n-max", label="Draft tokens (max)", group="adapters", default=3, min=1, order=74),
    F("spec_draft_n_min", "llamacpp", "int", "value", flag="--spec-draft-n-min", label="Draft tokens (min)", group="adapters", min=0, order=75),
    F("draft_p_min", "llamacpp", "float", "value", flag="--spec-draft-p-min", label="Draft acceptance p_min", group="adapters", min=0, max=1, order=76),
    F("spec_draft_ngl", "llamacpp", "int", "value", flag="--spec-draft-ngl", label="Draft model GPU layers", group="adapters", min=0, order=77),
    F("mmproj", "llamacpp", "str", "value", flag="--mmproj", path=True, label="Multimodal projector (GGUF)", group="adapters", order=78),
    F("mmproj_offload", "llamacpp", "bool", "no_only", flag="--mmproj-offload", label="Offload projector to GPU", group="adapters", default=True, order=79),
    # --- logging / startup ---
    F("verbose_logging", "llamacpp", "bool", "switch", flag="--verbose", label="Verbose logging", group="logging", order=80),
    F("check_tensors", "llamacpp", "bool", "switch", flag="--check-tensors", label="Check tensors on load", group="logging", order=81),
    F("skip_warmup", "llamacpp", "bool", "switch", flag="--no-warmup", label="Skip warmup", group="logging", order=82),
)

ALL_FIELDS: tuple[FieldSpec, ...] = COMMON_FIELDS + VLLM_FIELDS + LLAMACPP_FIELDS
FIELD_BY_NAME: dict[str, FieldSpec] = {f.name: f for f in ALL_FIELDS}

# Groups in display order (shared with the UI)
GROUPS: tuple[tuple[str, str], ...] = (
    ("engine", "Engine image & startup"),
    ("source", "Model source & tokenizer"),
    ("placement", "GPU placement & parallelism"),
    ("memory", "Memory & KV cache"),
    ("throughput", "Throughput & scheduling"),
    ("serving", "Serving mode"),
    ("behavior", "Model behaviour"),
    ("adapters", "Adapters, speculative decoding & multimodal"),
    ("logging", "Logging & diagnostics"),
    ("custom", "Custom args & environment"),
    ("request", "Request defaults"),
)


def fields_for(engine: str) -> list[FieldSpec]:
    return [f for f in ALL_FIELDS if f.applies_to(engine)]


def field_names_for(engine: str) -> frozenset[str]:
    return frozenset(f.name for f in fields_for(engine))


def other_engine_only_fields(engine: str) -> frozenset[str]:
    """Fields that exist only for the other engine (to clear/ignore)."""
    other = "llamacpp" if engine == "vllm" else "vllm"
    return frozenset(f.name for f in ALL_FIELDS if f.engine == other)


def value_flags_for(engine: str) -> set[str]:
    """Flags that consume a value (used when custom args override standard ones)."""
    out: set[str] = set()
    for f in fields_for(engine):
        fl = f.flag_for(engine)
        if fl and f.form in ("value", "csv", "json", "onoff"):
            out.add(fl)
    return out


def spec_as_json() -> dict[str, Any]:
    return {
        "groups": [{"key": k, "label": v} for k, v in GROUPS],
        "fields": [f.to_json() for f in ALL_FIELDS],
    }


# Short aliases accepted in custom args, mapped to canonical long flags per engine
LLAMACPP_FLAG_ALIASES: dict[str, str] = {
    "-c": "--ctx-size", "-ngl": "--n-gpu-layers", "--gpu-layers": "--n-gpu-layers", "-b": "--batch-size",
    "-ub": "--ubatch-size", "-t": "--threads", "-np": "--parallel", "-ts": "--tensor-split", "-sm": "--split-mode",
    "-mg": "--main-gpu", "-fa": "--flash-attn", "-ctk": "--cache-type-k", "-ctv": "--cache-type-v", "-lm": "--load-mode",
    "-md": "--model-draft", "-a": "--alias", "-n": "--n-predict", "-kvu": "--kv-unified", "-cb": "--cont-batching",
    "-nocb": "--no-cont-batching", "-ot": "--override-tensor", "-ncmoe": "--n-cpu-moe", "-mm": "--mmproj",
    "-sp": "--special", "-v": "--verbose", "-lv": "--verbosity", "-s": "--seed", "-m": "--model",
}

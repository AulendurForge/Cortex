# vLLM Engine Guide

vLLM serves HuggingFace-format checkpoints (safetensors, and quantized variants such as AWQ,
GPTQ, FP8, NVFP4/ModelOpt) with PagedAttention and continuous batching. It is the engine for
GPU-resident transformer models; GGUF files are always served by [llama.cpp](llamaCPP.md).

Pinned image: **`vllm/vllm-openai:v0.28.0`** (`VLLM_IMAGE` in `versions.env` and
`backend/src/config.py`). The image is CUDA 13 based and needs **NVIDIA driver >= 580** on
the host. Hosts on the 550-579 driver series must use the CUDA 12.9 build
`vllm/vllm-openai:v0.28.0-cu129`, either globally (`VLLM_IMAGE=...` in `.env`) or per model
through the `engine_image` field. See [Engine images and driver compatibility](#engine-images-and-driver-compatibility).

---

## How Cortex runs vLLM

Every model record is turned into one container by the vLLM adapter
(`backend/src/engines/vllm.py`), driven by the declarative field table in
`backend/src/engines/spec.py`. The same table generates the API schema, the UI form and the
tables below, so a field that appears here is exactly what reaches the container.

```
docker run --name vllm-model-<id> \
  --label cortex.managed=1 --label cortex.model_id=<id> --label cortex.engine=vllm \
  --network cortex_default -p 127.0.0.1::8000 --ipc host --runtime nvidia \
  -e NVIDIA_VISIBLE_DEVICES=<selected_gpus> -e HF_HUB_OFFLINE=1 (offline mode) \
  -v /var/cortex/models:/models:ro -v /var/cortex/hf-cache:/root/.cache/huggingface \
  vllm/vllm-openai:v0.28.0 \
  --model /models/<local_path>  --served-model-name <name> --host 0.0.0.0 --port 8000 \
  --api-key $INTERNAL_VLLM_API_KEY  <fields below>  <custom args>
```

Points that matter operationally:

- **Ports are published on `127.0.0.1` only.** LAN clients cannot reach the engine; they go
  through the gateway, which authenticates with `INTERNAL_VLLM_API_KEY` (`--api-key`).
- **The image entrypoint is `vllm serve`**; the `--model` positional/flag, `--served-model-name`,
  `--host`, `--port` and `--api-key` are managed by Cortex and rejected in custom args
  (`custom_arg_forbidden`). `entrypoint_override` replaces the command prefix for exotic images.
- **Model source**: HF repo id (downloaded into the HF cache; `hf_token` is passed as
  `HF_TOKEN` and never returned by the API) or a folder under `CORTEX_MODELS_DIR`
  (`local_path`, mounted read-only at `/models`).
- **GPU placement** comes from `selected_gpus`; `tp_size` defaults to its length and
  `tp_size x pipeline_parallel_size` must not exceed it. Empty `selected_gpus` means
  `device=cpu`.
- **Dry-run** (`POST /admin/models/dry-run` with a body, or `POST /admin/models/{id}/dry-run`)
  renders the command with secrets redacted and reports `issues[]` with severities.

### GGUF under vLLM

vLLM's GGUF loader is an out-of-tree plugin in v0.28 and is not shipped in the pinned image.
Cortex therefore **routes every `.gguf` model to llama.cpp**; selecting `engine_type=vllm` for a
GGUF path fails validation with `GGUF models must use the llama.cpp engine`. If you have a
custom vLLM image with the GGUF plugin installed you can set it as `engine_image` and pass the
tokenizer with `tokenizer`, but this is unsupported.

---

## Configuration fields

Fields marked *Cortex-internal* are consumed by the gateway (placement, image, timeouts) and
never become flags. "Engine default" means Cortex does not emit the flag unless you set the
field; the value vLLM then uses is documented in the vLLM CLI reference.

The tables are generated from `backend/src/engines/spec.py` by
`python3 scripts/gen-engine-flag-tables.py`; do not edit them by hand.

### Common fields (both engines)

<!-- BEGIN GENERATED: common -->

#### Engine image & startup

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `engine_image` | (Cortex-internal, not a flag) | Engine image. Docker image override. Leave blank for the pinned system default. | engine default |  |
| `engine_version` | (Cortex-internal, not a flag) | Engine version (reference) | engine default |  |
| `engine_digest` | (Cortex-internal, not a flag) | Engine image digest | engine default |  |
| `startup_timeout_sec` | (Cortex-internal, not a flag) | Startup timeout (s). How long the model may take to become ready before it is marked failed. | engine default | (min 30) |

#### GPU placement & parallelism

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `selected_gpus` | (Cortex-internal, not a flag) | GPUs. GPU indices exposed to the container. Empty = CPU mode (vLLM device=cpu, llama.cpp ngl=0). | engine default |  |

#### Model behaviour

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `seed` | `--seed VALUE` | Seed. Random seed for sampling reproducibility. | engine default |  |
| `chat_template` | `--chat-template VALUE` | Chat template (inline, preset name or file under the models dir) | engine default |  |

#### Custom args & environment

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `engine_startup_args_json` | (Cortex-internal, not a flag) | Custom startup args | engine default |  |
| `engine_startup_env_json` | (Cortex-internal, not a flag) | Custom environment variables | engine default |  |

#### Request defaults

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `request_defaults_json` | (Cortex-internal, not a flag) | Request defaults | engine default |  |
| `request_timeout_sec` | (Cortex-internal, not a flag) | Request timeout (s) | engine default | (min 1) |
| `stream_timeout_sec` | (Cortex-internal, not a flag) | Stream timeout (s) | engine default | (min 1) |
<!-- END GENERATED -->

### vLLM fields

<!-- BEGIN GENERATED: vllm -->

#### Engine image & startup

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `entrypoint_override` | (Cortex-internal, not a flag) | Entrypoint override. Comma-separated command prefix. Leave blank to use the image entrypoint (vllm serve). | engine default |  |

#### Model source & tokenizer

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `tokenizer` | `--tokenizer VALUE` | Tokenizer (HF repo or path) | engine default |  |
| `hf_config_path` | `--hf-config-path VALUE` | HF config path | engine default |  |
| `tokenizer_mode` | `--tokenizer-mode VALUE` | Tokenizer mode | engine default | `auto`, `hf`, `slow`, `mistral` |
| `load_format` | `--load-format VALUE` | Load format | engine default | `auto`, `safetensors`, `pt`, `npcache`, `tensorizer`, `fastsafetensors`, `runai_streamer` |
| `trust_remote_code` | `--trust-remote-code` | Trust remote code | engine default |  |

#### GPU placement & parallelism

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `device` | (Cortex-internal, not a flag) | Device | `cuda` | `cuda`, `cpu` |
| `tp_size` | `--tensor-parallel-size VALUE` | Tensor parallel size Emitted only when > 1. | engine default | (min 1) |
| `pipeline_parallel_size` | `--pipeline-parallel-size VALUE` | Pipeline parallel size Emitted only when > 1. | engine default | (min 1) |
| `data_parallel_size` | `--data-parallel-size VALUE` | Data parallel size Emitted only when > 1. | engine default | (min 1) |
| `enable_expert_parallel` | `--enable-expert-parallel` | Expert parallel (MoE) | engine default |  |
| `distributed_executor_backend` | `--distributed-executor-backend VALUE` | Distributed executor | engine default | `mp`, `ray`, `uni`, `external_launcher` |

#### Memory & KV cache

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `dtype` | `--dtype VALUE` | DType | `auto` | `auto`, `float16`, `bfloat16`, `float32` |
| `gpu_memory_utilization` | `--gpu-memory-utilization VALUE` | GPU memory utilization | `0.92` | (min 0.05, max 0.99) |
| `kv_cache_memory_bytes` | `--kv-cache-memory-bytes VALUE` | KV cache memory (bytes). Explicit KV cache size; overrides gpu_memory_utilization when set. | engine default | (min 0) |
| `max_model_len` | `--max-model-len VALUE` | Max model length | engine default | (min 1) |
| `kv_cache_dtype` | `--kv-cache-dtype VALUE` | KV cache dtype | `auto` | `auto`, `bfloat16`, `float16`, `fp8`, `fp8_e4m3`, `fp8_e5m2`, `fp8_inc`, `nvfp4` |
| `quantization` | `--quantization VALUE` | Quantization | engine default | `awq`, `awq_marlin`, `gptq`, `gptq_marlin`, `fp8`, `compressed-tensors`, `modelopt`, `modelopt_fp4`, `mxfp4`, `torchao`, `experts_int8`, `bitsandbytes` |
| `block_size` | `--block-size VALUE` | KV block size | `16` | (min 1) |
| `cpu_offload_gb` | `--cpu-offload-gb VALUE` | CPU offload (GiB) Emitted only when > 0. | engine default | (min 0) |

#### Throughput & scheduling

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `enable_prefix_caching` | `--enable-prefix-caching` / `--no-enable-prefix-caching` | Prefix caching | on |  |
| `prefix_caching_hash_algo` | `--prefix-caching-hash-algo VALUE` | Prefix cache hash | engine default | `sha256`, `sha256_cbor_64bit`, `xxhash`, `xxhash_cbor` |
| `max_num_seqs` | `--max-num-seqs VALUE` | Max concurrent sequences | `128` | (min 1) |
| `max_num_batched_tokens` | `--max-num-batched-tokens VALUE` | Max batched tokens | `2048` | (min 1) |
| `enable_chunked_prefill` | `--enable-chunked-prefill` / `--no-enable-chunked-prefill` | Chunked prefill | on |  |
| `enforce_eager` | `--enforce-eager` | Enforce eager (no compile / CUDA graphs). Fastest startup, slower decode. Leave off for production. | off |  |
| `cuda_graph_sizes` | `--cudagraph-capture-sizes a b c` (comma list) | CUDA graph capture sizes. Comma-separated batch sizes to capture, e.g. 1,2,4,8,16. | engine default |  |
| `compilation_config_json` | `--compilation-config '{...}'` | Compilation config (JSON) | engine default |  |
| `async_scheduling` | `--async-scheduling` | Async scheduling | engine default |  |
| `attention_backend` | `--attention-backend VALUE` | Attention backend | engine default | `FLASH_ATTN`, `FLASHINFER`, `TRITON_ATTN`, `FLEX_ATTENTION`, `TORCH_SDPA` |
| `enable_sleep_mode` | `--enable-sleep-mode` | Sleep mode | engine default |  |

#### Model behaviour

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `hf_overrides_json` | `--hf-overrides '{...}'` | HF config overrides (JSON). JSON merged into the model config, e.g. {"rope_parameters": {"rope_type": "yarn", "factor": 4.0}}. | engine default |  |
| `generation_config` | `--generation-config VALUE` | Generation config source. 'auto' uses the model's generation_config.json, 'vllm' uses vLLM defaults, or a path. | engine default |  |
| `override_generation_config_json` | `--override-generation-config '{...}'` | Override generation config (JSON) | engine default |  |
| `reasoning_parser` | `--reasoning-parser VALUE` | Reasoning parser | engine default | `deepseek_r1`, `deepseek_v3`, `qwen3`, `glm45`, `granite`, `hunyuan_a13b`, `mistral`, `gpt_oss`, `step3`, `minimax_m2`, `olmo3`, `ernie45`, `seed_oss`, `kimi_k2` |
| `enable_auto_tool_choice` | `--enable-auto-tool-choice` | Auto tool choice | engine default |  |
| `tool_call_parser` | `--tool-call-parser VALUE` | Tool call parser | engine default | `hermes`, `mistral`, `llama3_json`, `llama4_pythonic`, `granite`, `granite-20b-fc`, `deepseek_v3`, `deepseek_v31`, `openai`, `kimi_k2`, `glm45`, `glm47`, `qwen3_xml`, `qwen3_coder`, `pythonic`, `internlm`, `jamba`, `phi4_mini_json`, `xlam`, `hunyuan_a13b`, `minimax`, `seed_oss`, `step3`, `longcat`, `olmo3` |
| `structured_outputs_config_json` | `--structured-outputs-config '{...}'` | Structured outputs config (JSON). e.g. {"backend": "xgrammar"} | engine default |  |
| `limit_mm_per_prompt_json` | `--limit-mm-per-prompt '{...}'` | Multimodal limits (JSON). e.g. {"image": 4, "video": 1} | engine default |  |

#### Adapters, speculative decoding & multimodal

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `enable_lora` | `--enable-lora` | Enable LoRA | engine default |  |
| `lora_modules_json` | `--lora-modules` (repeated) | LoRA modules (JSON list of {name, path}) Requires `enable_lora=True`. | engine default |  |
| `max_loras` | `--max-loras VALUE` | Max LoRAs per batch | engine default | (min 1) |
| `max_lora_rank` | `--max-lora-rank VALUE` | Max LoRA rank | engine default | (min 1) |
| `max_cpu_loras` | `--max-cpu-loras VALUE` | Max CPU LoRAs | engine default | (min 1) |
| `speculative_config_json` | `--speculative-config '{...}'` | Speculative decoding config (JSON). e.g. {"method": "ngram", "num_speculative_tokens": 5} or {"method": "eagle3", "model": "..."} | engine default |  |

#### Logging & diagnostics

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `enable_log_requests` | `--enable-log-requests` | Log requests | engine default |  |
| `disable_log_stats` | `--disable-log-stats` | Disable stats logging | engine default |  |
| `max_log_len` | `--max-log-len VALUE` | Max logged prompt chars Emitted only when > 0. | engine default | (min 0) |
| `debug_logging` | env `VLLM_LOGGING_LEVEL`=`DEBUG` | Debug logging | engine default |  |
| `trace_mode` | env `VLLM_TRACE_FUNCTION`=`1` | Trace mode (very slow) | engine default |  |
| `engine_request_timeout` | env `VLLM_ENGINE_ITERATION_TIMEOUT_S` | Engine iteration timeout (s) | engine default | (min 1) |
<!-- END GENERATED -->

### Removed or renamed since earlier Cortex releases

| Old field / flag | Now |
|---|---|
| `swap_space` / `--swap-space` | Removed (V1 engine has no CPU swap; use `cpu_offload_gb`). |
| `cuda_graph_sizes` → `--cuda-graph-sizes` | Same field, now emits `--cudagraph-capture-sizes`. |
| `disable_log_requests` / `--disable-log-requests` | Inverted: `enable_log_requests` → `--enable-log-requests` (requests are not logged by default). |
| `VLLM_USE_V1` env | Removed; v0.28 only has the V1 engine. |
| `--task embed` | Removed; embedding models are detected from the checkpoint (`task=embed` on the Cortex record only selects the gateway route). |
| `python3 -m vllm.entrypoints.openai.api_server` | The image entrypoint is `vllm serve`; use `entrypoint_override` only for custom images. |
| TP slider in the form | `tp_size` is derived from `selected_gpus`. |

---

## Custom arguments and environment

Anything not covered by a field goes into **Custom startup args** (`engine_startup_args_json`,
an ordered list of `{flag, value}`) and **Custom environment variables**
(`engine_startup_env_json`). Custom args are appended after Cortex's own flags; a custom flag
that duplicates a field flag overrides it and the dry-run shows the final command.

Rejected at save time:

- flags Cortex owns: `--host`, `--port`, `--api-key`, `--api-key-file`, `--ssl-*`, `--root-path`,
  `--model`, `--served-model-name`, `--uvicorn-log-level`;
- protected env vars: `NVIDIA_VISIBLE_DEVICES`, `CUDA_VISIBLE_DEVICES`, `HF_HUB_OFFLINE`,
  `VLLM_API_KEY` (plus the llama.cpp `LLAMA_*` names). See
  [Setting custom environment variables](setting-custom-env-vars.md).

Typical uses: `--mamba-ssm-cache-dtype float16`, `--reasoning-parser-plugin /models/...py`,
`VLLM_USE_FLASHINFER_MOE_FP8=1`, `NCCL_P2P_DISABLE=1`.

---

## Engine images and driver compatibility

`engine_image` (per model) overrides `VLLM_IMAGE` (global). `engine_version` and
`engine_digest` are free-text references shown in the UI and exports. The offline pre-check
(`scripts/verify-offline-images.sh`) lists every `engine_image` stored in the database so they
can be added to the air-gap package (`EXTRA_IMAGES="..." make prepare-offline`).

| Host driver | CUDA in image | Image |
|---|---|---|
| >= 580 | 13.0 | `vllm/vllm-openai:v0.28.0` (default) |
| 575.51 - 579 | 12.9 | `vllm/vllm-openai:v0.28.0-cu129` |
| 550 - 575.50 | 12.8 | `vllm/vllm-openai:v0.24.0-ubuntu2404` (last CUDA 12.8 tag; older CLI, see the vLLM release notes) |
| < 550 | - | Update the driver ([UPDATE_NVIDIA_DRIVERS](../operations/UPDATE_NVIDIA_DRIVERS.md)) |

Symptom of a mismatch: the container exits immediately with
`nvidia-container-cli: requirement error: unsatisfied condition: cuda>=13.0` and the model
shows `state=failed`, `state_reason=container_exited: ...`. Fix with `engine_image` for that
model or `VLLM_IMAGE` for all; see the [runbooks](../operations/runbooks.md#driver-cuda-mismatch).

A worked example (driver-gated image selection, custom parsers, MTP speculative decoding,
request defaults) is in [Nemotron 3 Super](nemotron-3-super.md).

---

## Memory and throughput guidance

- `gpu_memory_utilization` (default 0.92) is the fraction of each GPU vLLM reserves for
  weights + KV cache. Lower it (0.85, 0.80) on `CUDA out of memory` during startup profiling,
  or pin the KV cache explicitly with `kv_cache_memory_bytes`.
- `max_model_len` bounds the context; the KV cache per token is
  `2 x n_layer x n_kv_heads x head_dim x bytes(kv_cache_dtype)`. Halving it roughly doubles
  how many concurrent sequences fit.
- `max_num_seqs` / `max_num_batched_tokens` trade latency for throughput; keep chunked prefill
  on (default).
- `enforce_eager` disables CUDA graphs: faster startup, markedly slower decode. Leave it off in
  production; the startup timeout (`startup_timeout_sec`, default `VLLM_STARTUP_TIMEOUT=600`)
  must cover graph capture on large models.
- `kv_cache_dtype=fp8` halves KV memory but needs calibrated scales for some checkpoints.
- Quantized checkpoints: leave `quantization` blank so vLLM reads it from `config.json`; set it
  only to force a kernel (`awq_marlin`, `gptq_marlin`).

---

## Request defaults

Per-request sampling defaults (`temperature`, `top_p`, `top_k`, `repetition_penalty`,
`frequency_penalty`, `presence_penalty`) and arbitrary extras (`vllm_xargs`, `stop`, ...) live in
`request_defaults_json` and are merged by the gateway into requests that do not set the key.
They take effect immediately, without a restart. Precedence: client request > Cortex request
defaults > the model's `generation_config.json` (when `generation_config=auto`) > vLLM defaults.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `state=failed`, `container_exited`, log says `cuda>=13.0` | driver too old for the image | `engine_image` `v0.28.0-cu129` |
| `startup_timeout_after_600s` | big model, CUDA graph capture | raise `startup_timeout_sec`; check `docker logs vllm-model-<id>` |
| `CUDA out of memory` while profiling | KV reservation too large | lower `gpu_memory_utilization` / `max_model_len` |
| `KeyError` for a parser name | wrong parser or older image | check the `reasoning_parser` / `tool_call_parser` choices for this image |
| `unrecognized arguments` | custom arg not in this vLLM version | remove it; the dry-run cannot validate engine-side flags |
| gateway 502 for a `running` model | engine crashed after ready | supervisor marks `failed` on the next probe; see [runbooks](../operations/runbooks.md) |

Related: [Engine comparison](engine-comparison.md), [Model management](model-management.md),
[HuggingFace download](huggingface-model-download.md).

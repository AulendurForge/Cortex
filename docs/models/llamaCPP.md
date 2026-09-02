# llama.cpp Engine Guide

llama.cpp (`llama-server`) serves **GGUF** models on CPU, GPU or a mix of both. Cortex uses it
for every GGUF file: single-file, sharded (`-00001-of-0000N`), quantized (Q4_K_M, Q8_0, ...),
and for architectures vLLM does not support (for example GPT-OSS / Harmony).

Pinned image: **`ghcr.io/ggml-org/llama.cpp:server-cuda-b10731`** (`LLAMACPP_IMAGE` in
`versions.env` and `backend/src/config.py`), CUDA 12.8 runtime, works with NVIDIA driver
>= 550. `server-cuda` without a build number is rebuilt daily and must not be used in
production or offline packages. CPU-only hosts can set `LLAMACPP_IMAGE=ghcr.io/ggml-org/llama.cpp:server-b10731`.

---

## How Cortex runs llama.cpp

The llama.cpp adapter (`backend/src/engines/llamacpp.py`) renders one container per model from
the field table in `backend/src/engines/spec.py`:

```
docker run --name llamacpp-model-<id> \
  --label cortex.managed=1 --label cortex.model_id=<id> --label cortex.engine=llamacpp \
  --network cortex_default -p 127.0.0.1::8000 --ipc host --runtime nvidia \
  -e NVIDIA_VISIBLE_DEVICES=<selected_gpus> \
  -v /var/cortex/models:/models:ro \
  ghcr.io/ggml-org/llama.cpp:server-cuda-b10731 \
  --model /models/<file>.gguf --alias <served name> --host 0.0.0.0 --port 8000 \
  --api-key $INTERNAL_VLLM_API_KEY --timeout 300 --metrics --log-timestamps <fields below> <custom args>
```

- **Ports are published on `127.0.0.1` only**; clients go through the gateway, which presents
  `INTERNAL_VLLM_API_KEY` (`--api-key`, both engines).
- **GGUF resolution**: `local_path` may be a `.gguf` file or a folder. A shard other than
  `00001` is rewritten to the first shard of the *same* set; a folder must contain exactly one
  GGUF set, otherwise the API asks you to pick the file. Multi-part files are loaded natively -
  never merge them.
- **GPU placement**: `selected_gpus` sets `NVIDIA_VISIBLE_DEVICES`; empty means CPU only
  (`ngl=0`). `tensor_split` is regenerated as an equal split when its arity no longer matches
  the GPU count.
- **Managed flags** (`--model`, `-m`, `--alias`, `-a`, `--host`, `--port`, `--api-key`) are
  rejected in custom args; the `LLAMA_ARG_*` / `LLAMA_API_KEY` env vars are protected.
- **Dry-run**: `POST /admin/models/dry-run` (body) or `POST /admin/models/{id}/dry-run` returns
  the redacted command plus `issues[]` (for example "quantized V cache requires flash attention").

### Why GGUF always runs here

vLLM v0.28 ships no GGUF loader (it is an out-of-tree plugin), and llama.cpp handles sharded
files, CPU offload and every GGUF architecture. Cortex enforces the policy at validation time:
a `.gguf` `local_path` with `engine_type=vllm` is rejected. See
[GGUF format](gguf-format.md) and [Multi-part GGUF](gguf-multipart.md).

---

## Configuration fields

"Engine default" means Cortex does not emit the flag unless you set the field. Values in the
Default column are the documented llama-server b10731 defaults. Generated from
`backend/src/engines/spec.py` by `python3 scripts/gen-engine-flag-tables.py`.

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

### llama.cpp fields

<!-- BEGIN GENERATED: llamacpp -->

#### GPU placement & parallelism

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `ngl` | `--n-gpu-layers VALUE` | GPU layers (-ngl). Layers to offload to GPU. Empty = auto (engine decides), 0 = CPU only, 999 = all. | engine default | (min 0) |
| `main_gpu` | `--main-gpu VALUE` | Main GPU | engine default | (min 0) |
| `split_mode` | `--split-mode VALUE` | Split mode | engine default | `none`, `layer`, `row`, `tensor` |
| `tensor_split` | `--tensor-split VALUE` | Tensor split. Proportions per GPU, e.g. 3,1. | engine default |  |
| `n_cpu_moe` | `--n-cpu-moe VALUE` | MoE layers kept on CPU | engine default | (min 0) |
| `override_tensor` | `--override-tensor VALUE` | Override tensor placement (-ot). pattern=buffer_type,... e.g. exps=CPU | engine default |  |
| `numa_policy` | `--numa VALUE` | NUMA policy | engine default | `distribute`, `isolate`, `numactl` |

#### Memory & KV cache

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `load_mode` | `--load-mode VALUE` | Load mode. Replaces --mlock / --no-mmap / --direct-io. | engine default | `auto`, `none`, `mmap`, `mlock`, `dio` |
| `context_size` | `--ctx-size VALUE` | Context size (-c, total across slots). Total KV context shared by all slots unless KV is unified. 0 = from model. | engine default | (min 0) |
| `kv_unified` | `--kv-unified` / `--no-kv-unified` | Unified KV cache | engine default |  |
| `kv_unified_per_slot` | `--kv-unified-per-slot VALUE` | Per-slot context limit (unified KV) | engine default | (min 1) |
| `fit_memory` | `--fit on|off` | Auto-fit unset args to VRAM (--fit). When on (engine default) llama.cpp adjusts UNSET -ngl / -c to fit device memory. Turn off for fully explicit configs. | on |  |
| `cache_type_k` | `--cache-type-k VALUE` | KV cache type K | `f16` | `f32`, `f16`, `bf16`, `q8_0`, `q4_0`, `q4_1`, `iq4_nl`, `q5_0`, `q5_1` |
| `cache_type_v` | `--cache-type-v VALUE` | KV cache type V. Quantized V cache requires flash attention on. | `f16` | `f32`, `f16`, `bf16`, `q8_0`, `q4_0`, `q4_1`, `iq4_nl`, `q5_0`, `q5_1` |

#### Throughput & scheduling

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `parallel_slots` | `--parallel VALUE` | Parallel slots (-np). Empty = auto. Each slot gets context_size / slots tokens unless unified KV. | engine default | (min 1) |
| `flash_attn` | `--flash-attn VALUE` | Flash attention | `auto` | `auto`, `on`, `off` |
| `batch_size` | `--batch-size VALUE` | Batch size (-b) | `2048` | (min 1) |
| `ubatch_size` | `--ubatch-size VALUE` | Micro-batch size (-ub) | `512` | (min 1) |
| `threads` | `--threads VALUE` | CPU threads (-t). Empty = auto. | engine default | (min 1) |
| `threads_http` | `--threads-http VALUE` | HTTP threads | engine default | (min 1) |
| `cont_batching` | `--no-cont-batching` when off | Continuous batching | on |  |
| `cache_reuse` | `--cache-reuse VALUE` | Cache reuse (min chunk) | engine default | (min 0) |
| `context_shift` | `--context-shift` | Context shift | engine default |  |

#### Serving mode

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `enable_embeddings` | `--embeddings` | Enable embeddings endpoint | engine default |  |
| `pooling` | `--pooling VALUE` | Pooling | engine default | `none`, `mean`, `cls`, `last`, `rank` |
| `rerank` | `--rerank` | Reranking endpoint | engine default |  |

#### Model behaviour

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `rope_freq_base` | `--rope-freq-base VALUE` | RoPE frequency base | engine default |  |
| `rope_freq_scale` | `--rope-freq-scale VALUE` | RoPE frequency scale | engine default |  |
| `jinja_enabled` | `--jinja` / `--no-jinja` | Jinja chat templates | on |  |
| `chat_template_file` | `--chat-template-file VALUE` | Chat template file Path relative to the models dir (mounted at `/models`). | engine default |  |
| `chat_template_kwargs_json` | `--chat-template-kwargs '{...}'` | Chat template kwargs (JSON). e.g. {"enable_thinking": false} | engine default |  |
| `reasoning_format` | `--reasoning-format VALUE` | Reasoning format | engine default | `auto`, `none`, `deepseek`, `deepseek-legacy` |
| `reasoning_budget` | `--reasoning-budget VALUE` | Reasoning budget (tokens, -1 unlimited) | engine default |  |
| `n_predict` | `--n-predict VALUE` | Max tokens to predict (-n) | engine default |  |
| `grammar_file` | `--grammar-file VALUE` | Grammar file (GBNF) Path relative to the models dir (mounted at `/models`). | engine default |  |

#### Adapters, speculative decoding & multimodal

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `lora_adapters_json` | `--lora` (repeated) | LoRA adapters (JSON list of path or {path, scale}) | engine default |  |
| `lora_init_without_apply` | `--lora-init-without-apply` | Load LoRAs without applying | engine default |  |
| `draft_model_path` | `--model-draft VALUE` | Draft model (GGUF) Path relative to the models dir (mounted at `/models`). | engine default |  |
| `spec_type` | `--spec-type VALUE` | Speculative type | engine default | `none`, `draft-simple`, `draft-eagle3`, `draft-mtp`, `draft-dflash`, `draft-dspark`, `ngram-simple`, `ngram-map-k`, `ngram-map-k4v`, `ngram-mod`, `ngram-cache` |
| `draft_n` | `--spec-draft-n-max VALUE` | Draft tokens (max) | `3` | (min 1) |
| `spec_draft_n_min` | `--spec-draft-n-min VALUE` | Draft tokens (min) | engine default | (min 0) |
| `draft_p_min` | `--spec-draft-p-min VALUE` | Draft acceptance p_min | engine default | (min 0, max 1) |
| `spec_draft_ngl` | `--spec-draft-ngl VALUE` | Draft model GPU layers | engine default | (min 0) |
| `mmproj` | `--mmproj VALUE` | Multimodal projector (GGUF) Path relative to the models dir (mounted at `/models`). | engine default |  |
| `mmproj_offload` | `--no-mmproj-offload` when off | Offload projector to GPU | on |  |

#### Logging & diagnostics

| Field (API / form) | Flag | Meaning | Default | Choices / range |
|---|---|---|---|---|
| `verbose_logging` | `--verbose` | Verbose logging | engine default |  |
| `check_tensors` | `--check-tensors` | Check tensors on load | engine default |  |
| `skip_warmup` | `--no-warmup` | Skip warmup | engine default |  |
<!-- END GENERATED -->

### Removed or renamed since earlier Cortex releases

| Old field / flag | Now |
|---|---|
| `flash_attn` boolean → `--flash-attn` | `flash_attn` is `auto` / `on` / `off` (`--flash-attn on\|off\|auto`). |
| `mlock`, `no_mmap`, `--direct-io` | One field: `load_mode` → `--load-mode auto\|none\|mmap\|mlock\|dio`. |
| `draft_n` → `--draft-max` | Same field, now `--spec-draft-n-max`; `--spec-draft-n-min`, `--spec-draft-p-min`, `--spec-draft-ngl`, `--spec-type` added. |
| `defrag_thold` / `--defrag-thold` | Removed (KV defragmentation is automatic). |
| `system_prompt` / `--system-prompt-file` | Removed; put system prompts in the chat template or the request. |
| `cache_type_v q8_0` as default | Default is `f16`; a quantized V cache requires `flash_attn=on` (validated). |
| `LLAMACPP_DEFAULT_NGL/BATCH_SIZE/UBATCH_SIZE/THREADS/CONTEXT`, `LLAMACPP_MAX_PARALLEL`, `LLAMACPP_CONT_BATCHING`, `LLAMACPP_CACHE_TYPE_K/V`, `LLAMACPP_LOG_VERBOSE/COLORS`, `LLAMACPP_CHECK_TENSORS`, `LLAMACPP_SKIP_WARMUP`, `LLAMACPP_JINJA_ENABLED`, `LLAMACPP_DEFRAG_THOLD` (gateway env) | Removed. Defaults are the engine's; set per model. Remaining gateway settings: `LLAMACPP_IMAGE`, `LLAMACPP_STARTUP_TIMEOUT`, `LLAMACPP_SERVER_TIMEOUT`, `LLAMACPP_METRICS_ENABLED`, `LLAMACPP_SLOTS_ENABLED`, `LLAMACPP_LOG_TIMESTAMPS`. |
| `cortex/llamacpp-server:latest` custom image | Never existed as a product artifact; the official `ghcr.io/ggml-org/llama.cpp` image is used. |
| `-ngl 999` as Cortex default | `ngl` is empty by default: llama.cpp's `--fit on` places as many layers as fit. |

---

## Context, slots and KV cache sizing

`context_size` (`-c`) is the **total** KV context shared by all `parallel_slots` (`-np`). With
`-c 16384 -np 4` each request gets 4096 tokens. Turn on `kv_unified` to let slots share one
pool (optionally capped per slot with `kv_unified_per_slot`).

KV cache memory for the whole context:

```
bytes = 2 x n_layer x n_ctx x n_embd_k_gqa x bytes_per_element
        (K and V)                 (= n_head_kv x head_dim)      f16 = 2, q8_0 ≈ 1.06, q4_0 ≈ 0.56
```

Example: Llama-3-8B (32 layers, 8 KV heads x 128 = 1024) at 32k context in f16 =
`2 x 32 x 32768 x 1024 x 2` ≈ 4.3 GiB; at q8_0 ≈ 2.3 GiB. Cortex's folder inspector reports
`n_layer` and the head counts from the GGUF header. Weights are on top of that
(Q4_K_M ≈ 0.6 bytes/param, Q8_0 ≈ 1.07 bytes/param). If weights + KV cache exceed VRAM, lower
`ngl` (partial CPU offload), reduce `context_size`, quantize the cache
(`cache_type_k/v=q8_0` with `flash_attn=on`) or, for MoE models, keep experts on CPU
(`n_cpu_moe`, `override_tensor=exps=CPU`). `fit_memory` (`--fit on`, the default) already
shrinks *unset* `-ngl`/`-c` to what fits.

---

## Custom arguments and environment

Any llama-server flag not in the table can be passed as a custom startup arg (short aliases
such as `-c`, `-ngl`, `-fa`, `-ctk` are normalised to the long form). Custom env vars are
attached to the container; the protected list (`NVIDIA_VISIBLE_DEVICES`,
`CUDA_VISIBLE_DEVICES`, `HF_HUB_OFFLINE`, `LLAMA_API_KEY`, `LLAMA_ARG_HOST/PORT/MODEL/API_KEY`,
`VLLM_API_KEY`) is rejected. See [Setting custom environment variables](setting-custom-env-vars.md).

---

## Request defaults and gateway behaviour

Sampling defaults (`temperature`, `top_p`, `top_k`, penalties) and custom extras in
`request_defaults_json` are merged by the gateway into requests that omit them and apply
immediately. They override llama-server's own `--temp`/`--top-p` defaults per request. Server-wide
generation limits (`n_predict`, `reasoning_budget`) still cap what a request can ask for.

The gateway proxies `/v1/chat/completions`, `/v1/completions` and `/v1/embeddings`
(`enable_embeddings` + `pooling` for embedding GGUFs, `rerank` for rerankers) and reads
`/metrics` (`--metrics` from `LLAMACPP_METRICS_ENABLED`, default on; Prometheus discovers the container by label).
Embedding-task models get `--embeddings` automatically.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `state=failed`, reason `container_exited: ... error loading model` | wrong file (shard 2, folder with several sets) | pick the first shard / the exact file |
| `cudaMalloc failed` / OOM | weights + KV cache > VRAM | see sizing above: lower `ngl`, `context_size`, quantize KV |
| very slow generation, GPU idle | `ngl` too low or CPU-only | set `ngl=999` (all layers) and check `selected_gpus` |
| `state_reason=startup_timeout_after_300s` | large model still loading | raise `startup_timeout_sec` (`LLAMACPP_STARTUP_TIMEOUT` default 300) |
| requests truncated at ~1k tokens | `context_size / parallel_slots` too small | raise `-c`, lower `-np`, or `kv_unified=on` |
| `quantized V cache requires flash attention` | `cache_type_v` set with `flash_attn=off` | set `flash_attn=on` |
| `nvidia-container-cli ... cuda>=12.8` | driver < 550 | update the driver or use an older `server-cuda-b*` image as `engine_image` |

Related: [Engine comparison](engine-comparison.md), [Model management](model-management.md),
[Runbooks](../operations/runbooks.md).

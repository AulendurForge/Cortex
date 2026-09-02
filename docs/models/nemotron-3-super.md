# Nemotron 3 Super 120B (NVFP4) on Cortex

A worked example of a model that needs everything the per-model configuration offers: a
driver-gated **engine image**, **custom arguments** for parsers and speculative decoding,
**custom environment variables**, and **request defaults** that differ from Cortex's stock
values. Everything here is done through the product (UI or API); no gateway code, no `.env`
edits and no hand-built images are required.

Model: `nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4` (hybrid Mamba2 / LatentMoE, ~75 GiB
of shards). Reference hardware: 4 x L40S 48 GB (sm89, PCIe, no NVLink); validated at
**85 tok/s** single stream with CUDA graphs and MTP on.

---

## 1. Pick the engine image from the driver

Nemotron 3 requires vLLM >= 0.24 (`NemotronHForCausalLM`, `modelopt_mixed`, `qwen3_xml` and
`nemotron_v3` parsers). The pinned Cortex default `vllm/vllm-openai:v0.28.0` covers it, but the
default image is **CUDA 13** and the host driver decides which build can start:

```bash
nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1
```

| Driver | `engine_image` to set on the model |
|---|---|
| >= 580 | leave blank (uses `VLLM_IMAGE` = `vllm/vllm-openai:v0.28.0`) |
| 575.51 - 579 | `vllm/vllm-openai:v0.28.0-cu129` |
| 550 - 575.50 | `vllm/vllm-openai:v0.24.0-ubuntu2404` (NVIDIA's pinned CUDA 12.8 recipe tag) |
| < 550 | update the driver first ([UPDATE_NVIDIA_DRIVERS](../operations/UPDATE_NVIDIA_DRIVERS.md)) |

Pre-pull the image on a connected host (`docker pull <image>`), or add it to the offline
package with `EXTRA_IMAGES="<image>" make prepare-offline`. Starting a model whose image is not
cached triggers a ~10 GB pull; in `OFFLINE_MODE=true` it fails fast with
`OfflineImageUnavailableError`.

Check the image before a 15-minute load:

```bash
IMG=vllm/vllm-openai:v0.28.0
docker run --rm --entrypoint python3 $IMG -c \
  "from vllm.reasoning import ReasoningParserManager as R; print(sorted(R.reasoning_parsers))" | grep -o nemotron_v3
docker run --rm --entrypoint python3 $IMG -c \
  "from vllm.entrypoints.openai.tool_parsers import ToolParserManager as T; print(sorted(T.tool_parsers))" | grep -o qwen3_xml
```

### FIPS-enabled hosts

On hosts with `/proc/sys/crypto/fips_enabled = 1` the stock image can abort on import
(`ssl.SSLError: [CRYPTO] unknown error` or `FATAL FIPS SELFTEST FAILURE` from a vendored
OpenSSL inside the `opencv` wheel). The first is cleared with the environment variable
`OPENSSL_FORCE_FIPS_MODE=0` (below). The second needs an image without that wheel; build it
once (`FROM vllm/vllm-openai:v0.28.0` + `RUN pip uninstall -y opencv-python-headless`),
tag it (for example `cortex/vllm-fips:v0.28.0`), and use that tag as `engine_image`. Cortex
treats it like any other image: no code change, include it in the offline package.

---

## 2. Model record

Models → Add model (or `POST /admin/models`). Fields not listed keep their defaults.

| Field | Value | Why |
|---|---|---|
| Engine | `vllm` | |
| Mode / local path | offline, `NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4` | folder name relative to `/var/cortex/models`; mounted at `/models` |
| Served model name | `nemotron` | |
| `engine_image` | from the table above | |
| `engine_version` | `v0.28.0` | reference only |
| `selected_gpus` | `[0,1,2,3]` | `tp_size` is derived (4); `moe_intermediate_size` 2688 / 4 divides cleanly |
| `dtype` | `auto` | the checkpoint decides |
| `max_model_len` | `32768` | raise later; capacity falls proportionally |
| `gpu_memory_utilization` | `0.90` | drop to 0.85 / 0.80 on OOM during profiling |
| `kv_cache_dtype` | `auto` | **not** `fp8`: no calibrated KV scales in this checkpoint |
| `max_num_seqs` | `32` | conservative; raise with measured concurrency |
| `trust_remote_code` | on | required |
| `enforce_eager` | **off** | CUDA graphs are the single largest win (~6x) |
| `enable_chunked_prefill` | on (default) | vLLM warns against disabling it for Mamba2 |
| `quantization` | blank | read from `config.json` |
| `startup_timeout_sec` | `2400` | ~3 min weight load + CUDA graph capture + MTP init |

### Custom startup args

| Flag | Value | Purpose |
|---|---|---|
| `--enable-auto-tool-choice` | (flag) | tool-call parsing |
| `--tool-call-parser` | `qwen3_xml` | Nemotron 3 emits Qwen3-style `<tool_call>` XML (underscores) |
| `--reasoning-parser` | `nemotron_v3` | separates `<think>` from content |
| `--mamba-ssm-cache-dtype` | `float16` | numerical stability of the SSM state |
| `--async-scheduling` | (flag) | overlaps scheduling with execution |
| `--speculative-config` | `{"method":"mtp","num_speculative_tokens":2}` | the checkpoint ships an MTP head; ~2x decode |
| `--prefix-caching-hash-algo` | `sha256` | FIPS-approved; explicit for audit |

`enable_auto_tool_choice`, `tool_call_parser`, `reasoning_parser`, `async_scheduling`,
`speculative_config_json` and `prefix_caching_hash_algo` also exist as form fields in
current releases; use either. Values pass through as an argument list (no shell), so the JSON
needs no extra quoting. If MTP makes startup fail, remove that one entry first.

If `nemotron_v3` is missing from an older image, use the plugin shipped with the weights:
`--reasoning-parser-plugin /models/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4/super_v3_reasoning_parser.py`
and `--reasoning-parser super_v3`.

### Custom environment variables

| Key | Value | Purpose |
|---|---|---|
| `OPENSSL_FORCE_FIPS_MODE` | `0` | FIPS hosts only (see above) |
| `VLLM_LOGGING_LEVEL` | `INFO` | `DEBUG` while troubleshooting |
| `NCCL_P2P_DISABLE` | `1` | optional on PCIe-only hosts; measure both settings |

`NVIDIA_VISIBLE_DEVICES`, `CUDA_VISIBLE_DEVICES`, `HF_HUB_OFFLINE` and `VLLM_API_KEY` are
managed by Cortex and rejected (`env_var_protected`).

### Request defaults

Cortex's stock sampling defaults damage reasoning models: penalties attack the structural
tokens of `<think>` and `<tool_call>` blocks. Set, in the model's Request defaults:

```json
{"temperature": 1.0, "top_p": 0.95, "top_k": -1,
 "repetition_penalty": 1.0, "frequency_penalty": 0.0, "presence_penalty": 0.0}
```

These are merged into requests that omit the key and apply immediately. Client guidance:
generous `max_tokens` (4096-8192), no penalties, streaming on.

---

## 3. Start and validate

Save, run **Dry-run** (the rendered command should show the image, `--tensor-parallel-size 4`
and the custom flags), then **Start**. The API returns `loading` immediately; the row moves to
`running` when `/health` answers, or to `failed` with a `state_reason`.

```bash
docker logs -f vllm-model-<id> 2>&1 | grep -iE 'marlin|fp4|nemotron|error|traceback'
curl -s -H "Authorization: Bearer $CORTEX_API_KEY" http://$HOST_IP:8084/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"nemotron","messages":[{"role":"user","content":"Name three properties of a Mamba state-space layer."}],"max_tokens":600}'
```

Expected log lines: a Marlin NVFP4 fallback warning on Ada (`sm89`), thousands of benign
`Unexpected gate/up projection names: up_proj` warnings (non-gated experts),
`Custom allreduce is disabled` on PCIe-only boxes. The response must carry `reasoning` separate
from `content` and populated `tool_calls` when tools are given.

---

## 4. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `container_exited`, log `cuda>=13.0` | driver too old for the default image | `engine_image` from section 1 |
| `invalid tool call parser` / `invalid reasoning parser` | old image, or hyphenated name | image >= v0.24, underscores |
| `startup_timeout_after_...` | graph capture still running | `startup_timeout_sec` 2400 |
| `CUDA out of memory` during profiling | Marlin dequant footprint | `gpu_memory_utilization` 0.90 → 0.85 → 0.80, then `max_model_len` 16384 |
| fluent nonsense | NVFP4 kernel path on this GPU | try the FP8 checkpoint (`...-FP8`, same settings, only `local_path` changes) |
| raw `<tool_call>` XML in `content` | parser mismatch | `qwen3_coder` instead of `qwen3_xml` |
| repetitive / truncated reasoning | penalties active | request defaults above; check the client sends none |
| `OfflineImageUnavailableError` | image not cached | pre-pull or add to the offline package |
| `ssl.SSLError [CRYPTO]` / `FIPS SELFTEST FAILURE` | FIPS host | env `OPENSSL_FORCE_FIPS_MODE=0`; derived image |

Confirm which image a Cortex-started container actually used:

```bash
docker inspect vllm-model-<id> --format '{{.Config.Image}}'
```

Related: [vLLM guide](vllm.md), [Setting custom environment variables](setting-custom-env-vars.md),
[Runbooks](../operations/runbooks.md), [Offline deployment](../operations/offline-deployment.md).

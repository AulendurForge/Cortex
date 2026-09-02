# Setting Custom Environment Variables and Arguments

Each model has two escape hatches for options the form does not cover: **custom startup
arguments** (`engine_startup_args_json`) and **custom environment variables**
(`engine_startup_env_json`). Both are applied to the model's container on the next start
(Apply restarts a running model).

## In the UI

**Models → Add / Configure model → Custom args & environment** (the last group of the
advanced section; the group names follow `backend/src/engines/spec.py`).

- **Arguments** tab: one row per flag - `--flag` plus an optional value. Rows keep their order
  and are appended after Cortex's own flags, so a custom flag overrides the form field that
  emits the same flag. The dry-run shows the final command.
- **Environment variables** tab: `NAME` = `value` rows, added to the container environment.

Example (vLLM, FlashInfer MoE kernels):

| Name | Value |
|---|---|
| `VLLM_USE_FLASHINFER_MOE_FP8` | `1` |
| `VLLM_FLASHINFER_MOE_BACKEND` | `throughput` |

Example (llama.cpp): argument `--override-tensor` = `exps=CPU`; environment
`GGML_CUDA_ENABLE_UNIFIED_MEMORY` = `1`.

## Through the API

Both fields are JSON strings:

```json
{
  "engine_startup_args_json": "[{\"flag\": \"--reasoning-parser\", \"value\": \"nemotron_v3\"}, {\"flag\": \"--async-scheduling\"}]",
  "engine_startup_env_json": "[{\"key\": \"VLLM_LOGGING_LEVEL\", \"value\": \"DEBUG\"}]"
}
```

`POST /admin/models/dry-run` (body) validates them without saving; `PATCH /admin/models/{id}`
saves; `POST /admin/models/{id}/apply` restarts a running model with the new values.

## What is rejected

Validation runs at save time (not only in dry-run) and returns HTTP 400.

**Forbidden flags** (`custom_arg_forbidden`) - Cortex owns these:

`--host`, `--port`, `-p`, `--api-key`, `--api-key-file`, `--ssl-keyfile`, `--ssl-certfile`,
`--ssl-ca-certs`, `--root-path`, `--model`, `-m`, `--served-model-name`, `--alias`, `-a`,
`--uvicorn-log-level`

**Protected environment variables** (`env_var_protected`) - set by Cortex from the model's
placement and mode:

`NVIDIA_VISIBLE_DEVICES`, `CUDA_VISIBLE_DEVICES`, `HF_HUB_OFFLINE`, `VLLM_API_KEY`,
`LLAMA_API_KEY`, `LLAMA_ARG_HOST`, `LLAMA_ARG_PORT`, `LLAMA_ARG_MODEL`, `LLAMA_ARG_API_KEY`

Everything else - including `NCCL_*`, `PYTORCH_CUDA_ALLOC_CONF`, `OMP_NUM_THREADS`,
`HF_TOKEN` - is allowed. (Earlier documentation claimed `NCCL_*` was protected; it is not, and
Cortex does not set NCCL variables itself.)

Custom args are checked for shape only (a flag must start with `-`, short llama.cpp aliases
are normalised). Whether the engine accepts the flag is only known at start: an unknown flag
makes the container exit and the model shows `failed` with the engine's
`unrecognized arguments` message in its logs.

## Notes

- Values are passed as an argument list to Docker (no shell): JSON values such as
  `{"method":"mtp","num_speculative_tokens":2}` need no extra quoting.
- Env names are case-sensitive; empty values are allowed.
- Recipes store custom args/env as part of the configuration snapshot (`config_json`).
- Verify what a container got: `docker inspect <container> --format '{{json .Config.Env}}'`
  and `docker inspect <container> --format '{{json .Args}}'` (the API key is present there -
  treat the output as sensitive).

Worked example: [Nemotron 3 Super](nemotron-3-super.md).

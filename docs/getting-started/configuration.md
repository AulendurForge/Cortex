# Configuration

Cortex is configured with environment variables. Defaults live in `backend/src/config.py`;
the compose files set the deployment-specific ones, and `.env` in the repository root (copied
from `.env.example`) overrides them for both `make` and `docker compose`. `backend/.env` is read
only when the gateway runs outside Docker (`backend/.env.example`).

Image tags are **not** configured here: they come from `versions.env`
([see Operations → Offline deployment](../operations/offline-deployment.md#pinned-images)).

## Gateway settings

| Variable | Default | Description |
|---|---|---|
| `INTERNAL_VLLM_API_KEY` | `""` | Shared secret passed as `--api-key` to every model container (both engines). **Required in prod.** |
| `GATEWAY_DEV_ALLOW_ALL_KEYS` | `false` | Accept any bearer token on `/v1`. Dev compose sets `true`. |
| `SESSION_SECRET` | `""` | HMAC key for admin session cookies; auto-generated and stored in `config_kv` when empty. **Set explicitly in prod.** |
| `SESSION_TTL_HOURS` | `8` | Admin session lifetime. |
| `SESSION_COOKIE_SECURE` | `false` | Send the session cookie only over https. `true` behind TLS. |
| `ADMIN_BOOTSTRAP_USERNAME` / `_PASSWORD` / `_ORG` | `""` | Create the first admin at startup while no admin exists. |
| `CORS_ENABLED` | `true` | Enable the CORS middleware. |
| `CORS_ALLOW_ORIGINS` | `http://localhost:3001,http://127.0.0.1:3001` | Comma-separated browser origins allowed with credentials. Never `*` in prod. |
| `SECURITY_HEADERS_ENABLED` | `true` | `X-Content-Type-Options`, `X-Frame-Options`, etc. (no HSTS; the proxy adds it). |
| `REQUEST_MAX_BODY_BYTES` | `1048576` | 413 above this (compose: 8 MiB). |
| `DATABASE_URL` | `postgresql+asyncpg://cortex:cortex@postgres:5432/cortex` | Async SQLAlchemy URL. Compose uses `127.0.0.1:${CORTEX_POSTGRES_PORT:-15432}` (host network). |
| `REDIS_URL` | `redis://redis:6379/0` | Compose: `redis://127.0.0.1:${CORTEX_REDIS_PORT:-16379}/0`. |
| `PROMETHEUS_URL` | `http://prometheus:9090` | Compose: `http://127.0.0.1:${PROM_PORT:-19090}`. |

## Limits and resilience

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_ENABLED` | `false` | Redis token bucket per key (prod compose: `true`). |
| `RATE_LIMIT_RPS` / `RATE_LIMIT_BURST` | `10` / `20` | Sustained rate and burst. |
| `RATE_LIMIT_WINDOW_SEC` / `RATE_LIMIT_MAX_REQUESTS` | `0` / `0` | Optional sliding window (0 = off). |
| `CONCURRENCY_LIMIT_ENABLED` | `false` | Cap concurrent streams per key (prod: `true`). |
| `MAX_CONCURRENT_STREAMS_PER_ID` | `5` | The cap. |
| `CB_ENABLED` | `false` | Circuit breaker per upstream. |
| `CB_FAILURE_THRESHOLD` / `CB_COOLDOWN_SEC` | `5` / `30` | Failures before opening; cooldown. |
| `CB_TIMEOUT_THRESHOLD` / `CB_TIMEOUT_COOLDOWN` / `CB_HEALTH_CHECK_INTERVAL` | `3` / `60` / `10` | Timeout-surge breaker. |
| `HEALTH_CHECK_TTL_SEC` | `30` | How long an upstream health snapshot is valid. |
| `HEALTH_CHECK_PATH` | `/health` | Upstream health path. |
| `HEALTH_POLL_SEC` | `10` | Background health poll interval (0 = off). |
| `TOKEN_ESTIMATION_ENABLED` | `true` | Estimate usage when the engine omits it. |

## Models, engines and lifecycle

| Variable | Default | Description |
|---|---|---|
| `CORTEX_MODELS_DIR` | `/var/cortex/models` | Models directory **inside the gateway container**. |
| `HF_CACHE_DIR` | `/var/cortex/hf-cache` | HF cache inside the container. |
| `CORTEX_EXPORT_DIR` | `/var/cortex/exports` | Deployment exports inside the container. |
| `CORTEX_MODELS_DIR_HOST` / `HF_CACHE_DIR_HOST` | same as container path | **Host** paths bind-mounted into model containers (compose passes them). |
| `VLLM_IMAGE` | `vllm/vllm-openai:v0.28.0` | Default vLLM image (CUDA 13, driver >= 580; `v0.28.0-cu129` for 550-579). |
| `LLAMACPP_IMAGE` | `ghcr.io/ggml-org/llama.cpp:server-cuda-b10731` | Default llama.cpp image. |
| `OFFLINE_MODE` | `false` | Never pull images; fail fast when one is missing. |
| `OFFLINE_MODE_AUTO_DETECT` | `true` | Treat the host as offline when the registry is unreachable. |
| `REQUIRE_IMAGE_PRECACHE` | `false` | Strict: refuse to start a model whose image is not cached. |
| `IMAGE_PULL_TIMEOUT` | `600` | Seconds allowed for a pull. |
| `VLLM_STARTUP_TIMEOUT` / `LLAMACPP_STARTUP_TIMEOUT` | `600` / `300` | Default `startup_timeout_sec` per engine. |
| `LLAMACPP_SERVER_TIMEOUT` | `300` | Per-request timeout passed to llama-server. |
| `LLAMACPP_METRICS_ENABLED` / `LLAMACPP_SLOTS_ENABLED` / `LLAMACPP_LOG_TIMESTAMPS` | `true` | `--metrics`, `--slots`, `--log-timestamps`. |
| `STOP_MODELS_ON_SHUTDOWN` | `false` | Stop managed containers when the gateway exits (default: leave them; the supervisor re-adopts them). |
| `MODEL_RECONCILE_SEC` | `15` | Supervisor loop: DB state vs containers vs registry. |
| `VLLM_GEN_URLS` / `VLLM_EMB_URLS` / `LLAMACPP_GEN_URLS` | `http://localhost:8001` / `:8002` / `""` | **Optional** static upstream pools for engines you run yourself. Compose sets them empty; managed models register themselves. |

Removed in 0.2: `LLAMACPP_DEFAULT_NGL`, `LLAMACPP_DEFAULT_BATCH_SIZE`, `LLAMACPP_DEFAULT_UBATCH_SIZE`,
`LLAMACPP_DEFAULT_THREADS`, `LLAMACPP_DEFAULT_CONTEXT`, `LLAMACPP_MAX_PARALLEL`,
`LLAMACPP_CONT_BATCHING`, `LLAMACPP_CACHE_TYPE_K/V`, `LLAMACPP_LOG_VERBOSE`, `LLAMACPP_LOG_COLORS`,
`LLAMACPP_CHECK_TENSORS`, `LLAMACPP_SKIP_WARMUP`, `LLAMACPP_JINJA_ENABLED`, `LLAMACPP_DEFRAG_THOLD`,
`VLLM_USE_V1`. Configure these per model ([llama.cpp guide](../models/llamaCPP.md)).

## Observability

| Variable | Default | Description |
|---|---|---|
| `OTEL_ENABLED` | `false` | OpenTelemetry tracing. |
| `OTEL_SERVICE_NAME` | `cortex-gateway` | |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `""` | OTLP HTTP endpoint. |

## Compose-level variables (root `.env`)

| Variable | Default | Description |
|---|---|---|
| `HOST_IP` | detected by `scripts/detect-ip.sh` | LAN IP used for CORS and printed URLs. |
| `CORTEX_MODELS_DIR` / `HF_CACHE_DIR` / `CORTEX_EXPORT_DIR` | `/var/cortex/...` | Host directories to mount. |
| `FRONTEND_PORT` | `3001` | UI port. |
| `PROM_PORT` | `19090` | Host Prometheus port (avoids Cockpit on 9090). |
| `PROM_RETENTION` | `7d` / `15d` | Prometheus retention. |
| `CORTEX_POSTGRES_PORT` / `CORTEX_REDIS_PORT` | `15432` / `16379` | Loopback ports for Postgres and Redis. |
| `NODE_EXPORTER_PORT` / `DCGM_PORT` / `CADVISOR_PORT` | `9100` / `9400` / `8085` | Exporter loopback ports. |
| `COMPOSE_PROFILES` | auto via make | `linux` (node-exporter, cadvisor), `gpu` (dcgm), `tools` (pgadmin, dev only). |
| `CORTEX_RUN_AS_ROOT` | `false` | Skip the gateway's privilege drop (debug only). |
| `*_MEM_LIMIT`, `REDIS_MAXMEMORY`, `FRONTEND_BIND` | see prod compose | Prod resource limits and UI bind address. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `cortex` | Prod database credentials. |

## Model containers

What Cortex sets on every engine container (not configurable):

| Env / flag | Value |
|---|---|
| `NVIDIA_VISIBLE_DEVICES` | from `selected_gpus` (`void` for CPU models) |
| `HF_HUB_OFFLINE=1` | offline-mode models |
| `HF_TOKEN` | the model's `hf_token`, vLLM only |
| `--api-key` | `INTERNAL_VLLM_API_KEY` |
| `--host 0.0.0.0 --port 8000`, published on `127.0.0.1:<random>` | |
| labels `cortex.managed=1`, `cortex.model_id`, `cortex.engine` | |

Everything else is per-model configuration: see the [vLLM](../models/vllm.md) and
[llama.cpp](../models/llamaCPP.md) guides and
[Setting custom environment variables](../models/setting-custom-env-vars.md).

# Runbooks

Short, symptom-first procedures for the failures operators actually hit. Every model row has a
`state` (`stopped`, `starting`, `loading`, `running`, `stopping`, `failed`) and a
`state_reason` that names the failure; start there.

## Where the logs are

| What | Where |
|---|---|
| Gateway | `make logs-gateway` (= `docker logs -f cortex-gateway-1`); json-file driver, rotated 50 MB x 5 in prod |
| One model | `docker logs -f vllm-model-<id>` / `llamacpp-model-<id>`, or **Models → Logs** (`GET /admin/models/{id}/logs?diagnose=true`) |
| All models | `make logs-models` |
| Startup diagnosis | `state_reason` on the model (`GET /admin/models`), `POST /admin/models/{id}/dry-run` |
| Postgres / Redis / Prometheus | `make logs SERVICE=postgres` etc. |
| Docker daemon | `journalctl -u docker -e` |
| Host GPU | `nvidia-smi`, `journalctl -k | grep -i nvrm` |

## Model stuck in `loading`

`loading` means the container is up but `/health` has not answered yet. The supervisor keeps
probing until `startup_timeout_sec` (defaults `VLLM_STARTUP_TIMEOUT=600`,
`LLAMACPP_STARTUP_TIMEOUT=300`) then sets `failed` / `startup_timeout_after_<n>s`.

1. `docker logs --tail 100 <container>`: weights still loading (large model, slow disk) or
   CUDA graph capture (vLLM) is normal; raise `startup_timeout_sec` on the model.
2. Log stops at an image pull: the engine image was not cached. Pre-pull it, or add it to the
   offline package; in `OFFLINE_MODE=true` this fails immediately instead.
3. `docker ps -a --filter label=cortex.model_id=<id>` shows `Exited`: read the last lines - the
   reason is usually one of the sections below (OOM, driver).
4. Nothing at all in the log for minutes: the process is blocked on `--ipc host` shared memory
   or NCCL; check `dmesg` and `nvidia-smi` for a hung GPU.
5. Stop it (`POST /admin/models/{id}/stop`) and start again; every start removes any leftover
   container of the same name first.

## Out of memory / KV cache sizing

vLLM: `CUDA out of memory` during "profiling" means weights + reserved KV cache do not fit.
Lower `gpu_memory_utilization` (0.92 → 0.85 → 0.80), then `max_model_len`, then
`max_num_seqs`; or pin `kv_cache_memory_bytes`. `kv_cache_dtype=fp8` halves the cache.

llama.cpp: `cudaMalloc failed` / `ggml_backend_cuda_buffer_type_alloc_buffer`. Size the cache
before you tune:

```
KV bytes = 2 x n_layer x n_ctx x n_embd_k_gqa x bytes_per_element
           n_embd_k_gqa = n_head_kv x head_dim;  f16 = 2 B, q8_0 ≈ 1.06 B, q4_0 ≈ 0.56 B
```

Llama-3-8B (32 layers, 8 KV heads x 128) at 32k f16: 2 x 32 x 32768 x 1024 x 2 ≈ 4.3 GiB per
full context; `-np 4` shares that pool. Weights: Q4_K_M ≈ 0.6 B/param, Q8_0 ≈ 1.07 B/param.
Remedies in order: lower `context_size`; `cache_type_k/v=q8_0` with `flash_attn=on`; lower
`ngl` to offload layers to CPU; for MoE, `n_cpu_moe` / `override_tensor=exps=CPU`;
`fit_memory=on` (default) already shrinks *unset* `-ngl`/`-c`.

Host OOM (the container is killed with exit 137 and `dmesg` shows `oom-kill`): reduce
`load_mode=mlock` usage, CPU offload, or add swap; the gateway itself has a 4 GB limit in prod.

## Driver / CUDA mismatch

Symptom: container exits at once; `state_reason=container_exited: ...`; log contains
`nvidia-container-cli: requirement error: unsatisfied condition: cuda>=13.0` (or `12.8`).

The image's CUDA runtime is newer than the host driver. Either update the driver
([UPDATE_NVIDIA_DRIVERS](UPDATE_NVIDIA_DRIVERS.md)) or pin an older build:

| Driver | vLLM | llama.cpp |
|---|---|---|
| >= 580 | `vllm/vllm-openai:v0.28.0` | `server-cuda-b10731` |
| 575.51-579 | `vllm/vllm-openai:v0.28.0-cu129` | `server-cuda-b10731` |
| 550-575 | `vllm/vllm-openai:v0.24.0-ubuntu2404` | `server-cuda-b10731` |

Per model: `engine_image`. Globally: `VLLM_IMAGE` / `LLAMACPP_IMAGE` in `.env` (and in
`versions.env` + `backend/src/config.py` if you want the default to change for everyone). Then
`make prepare-offline` again for air-gapped sites.

Also check `nvidia-smi` works on the host and `docker info | grep -i runtime` lists `nvidia`.

## Port conflicts

| Port | Used by | If taken |
|---|---|---|
| 8084 | gateway (host network) | `ss -ltnp | grep 8084`; stop the other process (the gateway port is fixed) |
| 3001 | UI | `FRONTEND_PORT=3002` in `.env`; `make up` updates CORS accordingly |
| 9090 | Prometheus | **Cockpit uses 9090 on many RHEL/Ubuntu hosts**: `PROM_PORT=9094` in `.env` (the gateway's `PROMETHEUS_URL` follows) |
| 15432 / 16379 | Postgres / Redis (loopback) | `CORTEX_POSTGRES_PORT` / `CORTEX_REDIS_PORT` in `.env` |
| 9100 / 9400 / 8085 | exporters (loopback) | `NODE_EXPORTER_PORT` / `DCGM_PORT` / `CADVISOR_PORT` |
| model engine ports | published on `127.0.0.1` with a random host port | never conflict; the gateway reads the assigned port |

`make validate` warns when 9090 belongs to a non-Docker process. Symptom of the Prometheus
clash: `cortex-prometheus-1` restarts in a loop with `bind: address already in use`, and the
System Monitor page shows no host metrics.

## Reboot recovery

All compose services carry `restart: unless-stopped`, so Docker brings them back after a
reboot in dependency order (postgres/redis healthy → gateway → frontend). Model containers are
started with `restart_policy: no` (an engine that crashed should not flap-restart under the
supervisor's feet), so after a reboot:

1. The gateway supervisor reconciles on startup: rows whose container is gone are marked
   `stopped` (`state_reason=container_not_found`), rows whose container is running are
   re-adopted and registered for routing - no restart needed.
2. Start the models you want from the UI or `POST /admin/models/{id}/start`. To bring every
   previously running model back automatically after a reboot, add a cron `@reboot` job that
   waits for `/health` and starts them via the API; there is no built-in autostart.
3. `make health` and `make monitoring-status` confirm exporters and Prometheus targets.

If Docker itself was stopped with running models, `make down` never stops them either
(`STOP_MODELS_ON_SHUTDOWN=false`); `make clean-models` removes them explicitly.

## Disk full

Symptoms: `no space left on device` in gateway or model logs, Postgres refusing writes,
Prometheus crash-looping, image pulls failing.

```bash
df -h / /var/lib/docker /var/cortex
docker system df                      # images, containers, volumes, build cache
docker builder prune -f               # build cache (safe)
docker image prune -f                 # dangling layers (safe)
docker images | grep -E 'vllm|llama'  # old engine tags no model uses -> docker rmi
du -sh /var/cortex/exports/*          # old deployment exports
du -sh /var/lib/docker/volumes/cortex_prometheus_data
```

Prometheus retention is `PROM_RETENTION` (7d dev, 15d/10GB prod). Model weights are never
deleted by Cortex; remove unused folders under `/var/cortex/models` by hand. Container logs
are rotated in prod; in dev set the same `logging:` block or run
`truncate -s0 /var/lib/docker/containers/*/*-json.log` as root.

## Gateway cannot talk to Docker

`state_reason=start_failed: ... Permission denied ... docker.sock`. The gateway runs as the
non-root `cortex` user and joins the group that owns `/var/run/docker.sock` at start. If the
socket is owned by gid 0 on the host, `chgrp docker /var/run/docker.sock` or set
`CORTEX_RUN_AS_ROOT=true` for the gateway service. `docker logs cortex-gateway-1 | head` prints
which uid/gid the entrypoint chose.

## `/var/cortex/exports` not writable

Exports and multipart-GGUF handling write into host directories. `sudo chown -R 1000 /var/cortex/exports`
(and `/var/cortex/models` if you use those features); the entrypoint warns at startup.

## A `running` model returns 502 / `model_unavailable`

The engine crashed after becoming ready. The supervisor re-probes every `MODEL_RECONCILE_SEC`
(15 s) and moves the row to `failed` with `engine_unhealthy: ...`. Read the container log for
the crash (often OOM on a long prompt, or a request that exceeded the context), fix the
setting, start again.

## Auth problems

- UI login loops back to `/login`: the cookie was not stored. Behind TLS with a plain-http
  origin, or `SESSION_COOKIE_SECURE=true` on http → set it to `false` or use https. Different
  origin for UI and API → the cookie is third-party; put both behind one origin.
- All admin sessions invalid after a restart: `SESSION_SECRET` changed (or was empty and the
  ConfigKV row was lost with the database).
- `401` on `/v1` with a valid key in dev: `GATEWAY_DEV_ALLOW_ALL_KEYS` is `false` and the key
  is revoked/expired; check **API Keys**.

Related: [Production deployment](production-deployment.md), [Model management](../models/model-management.md),
[Observability](../architecture/observability.md).

## Admin credentials and secrets

| Task | Command |
|---|---|
| Set or reset the admin login (also on a running system) | `make setup-admin` (asks twice for the password; `SETUP_ADMIN_USERNAME`/`SETUP_ADMIN_PASSWORD` for automation) |
| Sign out every admin session | `LOGOUT_ALL=1 make setup-admin` (rotates `SESSION_SECRET` in `.env` and recreates the gateway) |
| Rotate the engine key `INTERNAL_VLLM_API_KEY` | edit `.env`, `make up`, then **restart every running model** (Models → Apply): containers keep the key they were started with and answer `Invalid API Key` until restarted |
| Fresh host, non-interactive | put `ADMIN_BOOTSTRAP_USERNAME`/`ADMIN_BOOTSTRAP_PASSWORD` (and the two secrets) in `.env` before `make up`; `make up` only prompts while they are blank |

`.env` holds these secrets (mode 600, git-ignored). Back it up together with the database; a
database dump restored on another host is only usable with the same `SESSION_SECRET`/admin values
or a `make setup-admin` afterwards.

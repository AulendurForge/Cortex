# CORTEX

**Self-hosted LLM inference gateway and model management platform**

CORTEX is an OpenAI-compatible gateway and admin UI for running vLLM and llama.cpp engines on
your own hardware: API keys and organizations, health-aware routing, usage metering, per-model
container management, Prometheus metrics, and offline (air-gapped) deployment.

## Start here

| I want to... | Read |
|---|---|
| Run it on a lab box in ten minutes | [Quick start](getting-started/quick-start.md) |
| Deploy for real users (TLS, secrets, built images) | [Production deployment](operations/production-deployment.md) |
| Deploy on an air-gapped network | [Offline deployment](operations/offline-deployment.md) |
| Understand every setting | [Configuration](getting-started/configuration.md) |
| Add and tune a model | [Model management](models/model-management.md), [vLLM](models/vllm.md), [llama.cpp](models/llamaCPP.md) |
| Fix something at 3 a.m. | [Runbooks](operations/runbooks.md) |
| Back up or move a deployment | [Backup & restore](operations/backup-restore.md) |
| Call the API | [OpenAI-compatible API](api/openai-compatible.md), [Admin API](api/admin-api.md) |
| Review security | [Security](security/security.md), [Threat model](security/threat-model.md) |

## What it does

- **Gateway**: `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, `/v1/models`;
  streaming with TTFT metrics; scoped API keys; rate and concurrency limits; circuit breaking.
- **Model management**: one container per model (`vllm/vllm-openai:v0.28.0` or
  `llama.cpp:server-cuda-b10731`, per-model `engine_image` override), declarative configuration
  generated from one engine spec, dry-run with the exact command, readiness tracking
  (`stopped → starting → loading → running`, `failed` with a reason), recipes, GGUF inspection.
- **Admin UI**: users, organizations, keys, models, usage analytics, System Monitor (host,
  GPU, per-model metrics), Chat Playground.
- **Operations**: pinned images in `versions.env`, `make prod-check`, Alembic migrations at
  startup, model containers that survive gateway restarts, Prometheus discovery of model
  containers, export/import for migrations, offline packages with checksums.

## Architecture

```
clients ──TLS proxy──► gateway (FastAPI, host network :8084) ──► vllm-model-<id>   (127.0.0.1:<port>)
                            │  auth, routing, metering        ──► llamacpp-model-<id>
                            ├──► Postgres (loopback)   ├──► Redis (loopback)
                            └──► Docker socket (starts/adopts model containers)
admin UI (Next.js :3001) ──► gateway          Prometheus ──► gateway, exporters, model containers (by label)
```

Details: [System overview](architecture/system.md), [Backend](architecture/backend.md),
[Frontend](architecture/frontend.md), [Observability](architecture/observability.md).

## Essential commands

```bash
make quick-start          # dev: build, start, create the admin account (prompts once)
make prod-check && make up ENV=prod
make health / make ps / make logs SERVICE=gateway / make logs-models
make test-backend / make test-frontend / make test-live GGUF=<file>
make db-backup / make db-restore BACKUP_FILE=...
make prepare-offline / make load-offline / make verify-offline
make versions             # pinned image tags from every source
```

`make help` lists everything; the [Makefile guide](operations/makefile-guide.md) explains it.

## Documentation map

```
docs/
├── getting-started/   quick start, configuration, admin guide, checklist
├── operations/        production, offline, runbooks, backup, network, Makefile, upgrades
├── models/            model management, vLLM, llama.cpp, custom args/env, GGUF, Nemotron example
├── api/               OpenAI-compatible and admin endpoints
├── architecture/      system, backend, frontend, IP detection, observability
├── security/          security posture, threat model
├── features/          chat playground
├── analysis/, bug/    engineering analyses and review plans
└── contributing/      how to contribute, coding standards, ADRs
```

## License

Copyright © 2024-2026 Aulendur Labs. See `LICENSE.txt` and `NOTICE.txt`.

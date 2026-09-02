<img src="frontend/src/assets/Aulendur%20LLC%20Dark%20Logo%20with%20Text_NoBackground.png" alt="Aulendur Labs" align="right" width="80" />

<p align="center">
  <img src="frontend/src/assets/cortex%20logo%20and%20text%20black.png" alt="CORTEX" width="360" />
</p>

# CORTEX

OpenAI-compatible gateway and admin UI for running vLLM and llama.cpp inference engines on your
own infrastructure. Built and maintained by Aulendur Labs.

- OpenAI-compatible `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings`, streaming with TTFT metrics
- Scoped API keys, organizations and users; rate and concurrency limits; usage metering
- One managed container per model on **vLLM `v0.28.0`** or **llama.cpp `server-cuda-b10731`**
  (pinned in `versions.env`; per-model `engine_image` override), dry-run of the exact command,
  readiness tracking with failure reasons, recipes, GGUF inspection
- Admin UI with System Monitor (host, GPU, per-model metrics) and a Chat Playground
- Prometheus metrics (model containers discovered through the gateway), Alembic migrations at startup,
  transfer bundles (engine images, models, the program itself) for air-gapped hosts, offline rebuilds

## Quick start (development)

```bash
sudo apt-get install -y make docker.io docker-compose-plugin curl jq
sudo mkdir -p /var/cortex/{models,hf-cache,exports} && sudo chown -R 1000:1000 /var/cortex
cp .env.example .env          # optional: paths, PROM_PORT=9094 if Cockpit owns 9090
make quick-start              # build + up; asks for the admin username/password once
```

Open `http://<HOST_IP>:3001/login` (the IP is printed; do not use `localhost` from other
devices), sign in with the credentials you chose (`make setup-admin` changes them), create an
API key, add a model. Full walkthrough:
[docs/getting-started/quick-start.md](docs/getting-started/quick-start.md) -
[START_HERE.md](START_HERE.md) is the five-minute version.

```bash
curl -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  http://<HOST_IP>:8084/v1/chat/completions \
  -d '{"model":"<served name>","messages":[{"role":"user","content":"Hello!"}]}'
```

## Production

```bash
cp .env.example .env    # set CORS_ALLOW_ORIGINS; `make up` generates the secrets and asks for the admin login
make build ENV=prod     # cortex-gateway:<version>, cortex-frontend:<version> (next build)
make prod-check         # fails on default secrets, :latest tags, drift between versions.env and config.py
make up ENV=prod
```

TLS reverse proxy (Caddy example), firewall and the security checklist:
[docs/operations/production-deployment.md](docs/operations/production-deployment.md).

## Offline / air-gapped

```bash
make prepare-offline    # connected host: program bundle (pinned images + built Cortex + deps images + wheels)
make load-offline BUNDLE=/media/usb/cortex-offline-bundle   # air-gapped host (or Transfer → Import in the UI)
make verify-offline
echo OFFLINE_MODE=true >> .env && make prod-check && make up ENV=prod
```

[docs/operations/offline-deployment.md](docs/operations/offline-deployment.md).

## Everyday commands

| | |
|---|---|
| `make help` | all targets |
| `make up` / `make down` / `make restart` | the compose stack (model containers keep running across `down`) |
| `make ps`, `make health`, `make monitoring-status` | status |
| `make logs SERVICE=gateway`, `make logs-models` | logs |
| `make test-backend`, `make test-frontend`, `make test-live GGUF=<path>` | tests (backend unit tests, frontend vitest + typecheck, live llama.cpp inference) |
| `make migrate` | re-run Alembic migrations |
| `make db-backup`, `make db-restore BACKUP_FILE=...` | database |
| `make clean-models` | remove all model containers |
| `make versions` | pinned images from `versions.env`, `config.py`, compose and the offline manifest |
| `make validate`, `make test-external-access`, `make setup-firewall` | network diagnostics |

## Documentation

- Docs site: https://aulendurforge.github.io/Cortex/ (source in `docs/`; `mkdocs build --strict`)
- Models: [model management](docs/models/model-management.md), [vLLM](docs/models/vllm.md),
  [llama.cpp](docs/models/llamaCPP.md), [custom args/env](docs/models/setting-custom-env-vars.md),
  [GGUF](docs/models/gguf-format.md), [Nemotron 3 Super example](docs/models/nemotron-3-super.md)
- Operations: [runbooks](docs/operations/runbooks.md), [backup & restore](docs/operations/backup-restore.md),
  [network access](docs/operations/network-access.md), [Makefile guide](docs/operations/makefile-guide.md)
- [Configuration](docs/getting-started/configuration.md), [Security](docs/security/security.md),
  [Admin API](docs/api/admin-api.md)

## Development

```bash
make up                         # dev stack: hot-reloading frontend, gateway image cortex-gateway:dev
make test-backend               # pytest inside the gateway container (unit + integration against it)
docker exec cortex-gateway-1 python -m pytest src/tests -q -m "not live and not integration"
cd frontend && npm ci && npm run typecheck && npm test && npm run build
python3 scripts/gen-engine-flag-tables.py --check   # engine docs match backend/src/engines/spec.py
```

CI (`.github/workflows/ci.yml`) runs backend unit tests with Postgres, frontend typecheck/tests/build,
both Docker image builds, compose validation and `mkdocs build --strict` on every pull request.

## Repository safety

`make` targets only touch resources labelled for Cortex: compose project `cortex`, containers
with `cortex.managed=1`, volumes/networks prefixed `cortex_`, and locally built images. Other
containers on the host are never affected. Model files under `/var/cortex/models` are never
deleted by Cortex.

## Changelog and license

See [CHANGELOG.md](CHANGELOG.md). Copyright © 2026 Aulendur Labs. See `LICENSE.txt` and `NOTICE.txt`.

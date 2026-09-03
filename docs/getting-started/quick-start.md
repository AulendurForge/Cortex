# Quick Start

The one page to get a development instance of Cortex running, reachable from your LAN, with
an admin user and a first API key. Production is a separate, shorter procedure:
[Production deployment](../operations/production-deployment.md).

## 1. Prerequisites

- Linux host (Ubuntu 22.04/24.04 or RHEL 9 family), Docker Engine 24+ with the compose plugin,
  GNU make, `curl`, `jq`.
- For GPU models: NVIDIA driver (>= 580 for the default vLLM image, >= 550 for llama.cpp and
  the `-cu129` vLLM build) and the NVIDIA Container Toolkit. Verify with
  `docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi`.
- Directories for model files, the HF cache and exports (defaults shown; change them in `.env`):

```bash
sudo mkdir -p /var/cortex/models /var/cortex/hf-cache /var/cortex/exports
sudo chown -R 1000:1000 /var/cortex        # the gateway runs as uid 1000 inside its container
```

```bash
sudo apt-get install -y make docker.io docker-compose-plugin curl jq   # Debian/Ubuntu
sudo usermod -aG docker $USER && newgrp docker
```

## 2. Start

```bash
git clone <repo> Cortex && cd Cortex
cp .env.example .env         # optional: paths and ports
make quick-start             # = make build + make up; asks for the admin username/password once
```

`make up` exports `versions.env` (pinned images), detects the host IP for CORS, and enables
the `linux`/`gpu` monitoring profiles automatically. The output ends with the URLs:

```
Admin UI:   http://192.168.1.50:3001/login
Gateway:    http://192.168.1.50:8084
Prometheus: http://192.168.1.50:19090
```

Use the **host IP, not `localhost`**, from other devices. `make ip` prints it again.

Without make (standalone compose):

```bash
set -a; . ./versions.env; set +a
HOST_IP=$(bash scripts/detect-ip.sh) docker compose -f docker.compose.dev.yaml up -d --build
```

## 3. First login and API key

1. Open `http://<HOST_IP>:3001/login` and sign in with the username and password you typed
   during `make quick-start` (stored in `.env` as `ADMIN_BOOTSTRAP_*`, mode 600; the account is
   created on an empty database). `make setup-admin` changes them at any time, also on a running
   system; `LOGOUT_ALL=1 make setup-admin` additionally signs out every session.
2. Non-interactive installs: put `ADMIN_BOOTSTRAP_USERNAME`/`ADMIN_BOOTSTRAP_PASSWORD` in `.env`
   (or export `SETUP_ADMIN_USERNAME`/`SETUP_ADMIN_PASSWORD`) before `make up`.
3. **API Keys → Create key** (scopes `chat,completions,embeddings`). Copy it; it is shown once.

Or from a shell: `make login && make create-key`.

```bash
curl -H "Authorization: Bearer $KEY" http://<HOST_IP>:8084/v1/models
```

The dev stack sets `GATEWAY_DEV_ALLOW_ALL_KEYS=true`, so *any* bearer token is accepted on
`/v1` for local experiments. Production turns this off.

## 4. Add a model

Put the weights under `/var/cortex/models/<folder>` (see
[HuggingFace download](../models/huggingface-model-download.md)), then **Models → Add model**:

- GGUF file → engine `llamacpp` ([guide](../models/llamaCPP.md));
- safetensors / HF checkpoint → engine `vllm` ([guide](../models/vllm.md));
- pick the GPUs, keep the defaults, **Dry-run**, **Start**.

The row shows `loading` until the engine answers `/health`, then `running`; a failure shows
`failed` with a `state_reason`. Model containers keep running across gateway restarts and
reboots are covered in the [runbooks](../operations/runbooks.md#reboot-recovery).

Test in **Chat → Playground**, or:

```bash
curl -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  http://<HOST_IP>:8084/v1/chat/completions \
  -d '{"model":"<served name>","messages":[{"role":"user","content":"Hello!"}]}'
```

## 5. Verify

```bash
make validate     # IP detection, CORS, listeners, firewall
make health       # gateway /health, containers, Prometheus and exporters
make test-backend # unit tests inside the gateway container
```

## 6. Network access, CORS and firewall

The gateway uses **host networking** (`0.0.0.0:8084`); the UI is published on `3001`. Browser
origins allowed to call the API with cookies come from `CORS_ALLOW_ORIGINS`; `make up` builds
it from the detected host IP, and the entrypoint adds the IP it detects when the list is
localhost-only. If your IP changes, `make restart`. To force an IP: `HOST_IP=10.0.0.5 make up`
or `HOST_IP=...` in `.env`.

Ports to allow on the host firewall for LAN access:

```bash
sudo ufw allow from 192.168.0.0/16 to any port 3001 proto tcp comment 'Cortex UI'
sudo ufw allow from 192.168.0.0/16 to any port 8084 proto tcp comment 'Cortex API'
sudo ufw reload
```

Containers on the same host reach the API at `http://host.docker.internal:8084` (add
`extra_hosts: ["host.docker.internal:host-gateway"]`); with UFW active run
`make setup-firewall` once so Docker bridge subnets may reach the host. Diagnose with
`make test-external-access`. Model engines listen on `127.0.0.1` only and are never reachable
from the LAN. Details: [Network access](../operations/network-access.md).

## 7. Monitoring

Prometheus scrapes the gateway, node-exporter, cAdvisor, DCGM and every running model
container (discovered by Docker label). `make monitoring-status` lists the targets; the
**System Monitor** page shows host, GPU and per-model metrics. Prometheus defaults to port
`19090` on the host (avoids Cockpit on 9090). See [Observability](../architecture/observability.md).

## 8. Everyday commands

```bash
make help                      # everything
make logs SERVICE=gateway      # follow one service
make logs-models               # tail every model container
make down / make up            # stop / start the stack (model containers survive)
make clean-models              # remove all model containers
make db-backup                 # pg_dump to backups/
make versions                  # pinned images from every source
```

Next: [Configuration](configuration.md), [Model management](../models/model-management.md),
[Production deployment](../operations/production-deployment.md),
[Offline deployment](../operations/offline-deployment.md).

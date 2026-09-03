# START HERE - Cortex in five minutes

For a new administrator on a Linux box with Docker. The complete version is
[docs/getting-started/quick-start.md](docs/getting-started/quick-start.md).

## 1. Install and start

```bash
sudo apt-get update && sudo apt-get install -y make docker.io docker-compose-plugin curl jq
sudo usermod -aG docker $USER && newgrp docker
sudo mkdir -p /var/cortex/{models,hf-cache,exports} && sudo chown -R 1000:1000 /var/cortex

git clone <repo> Cortex && cd Cortex
make quick-start
```

The last lines of the output are your URLs:

```
Admin UI:   http://192.168.1.50:3001/login
Gateway:    http://192.168.1.50:8084
Prometheus: http://192.168.1.50:19090
```

**Use that IP, not `localhost`, from any other device.** `make ip` prints it again.

## 2. Log in and secure the account

1. `http://<HOST_IP>:3001/login` - `admin` / `admin`
2. **Users → admin → change password**
3. **API Keys → Create key** - copy it, it is shown once

## 3. Add a model

Copy weights to `/var/cortex/models/<folder>` (see
[docs/models/huggingface-model-download.md](docs/models/huggingface-model-download.md)), then
**Models → Add model**: GGUF → llama.cpp, safetensors → vLLM, choose GPUs, **Dry-run**,
**Start**. The row goes `loading → running` (or `failed` with a reason). Try it in
**Chat → Playground** or:

```bash
curl -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
  http://<HOST_IP>:8084/v1/chat/completions \
  -d '{"model":"<served name>","messages":[{"role":"user","content":"Hello!"}]}'
```

## 4. Check

```bash
make validate          # IP, CORS, listeners, firewall
make health            # gateway, containers, Prometheus, exporters
make test-backend      # unit tests inside the gateway container
```

## If something is off

| Symptom | Do |
|---|---|
| UI unreachable from another device | use the host IP; `sudo ufw allow 3001/tcp; sudo ufw allow 8084/tcp` |
| Prometheus keeps restarting | port conflict: set `PROM_PORT=<free port>` in `.env` and `make restart` |
| model stuck `loading` / `failed` | `make logs-models`, then [docs/operations/runbooks.md](docs/operations/runbooks.md) |
| CORS error in the browser | IP changed: `make restart` |
| another container must call Cortex | `http://host.docker.internal:8084`; `make setup-firewall` once on UFW hosts |

## Next

- Production (TLS, secrets, built images): [docs/operations/production-deployment.md](docs/operations/production-deployment.md)
- Air-gapped: [docs/operations/offline-deployment.md](docs/operations/offline-deployment.md)
- Backups: `make db-backup` (+ cron) - [docs/operations/backup-restore.md](docs/operations/backup-restore.md)
- All commands: `make help` - [docs/operations/makefile-guide.md](docs/operations/makefile-guide.md)

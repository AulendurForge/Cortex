# Quickstart (Docker Compose)

This is the fastest way to run CORTEX locally.

## Prerequisites
- Docker and Docker Compose
- Optional: NVIDIA GPU + drivers for running vLLM with CUDA

## Recommended: Use Makefile (Easier)

The Makefile provides automatic configuration:

```bash
make quick-start
# - Auto-detects your IP
# - Auto-enables monitoring on Linux
# - Creates admin user
# - Shows access URLs
```

## Alternative: Direct Docker Compose

You can also use Docker Compose directly:

```bash
# From repo root
docker compose -f docker.compose.dev.yaml up --build

# Cortex will:
# ✓ Auto-detect host IP in the gateway container (fallback)
# ✓ Configure CORS automatically
# ✓ Work from your network

# Note: Monitoring profiles (linux, gpu) need manual enabling:
export COMPOSE_PROFILES=linux,gpu
docker compose -f docker.compose.dev.yaml up -d --build
```

**Recommendation**: Use `make up` instead - it auto-enables monitoring on Linux!

Services exposed:
- **Admin UI** (Next.js): `http://localhost:3001`
- **Gateway** (FastAPI): `http://localhost:8084`
- Prometheus: `http://localhost:9090`
- PgAdmin: `http://localhost:5050` (admin@local / admin)

Health check:
```bash
curl http://localhost:8084/health
```

## Network Access (Serving to LAN)

Cortex runs with **host network mode** for the gateway, making it accessible from any device on your network.

### Access URLs

| From | Admin UI | API Gateway |
|------|----------|-------------|
| Same machine | `http://localhost:3001` | `http://localhost:8084` |
| LAN devices | `http://<HOST_IP>:3001` | `http://<HOST_IP>:8084` |
| Docker containers | `http://host.docker.internal:8084` | (with extra_hosts) |

Get your host IP:
```bash
make info    # Shows detected IP and access URLs
```

### Firewall Configuration (Linux/UFW)

If you have UFW firewall enabled, allow Cortex ports:

```bash
# Allow Cortex ports
sudo ufw allow 3001/tcp comment 'Cortex Admin UI'
sudo ufw allow 8084/tcp comment 'Cortex API Gateway'
sudo ufw reload

# Or allow your entire local network
sudo ufw allow from 192.168.0.0/16 comment 'Local network'
sudo ufw reload

# Verify
sudo ufw status
```

**Troubleshoot firewall issues:**
```bash
# Check for blocked connections
sudo tail -20 /var/log/ufw.log | grep BLOCK
```

### Docker Container Access

For applications running in Docker containers to reach Cortex:

```yaml
# docker-compose.yaml
services:
  your-app:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      OPENAI_API_BASE: "http://host.docker.internal:8084/v1"
      OPENAI_API_KEY: "your-cortex-api-key"
```

On Linux with UFW, also run:
```bash
make setup-firewall  # Allows Docker container traffic to host
```

## Bootstrap an admin and login (dev cookie)
```bash
curl -X POST http://localhost:8084/admin/bootstrap-owner \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin","org_name":"Default"}'
```

Login via UI at `http://localhost:3001/login` or via API:
```bash
curl -X POST http://localhost:8084/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' -i
```
(The response sets a `cortex_session` httpOnly cookie for dev.)

If the UI reports a CORS error, ensure the gateway allows your UI origin. In `docker.compose.dev.yaml`, the gateway sets:

```
CORS_ALLOW_ORIGINS: http://localhost:3001,http://127.0.0.1:3001
```
Recreate the gateway after edits:

```bash
docker compose -f docker.compose.dev.yaml up -d --build gateway
```

## Create an API key
```bash
curl -X POST http://localhost:8084/admin/keys \
  -H 'Content-Type: application/json' \
  -d '{"scopes":"chat,completions,embeddings"}'
```
Copy the returned `token` immediately; it is shown once.

## Make an API call
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:8084/v1/chat/completions \
  -d '{"model":"meta-llama/Llama-3-8B-Instruct","messages":[{"role":"user","content":"Hello!"}]}'
```

## Monitoring

**With Makefile** (automatic on Linux):
```bash
make up                    # Auto-enables monitoring
make monitoring-status     # Check monitoring health
```

**With Docker Compose** (manual):
```bash
export COMPOSE_PROFILES=linux,gpu
docker compose -f docker.compose.dev.yaml up -d
```

**Verify monitoring:**
```bash
# Check Prometheus targets
curl http://localhost:9090/targets

# Check GPU metrics
curl http://localhost:8084/admin/system/gpus

# Check host metrics
curl http://localhost:8084/admin/system/summary
```

All metrics are visible in the Admin UI → System Monitor page, including:
- Per-model inference metrics (requests, tokens, latency)
- GPU utilization and memory
- Host CPU, memory, disk, network

## Smoke test script
You can also run `scripts/smoke.sh` after bringing the stack up.

## Stopping
`Ctrl+C` then `docker compose -f docker.compose.dev.yaml down`.

## Reset to a fresh state (wipe dev databases)
```bash
docker compose -f docker.compose.dev.yaml down -v
docker ps -a --filter "name=vllm-model-" -q | xargs -r docker rm -f
docker compose -f docker.compose.dev.yaml up -d --build
```

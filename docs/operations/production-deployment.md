# Production Deployment

`docker.compose.prod.yaml` runs the same services as the dev stack with production settings:
locally built, version-tagged images; required secrets; the admin UI built with `next build`;
`restart: unless-stopped`, healthchecks and memory limits everywhere; no pgadmin; and
everything except the gateway's host-network listener bound to loopback so a TLS reverse
proxy is the only thing you expose.

## 1. Host preparation

```bash
sudo mkdir -p /var/cortex/models /var/cortex/hf-cache /var/cortex/exports
sudo chown -R 1000:1000 /var/cortex            # gateway runs as uid 1000
sudo usermod -aG docker <deploy-user>
```

NVIDIA driver >= 580 (default vLLM image) or >= 550 with `VLLM_IMAGE=vllm/vllm-openai:v0.28.0-cu129`;
NVIDIA Container Toolkit installed; `docker run --rm --gpus all <image> nvidia-smi` works.

## 2. Configuration

```bash
cp .env.example .env
```

Set at least the four required variables (compose refuses to start without them):

```bash
INTERNAL_VLLM_API_KEY=$(openssl rand -hex 32)   # gateway <-> model containers
SESSION_SECRET=$(openssl rand -hex 32)          # signs admin session cookies
ADMIN_BOOTSTRAP_PASSWORD=<strong password>      # first admin; only used while no admin exists
CORS_ALLOW_ORIGINS=https://cortex.example.com   # the exact UI origin(s), never *
```

Other production defaults in the compose file: `GATEWAY_DEV_ALLOW_ALL_KEYS=false`,
`SESSION_COOKIE_SECURE=true` (set `false` only if you really serve the UI over plain http),
`RATE_LIMIT_ENABLED=true`, `CONCURRENCY_LIMIT_ENABLED=true`, `OFFLINE_MODE=${OFFLINE_MODE:-false}`,
Prometheus retention 15d / 10GB, json-file log rotation 50 MB x 5 per container. Image tags
come from `versions.env` (see `make versions`).

## 3. Build, check, start

```bash
make build ENV=prod        # cortex-gateway:<CORTEX_VERSION>, cortex-frontend:<CORTEX_VERSION>
make prod-check            # fails on missing/default secrets, :latest tags, drift from config.py
make up ENV=prod
make health
```

`make prod-check` (`scripts/prod-check.sh`) is the gate: it loads `.env`, renders the compose
config and refuses default secrets, `*` origins, unpinned images and a missing `/var/cortex`.
Migrations run automatically at gateway startup (`alembic upgrade head`; pre-Alembic databases
are stamped at the baseline first). `make migrate` re-runs them on demand.

## 4. TLS reverse proxy (Caddy)

With the proxy in front, the browser must call the API on the **same origin** as the UI: set
`CORTEX_GATEWAY_URL=/` in `.env` (the UI reads it at request time, no rebuild needed). Without it
the UI would call `https://<host>:8084`, which the proxy does not serve.

Serve UI and API from **one origin** so the admin session cookie is first-party and CORS is
trivial. Caddy obtains and renews certificates automatically (internal CA or ACME).

`/etc/caddy/Caddyfile`:

```caddyfile
cortex.example.com {
    # API and admin endpoints -> gateway (host network, :8084)
    handle /v1/* {
        reverse_proxy 127.0.0.1:8084 {
            flush_interval -1          # stream SSE tokens immediately
            transport http { read_timeout 0 }
        }
    }
    handle /admin/* {
        reverse_proxy 127.0.0.1:8084
    }
    handle /auth/* {
        reverse_proxy 127.0.0.1:8084
    }
    handle /health {
        reverse_proxy 127.0.0.1:8084
    }
    # Everything else -> Next.js UI (loopback :3001)
    handle {
        reverse_proxy 127.0.0.1:3001
    }
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        -Server
    }
    request_body { max_size 16MB }
}
```

```bash
sudo apt-get install -y caddy && sudo systemctl enable --now caddy
sudo systemctl reload caddy
```

With this layout `CORS_ALLOW_ORIGINS=https://cortex.example.com` and the UI derives the
gateway URL from the browser origin. The equivalent nginx setup needs
`proxy_buffering off; proxy_read_timeout 3600;` on `/v1/` for streaming. For an internal CA use
`tls internal` or `tls /path/cert.pem /path/key.pem` inside the site block.

Firewall: expose 443 (and 80 for ACME) only.

```bash
sudo ufw default deny incoming
sudo ufw allow 22/tcp && sudo ufw allow 80,443/tcp
sudo ufw enable
```

Ports 8084 (gateway) and 3001/9090/9100/9400/8085 (loopback) are not published beyond the
host. Model containers publish their engine port on `127.0.0.1` only and require
`INTERNAL_VLLM_API_KEY`.

## 5. Security checklist

- [ ] `make prod-check` passes with no failures.
- [ ] Admin password changed after first login; `ADMIN_BOOTSTRAP_PASSWORD` removed from `.env`
      afterwards (it is ignored once an admin exists, but keep secrets out of files).
- [ ] TLS terminated by the proxy; `SESSION_COOKIE_SECURE=true`; HSTS set **by the proxy**
      (the gateway does not send HSTS).
- [ ] `CORS_ALLOW_ORIGINS` is the exact UI origin.
- [ ] Only 80/443 (and SSH) reachable from outside; 8084 restricted to the proxy host or the
      LAN you trust; Prometheus not exposed.
- [ ] Every API key has the minimum scopes; unused keys revoked.
- [ ] `RATE_LIMIT_*` tuned; `REQUEST_MAX_BODY_BYTES` sized for your prompts.
- [ ] `versions.env` pinned tags reviewed; `docker image inspect` digests recorded for audits.
- [ ] `OFFLINE_MODE=true` on air-gapped hosts so nothing is pulled.
- [ ] Backups scheduled (`make db-backup` via cron, export dir + models dir on storage snapshots)
      and a restore rehearsed: [Backup & restore](backup-restore.md).
- [ ] Log rotation in place (compose json-file 50 MB x 5; `journalctl` for Docker itself).
- [ ] Reboot tested: services and model containers return
      ([runbooks](runbooks.md#reboot-recovery)).

## 6. Operating

| Task | Command |
|---|---|
| Status / health | `make ps`, `make health`, `make monitoring-status` |
| Logs | `make logs SERVICE=gateway`, `make logs-models` |
| Upgrade Cortex | `git pull`, bump `CORTEX_VERSION` in `versions.env`, `make build ENV=prod`, `make prod-check`, `make up ENV=prod` (running models are re-adopted) |
| Change an engine image | edit `versions.env` (`VLLM_IMAGE`/`LLAMACPP_IMAGE`), keep `backend/src/config.py` in sync, `make prepare-offline` for air-gapped sites, `make up ENV=prod` |
| Rotate `INTERNAL_VLLM_API_KEY` | change `.env`, `make up ENV=prod`, then restart each model (Apply) so containers get the new key |
| Rotate `SESSION_SECRET` | change `.env`, `make up ENV=prod`; all admin sessions are invalidated |
| Stop everything incl. models | `make down && make clean-models` |

Prometheus data lives in the `cortex_prometheus_data` volume with the retention above;
gateway logs go to Docker's json-file driver (`docker logs cortex-gateway-1`).

Related: [Quick start (dev)](../getting-started/quick-start.md), [Security](../security/security.md),
[Offline deployment](offline-deployment.md), [Runbooks](runbooks.md).

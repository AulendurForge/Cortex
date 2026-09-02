# Deployment Options

| Scenario | Guide |
|---|---|
| Developer / lab box, LAN access | [Quick start](../getting-started/quick-start.md) (`make quick-start`) |
| Production with TLS, real secrets, built images | [Production deployment](production-deployment.md) (`make prod-check && make up ENV=prod`) |
| Air-gapped / classified network | [Offline deployment](offline-deployment.md) (bundles: `make prepare-offline` → drive → `make load-offline` / Transfer page) |
| Moving a deployment to another host | [Backup & restore](backup-restore.md) (Transfer bundles with a database dump) |

## What the two compose files differ in

| | `docker.compose.dev.yaml` | `docker.compose.prod.yaml` |
|---|---|---|
| Images | `cortex-gateway:dev`, `cortex-frontend:dev` (`next dev`, source bind-mounted) | `cortex-gateway:<CORTEX_VERSION>`, `cortex-frontend:<CORTEX_VERSION>` (`next build`) |
| Auth | `GATEWAY_DEV_ALLOW_ALL_KEYS=true`; admin credentials and internal key from `.env` (`make up` asks/generates) | `false`; `INTERNAL_VLLM_API_KEY`, `SESSION_SECRET`, `ADMIN_BOOTSTRAP_PASSWORD`, `CORS_ALLOW_ORIGINS` required |
| Cookies | `SESSION_COOKIE_SECURE=false` | `true` |
| Limits | rate/concurrency limits off | on; memory limits, log rotation |
| UI bind | `0.0.0.0:3001` | `127.0.0.1:3001` (behind the proxy) |
| pgadmin | `tools` profile, loopback | absent |
| Prometheus retention | 7d | 15d / 10 GB |
| Restart policy / healthchecks | yes | yes |

Both use host networking for the gateway (`:8084`), pinned images from `versions.env`, the
`linux` / `gpu` monitoring profiles, and the same Prometheus configuration.

## Profiles

```bash
make up                              # auto: linux(,gpu) on Linux hosts
make up PROFILES=linux,gpu,tools     # + pgadmin (dev)
make up PROFILES=''                  # no exporters
```

## Health endpoints

| Service | Check |
|---|---|
| Gateway | `GET /health`; `GET /admin/system/summary` (admin) |
| Model | `GET /admin/models/{id}/readiness` → `stopped` / `loading` / `ready` / `error` |
| Prometheus | `GET /-/ready`, targets at `/targets` |
| Postgres / Redis | compose healthchecks (`pg_isready`, `redis-cli ping`) |

`make health` and `make monitoring-status` wrap these.

## Scaling

One gateway per host is the supported topology: the gateway owns the Docker socket and the
model containers of its host. For more capacity add hosts, each with its own Cortex, behind
your load balancer (keys and users are per instance; export/import moves configuration). See
[Scaling & reliability](scaling.md).

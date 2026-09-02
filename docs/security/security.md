# Security

What Cortex actually does today, and what you must add around it. Read with the
[threat model](threat-model.md) and the
[production deployment guide](../operations/production-deployment.md).

## Authentication

### API keys (`/v1/*`)

- Every `/v1` request needs `Authorization: Bearer <key>`. Keys are 40-character random
  strings generated with `secrets.choice`; the first 8 characters are stored as a lookup
  prefix and the full key is stored as a **bcrypt hash** (`passlib`, `backend/src/crypto.py`).
  The plaintext is returned once at creation and cannot be recovered.
- Keys carry scopes (`chat`, `completions`, `embeddings`), belong to an organization/user,
  can expire and can be revoked instantly (**API Keys** page or `DELETE /admin/keys/{id}`).
- `GATEWAY_DEV_ALLOW_ALL_KEYS` (default **false**) makes the gateway accept any bearer token.
  The dev compose file sets it to `true` explicitly; the prod file pins it to `false` and
  `make prod-check` fails if the environment overrides it.

### Admin sessions (`/admin/*`, `/auth/*`)

- `POST /auth/login` sets the `cortex_session` cookie: an **HMAC-SHA256 signed token**
  (username + expiry) using `SESSION_SECRET`. When `SESSION_SECRET` is empty the gateway
  generates a random secret and stores it in the `config_kv` table, so sessions survive
  restarts; set it explicitly in production so it is not tied to the database.
- Cookie attributes: `HttpOnly`, `SameSite=Lax`, `Max-Age = SESSION_TTL_HOURS` (8),
  `Secure = SESSION_COOKIE_SECURE` (default false; **set true behind TLS**).
- Every `/admin/*` route requires an admin session (`require_admin`). The only
  unauthenticated write is `POST /auth/bootstrap-owner`, which creates the first admin and is
  a no-op once any admin exists. `ADMIN_BOOTSTRAP_*` env vars do the same at startup.
- Passwords are bcrypt-hashed. There is no MFA, no password policy and no lockout; put the
  UI behind your SSO/VPN if you need those.

## Authorization

| Endpoint | Requirement |
|---|---|
| `/v1/chat/completions` | key with `chat` |
| `/v1/completions` | key with `completions` |
| `/v1/embeddings` | key with `embeddings` |
| `/v1/models` | any valid key |
| `/admin/*` | admin session |
| `/health`, `/metrics` | none (restrict `/metrics` at the proxy if the host is exposed) |

## Model containers and the internal key

- The gateway starts model containers through the Docker socket. Each container gets
  `--api-key $INTERNAL_VLLM_API_KEY` (vLLM and llama.cpp) and publishes its port on
  **`127.0.0.1` only**, joined to the `cortex_default` network. LAN clients cannot bypass the
  gateway; anything on the host loopback still needs the internal key.
- Containers are labelled `cortex.managed=1`, `cortex.model_id`, `cortex.engine`; the gateway
  re-adopts them after a restart and Prometheus discovers them by label.
- Model containers run with the models directory mounted read-only, `--ipc host` (required by
  NCCL/vLLM), the NVIDIA runtime, and no extra capabilities. They run whatever code the
  checkpoint asks for when `trust_remote_code` is on: treat model files as code.
- Custom startup args cannot set `--host`, `--port`, `--api-key`, `--model`,
  `--served-model-name`, `--ssl-*`; custom env cannot set `NVIDIA_VISIBLE_DEVICES`,
  `CUDA_VISIBLE_DEVICES`, `HF_HUB_OFFLINE`, `VLLM_API_KEY`, `LLAMA_API_KEY`, `LLAMA_ARG_*`.
  The startup command is logged and returned by dry-run with the key redacted.

## The gateway process

- Runs as the non-root `cortex` user (uid 1000) with the Docker socket's group added at start.
  Access to the Docker socket is root-equivalent on the host: the gateway must be trusted, and
  the socket should not be reachable by anything else.
- Host network mode: the API listens on `0.0.0.0:8084`. Firewall it to the proxy / trusted LAN.
- Postgres, Redis, Prometheus, exporters and pgadmin are bound to `127.0.0.1` (pgadmin only
  with the dev `tools` profile).
- Alembic migrations run at startup with the application's database credentials.

## Transport security

Cortex does not terminate TLS and **does not send HSTS**. Put a reverse proxy in front (Caddy
example in the production guide), serve UI and API from one origin, set
`SESSION_COOKIE_SECURE=true`, and let the proxy add `Strict-Transport-Security`.

Security headers the gateway does send when `SECURITY_HEADERS_ENABLED=true` (default):
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: strict-origin-when-cross-origin` (see `backend/src/main.py`).

## CORS

`CORS_ALLOW_ORIGINS` is a comma-separated allowlist evaluated with credentials. The dev stack
adds the detected host IP; production must list the exact UI origin. `*` is rejected by
`make prod-check`. CORS protects browsers only; server-to-server callers are unaffected.

## Limits and abuse controls

| Setting | Default | Purpose |
|---|---|---|
| `REQUEST_MAX_BODY_BYTES` | 1 MiB (8 MiB in compose) | 413 on larger bodies |
| `RATE_LIMIT_ENABLED` + `RATE_LIMIT_RPS/BURST` | off (on in prod compose) | Redis token bucket per key |
| `RATE_LIMIT_WINDOW_SEC` / `RATE_LIMIT_MAX_REQUESTS` | 0 | optional sliding window |
| `CONCURRENCY_LIMIT_ENABLED` + `MAX_CONCURRENT_STREAMS_PER_ID` | off (on in prod) | cap simultaneous streams per key |
| `CB_ENABLED` | off | circuit breaker per upstream |
| per-model `request_timeout_sec` / `stream_timeout_sec` | engine defaults | bound request duration |

## Data at rest

- Database: users (bcrypt password hashes), organizations, API key hashes + prefixes, model
  configurations, usage rows (metadata: key id, model, tokens, latency, status - **no prompt
  or completion text**), `config_kv` (session secret, registry).
- `hf_token` on a model is stored in plaintext in the database (it must be replayed to
  HuggingFace) and is never returned by the API; exports redact it.
- Redis holds rate-limit counters only.
- Model weights and the HF cache are plain files under `/var/cortex`; protect them with
  filesystem permissions and backups.
- Deployment exports (`/var/cortex/exports`) contain the database dump, so treat them as
  secrets.

## Logging and audit

- Gateway request log: request id, route, status, latency, key prefix; auth decisions are
  counted in `gateway_key_auth_allowed_total` / `gateway_key_auth_blocked_total`.
- Container start commands are logged with secrets redacted.
- There is no tamper-evident audit trail; ship Docker logs to your SIEM if you need one.

## Incident response

1. Revoke the affected API keys (**API Keys**), rotate `INTERNAL_VLLM_API_KEY` (then Apply on
   every running model) and `SESSION_SECRET` (logs everyone out).
2. Reset admin passwords; review **Usage** for the key and time window.
3. Check `docker ps -a --filter label=cortex.managed=1` for containers you did not start and
   `docker logs cortex-gateway-1` for unexpected `/admin` activity.

## Production checklist

The authoritative list lives in
[Production deployment → Security checklist](../operations/production-deployment.md#5-security-checklist);
`make prod-check` enforces the machine-checkable items.

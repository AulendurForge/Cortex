# Upgrade Notes

## Database migrations (Alembic)

The schema is managed by Alembic (`backend/alembic/versions/`: `0001_baseline`,
`0002_engine_spec`, ...). **The gateway runs `alembic upgrade head` itself at startup**; a
database created before Alembic (tables present, no `alembic_version`) is stamped at the
baseline first and then upgraded. Nothing to run by hand.

- Re-run on demand: `make migrate`.
- Migration failure is logged (`database migration failed`) and the API keeps starting so you
  can inspect it; fix and restart.
- Developers: `cd backend && alembic revision --autogenerate -m "msg"` (uses
  `backend/alembic.ini`, `script_location = %(here)s/alembic`; set `DATABASE_URL`).

## Upgrading Cortex

```bash
make db-backup
git pull
# review versions.env (engine/infra pins) and CHANGELOG.md
make build            # or: make build ENV=prod
make up               # or: make prod-check && make up ENV=prod
make health
```

Model containers are not touched by a gateway upgrade: the supervisor re-adopts running
containers by label. Restart a model (Apply) only when its engine image or configuration
changed.

## 0.1 → 0.2

- **Settings removed**: `LLAMACPP_DEFAULT_*`, `LLAMACPP_MAX_PARALLEL`, `LLAMACPP_CONT_BATCHING`,
  `LLAMACPP_CACHE_TYPE_K/V`, `LLAMACPP_LOG_VERBOSE`, `LLAMACPP_LOG_COLORS`,
  `LLAMACPP_CHECK_TENSORS`, `LLAMACPP_SKIP_WARMUP`, `LLAMACPP_JINJA_ENABLED`,
  `LLAMACPP_DEFRAG_THOLD`, `VLLM_USE_V1`. Configure per model.
- **Defaults changed**: `GATEWAY_DEV_ALLOW_ALL_KEYS` is `false` (dev compose sets `true`);
  engine images pinned (`vllm/vllm-openai:v0.28.0`, `llama.cpp:server-cuda-b10731`); model
  ports published on `127.0.0.1` only; `--api-key` on both engines; model containers survive
  gateway restarts (`STOP_MODELS_ON_SHUTDOWN=false`).
- **New settings**: `SESSION_SECRET`, `SESSION_TTL_HOURS`, `SESSION_COOKIE_SECURE`,
  `STOP_MODELS_ON_SHUTDOWN`, `MODEL_RECONCILE_SEC`.
- **Routes**: `POST /admin/bootstrap-owner` → `POST /auth/bootstrap-owner`; every `/admin`
  route requires an admin session; `POST /admin/models/dry-run` accepts a body.
- **Sessions**: cookies are now signed; all users must log in again after the upgrade.
- **Files**: `backend/.env.dev` / `.env.prod` are no longer tracked (compose files carry the
  settings; root `.env` overrides); `scripts/versions.env` moved to `versions.env`;
  `NEMOTRON_3_SUPER_DEPLOYMENT.md` moved to `docs/models/nemotron-3-super.md`.
- **Gateway runs as non-root** (uid 1000): `chown -R 1000 /var/cortex/exports` (and
  `/var/cortex/models` if you rely on multipart-GGUF handling).
- **Frontend image** has a `prod` target (`next build`); `node:22-alpine` base.
- **Offline package** now includes the built `cortex-gateway`/`cortex-frontend` images and a
  copy of `versions.env`; regenerate it with `make prepare-offline`.
- **llama.cpp flags renamed** (`--flash-attn on|off|auto`, `--load-mode`, `--spec-draft-n-max`;
  `--defrag-thold`, `--system-prompt-file`, `--mlock` gone) and **vLLM flags**
  (`--cudagraph-capture-sizes`, `--enable-log-requests`; `--swap-space` gone). Stored model
  configurations are migrated by `0002_engine_spec`; review models that used custom args.

## Compatibility

- The frontend derives the gateway URL from the browser origin; `NEXT_PUBLIC_GATEWAY_URL` is
  only for running `next dev` outside compose.
- API changes are listed in `CHANGELOG.md`.

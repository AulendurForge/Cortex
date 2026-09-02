# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Revitalization (2026-09-02) — engine spec, supervisor, security, ops
- **Single source of truth for model configuration**: `backend/src/engines/spec.py` defines every tunable field;
  ORM columns, API schemas, the frontend schema/forms (`GET /admin/engines/spec`), validation and docs derive
  from it. Engine adapters (`engines/vllm.py`, `engines/llamacpp.py`) replace the hand-written builders.
- **Current engine flags**: vLLM v0.28 (`--cudagraph-capture-sizes`, `--enable-log-requests`, `--hf-overrides`,
  `--speculative-config`, LoRA, tool/reasoning parsers, image entrypoint) and llama.cpp b10731
  (`--flash-attn on|off|auto`, `--load-mode`, `--spec-draft-n-max/-min`, `--spec-type`, `--fit`, unified KV,
  repeated `--lora`, `--api-key`). Removed obsolete flags (`--swap-space`, `--gguf-weight-format`, `VLLM_USE_V1`,
  `--disable-log-requests`, `--draft`, `--system-prompt-file`, `--defrag-thold`, `--mlock/--no-mmap`).
- **GGUF always runs on llama.cpp** (vLLM's GGUF loader is an out-of-tree plugin). Pinned images
  `vllm/vllm-openai:v0.28.0` and `ghcr.io/ggml-org/llama.cpp:server-cuda-b10731` via `versions.env`.
- **ModelSupervisor**: per-model locks, Docker calls off the event loop, background startup tracking with
  `state_reason`, health-driven `running → failed`, reconciliation on startup and every 15 s, model containers
  survive gateway restarts, apply restarts only running models.
- **Security**: HMAC-signed session cookies, dev key bypass off by default, admin dependency on every `/admin`
  router (keys/users/orgs/recipes/deployment were unauthenticated), engine ports on loopback with `--api-key`,
  secrets redacted from dry-run output, `hf_token` never returned, forbidden custom flags / protected env vars
  enforced on save, path traversal guards, committed API key and `.env.*` files removed from git.
- **Alembic migrations** (`0001_baseline`, `0002_engine_spec`) run at gateway startup; recipes are JSON snapshots.
- **Frontend**: spec-driven advanced sections, pre-submit validation, live dry-run gating, engine guidance,
  accessible modal/tooltips/toasts, `tsc` clean, 56 unit tests.
- **Ops**: deployable prod compose, non-root gateway, offline package with built images, Prometheus HTTP service discovery for model containers (`GET /prometheus/sd`, no Docker socket), CI workflow, regenerated engine docs, runbooks.
- **Verified**: four-model live matrix (chat + embedding on both engines) through the full CRUD/lifecycle.
- **Transfer bundles replace the Deployment (Beta) page**: export the exact engine image a model needs, extra
  engine tags, infra/program images, model files and an optional database dump to a mounted drive; import on the
  air-gapped host (load images, place files, register models) from the UI or `make load-offline BUNDLE=...`.
  `GET/POST /admin/bundles/*`; legacy `/admin/deployment/export*`, `import-model`, `model-manifests`,
  `estimate-size`, `options` removed (database restore kept).
- **Offline rebuilds**: `make build-deps` produces dependency images that a program bundle ships;
  `make build-offline` rebuilds gateway and UI from modified source with `--network none`.
- Gateway serves Prometheus service discovery (`/prometheus/sd`) and proxies engine metrics (`/engine-metrics/{id}`); admin session cookies are accepted
  on `/v1` so the playground works without a key; Docker start failures return 502 with the reason.

- **No default credentials**: `make up`/`make quick-start` create `.env` (mode 600), generate
  `INTERNAL_VLLM_API_KEY` and `SESSION_SECRET`, and ask for the admin username and password (typed twice, 8+
  characters) only while they are blank; `make setup-admin` sets or resets the account on a running system
  (`python -m src.tools.set_admin`, password over stdin) and `LOGOUT_ALL=1` signs every session out. The dev
  compose no longer defaults to `admin/admin` or `dev-internal-token`; `make bootstrap-default` is gone.
  Tracked `backend/.env`, `.env.linux`, `.env.windows` removed from git (they were committed with a private
  address); docs no longer quote `admin/admin`.

### Frontend audit (2026-09-02) — see docs/FRONTEND_AUDIT.md
- **Usage is now accurate**: streamed chats are metered at stream end with the engine's token counts; usage rows
  carry the key owner or signed-in user and their organization; every filter (time, model, task, status, key,
  user, org) applies to KPIs, charts and the journal; 7-day/30-day windows work (`bucket=day`, zero-filled);
  time-to-first-token comes from Prometheus (shows "—" without samples); CSV export includes user/org.
- **Monitoring numbers mean what they say**: throughput and latency tiles count `/v1` inference routes only and
  both engine families; Health shows tokens/s per served model, breaker state, probe staleness and errors, and
  "Probe now" really probes managed models; System Monitor scrapes vLLM and llama.cpp metrics through the
  gateway, shows GPU name/capacity under DCGM, ranges up to 24 h, units everywhere, no fake "Live" badge.
- **Playground**: embedding models are no longer offered; the running list follows the supervisor; real
  token counts and engine-reported tok/s; failed and cancelled turns are never replayed or persisted; sessions
  are created on the first message with the correct engine; switching chats aborts the stream; retry button.
- **Models**: Save & Apply reports restart failures honestly; renaming a running model no longer rewrites its
  served name; Archive only for stopped/failed models (backend enforced); dead `HF offline` control removed;
  calculator says "capacity unknown" instead of "FITS" without GPU data.
- **Keys / users / orgs**: Cancel no longer creates a key (Button defaults to `type="button"`); non-admins get a
  working "My API Keys" page (`/admin/me/keys` list/create/revoke); CIDR allowlists; `X-Forwarded-For` only
  from `TRUSTED_PROXY_IPS`; user validation (roles, 8-char passwords), org unassign, status editing, self-delete
  and last-admin guards, inline errors; orgs delete no longer calls a nonexistent route.
- **Auth/navigation**: single session probe with an auth gate (no 401 storms), `/login?next=` redirect, role
  never read from localStorage, accessible login form, mobile navigation drawer, "Reached via" host box,
  gateway URL from runtime config (`CORTEX_GATEWAY_URL`, `/` behind the TLS proxy).
- **Foundation**: `ApiError` + `errMsg`, shared formatters, `@/` alias, ESLint in `npm run lint`/CI,
  `output: 'standalone'` with security headers and slim production images, `.dockerignore`, dead code and
  3 MB of unused images removed, Modal focus fix, hydration-safe Accordion, corrected LineChart geometry.
- **Guide as data**: every guide tab is typed content rendered by shared primitives with facts interpolated
  from `/admin/system/about`; the configuration flag reference is generated from the engine spec; tests reject
  stale phrases, unknown make targets and unpinned image tags. `routes/admin.py` split into four modules; large
  model-form modules split into data + components.
- **Guide**: 46 stale statements corrected (key format/hashing, statuses, driver table, feature claims,
  GPT-OSS on vLLM, admin credentials), About page rewritten with version/pinned images/links and an accurate
  Aulendur Labs description, "Users & Orgs" section written, a vitest guardrail rejects known-stale phrases,
  unknown make targets and unpinned image tags.

### Fixed
- **Configure Model lost settings on reopen**: the model list response now returns every configuration field
  (GPU selection, sampling defaults, custom request extras, llama.cpp speculative/startup options) and the
  frontend schema no longer strips them, so the Configure modal shows what was saved instead of defaults.
  Multi-GPU selections and tensor-parallel size survive a reconfigure; llama.cpp tensor splits are regenerated
  to match the GPU count.
- **Sampling defaults reset on every Apply**: temperature / top-p / top-k / penalties are read back from
  `request_defaults_json`; custom request extras (`vllm_xargs`, `stop`, ...) are preserved when only sampling
  fields change, and an empty custom JSON means "unchanged".
- **Stored HuggingFace token wiped on Apply**: an empty `hf_token` in PATCH now means "leave unchanged".
- **Number inputs snapping back while typing**: new `NumberField` lets you clear a field, type `0`, or type a
  negative decimal without the default reappearing. Empty means "engine default".
- **Apply on a stopped model** no longer tries to launch a container; it saves and reports `saved`.
  Apply on a running model reuses the same startup tracking as Start.
- `PATCH /admin/models/{id}` rejects an empty GPU selection for GPU models and derives `tp_size` from the
  selected GPUs when not provided; fields belonging to the other engine are ignored.
- `updated_at` is now maintained on model updates; `ngl=0` (CPU-only llama.cpp) is honoured instead of
  falling back to the default layer count.
- **First login always failed, second succeeded**: with `*` in `CORS_ALLOW_ORIGINS` the gateway answered a
  cookie-less (first) login with `Access-Control-Allow-Origin: *` plus `Allow-Credentials: true`, which
  browsers reject for credentialed requests even though the session cookie was stored. `*` is now translated
  to an allow-all origin regex so the request origin is always echoed explicitly.
- Login page disables the button while submitting and distinguishes "invalid credentials" from "gateway
  unreachable" (shows the gateway URL to check). The user provider no longer forgets the local user on a
  network error, only on a real 401.
- **Gateway froze while pulling an engine image**: `start`/`apply` ran the Docker SDK (including multi-GB
  image pulls) synchronously on the event loop, blocking every other request for the whole pull. Container
  creation now runs in a worker thread.
- Dry-run validation logged `cannot import name 'get_gpu_metrics'` and skipped the VRAM-vs-GPU check; the GPU
  metrics collector is now shared between `/admin/system/gpus` and the validator.
- `scripts/detect-ip.sh` no longer picks libvirt/VirtualBox bridge addresses (e.g. 192.168.122.1) over the
  real LAN address; the default-route address wins ties.

### Changed
- Backend model config handling consolidated into `services/model_config.py` and
  `services/request_defaults.py`; API schemas share one `ModelConfigFields` base. Container GPU device
  requests come from a single `gpu_device_requests()` helper.
- Frontend model form state lives in `modelFormValues.ts` (`buildInitialValues`, `apiItemToFormValues`,
  `toSubmitPayload`); the unused `ModelForm` component was removed. GPU selector sorts numerically and lets
  you add GPU slots when discovery is unavailable.
- Models list query no longer fetches the list twice per poll.

### Added
- Backend tests: `test_model_crud_api.py` (full CRUD + start/stop/archive/delete against a live gateway),
  `test_model_schema_parity.py` (ORM ↔ API schemas ↔ frontend zod), `test_docker_command_build.py`,
  `test_request_defaults.py`.
- Frontend tests (vitest): `modelFormValues.test.ts`, `NumberField.test.tsx`.
- `docs/bug/model-config-persistence-todo.md`: full trace of the persistence and input bugs.

### Planned
- Enhanced monitoring and alerting capabilities
- Additional authentication providers
- Advanced model optimization features

---

## [0.1.1] - 2026-01-18

### Added
- **Custom Environment Variables**: Support for setting custom environment variables in model configuration
  - New "Environment Variables" tab in Custom Startup Configuration section
  - Available in both standard and workflow model forms
  - Documentation guide: `docs/models/setting-custom-env-vars.md`
  - Enables advanced vLLM features like FlashInfer MoE FP8 support
  - Enhanced `docker_manager.py` to handle custom environment variables

### Changed
- Improved model startup configuration flexibility
- Enhanced docker container startup with custom environment variable support

### Documentation
- Added comprehensive guide for setting custom environment variables (`docs/models/setting-custom-env-vars.md`)
- Cleaned up implementation gap documentation files

---

## [0.1.0-beta] - 2026-01-11

### Added

#### Core Features
- **OpenAI-compatible API Gateway**: Full compatibility with OpenAI API endpoints
  - `/v1/chat/completions` - Chat completions with streaming support
  - `/v1/completions` - Text completions
  - `/v1/embeddings` - Embedding generation
  - `/v1/models` - Model listing endpoint
- **Multi-engine Support**: Dual inference engine architecture
  - vLLM engine for standard HuggingFace Transformers models
  - llama.cpp engine for GGUF models and GPT-OSS/Harmony architecture
- **Health-aware Routing**: Intelligent request routing with health checks, circuit breaking, and retries
- **Streaming Support**: Server-sent events (SSE) with time-to-first-token (TTFT) metrics

#### Chat Playground
- Interactive web UI for testing models in real-time
- Server-side chat persistence with user-scoped sessions
- Real-time performance metrics (tokens/second, TTFT, context usage)
- Cross-device access to chat history
- Context window tracking and visualization
- Model selector with running model detection

#### Admin UI & Management
- Comprehensive admin dashboard for system management
- Model lifecycle management (create, configure, start, stop, delete)
- User and organization management with multi-tenant support
- API key management with scoped permissions
- Usage analytics dashboard with filtering and export
- System monitoring dashboard with real-time metrics
- Recipe system for model configuration templates

#### Model Management
- Pre-start VRAM estimation and validation
- Configuration dry-run for testing before deployment
- Startup diagnostics with actionable error fixes
- Model state tracking: `stopped` → `starting` → `loading` → `running` → `failed`
- Resource calculator for optimal GPU memory allocation
- Model testing endpoints for validation
- Log viewer with search and filtering

#### GGUF Support
- Smart engine guidance with automatic recommendations
- GGUF file validation and corruption detection
- Metadata extraction (architecture, context length, layers)
- Multi-part GGUF support for llama.cpp (no merge required)
- Quantization quality indicators (Q4_K_M, Q8_0, etc.)
- Architecture compatibility detection
- Speculative decoding support for llama.cpp

#### Security & Access Control
- Multi-tenant access control with organizations and users
- API key authentication with scoped permissions (chat, completions, embeddings)
- IP allowlisting for API keys
- Rate limiting (configurable per-key or per-IP)
- Concurrency limits for streaming requests
- Session-based authentication for admin UI
- Role-based access control (Admin, User)

#### Observability
- Prometheus metrics integration
- Per-model inference metrics (requests, tokens, latency)
- GPU utilization and memory monitoring
- System Monitor dashboard with:
  - Host metrics (CPU, memory, disk, network)
  - GPU metrics (utilization, temperature, memory)
  - Throughput and latency summaries
  - Per-model vLLM metrics (requests running, cache usage)
- Usage analytics with time-series data
- Request tracing with request IDs

#### Deployment & Operations
- **Offline/Air-gapped Deployment**: Full support for restricted networks
  - Package preparation script for offline environments
  - Image loading and verification tools
  - No internet required after initial package creation
- Docker Compose integration (dev and prod configurations)
- Makefile with 50+ commands for common operations
- Automatic IP detection and CORS configuration
- Database backup and restore functionality
- Deployment export/import for model migration
- Model manifest system for reproducible deployments

#### Developer Experience
- Comprehensive documentation site (MkDocs)
- Quick start guide (`START_HERE.md`)
- API documentation (OpenAI-compatible and Admin APIs)
- Architecture documentation
- Contributing guidelines
- Coding standards and ADR (Architecture Decision Records)

### Technical Details

#### Backend
- FastAPI-based gateway with async/await support
- PostgreSQL database with SQLAlchemy ORM
- Redis integration for rate limiting and caching
- Docker SDK integration for container management
- Prometheus client for metrics export
- OpenTelemetry support (optional)

#### Frontend
- Next.js 14 with React 18
- TypeScript for type safety
- Tailwind CSS for styling
- React Query for data fetching
- Real-time streaming with Server-Sent Events

#### Infrastructure
- Docker Compose for orchestration
- PostgreSQL for persistent storage
- Redis for rate limiting and caching
- Prometheus for metrics collection
- Node Exporter for host metrics (Linux)
- DCGM Exporter for GPU metrics (NVIDIA)
- cAdvisor for container metrics

### Known Limitations

- vLLM GGUF support is experimental (single-file only, requires external tokenizer)
- Some advanced vLLM features require specific engine versions
- Rate limiting requires Redis (optional but recommended for production)
- GPU monitoring requires NVIDIA drivers and DCGM (Linux only)

### Documentation

- Full documentation site: https://aulendurforge.github.io/Cortex/
- Quick start guide: `START_HERE.md`
- API reference: `docs/api/`
- Architecture guides: `docs/architecture/`
- Operations guides: `docs/operations/`

### Security

- See `docs/security/` for security posture and threat model
- Default admin credentials: `admin/admin` (change in production!)
- API keys are hashed using bcrypt
- CORS configuration for network access control

---

## Version History

- **0.1.1** (2026-01-18): Custom environment variables support
- **0.1.0-beta** (2026-01-11): First public beta release

---

## Notes

- This is a beta release. Breaking changes may occur before v1.0.0
- We welcome feedback and contributions from the community
- Report issues and feature requests on [GitHub Issues](https://github.com/AulendurForge/Cortex/issues)
- Join discussions on [GitHub Discussions](https://github.com/AulendurForge/Cortex/discussions)
- See `docs/contributing/` for contribution guidelines
- Repository: https://github.com/AulendurForge/Cortex


# Cortex Revitalization Checklist — Model Management on vLLM & llama.cpp

Date: 2026-09-01
Scope: everything on the path from "admin registers a local model" to "requests are served by a vLLM or
llama.cpp container": backend lifecycle code, engine command/env construction, the admin UI for
configuration, operations/deployment, tests, and documentation.
Method: full read of the code paths listed in each section, online research against current vLLM (v0.28,
2026-08-26) and llama.cpp (`llama-server` build b10731 in the image pulled today; master b10752) documentation
and source, and empirical checks against the images and gateway running on this machine. Findings that
were fixed earlier today (Configure modal losing settings, number inputs, first-login CORS bug, blocking
image pull on start, GPU import error) are recorded in `docs/bug/model-config-persistence-todo.md` and are not
repeated here.

How to use this document: work top-down. Section 1 is the verdict, Section 2 is what the engines actually
look like today and where Cortex has drifted, Section 3 is the target architecture, Section 4 is the phased
checklist (tick boxes as you go), Sections 5–8 are the detailed findings that back the checklist, Section 9
is the test plan, and the appendix holds the flag inventories. IDs are stable so you can reference them in
tickets. Effort: S ≤ half a day, M = 1–3 days, L = a week or more.

---

## 1. Executive assessment

**The value proposition is right and still unusual.** A self-hosted, OpenAI-compatible gateway that lets an
admin register a folder or HuggingFace repo, pick vLLM or llama.cpp, tune the engine through a form (not a
YAML file), launch it as a container, route requests by served name with per-model request defaults, meter
usage, hand out scoped API keys, and do all of it air-gapped. Nothing in the open-source space packages that
whole loop for a small ops team; the pieces exist (vLLM, llama.cpp, LiteLLM, Open WebUI) but not the "one
console that runs the engines and fronts them" combination. Cortex is worth revitalizing.

**The implementation is a feature-complete prototype, not a product.** The codebase has grown by
"gap" (Gap #1–#16 in comments): each gap added a column, a flag, a form field and a doc page, with no
shared definition of a model's configuration. The result is:

1. **Engine drift.** Cortex emits flags that current engine builds reject: vLLM `--swap-space`,
   `--cuda-graph-sizes`, `--gguf-weight-format`, `--disable-log-requests`, env `VLLM_USE_V1`; llama.cpp
   `--draft`, `--system-prompt-file`; wrong value forms for `--lora`/`--lora-scaled`. On the `latest` images
   several of these make the container exit at argument parsing. vLLM has moved GGUF support out of the
   official image entirely, so Cortex's "vLLM + GGUF" path no longer works on `latest`.
2. **No state machine.** `Model.state` is written from five places with no lock and no reconciliation on
   restart; the health poller and the Docker healthcheck never feed back into it; a model that crashes stays
   RUNNING in the UI. Three sources of truth (models table, persisted registry, live containers) drift.
3. **Blocking work on a single event loop.** Docker SDK calls, DNS probes, `urllib`, `tar`, `pg_dump` all run
   inline; a start, stop, export or image pull freezes inference traffic for everyone.
4. **Not production-grade security.** Session cookie is the bare username; engines are published on
   `0.0.0.0` without an API key; dev key bypass is on by default; secrets appear in dry-run output, logs and
   recipe responses; several `/admin` routes lack the admin dependency.
5. **Two hand-maintained forms and eight field lists.** Every field is defined in the ORM, three pydantic
   schemas, the zod schema, the form defaults, the Recipe copy and the docs. Today's bugs were the predictable
   result; more will follow until there is one manifest.
6. **Weak feedback loops.** Dry-run validates the saved row instead of the form, does not block on errors,
   and the smart engine guidance never renders because props are not passed. `alert()` is the validation UI.
7. **No quality gates.** No CI, no lint, 36 TypeScript errors that Next dev hides, tests only added today.
8. **Not deployable as shipped.** The prod compose file lacks the frontend, Prometheus and an admin
   bootstrap; the offline package cannot complete; there are no migrations; an API key and internal IP are
   committed in `debug_api.py` and the tracked `.env.dev`.

**Verdict:** keep the product, keep the stack (FastAPI + Next.js + Docker SDK are fine), replace the core:
a declarative engine spec, a supervised lifecycle, an async Docker boundary, real auth, migrations, and a
generated form. That is roughly 6–8 engineer-weeks in the phases below, and Phase 0 (one week) removes the
things that break model starts today.

---

## 2. Engine reality check (research summary) and Cortex drift

### 2.1 vLLM (v0.28.0, 2026-08-26; release every two weeks, deprecations removed two minors later)
- Image `vllm/vllm-openai` has `ENTRYPOINT ["vllm","serve"]`; args only. `python -m
  vllm.entrypoints.openai.api_server` is a deprecated shim. Base image is CUDA 13 / Ubuntu 24.04 / Python 3.12;
  compute capability ≥ 7.5.
- V0 engine removed in v0.11: `VLLM_USE_V1` no longer exists; `--swap-space` (GPU↔CPU swap) is gone;
  `--enforce-eager` now means "skip torch.compile and CUDA-graph capture". Chunked prefill and prefix caching
  are on by default; only the `--no-enable-*` forms matter.
- Renamed/removed flags relevant to Cortex: `--task` → `--runner pooling` (+`--convert`), `--cuda-graph-sizes`
  → `--cudagraph-capture-sizes` / `--compilation-config`, `--disable-log-requests` → opt-in
  `--enable-log-requests` (removed v0.19), `VLLM_ATTENTION_BACKEND` → `--attention-backend` (v0.13),
  `--rope-scaling/--rope-theta` → `--hf-overrides '{"rope_parameters":…}'`, `--guided-decoding-backend` →
  `--structured-outputs-config`, `--speculative-model` → `--speculative-config` JSON, `--max-seq-len-to-capture`
  → compilation config. `--gguf-weight-format` never existed.
- `--quantization` accepts `awq, gptq, gptq_marlin, awq_marlin, fp8, compressed-tensors, modelopt*, mxfp4,
  torchao, …`; `int8` is not a value; `gguf` and `bitsandbytes` are now out-of-tree plugins.
- GGUF: migrated to the `vllm-gguf-plugin` package, not installed in the official image, single-file only,
  "highly experimental". Cortex must either build a derived image with the plugin or steer GGUF to llama.cpp.
- Health: `/health` is served only after the engine is up (connection refused while loading), 200 when
  healthy, 503 when the engine died. `/metrics` exposes `vllm:num_requests_running/waiting`,
  `vllm:kv_cache_usage_perc`. Recommended run flags: `--ipc=host` (or `--shm-size`), `--gpus`, HF cache volume,
  `VLLM_CACHE_ROOT` volume to persist compile artifacts, ≥ 2+N CPU cores.
- Features admins expect that Cortex has no field for: `--hf-overrides`, `--tokenizer-mode`, `--load-format`,
  `--seed`, `--max-num-seqs` default 128, LoRA (`--enable-lora --lora-modules --max-loras --max-lora-rank`),
  `--speculative-config`, tool calling (`--enable-auto-tool-choice --tool-call-parser`), `--reasoning-parser`,
  structured outputs backend, `--chat-template`, `--generation-config`/`--override-generation-config` (this
  interacts with Cortex request defaults), multimodal limits, `--kv-cache-memory-bytes`, `--data-parallel-size`,
  `--enable-expert-parallel`, `--async-scheduling`, `--enable-sleep-mode`, `--config file.yaml`.

### 2.2 llama.cpp (`llama-server`, image build b10731; multiple `bNNNN` releases per day)
- Image `ghcr.io/ggml-org/llama.cpp:server-cuda` (CUDA 12.8, driver ≥ 570 or 12.x minor compat) has
  `ENTRYPOINT ["/app/llama-server"]`, `LLAMA_ARG_HOST=0.0.0.0`, and a built-in healthcheck on port 8080 (Cortex
  overrides it). Versioned tags `server-cuda-bNNNN` exist; `server-cuda` floats daily. `server-cuda13` exists.
- Every CLI arg has an env form `LLAMA_ARG_<NAME>`; CLI wins.
- Renames/removals verified with `--help` on the pulled image: `--draft/--draft-n/--draft-max` and
  `--draft-min` are **removed** ("use `--spec-draft-n-max` / `--spec-draft-n-min`"); `--mlock`, `--mmap/--no-mmap`,
  `--direct-io` are **deprecated** in favor of `--load-mode {auto|none|mmap|mlock|dio}`; `--defrag-thold` is a
  no-op; `--flash-attn` takes `on|off|auto` (default auto); `--system-prompt-file` is not a server argument;
  `-np` default is `-1` (auto) and `--kv-unified`/`--kv-unified-per-slot` change how context is shared;
  `--fit on` (default) silently adjusts *unset* `-ngl`/`-c`/`-ot` to fit VRAM; `--spec-type` selects the
  speculative method; `--reasoning-format`/`--reasoning-budget`, `--chat-template-kwargs`, `--cache-reuse`,
  `--context-shift`, `--n-cpu-moe`, `--override-tensor`, `--mmproj` (multimodal), router mode (`--models-dir`).
- Constraints: quantized V cache (`q8_0`, `q4_0`, …) requires flash attention on; `-c` is the *total* context
  split across `-np` slots unless KV is unified; sharded GGUF auto-loads siblings from the first part.
- Health: `/health` returns 503 `{"error":{"message":"Loading model"}}` while loading, 200 `{"status":"ok"}` when
  ready; `/metrics` (needs `--metrics`), `/slots`, `/props`, `/v1/models`. OpenAI-compat request names:
  `n_predict`, `repeat_penalty`, `top_k`, `min_p`, `stop`, `chat_template_kwargs`; reasoning in
  `message.reasoning_content`.

### 2.3 Drift table (what Cortex emits vs what the engines accept today)

| ID | Engine | Cortex emits / stores | Reality | Effect | Fix |
|----|--------|-----------------------|---------|--------|-----|
| D-1 | vLLM | `--swap-space` (`swap_space_gb`) | removed in V1 | unrecognized argument → exit | drop field + UI slider |
| D-2 | vLLM | `--cuda-graph-sizes a b c` | removed | exit | `--cudagraph-capture-sizes` or compilation-config JSON |
| D-3 | vLLM | `--gguf-weight-format` | never existed | exit when set | drop |
| D-4 | vLLM | `--disable-log-requests` | removed v0.19 | exit on ≥0.19 | drop; expose `--enable-log-requests` |
| D-5 | vLLM | env `VLLM_USE_V1` | removed v0.11 | dead toggle | drop `vllm_v1_enabled` |
| D-6 | vLLM | entrypoint `python3 -m vllm.entrypoints.openai.api_server` for `latest` | deprecated shim; image ENTRYPOINT is `vllm serve` | fragile | use image entrypoint, args only; keep override |
| D-7 | vLLM | GGUF via `--tokenizer`/`--hf-config-path` | plugin not in official image | vLLM GGUF fails on `latest` | route GGUF to llama.cpp; optional derived image with plugin |
| D-8 | vLLM | UI `quantization=int8` | not a value | exit | replace list: awq, gptq, gptq_marlin, awq_marlin, fp8, compressed-tensors, modelopt, mxfp4, torchao |
| D-9 | vLLM | env `VLLM_ENGINE_ITERATION_TIMEOUT_S` for `engine_request_timeout` | still valid (default 60) but V0-era semantics | misleading label | keep, relabel, or drop |
| D-10 | vLLM | `--enforce-eager` default **true** (`ADD_DEFAULTS`) | now disables compile + CUDA graphs | slower decode for every model by default | default false |
| D-11 | llama.cpp | `--draft N` (`draft_n`) | removed | exit when a draft model is configured | `--spec-draft-n-max`; add `--spec-draft-n-min`, `--spec-type` |
| D-12 | llama.cpp | `--system-prompt-file` | not a server arg (and file written to a non-existent host path) | exit | remove feature; use request defaults |
| D-13 | llama.cpp | `--defrag-thold` | no-op | dead field | drop |
| D-14 | llama.cpp | `--mlock`; `no_mmap` stored but never emitted | deprecated → `--load-mode` | checkbox does nothing | one `load_mode` select |
| D-15 | llama.cpp | `--lora a,b`, `--lora-scaled p:s` | repeated `--lora F`, `--lora-scaled F S` | LoRA never works | fix forms |
| D-16 | llama.cpp | `--cache-type-v q8_0` default with FA optional | quantized V needs FA on | startup failure when FA off | validate/force |
| D-17 | llama.cpp | `-t 32`, `-ub 2048`, `-np 16`, `-c 16384` defaults | upstream `-t auto`, `-ub 512`, `-np auto`; `-c` is total | oversubscribed CPU, 1024 tokens/slot | defaults to auto; explain per-slot context; expose `--kv-unified` |
| D-18 | llama.cpp | no `--fit off` | `--fit on` rewrites unset `-ngl/-c` | "why did my context shrink" | pass `--fit off` when values are explicit, or expose it |
| D-19 | llama.cpp | `split_mode` stored, never emitted | `-sm layer|row|none|tensor` valid | dead field | emit or drop |
| D-20 | llama.cpp | no `--api-key` | supported | engine reachable without auth | pass internal key |
| D-21 | both | `latest` / floating `server-cuda` defaults | daily/biweekly breaking changes | drift recurs | pin per release; test matrix |

---

## 3. Target architecture (what "clean" looks like)

- **A-1 Engine spec as data.** One declarative table per engine: `field → {cli flag | env var, type, value form,
  default, min/max/choices, group, since/until version, mutually-exclusive/requires}`. Generated from it:
  pydantic schemas, the ORM/JSON config, the zod schema, the form sections, the dry-run validator, the
  flag inventory in docs, and the unit tests. `EngineAdapter` (`build_args`, `build_env`, `run_kwargs`,
  `healthcheck`, `readiness`, `container_paths`, `translate_request`) with `VllmAdapter` and
  `LlamaCppAdapter` implementing it; the 480 lines of `try/except: pass` builders go away.
- **A-2 Config storage.** Keep identity/runtime columns; move engine tuning into one JSON `config` column
  validated against the spec (Recipes become `model_id + config JSON`). Alembic migration on; `create_all`
  only for fresh dev databases. Unique index on `served_model_name`.
- **A-3 ModelSupervisor.** A single service owns the state enum (`stopped → starting → loading → running |
  failed`, plus `stopping`), holds a per-model asyncio lock, runs all Docker/DNS/HTTP work via
  `asyncio.to_thread` or the shared httpx client, reconciles DB ↔ containers ↔ registry at startup and on a
  timer, and lets the health poller drive `running → failed`. The registry is derived from rows in `running`
  state, not persisted separately.
- **A-4 Async boundary.** No Docker SDK, `urllib`, `socket.gethostbyname`, `tar`, `pg_dump` or NVML call on the
  event loop. Long operations (start, apply, export) return a job id and progress; the UI polls.
- **A-5 Security baseline.** Signed session cookies (or JWT) with expiry; dev bypass off by default and never
  when a token is presented; engines bound to the compose network with an internal API key for both engines;
  `require_admin` on every `/admin` route; secrets redacted in dry-run, logs and recipes; path joins through
  one `safe_join`.
- **A-6 Observability.** `logging.dictConfig`, request id on every log line, structured lifecycle events,
  Prometheus counters/histograms for model starts/failures/durations, engine `/metrics` scraped per model.
- **A-7 Frontend.** One reducer-backed form state driven by the engine spec; React Query hooks for every
  fetch; pure `validateFormValues`; dry-run on the live form in Add and Configure; error boundary; no
  `alert()`; typecheck in CI.
- **A-8 Version awareness.** Image pinned per release in one place; a per-engine capability probe
  (`llama-server --help`, `vllm serve --help` or `/version`) cached per image digest, used by the validator
  to warn about flags the image does not accept before starting.

---

## 4. Phased checklist

### Phase 0 — Containment: things that break starts or expose the box (≈ 1 week)
- [x] **P0-1 [S]** Remove D-1..D-5 from the vLLM builder; drop `swap_space_gb`, `gguf_weight_format`,
      `vllm_v1_enabled`, `cuda_graph_sizes` from spec/UI (or map `cuda_graph_sizes` to
      `--cudagraph-capture-sizes`). Files: `docker_manager.py:327-560`, `VLLMConfiguration.tsx`.
- [x] **P0-2 [S]** llama.cpp builder: `--draft` → `--spec-draft-n-max`; remove `--system-prompt-file` and
      `--defrag-thold`; fix `--lora`/`--lora-scaled` forms; emit `--load-mode` from mlock/no_mmap; force
      `--flash-attn on` when `cache_type_v` is quantized (or reject). Files: `docker_manager.py:561-803`.
- [x] **P0-3 [S]** Use the image entrypoint for vLLM (`vllm serve`), keep `entrypoint_override`; delete the dead
      version parser. `docker_manager.py:22-105`.
- [x] **P0-4 [S]** Pin `VLLM_IMAGE` and `LLAMACPP_IMAGE` to tested versions in one place (`config.py` ←
      compose ← `prepare-offline-deployment.sh`); document the tested pair in README.
- [x] **P0-5 [M]** Stop publishing engine ports on `0.0.0.0`; bind to `127.0.0.1`/compose network; pass
      `--api-key` to llama.cpp as well. `docker_manager.py:1043,1218`.
- [x] **P0-6 [S]** `GATEWAY_DEV_ALLOW_ALL_KEYS` default `False`; never bypass when a bearer token is present.
      `config.py:9`, `auth.py:20-45`.
- [x] **P0-7 [M]** Signed session cookie with expiry (itsdangerous/JWT), `secure` when behind TLS.
      `routes/authn.py`, `auth.py`.
- [x] **P0-8 [S]** Add `require_admin` to `routes/admin.py:379,613,623,635,645,730` and
      `/admin/models/hf-config` (`routes/models.py:763`).
- [x] **P0-9 [S]** Redact `--api-key` in dry-run/command preview and logs; stop returning `hf_token` in recipe
      responses. `config_validator.py:540`, `docker_manager.py:1232`, `routes/recipes.py`, `schemas/recipes.py`.
- [x] **P0-10 [S]** Enforce `FORBIDDEN_CUSTOM_ARGS`/`PROTECTED_ENV_VARS` on create/PATCH, not only in dry-run.
      `utils/custom_args_validator.py`, `routes/models.py`.
- [x] **P0-11 [S]** `safe_join` for `local_path`, `base`, `folder` in `docker_manager.py:849,902`,
      `routes/models.py:704-760`; reject absolute and `..`.
- [x] **P0-12 [S]** Fix `HTTPException(status_code=408, content=…)` and unbound `engine_type` in
      `routes/openai.py:507,569-578,644`; add a test.
- [x] **P0-13 [S]** vLLM GGUF: warn/refuse in the UI and validator unless the image is known to include the
      GGUF plugin; recommend llama.cpp (fixes the engine-guidance wiring, FE H1).

### Phase 1 — Stability: lifecycle, async, health (≈ 2 weeks)
- [x] **P1-1 [L]** `ModelSupervisor` (A-3): state enum, per-model lock, single `launch()`/`stop()`/`apply()`,
      startup reconciliation (containers ↔ DB ↔ registry), periodic reconcile.
- [x] **P1-2 [M]** Health poller and Docker healthcheck feed `running → failed`; readiness endpoint uses the
      same probe as launch; remove the three copies of the DNS-probe/URL heuristic (`routes/models.py:466`,
      `model_testing.py:205`, `:803`).
- [x] **P1-3 [M]** Move every remaining blocking call off the loop: `stop_container_for_model`, `tail_logs`,
      `urllib` readiness probes, `socket.gethostbyname`, `docker.from_env`, NVML, deployment export
      (`_export_images`, `_tar_directory`, `pg_dump`). Start/apply/export become jobs with progress.
- [x] **P1-4 [S]** `stop` must not write `stopped` when the daemon call failed; `delete` must persist the
      registry; gateway shutdown should not stop all models (make it a config flag, default off).
- [x] **P1-5 [S]** Unique index on `served_model_name`; state column constrained to the enum; log unhandled
      exceptions with request id (`main.py:103-107`).
- [x] **P1-6 [M]** Alembic: generate the initial migration from the current models, run `alembic upgrade head`
      in `entrypoint.sh`, keep `create_all` only when `ENV=dev` and the DB is empty.
- [x] **P1-7 [S]** `_handle_multipart_gguf_merge` and `_resolve_llamacpp_model_path` disagree on which shard
      set to load; keep one implementation keyed on the selected file's base name; never rewrite
      `local_path` behind the admin's back (`routes/models.py:269-339`, `docker_manager.py:905-924`).
- [x] **P1-8 [S]** Fix `_CB_STATE` shadowing (`routes/openai.py:17,32`), prune `HEALTH_STATE`, stop
      re-discovering default `VLLM_GEN_URLS=localhost` inside the container (`health.py:43-84`).
- [x] **P1-9 [S]** `model_testing.py:298-316`: don't send chat completions to embedding models; map failures to
      `failed`, not `loading`.
- [ ] **P1-10 [S]** Logging: `dictConfig`, replace `print()`, request-id filter, lifecycle metrics
      (`model_start_total{engine,result}`, `model_start_seconds`, `model_state{id}` gauge).

### Phase 2 — Configuration completeness and UX (≈ 2 weeks)
- [x] **P2-1 [L]** Engine spec + adapters (A-1). Migrate existing columns into the spec; generate schemas.
- [x] **P2-2 [M]** vLLM fields to add (from §2.1): `hf_overrides` (JSON), `tokenizer_mode`, `load_format`, `seed`,
      LoRA block, `speculative_config` (JSON), tool-call parser + auto tool choice, reasoning parser,
      structured-outputs backend, `chat_template`, `generation_config`/`override_generation_config`,
      multimodal limits, `kv_cache_memory_bytes`, `data_parallel_size`, `enable_expert_parallel`,
      `async_scheduling`, `compilation_config`. Replace the quantization/kv-cache/attention choice lists with
      the current ones.
- [x] **P2-3 [M]** llama.cpp fields to add: `load_mode`, `split_mode` (emit), `main_gpu`, `kv_unified` /
      `kv_unified_per_slot`, `fit` (+ target/ctx), `spec_type`, `spec_draft_n_min`, `spec_draft_ngl`,
      `reasoning_format`/`reasoning_budget`, `chat_template_kwargs`, `cache_reuse`, `context_shift`,
      `n_cpu_moe`, `override_tensor`, `mmproj` (multimodal), `pooling`/`rerank`, `n_predict`, `seed`,
      `threads_http`, `verbosity` level. Defaults: `-t auto`, `-ub 512`, `-np auto`; show per-slot context.
- [x] **P2-4 [M]** Custom args/env editor: duplicate-flag detection, collision warning against form-managed
      flags, forbidden list enforced client-side, boolean-false semantics defined (omit vs `--no-x`), quoting
      for list values, presets (Nemotron/FlashInfer cases from `NEMOTRON_3_SUPER_DEPLOYMENT.md`), and a
      "raw extra args" escape hatch shown verbatim in the summary.
- [x] **P2-5 [M]** Dry-run on the live form (`POST /admin/models/dry-run` with body) in Add and Configure;
      auto-run on the Summary step; errors block Start with an explicit override; show the exact command and
      env (secrets redacted).
- [x] **P2-6 [S]** Pure `validateFormValues()`: TP×PP vs GPUs, CPU mode, vLLM GGUF tokenizer, unselected GGUF
      file, multipart-with-vLLM, quantized V cache without FA, `-c` divisible by `-np`, custom-arg collisions.
- [x] **P2-7 [S]** Wire engine guidance props (FE H1); recipe prefill through `apiItemToFormValues` and clear
      prefill on close (FE H5); Configure mode exposes engine image/version, tokenizer, hf_config_path.
- [x] **P2-8 [S]** Replace range sliders that hide "unset" with number inputs + "(engine default)" marker;
      normalise select empty values; remove dead ternaries.
- [x] **P2-9 [S]** Replace `alert()` with inline errors and toasts; pending/disabled states on every async
      button (archive, delete, test); `(admin)/error.tsx`; list query surfaces errors instead of "Zero
      Active Deployments".
- [x] **P2-10 [S]** Logs viewer: tail/offset API (`?since=`), diagnosis re-runs on state change, "Retry" refetches;
      `DiagnosticBanner` uses the shared API client.
- [x] **P2-11 [S]** Summary step lists engine image, tokenizer, chosen GGUF file, custom args/env counts, PP/TP.
- [ ] **P2-12 [S]** Version-aware validation (A-8): capability probe per image digest; warn on unsupported flags
      before start.

### Phase 3 — Cleanup and refactor (≈ 1–2 weeks, overlaps with 2)
- [x] **P3-1 [M]** Split `ModelWorkflowForm.tsx` (515 lines) into shell + step components; split
      `VLLMConfiguration.tsx` (533) and `LlamaCppConfiguration.tsx` (352) by section; move the four GPU
      fetches into `useGpus()`; stable React Query keys for base-dir/folders/inspect/logs (FE H4).
- [x] **P3-2 [S]** Fix the 36 pre-existing `tsc` errors (InfoBox/SectionTitle variants, `Select size`,
      `Badge variant`, chart props, `copyIP`, PNG module declarations); add `npm run typecheck`.
- [x] **P3-3 [S]** Delete dead/duplicate code: vLLM version parser branches, `_BASE_DIR` global vs ConfigKV,
      `admin.py:543-590` registry re-implementation, third GPU-list parser in `config_validator.py`, hooks after
      early return in the two configuration components, static 130-line tokenizer table.
- [x] **P3-4 [S]** Consistent path contract: every file-type field is a path relative to the models dir and is
      mapped to `/models/…` in one place (`tokenizer`, `hf_config_path`, `draft_model_path` are currently raw).
- [x] **P3-5 [S]** Modal/Tooltip/Toast accessibility: focus trap, Escape, `role="dialog"`, keyboard-reachable
      tooltips, `aria-live` toasts; dynamic Tailwind classes replaced or safelisted.
- [x] **P3-6 [S]** Replace full-Prism syntax highlighter with `PrismLight` + registered languages; static
      `import` for images.
- [x] **P3-7 [S]** Pydantic v2 (`model_dump`, `field_validator`) and FastAPI lifespan instead of `on_event`.

### Phase 4 — Testing and CI (≈ 1 week, start in Phase 0)
- [x] **P4-1 [S]** Split test markers: `unit` (no Docker/DB), `integration` (live gateway), `live` (real
      engine); `pytest -m unit` runs in CI without services.
- [x] **P4-2 [M]** Unit tests per engine adapter generated from the spec: every field → expected flag/env,
      value forms, negation, custom-arg precedence, path mapping, forbidden args.
- [x] **P4-3 [M]** Supervisor tests with a fake Docker client: every transition, crash after running, restart
      reconcile, concurrent start/apply, stop failure.
- [x] **P4-4 [S]** Auth tests: cookie forgery rejected, dev bypass off, invalid token → 401, admin routes
      require admin; path traversal tests for `local_path`, `base`, `folder`.
- [x] **P4-5 [S]** Frontend: `validateFormValues`, submit path assembly, recipe prefill round trip,
      `OfflineModeFields` with a multipart fixture, `CustomArgsEditor` parse/serialise/dupes, list error state.
- [x] **P4-6 [M]** Live matrix (nightly, one GPU box): tiny GGUF under llama.cpp (exists:
      `test_live_llamacpp_inference.py`), tiny safetensors under vLLM (e.g. Qwen2.5-0.5B-Instruct), multipart
      GGUF, embeddings model, LoRA adapter, spec-decoding draft; run against the pinned images and against
      `latest` to catch drift early.
- [x] **P4-7 [M]** Stability tests: `run_stress_test.sh` wired to a pytest that asserts p95 latency and zero
      5xx under N concurrent streams; chaos cases (kill the engine container, restart the gateway, fill the
      disk, revoke the GPU) with expected end states.
- [x] **P4-8 [S]** GitHub Actions: backend unit tests, `ruff`, frontend `typecheck` + `vitest` + `next build`
      on every PR; nightly live matrix.

### Phase 5 — Operations, deployment and docs (≈ 1 week; P5-1/P5-2 belong in Phase 0)
- [x] **P5-1 [S] (do now)** Revoke the API key committed in `debug_api.py:12-14`, delete the file, purge it from
      history; untrack `backend/.env.dev` and `backend/.env.prod` (they also embed an internal IP); keep only
      `.env.example`. Remove the 90 MB of unreferenced `lib/*.so`.
- [x] **P5-2 [M] (do now)** Make `docker.compose.prod.yaml` deployable: add the frontend (a real `next build`
      image; the current Dockerfile only runs `npm run dev`), Prometheus, admin bootstrap vars, `:rw` models
      mount, `${INTERNAL_VLLM_API_KEY:?}` required-var syntax, real image names; delete or fix `backend/.env.prod`
      (its `db`/`redis` hosts never resolve under host networking). Prefer one compose file plus a prod overlay.
- [x] **P5-3 [S]** `restart: unless-stopped` for infra services, gateway healthcheck on `/health`,
      `depends_on: condition: service_healthy`, memory/pids limits, non-root gateway user; document reboot
      recovery (today nothing comes back: `restart_policy: no` on model containers, no reconciliation).
- [x] **P5-4 [S]** One `versions.env` consumed by compose, `config.py` and `prepare-offline-deployment.sh`; pin
      `vllm/vllm-openai`, `llama.cpp:server-cuda-bNNNN`, prometheus, node-exporter, dcgm, cadvisor (offline script
      saves `v2.47.0`-era tags while compose uses `:latest`, so `make up` pulls and fails offline).
- [x] **P5-5 [M]** Offline package must ship the built gateway/frontend images (or a wheelhouse); `make build`
      uses `--pull` and the Dockerfile installs from PyPI; `setup-docker-firewall.sh`/`test-external-access.sh`
      pull `curlimages/curl:latest`. Extend `check_image_availability()` to per-model `engine_image`.
- [x] **P5-6 [S]** Fix monitoring wiring: `infra/prometheus/prometheus.yml` scrapes static `vllm-gen`/`vllm-emb`
      (never exist) and cadvisor on the wrong port; node-exporter publishes no port but `make health` curls
      `:9100`; profiles mislabeled in `Makefile:107`; gateway needs the NVIDIA runtime for NVML or documented
      degradation; dynamic per-model scrape via container labels / file_sd.
- [x] **P5-7 [S]** Fix `make prod-check` (`Makefile:472-478`, greps the dev file and always passes),
      `make connect-network` (script missing), `validate-config.sh:89-99` (always warns under host network),
      port/env drift (`.env.linux` `PROM_PORT=9094` unused; root `.env.example` Windows-only; `config.py` DB
      default vs runtime port).
- [x] **P5-8 [S]** Collapse the three IP-detection implementations (`detect-ip.sh`, `Makefile:36`,
      `entrypoint.sh:10-31`) into one; make standalone `docker compose up` actually work as README claims.
- [x] **P5-9 [S]** CI (see P4-8) plus `mkdocs build --strict`; wire `scripts/smoke.sh` as a post-deploy check
      using a real key instead of `Bearer dev-any`; delete or wire the orphaned test scripts
      (`run_stress_test.sh` → gitignored file, `test-makefile.sh`, `test-offline-models.sh`, `test_gguf_gaps.sh`).
- [x] **P5-10 [S]** Backups: scheduled `pg_dump` + Redis + export dir; fix `backup-restore.md` endpoint names and
      dump filename.
- [x] **P5-11 [M]** Docs: correct every flag/default in `docs/models/llamaCPP.md` and `vllm.md` (generate the
      tables from the engine spec), `setting-custom-env-vars.md` (protected list claim), `security.md` /
      `threat-model.md` (claims about hashed `ctx_` keys, HSTS, unexposed ports are false), `admin-api.md`
      (wrong keys/endpoints); collapse the seven quick-start/IP/CORS duplicates and four prod checklists into
      one quick-start, one ops handbook, one security page; add runbooks (stuck `loading`, OOM/KV sizing,
      driver/CUDA mismatch → pin `engine_image`, port conflicts, log locations, reboot recovery, disk full);
      document `engine_image`/`engine_version`; move `NEMOTRON_3_SUPER_DEPLOYMENT.md` under `docs/models/` and
      turn its driver→image selection into a product feature; add missing pages to `mkdocs.yml` nav; decide
      whether the 7.8k-line in-app guide or the docs site is canonical.
- [x] **P5-12 [S]** Housekeeping: `node:18-alpine` (EOL) → 22; Prometheus retention and log rotation documented;
      TLS reverse-proxy reference (Caddy/nginx) shipped.

---

## 5. Backend findings (detail)

Severity: C critical, H high, M medium, L low. Locations are `file:line` as of 2026-09-01.

### 5.1 Correctness of engine command/env construction
- **B-1 (H)** `docker_manager.py:736-760` LoRA flags in the wrong form (comma lists / `path:scale`); llama-server
  expects repeated `--lora FNAME` and `--lora-scaled FNAME SCALE`. Any LoRA config fails to start.
- **B-2 (H)** `docker_manager.py:789-803` system prompt file written under `CORTEX_MODELS_DIR_HOST` from inside
  the gateway container (host path does not exist there), into a read-only mount, then passed as
  `--system-prompt-file`, which llama-server does not accept.
- **B-3 (H)** `docker_manager.py:605-606,619-620,665-666` + `config.py:92-93`: default `--cache-type-v q8_0`
  with flash attention optional; quantized V requires FA.
- **B-4 (H)** `docker_manager.py:905-924` for a `.gguf` path the resolver picks the alphabetically-first
  `*-00001-of-*` in the folder, ignoring the selected quantization set.
- **B-5 (M)** `docker_manager.py:401-436` custom-arg override only implemented for `--max-model-len`; other
  duplicates rely on argparse last-wins; store-true flags cannot be negated; negative numbers are treated as
  flags (`:416-419`).
- **B-6 (M)** Two path contracts: `tokenizer`, `hf_config_path`, `draft_model_path` are passed raw while
  `chat_template_file`, `grammar_file`, LoRA paths get `/models/` prefixed.
- **B-7 (M)** `docker_manager.py:608,654` `-c` is total context shared across `--parallel` slots (defaults
  16384/16 → 1024 tokens per request) but the UI presents it as per-request.
- **B-8 (L)** `docker_manager.py:597-604` `or` defaults swallow explicit `0` for threads/batch/context/slots.
- **B-9 (L)** `no_mmap`, `split_mode`, `device` (vLLM `--device`) stored/exposed but never emitted;
  `engine_version`/`engine_digest` never written.
- **B-10 (L)** `docker_manager.py:1045-1046` `shm_size` ignored when `ipc_mode=host`; `runtime="nvidia"` only
  set for llama.cpp (`:1054`).
- **B-11 (L)** `docker_manager.py:1151,1173` `VLLM_USE_V1` and `VLLM_ENGINE_ITERATION_TIMEOUT_S` are V0-era.
- **B-12 (L)** `docker_manager.py:43-119` version parser: every branch returns the same entrypoint; `latest`
  logs a warning on each start.
- See also drift table D-1..D-21.

### 5.2 Blocking calls on the event loop
- **B-13 (H)** `routes/models.py:426-445,469,539,575,621,874`, `delete:243`, `main.py:285`:
  `urllib.request.urlopen` (5 s × 15), `socket.gethostbyname`, `docker.from_env()`, `container.stop(timeout)`,
  `c.logs()` run inline. One `/start` can stall the worker ~75 s; every `/stop` freezes traffic ≥ 5 s.
  (`start_container_for_model` itself was moved to a thread today.)
- **B-14 (H)** `services/deployment_manager.py:1256-1334` sync `images.pull`/`img.save`, tar of the whole
  models dir and `pg_dump` streaming inside `asyncio.create_task` → gateway frozen for the export duration.
- **B-15 (M)** `routes/admin.py:783-855` sync Docker calls; `:163-316` sync NVML (5 s cache).

### 5.3 State machine and sources of truth
- **B-16 (H)** `docker_manager.py:1284-1296` `stop_container_for_model` swallows every error; `routes/models.py:542`
  then writes `stopped` → daemon down = DB says stopped, container still serving.
- **B-17 (H)** `health.py` never updates `Model.state`; the Docker HEALTHCHECK (`:1015,:1202`) is never read;
  readiness for `state == running` (`:910-916`) just proxies → a crashed model stays RUNNING while
  `/v1/models/status` says down.
- **B-18 (H)** `main.py:268-295` stops **all** models on every gateway shutdown; nothing reconciles on startup
  after a crash (DB `running/loading`, registry restored from ConfigKV with stale URLs).
- **B-19 (H)** `routes/models.py:247-249` delete unregisters but never persists the registry → stale route
  resurrects on restart.
- **B-20 (H)** No per-model lock: concurrent `/start`, or `/start` + `/apply`, remove each other's container by
  name → spurious `failed`.
- **B-21 (M)** `routes/models.py:461` registration skipped when `host_port == 0`; `:466-476`,
  `model_testing.py:205-213,803-809` `127.0.0.1:<host_port>` is the *gateway container's* loopback and only
  correct under host networking; three copies of the heuristic.
- **B-22 (M)** `routes/models.py:269-339` `_handle_multipart_gguf_merge` duplicates `docker_manager.py:910-923`
  with different rules and persists the rewritten `local_path` (`:368`).
- **B-23 (M)** `routes/openai.py:17` vs `:32` `_CB_STATE` imported then shadowed → circuit breaker nobody
  reads; `health.py:43-84` rediscovers every upstream every 60 s including the default
  `VLLM_GEN_URLS=http://localhost:8001` which is nothing inside the container; `HEALTH_STATE`/`HEALTH_META`
  never pruned; `state.py:40` discovery heuristic prevents changing `engine_type` for a reused served name.
- **B-24 (M)** `routes/openai.py:345-357` per-model timeouts are read from `request_defaults_json` but stored in
  separate columns → dead; if an admin adds them to custom JSON they are forwarded to the engine.
- **B-25 (M)** `model_testing.py:298-316` fallback sends a chat completion to embedding models → mapped to
  `loading` forever; `:219` magic `"dev-internal-token"`.

### 5.4 Security
- **B-26 (C)** `routes/authn.py:32-39`, `auth.py:75-89` session cookie = bare username, unsigned, `secure=False`.
- **B-27 (C)** `docker_manager.py:1043,1218` engine ports published on `0.0.0.0`; llama.cpp gets no `--api-key`;
  vLLM's `INTERNAL_VLLM_API_KEY` defaults to empty. LAN clients bypass gateway auth, quotas and usage.
- **B-28 (H)** `config.py:9`, `auth.py:20-45` dev key bypass on by default; an invalid token silently bypasses.
- **B-29 (H)** Secrets: `--api-key <secret>` printed to stdout on every start (`docker_manager.py:1232`) and
  returned by `/dry-run`; recipes copy and return `hf_token` (`routes/recipes.py:190,273,374,562`).
- **B-30 (H)** `utils/custom_args_validator.py:152-188` forbidden args / protected env only enforced in dry-run.
- **B-31 (M)** Path traversal: `docker_manager.py:849,902` (`local_path`), `routes/models.py:704-760`
  (`base`, `folder` enumerate the gateway filesystem); `deployment_manager.py:699` bypasses `_safe_join`.
- **B-32 (M)** `routes/admin.py:379,613,623,635,645,730` and `routes/models.py:763-770` (`/hf-config`, forwards
  the HF token) lack `require_admin`.
- **B-33 (M)** `main.py:46-53` `*` in CORS with credentials (mitigated today by echoing the origin, but the
  policy is still "any origin with credentials"); `entrypoint.sh` injects detected IPs into CORS.

### 5.5 Schema and data
- **B-34 (H)** `main.py:176-180` `create_all` with swallowed exception; `backend/alembic/versions` absent →
  columns added since first install are missing on upgraded sites; every `select(Model)` 500s unlogged.
- **B-35 (M)** `models.py:69` no unique index on `served_model_name`; `:182` free-form `state`
  (`starting` unreachable at `routes/models.py:618`); `:98` plaintext `hf_token`; six JSON-in-Text columns;
  `Usage.model_name`/`created_at` unindexed.
- **B-36 (M)** `Recipe` (`models.py:189-280`) hand-mirrors ~70 columns and is already missing
  `startup_timeout_sec`, `draft_*`, `chat_template*`, `lora*`, `cont_batching`, `system_prompt`;
  `routes/recipes.py:467-523` copies an even smaller subset (no `attention_backend`, `request_defaults_json`,
  `engine_startup_*_json`, `engine_image`) → recipes silently lose config.
- **B-37 (L)** `deployment_manager.py:792` `Model(**new_vals)` with foreign manifest keys → TypeError 500.

### 5.6 Code quality and observability
- **B-38 (M)** `_build_command` / `_build_llamacpp_command` are 230/240 lines with ~30 `try/except: pass`
  around attribute reads that cannot raise; `_launch_model` is 170 lines and blocks the request up to ~40 s.
- **B-39 (M)** `main.py:103-107` unhandled exceptions returned without logging; request id never bound to log
  records; `print()` throughout `docker_manager.py`; no logging configuration, so `logger.info` is invisible.
- **B-40 (L)** `services/config_validator.py:47-135` VRAM heuristic by name substring (`"7b"` matches `17b`);
  `:308-315,:521-527` third GPU-list parser; `from ..main import SessionLocal` circular pattern in six modules.
- **B-41 (L)** `routes/models.py:588` `"failed" in logs.lower()` triggers diagnosis on normal logs;
  `docker_manager.py:131-143` Docker Hub TCP probe result cached process-wide forever.

---

## 6. Frontend findings (detail)

### 6.1 High
- **F-1** Smart engine guidance is dead: `ModelWorkflowForm.tsx:291-297` never passes `engineRecommendation`;
  `:366-394` never passes `engineType`/`onSwitchEngine` to `OfflineModeFields`, so `EngineGuidance` never
  renders (multipart-GGUF-with-vLLM warning, "switch to llama.cpp", badges).
- **F-2** Dry-run validates the persisted row, not the form (`ModelWorkflowForm.tsx:98-104`); disabled in Add
  mode (`:496`); `page.tsx:242-272` starts anyway on `severity: error` with an info toast.
- **F-3** No pre-submit invariants beyond "≥ 1 GPU or CPU": vLLM GGUF with blank tokenizer
  (`OfflineModeFields.tsx:685-702`), `tp × pp ≠ GPUs` via calculator/recipe prefill
  (`ResourceCalculatorModal.tsx:110-121` sets `tp_size` but not `selected_gpus`), GGUF chosen but
  `selectedGguf === ''` leaves `local_path` as the folder (`OfflineModeFields.tsx:659`), vLLM + multipart group
  selectable (`GGUFGroupSelector.tsx:282`).
- **F-4** Effect-dependency churn: `page.tsx:437-439,469-471,485` new arrow props each render →
  `ModelWorkflowForm.tsx:106-118` refetches base-dir/GPUs every parent render, `refreshFolders` re-lists
  folders every poll tick, `LogsViewer.tsx:41-78` restarts its interval on every render.
- **F-5** Recipe prefill bypasses `apiItemToFormValues` (`page.tsx:500`): `mode` not derived (offline llama.cpp
  opens as online), `request_defaults_json` not split, recipe metadata leaks into the POST body; `prefill`
  never cleared so the next Add reuses it.
- **F-6** `JSON.parse(engine_startup_args_json)` on every render with no try/catch
  (`ModelWorkflowForm.tsx:424-425`) and no error boundary → white screen on a bad stored value.
- **F-7** Hard-coded `http://192.168.1.50:8084` (`page.tsx:288`).
- **F-8** List query swallows every error (`page.tsx:79`) → "Zero Active Deployments" on 5xx/auth/schema drift.

### 6.2 Medium / Low
- `page.tsx`: apply two-phase error message wrong (`:209-226`); archive/delete without `onError` or pending
  state (`:201-208`); readiness N+1 (`:45-88`); `setTestingId` in `mutationFn` and reset before the modal reads it
  (`:228-239,:494`); rows typed `any`; no `aria-label`s; copy button invisible until hover; no `down` badge.
- `ModelWorkflowForm.tsx`: Configure mode hides engine image/version, tokenizer, hf_config_path (`:38-43`);
  GGUF path assembly runs for both engines and always sets `hf_config_path` for vLLM GGUF (`:181-190`); whole
  workflow re-renders per keystroke (`:156`); `alert()` (`:194,:266`); dynamic Tailwind class names not safelisted
  (`:247`, `GGUFGroupSelector.tsx:288`); GPU count fetched in four places; Summary omits engine image, custom
  args/env, tokenizer, GGUF file, PP.
- `VLLMConfiguration.tsx` / `LlamaCppConfiguration.tsx`: hooks after early return (`:19/:22`, `:20/:23`); range
  sliders display defaults that are not sent (`:79,96,380,455,365`) so "engine default" is indistinguishable
  from 0.9; dead ternary (`:96,100`); selects commit `null` vs `''` inconsistently (`:146,207,223`); `tp_size`
  invisible; llama.cpp `tensor_split` regenerated on every toggle discarding manual splits (`:165-170`);
  `split_mode`, `rope_*`, `startup_timeout_sec`, `chat_template*`, `lora_*`, `grammar_file`, `system_prompt`,
  `cont_batching` have no UI.
- `CustomArgsEditor.tsx`: no duplicate-flag detection, forbidden list not enforced client-side (`:313`), no
  collision warning with form-managed flags, no presets, `flag` type stores `value:false` (`:73-74`),
  boolean-false ambiguous, comma split without quoting, five `alert()`s, index keys.
- `OfflineModeFields.tsx`: `alert()` for copy (`:503-506`); 130-line static tokenizer table (`:14-145`);
  inspect types redeclared in four files.
- `LogsViewer.tsx` / `DiagnosticBanner.tsx`: raw `fetch` to `http://${hostname}:8084` bypassing the API client
  (`:40-43`), `modelState` prop unused; full-log refetch every 2 s with a 2 MB cap; "Retry" does not refetch (`:285`).
- `validators.ts`: `.or(z.string())` defeats the enums; strip mode (parity test now guards it).
- Providers/UI: toast timers not cleared, no `aria-live`; `Modal` without focus trap/Escape/`role="dialog"`;
  `Tooltip` hover-only; `UserProvider` defaults role to admin from localStorage (UI gating only);
  `require('…PNG')`; full Prism bundle in chat.
- Guide accuracy: `SpeculativeDecodingExplainer.tsx:203` wrong step; `AddingModels.tsx:277` "Save & Scan";
  `:318-327` wrong step number; `ModelOperations.tsx:88` "requires restart" stale.
- `tsc` (36 errors, none in the model form path): 17 `InfoBox`/`SectionTitle` variant values not in the union
  across guide files; 11 `Select size` → `selectSize` (`keys`, `usage`, `users` pages); 2 PNG module
  declarations (`WelcomeToCortex.tsx:8`, `chat/MessageList.tsx:12`); 1 `Badge variant` (`system/page.tsx:256`);
  1 chart props (`usage/page.tsx:181`); 2 undefined `copyIP` (`HostIpDisplay.tsx:139,160`).

---

## 7. Configuration model: what admins need to be able to express

A checklist of capabilities the form must cover for each engine, independent of how it is rendered.

- [x] **C-1** Source: HF repo (+token, revision), local folder (safetensors), local GGUF (single or sharded,
      with quant-set selection), tokenizer source for GGUF-under-vLLM, multimodal projector (`--mmproj`).
- [x] **C-2** Placement: GPU set, tensor/pipeline/data/expert parallel (vLLM), `-ngl`/`--tensor-split`/
      `--split-mode`/`--main-gpu`/`--device` (llama.cpp), CPU-only, CPU MoE offload, `--fit`.
- [x] **C-3** Memory: GPU memory utilization or `kv_cache_memory_bytes`, KV cache dtype, context length (and
      per-slot semantics), block size, CPU offload, load mode (mmap/mlock/dio), unified KV.
- [x] **C-4** Throughput: max seqs / slots, batched tokens / `-b -ub`, chunked prefill, prefix caching /
      cache reuse, CUDA graph / compilation config, async scheduling, threads.
- [x] **C-5** Model behaviour: chat template (+kwargs, jinja), reasoning parser/format/budget, tool-call parser,
      structured outputs backend, generation-config source, `hf_overrides`, RoPE, `trust_remote_code`, seed.
- [x] **C-6** Adapters and acceleration: LoRA (static and runtime), speculative decoding (method, draft model,
      draft tokens, spec type), quantization (with valid lists per engine).
- [x] **C-7** Serving: served name/aliases, embeddings/pooling/rerank mode, request timeout, metrics/slots
      endpoints, log level/format, warmup, tensor checks, API key injection.
- [x] **C-8** Escape hatches: raw extra args (ordered, shown in the command preview), env vars (with protected
      list), entrypoint override, image override; all validated against the image's capability probe.
- [x] **C-9** Request defaults (Plane C): sampling knobs + custom JSON, with an explicit precedence statement
      versus the model's `generation_config.json` (vLLM) and server-wide `--temp` etc. (llama.cpp).

---

## 8. Operations, deployment and documentation (detail)

### Critical
- **O-1** `docker.compose.prod.yaml` is not deployable: no frontend, no Prometheus (`PROMETHEUS_URL` default
  unresolvable), empty `INTERNAL_VLLM_API_KEY` placeholder, `your-registry/cortex-gateway:latest`, no admin
  bootstrap, models mounted `:ro` (breaks the multipart handling dev enables); `backend/.env.prod` hosts
  `db`/`redis` never resolve under `network_mode: host`. `deployments.md:47` and `admin-setup.md:375` tell users
  `make up ENV=prod` works.
- **O-2** A live-looking API key and an internal IP are committed in `debug_api.py:12-14`; `backend/.env.dev`
  and `.env.prod` are tracked (`.gitignore` only excludes `.env`/`.env*.local`). Verified in `git ls-files`.
- **O-3** No migration path: `create_all` inside `try/except: pass` (`main.py:175-181`), `backend/alembic/`
  has `env.py` but no `versions/`, `alembic.ini` only works from repo root, `upgrade-notes.md` tells users to
  run `alembic upgrade` against nothing.
- **O-4** Air-gapped deployment cannot complete as documented: `prepare-offline-deployment.sh:68-84` saves
  pinned monitoring images while both compose files use `:latest`; the built gateway/frontend images are never
  saved; `backend/Dockerfile` installs from PyPI and `make build` uses `--pull`; helper scripts pull
  `curlimages/curl:latest`; `offline-deployment.md:251` says run `make quick-start` offline.

### High
- **O-5** Gateway runs as root with the Docker socket on the host network, no healthcheck, no `restart:`
  policy anywhere, no resource limits; model containers use `restart_policy: no`
  (`docker_manager.py:1042,1245`) and nothing reconciles after a reboot.
- **O-6** Auth posture (see B-26..B-33): plaintext cookie, dev bypass default on, `admin/admin` and pgadmin
  `admin@example.com/admin` bound to all interfaces, engines published on `0.0.0.0`, no TLS story;
  `security.md:11-12,91,197` and `threat-model.md:44-51,84-86` describe SHA-256 `ctx_` keys, HSTS and
  unexposed internal ports that do not exist.
- **O-7** Zero CI gates: only `docs.yml` and `update-year.yml`; `lint` is an echo; `next build` never runs so
  type errors never surface; backend tests are mostly live-gateway e2e with no unit marker.
- **O-8** `make prod-check` (`Makefile:472-478`) greps the dev compose file with a bare-name key check that
  always passes, and is cited as the production gate in four docs.
- **O-9** Per-model `engine_image` escapes the offline pre-check (`check_image_availability()` only inspects the
  global image, `docker_manager.py:297-307`); `engine_image`/`engine_version`/`engine_digest` are undocumented
  though `NEMOTRON_3_SUPER_DEPLOYMENT.md` depends on them; no digest verification.

### Medium
- **O-10** Monitoring wiring: `prometheus.yml` scrapes static `vllm-gen:8000`/`vllm-emb:8000` (never exist) and
  `cadvisor:8084` (listens on 8080; compose maps `8085:8084`); node-exporter publishes no port but `make health`
  curls `:9100`; cadvisor profile mislabeled (`Makefile:107`); gateway lacks the NVIDIA runtime so NVML fails.
- **O-11** Port/env drift: `.env.linux` `PROM_PORT=9094` unused; `make health` hardcodes 9090; root
  `.env.example` is Windows-only; `config.py` DB default `postgres:5432` vs runtime `127.0.0.1:15432`;
  `VLLM_GEN_URLS=http://vllm-gen:8000` dead static upstreams.
- **O-12** IP detection triplicated (`detect-ip.sh`, `Makefile:36`, `entrypoint.sh:10-31` whose `/host-proc`
  fallback is wrong); HOST_IP/profiles only work via `make`.
- **O-13** `make connect-network` calls a nonexistent script; `lib/*.so` (90 MB, unreferenced) committed.
- **O-14** Testing tooling orphaned: `run_stress_test.sh` targets a gitignored file; `smoke.sh` uses `Bearer
  dev-any` and hardcoded model names; `TESTING_OFFLINE_MODELS.md:190` shows a CI job that does not exist;
  `test-makefile.sh`, `test-offline-models.sh`, `test_offline_models.py`, `test_gguf_gaps.sh` wired to nothing;
  `validate-config.sh:89-99` always warns under host networking.
- **O-15** Backups: unscheduled `pg_dump` only; `backup-restore.md` documents a wrong endpoint and dump filename.
- **O-16** Docs contradict code: `llamaCPP.md` defaults wrong on nearly every flag and names a non-existent
  image; `vllm.md:366` `--task embed`, `:209` "uses `vllm serve`", `:116` a TP slider that does not exist;
  `setting-custom-env-vars.md:125` claims a protected-variable list that is not enforced; `chat-playground.md`
  poll interval; `admin-api.md` wrong keys/endpoints.
- **O-17** `NEMOTRON_3_SUPER_DEPLOYMENT.md` prescribes a hand-built FIPS image, driver-gated tag selection and
  manual pulls; the product supports it only through `engine_image` + custom args, with no image-build step,
  no driver→image check, and the guide lives outside mkdocs.

### Low
- `:latest` engine tags in `config.py:70`, both composes and `versions.env`; `server-cuda` floats daily.
- `node:18-alpine` (EOL); pinned `prometheus:v2.47.0` (2023) in the offline package.
- Prometheus retention 7 d undocumented; no gateway log rotation.
- `mkdocs.yml` nav omits `TESTING_OFFLINE_MODELS.md`, `models/setting-custom-env-vars.md`, `analysis/`,
  `bug/`; broken links in `offline-deployment.md:1301`, `admin-setup.md:855`.
- Heavy duplication: quick-start/IP/CORS in seven docs, firewall in five, backup in four, four divergent prod
  checklists, three inconsistent quantization tables; the in-app guide (≈ 7.8k lines, 19 sections)
  duplicates the docs site.

---

## 9. Test and stability plan

| Layer | What | How | Gate |
|-------|------|-----|------|
| Unit (no services) | engine adapters (every spec field → flag/env, value forms, negation, custom precedence, paths, forbidden args), request-defaults merge, schema parity, supervisor transitions with a fake Docker client, auth (cookie forgery, bypass, admin dependency), path traversal, openai error paths | `pytest -m unit` | every PR |
| Frontend unit | `validateFormValues`, submit path assembly, prefill round trip, NumberField, CustomArgsEditor, list error state, multipart guidance render | `vitest run` + `tsc --noEmit` | every PR |
| Integration | CRUD + start/stop/archive/delete against a live gateway (`test_model_crud_api.py`), export/import | `pytest -m integration` against the dev stack | every PR (compose in CI) |
| Live matrix | tiny GGUF/llama.cpp, tiny safetensors/vLLM, multipart GGUF, embeddings, LoRA, speculative draft; pinned images and `latest` | `pytest -m live` on a GPU runner | nightly |
| Stability | N concurrent streaming clients for T minutes: p95 latency, zero 5xx, memory flat (`run_stress_test.sh` → pytest asserts) | GPU runner | nightly |
| Chaos | kill engine container → state `failed` within one poll; restart gateway → states reconciled, routes intact; disk full on export → job fails cleanly; GPU busy → dry-run warns and start fails with an actionable message | GPU runner | weekly |

Done-when for the whole effort: every P0/P1 box ticked, the live matrix green on the pinned image pair, and
the drift table empty.

---

## Appendix A — vLLM flag inventory (Cortex → engine)

| Cortex field | Emitted | Status (v0.28) | Action |
|--------------|---------|----------------|--------|
| repo_id / local_path | `--model` | ok | map local → `/models/…` in one place |
| tokenizer, hf_config_path (GGUF) | `--tokenizer`, `--hf-config-path` | ok, but GGUF needs plugin | see D-7 |
| served_model_name | `--served-model-name` | ok | |
| task=embed | `--runner pooling` | ok (`--task` removed) | add `--convert` |
| dtype | `--dtype` | ok | |
| tp_size / pipeline_parallel_size | `--tensor-parallel-size`, `--pipeline-parallel-size` | ok | add data/expert parallel |
| gpu_memory_utilization | `--gpu-memory-utilization` | ok (default 0.92) | add `--kv-cache-memory-bytes` |
| max_model_len | `--max-model-len` | ok | support `auto` |
| max_num_batched_tokens, max_num_seqs | same names | ok | defaults 2048/128 |
| kv_cache_dtype | `--kv-cache-dtype` | ok; UI list incomplete | extend list |
| quantization | `--quantization` | UI `int8` invalid | replace list |
| block_size | `--block-size` | ok (any int) | |
| swap_space_gb | `--swap-space` | **removed** | drop |
| enforce_eager | `--enforce-eager` | ok; means no compile/graphs | default off |
| trust_remote_code | `--trust-remote-code` | ok | |
| cpu_offload_gb | `--cpu-offload-gb` | ok | |
| enable_prefix_caching | `--[no-]enable-prefix-caching` | ok (default on) | |
| prefix_caching_hash_algo | `--prefix-caching-hash-algo` | ok | |
| enable_chunked_prefill | `--enable-chunked-prefill` | ok (default on; cannot negate) | add `--no-` form |
| cuda_graph_sizes | `--cuda-graph-sizes` | **removed** | `--cudagraph-capture-sizes` |
| attention_backend | `--attention-backend` | ok; UI list has V0 names | refresh list |
| gguf_weight_format | `--gguf-weight-format` | **never existed** | drop |
| disable_log_requests | `--disable-log-requests` | **removed v0.19** | `--enable-log-requests` |
| disable_log_stats | `--disable-log-stats` | ok | |
| max_log_len | `--max-log-len` | ok | |
| vllm_v1_enabled | env `VLLM_USE_V1` | **removed** | drop |
| debug_logging / trace_mode | env `VLLM_LOGGING_LEVEL`, `VLLM_TRACE_FUNCTION` | ok | |
| engine_request_timeout | env `VLLM_ENGINE_ITERATION_TIMEOUT_S` | ok (default 60) | relabel |
| entrypoint_override | container command prefix | keep | default to image entrypoint |
| device, split_mode, no_mmap, engine_version, engine_digest | — | never emitted | drop or implement |
| (missing) | `--hf-overrides`, `--tokenizer-mode`, `--load-format`, `--seed`, LoRA, `--speculative-config`, tool/reasoning parsers, structured outputs, `--chat-template`, generation config, multimodal, `--data-parallel-size`, `--enable-expert-parallel`, `--async-scheduling`, `--compilation-config`, `--enable-sleep-mode` | | P2-2 |

## Appendix B — llama.cpp flag inventory (Cortex → engine)

| Cortex field | Emitted | Status (b10731) | Action |
|--------------|---------|-----------------|--------|
| local_path | `-m /models/…` | ok; sharded auto-loads from part 1 | keep one resolver |
| context_size | `-c` | ok; total across slots | explain / `--kv-unified` |
| ngl | `-ngl` | ok (`auto`/`all` also valid) | default auto |
| batch_size, ubatch_size | `-b`, `-ub` | ok; Cortex `-ub 2048` vs upstream 512 | default 512 |
| threads | `-t` | ok; Cortex 32 vs auto | default auto |
| parallel_slots | `--parallel` | ok; upstream default auto | default auto |
| tensor_split | `--tensor-split` | ok | |
| split_mode | — | never emitted | emit `-sm` |
| flash_attention | `--flash-attn on|off` | ok | add `auto`; force on with quantized V |
| mlock / no_mmap | `--mlock` / — | deprecated → `--load-mode` | one select |
| numa_policy | `--numa` | ok | |
| rope_freq_base/scale | `--rope-freq-*` | ok | |
| cache_type_k/v | `--cache-type-k/v` | ok; V quant needs FA | validate; extend list |
| draft_model_path | `--model-draft` | ok | path mapping |
| draft_n | `--draft` | **removed** | `--spec-draft-n-max` |
| draft_p_min | `--draft-p-min` | ok (alias) | |
| (missing) | `--spec-type`, `--spec-draft-n-min`, `-ngld`, `-ctkd/-ctvd` | | P2-3 |
| startup/timeout | `--timeout` | ok | |
| cont_batching | `--cont-batching` | ok (default) | emit only `--no-cont-batching` |
| metrics/slots | `--metrics`, `--slots` | ok | |
| verbose_logging | `--log-verbose`/`--verbose` | check exact flag per build | use `-lv N` |
| check_tensors, skip_warmup | `--check-tensors`, `--no-warmup` | ok | |
| jinja_enabled, chat_template, chat_template_file | `--jinja`, `--chat-template`, `--chat-template-file` | ok | add `--chat-template-kwargs`, `--reasoning-format` |
| defrag_thold | `--defrag-thold` | no-op | drop |
| lora_adapters_json, lora_init_without_apply | `--lora …`, `--lora-scaled …` | **wrong form** | repeated flags |
| grammar_file | `--grammar-file` | ok | add `--json-schema` |
| enable_embeddings | `--embeddings` | ok | add `--pooling`, `--rerank` |
| system_prompt | `--system-prompt-file` | **not a server arg** | remove |
| served_model_name | `--alias` | ok | |
| (security) | no `--api-key` | supported | emit internal key |
| (missing) | `--load-mode`, `--main-gpu`, `--device`, `--fit*`, `--kv-unified*`, `--cache-reuse`, `--context-shift`, `--n-cpu-moe`, `--override-tensor`, `--mmproj`, `--n-predict`, `--seed`, `--threads-http`, `--reasoning-budget` | | P2-3 |

## Appendix C — Health and readiness semantics to encode in the adapters

| | vLLM | llama.cpp |
|--|------|-----------|
| during load | `/health` connection refused (server not up) | `/health` 503 `Loading model` |
| ready | `/health` 200 | `/health` 200 `{"status":"ok"}` |
| engine dead | `/health` 503 | process exits |
| models | `/v1/models` | `/v1/models` (`owned_by: llamacpp`) |
| metrics | `/metrics` (`vllm:*`) | `/metrics` with `--metrics` (`llamacpp:*`) |
| slots | — | `/slots` (`?fail_on_no_slot=1`) |
| request names | OpenAI | `n_predict`, `repeat_penalty`, `min_p`, `chat_template_kwargs` |

---

## 10. Progress log

### 2026-09-02 — backend core replaced (Phases 0/1 and backend parts of 2/3/4)
- `backend/src/engines/spec.py` is the single source of truth (112 fields); ORM columns, pydantic schemas,
  builders, validation and `GET /admin/engines/spec` derive from it. `test_model_schema_parity` enforces
  ORM ↔ spec ↔ API ↔ frontend zod.
- Adapters (`engines/vllm.py`, `engines/llamacpp.py`) replace the two hand-written builders. Verified flags:
  llama.cpp `--flash-attn on|off|auto`, `--load-mode`, `--spec-draft-n-max/-min`, `--spec-type`, repeated
  `--lora`/`--lora-scaled F S`, `--ctx-size`, `--n-gpu-layers`, `--api-key`; vLLM `--cudagraph-capture-sizes`,
  `--enable-log-requests`, `--hf-overrides`, `--speculative-config`, `--lora-modules name=path`, `--api-key`,
  image entrypoint (`vllm serve`). Obsolete flags are gone (D-1..D-15, D-19, D-20 closed; D-16 enforced;
  D-17 defaults now "auto"; D-18 exposed as `fit_memory`).
- GGUF is always served by llama.cpp (`gguf_requires_llamacpp` on create; adapter refuses at plan time).
- Images pinned: `vllm/vllm-openai:v0.28.0` (v0.28.1 is not published yet; bump `VLLM_IMAGE`/`versions.env`
  when it is) and `ghcr.io/ggml-org/llama.cpp:server-cuda-b10731`.
- `services/model_supervisor.py`: per-model lock, `to_thread` Docker calls, background startup tracker
  (container exit → `failed` with the last log line, health probe with per-engine semantics, startup timeout),
  registry derived from `running` rows, reconcile on startup + every 15 s (missing container / dead engine →
  `failed`), `apply` restarts only active models, gateway restart no longer stops models
  (`STOP_MODELS_ON_SHUTDOWN=false`). `state_reason` column added.
- Security: HMAC-signed session cookies with expiry (`SESSION_SECRET` auto-generated into `config_kv` when
  unset), dev key bypass off by default and never when a token is presented, every `/admin` router carries
  `require_admin` (keys/users/orgs/recipes/deployment were unauthenticated), `/auth/bootstrap-owner` moved,
  engine ports published on 127.0.0.1 only, `--api-key` for both engines, secrets redacted in dry-run,
  `hf_token` never returned (recipes included), forbidden custom flags / protected env vars enforced on
  create/PATCH, `safe_host_path` for every filesystem input, committed key/`debug_api.py`/`lib/*.so`
  removed from git, `.env.dev`/`.env.prod` untracked.
- Alembic: `0001_baseline` (pre-spec schema, auto-stamped on existing databases) and `0002_engine_spec`
  (column changes with data conversion, legacy sampling columns folded into `request_defaults_json`, unique
  `served_model_name`, recipes → JSON snapshots). The gateway runs `upgrade head` at startup.
- Deployment export (`pg_dump`, image save, tar) and log tailing run in worker threads; gateway 408 bug and
  breaker-state shadowing fixed; `check_model_readiness` and `custom_args_validator` deleted.
- Tests: 77 backend tests pass (`-m "not live"`), including CRUD against the live gateway, supervisor
  state-machine tests on a dedicated `cortex_test` database with a fake Docker layer, session-token forgery
  tests, adapter tests per flag form. `test_live_model_matrix.py` covers chat + embedding on both engines
  (llama.cpp cases pass; vLLM cases pending the image pull).

### 2026-09-02 (later) — frontend, ops and end-to-end validation
- Frontend: engine spec consumed at runtime (`useEngineSpec`, `SpecFieldsSection` renders every field the curated
  sections do not), `validateFormValues` gates submit with an inline issue list, live dry-run on the Summary step
  (Add and Configure) with an explicit "start anyway" override, engine guidance wired (GGUF folders auto-select
  llama.cpp and disable vLLM), recipe prefill normalised and cleared, error boundary, no `alert()`, accessible
  Modal/Tooltip/Toast, `tsc --noEmit` clean (was 51 errors at the start of this effort), 56 vitest tests.
  A hydration mismatch on the models page (gateway URL rendered during SSR) and a dry-run panel that never left
  "Validating…" (replaced the mutation hook with local state) were found by driving the real UI in Chrome and fixed.
- Ops: `versions.env` single source for image tags, dev compose with restart policies / healthchecks / loopback
  pgadmin, deployable prod compose (frontend build, Prometheus, required secrets, memory limits), non-root gateway,
  `make prod-check` that really checks, offline package that ships the built images, Prometheus HTTP service
  discovery for model containers via the gateway, CI workflow (backend unit + migration check, frontend typecheck/test/build,
  image builds, compose validation, docs build), docs regenerated from the spec (`scripts/gen-engine-flag-tables.py`),
  runbooks, production deployment guide, security docs matching the code, quick-start consolidation.
- End-to-end on this machine (RTX 4060, pinned images): `test_live_model_matrix.py` passes for all four models —
  llama.cpp chat (Qwen2.5-0.5B Q4_K_M, ready in 2 s warm), llama.cpp embedding (nomic-embed-text v1.5 Q8_0,
  768 dims), vLLM chat (Qwen2.5-0.5B safetensors, ready in 71 s, "PONG!"), vLLM embedding (bge-small-en-v1.5,
  384 dims) — each through create → GET → PATCH → dry-run (saved and unsaved) → start → readiness → inference and
  streaming via the gateway with a real API key → built-in test → apply-restart → stop → delete. The Configure modal
  was exercised in Chrome: saved values persist, cleared number fields stay empty, dry run renders the exact
  command, Save & Apply persisted a context change (verified through the API).

### 2026-09-02 (evening) — adversarial pass, transfer bundles, offline rebuilds
- Self-review fixes: Prometheus could not scrape engines once `--api-key` was enforced (llama.cpp returns 401 on
  `/metrics`) → gateway proxies `GET /engine-metrics/{id}` and serves `GET /prometheus/sd` (HTTP service discovery; the
  Docker-socket discovery never worked because Prometheus runs as `nobody` and cannot read the socket); the playground would 401 in prod because `/v1` required an API key → `require_api_key` accepts the admin
  session cookie; per-probe `httpx.AsyncClient` leak in the supervisor → shared client; model start failures
  caused by Docker (bad image tag) returned 500 → 502 with the reason; `/var/cortex/exports` and the top level
  of the models dir are chowned by the entrypoint (still root at that point) so the non-root gateway can write
  exports and place imported model files without a manual `chown` on the host.
- **Transfer bundles** (`services/bundles.py`, `routes/bundles.py`, `/admin/bundles/*`): one self-describing
  folder format (`bundle.json`, `images.json`, `images/*.tar`, `models/<served>/manifest.json` + `files/`,
  optional `db/cortex.sql`, `checksums.sha256`, README) shared by the UI export, the UI import and the shell
  scripts. Exports pick a destination from mounted drives (`/media`, `/mnt`, `/run/media` are bind-mounted into
  the gateway as `/host/...`; `CORTEX_TRANSFER_DIRS`), ship the *exact* engine image each selected model is
  configured with plus any extra tag, optionally infra and program images, model files (the model's own folder,
  hashed as they are copied) and a pg_dump; a plan endpoint gives size vs free space before anything is written;
  jobs stream `docker save` with progress/ETA, honour cancel, and remove partial bundles on failure. Imports scan
  a bundle (which images are loaded, which files are already on the host, name conflicts, checksum
  verification), `docker load` + retag to the original ref, copy files into the models dir with sha256 checks,
  and register models with conflict handling (rename/skip/replace/error). Legacy deployment export/import routes
  and ~1150 lines of dead export code removed; database restore kept.
- Offline rebuilds: `backend/Dockerfile` gained a `deps` stage; `make build-deps` tags `cortex-gateway-deps` /
  `cortex-frontend-deps:<ver>`; `Dockerfile.offline` (both) + `make build-offline` rebuild from source with
  `--network none`. `prepare-offline-deployment.sh` now writes a bundle (all pinned images + Cortex + deps images
  + wheelhouse), `load-offline-deployment.sh` imports one (checksums, load, retag, copy model files).
- Tests: `test_bundles_integration.py` runs a real export → scan → import round trip (tiny image imported from a
  tarball, 64 KB fake model, image removed and re-loaded, files re-placed, model re-registered, conflict modes).
- Fresh-install test on this box: `make clean && make quick-start` (with `PROM_PORT=9094`, `NODE_EXPORTER_PORT=9104` in
  `.env` because Cockpit and another stack hold the defaults; `make up` now pre-checks published ports and names the
  variable to set) → migrations 0001→0002, admin bootstrapped, all services healthy; the bundle exported from the
  previous install was imported into the empty database (files/image already present, model registered), started
  and answered an embedding request. `make build-deps` + `make build-offline` (`--network none`) rebuilt both images.
- Docs: offline-deployment.md rewritten around bundles; backup-restore.md, admin-api.md, README, deployments.md
  updated; frontend guide section rewritten with the Transfer workflow.

- Security scrub before commit: no default admin password anywhere (`make up` prompts once, `make setup-admin` resets,
  `LOGOUT_ALL=1` rotates `SESSION_SECRET`), secrets generated into a mode-600 `.env`, committed env files with a private
  address untracked, stale private IPs in docs replaced by the documentation example address, integration tests take
  the admin credentials from `.env`. Verified on this box: old password rejected, new accepted, suites green.
- Prometheus now reaches the gateway after `make setup-firewall` (all targets up, including model discovery).

### Still open
- P2-12 version-aware capability probe (needs a backend endpoint that runs `--help` per image digest).
- P3-3 partially: the legacy `state.py` registry persistence remains (routes are derived from `running` rows but
  the ConfigKV copy is still written for the health poller); `check_v1_compatibility` in `routes/openai.py` is dead.
- `engine-spec.static.ts` must be regenerated when `spec.py` changes (header documents the command); consider a
  build step.
- vLLM v0.28.1 is not on Docker Hub yet; bump `versions.env`/`config.py` when it is.
- Transfer jobs live in gateway memory: a gateway restart forgets a running job (the partial bundle is left on
  disk without `bundle.json`, so the scanner ignores it). Persisting jobs is not needed for the workflow but would
  make the UI resume cleanly.

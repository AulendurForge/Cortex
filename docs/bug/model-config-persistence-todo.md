# Model Configuration Persistence & Form UX — Findings and Todo

Date: 2026-09-01
Scope: "Configure Model" round-trip losing settings (GPUs, sampling controls), and number inputs that snap back to defaults while typing.

---

## 1. Stack summary (what Cortex is and how model config flows)

**Value proposition.** Cortex is a self-hosted, OpenAI-compatible gateway plus admin UI that lets an operator
register models (HuggingFace repo or local folder/GGUF), pick an engine (vLLM or llama.cpp), tune the engine's
startup flags and per-request sampling defaults, and run each model as a Docker container that the gateway
routes to by served name. It adds auth/keys/orgs, usage metering, health-aware routing, offline/air-gapped
deployment, and a chat playground on top of the raw engines.

**Runtime layout (dev compose).**
- `gateway` (FastAPI, `backend/src`, host network, port 8084). Image is built from source (`COPY src`), so backend
  changes require `docker compose build gateway && up -d gateway`.
- `frontend` (Next.js 14 app router, port 3001). Source is volume-mounted, hot reload works.
- `postgres` (15432), `redis` (16379), `prometheus` (9090), `dcgm-exporter`, `node-exporter`, `cadvisor`, `pgadmin`.
- Model containers are created by the gateway through the Docker socket (`backend/src/docker_manager.py`).

**Model config data path.**

```
ModelWorkflowForm (values state)            frontend/src/components/models/ModelWorkflowForm.tsx
   ├─ VLLMConfiguration / LlamaCppConfiguration / RequestDefaultsSection / CustomArgsEditor
   └─ onSubmit(values) ───────────────────────────┐
                                                  │ POST /admin/models   (create)
                                                  │ PATCH /admin/models/{id} + POST .../apply  (configure)
                                                  ▼
CreateModelRequest / UpdateModelRequest      backend/src/schemas/models.py
   └─ routes/models.py create_model / update_model
        ├─ sampling fields  → request_defaults_json (+ legacy columns)
        ├─ selected_gpus    → JSON text column
        └─ Model ORM row                          backend/src/models.py
                                                  │
GET /admin/models → ModelItem (hand-built)  ──────┘ routes/models.py list_models
   └─ frontend ModelListSchema (zod, strips unknown keys)   frontend/src/lib/validators.ts
        └─ models/page.tsx  defaults={...m}  → ModelWorkflowForm initial state (`defaults?.x ?? DEFAULT`)

start/apply → docker_manager._build_command / _build_llamacpp_command + DeviceRequest(selected_gpus)
            → state.register_model_endpoint(served_name, url, request_defaults_json)
            → routes/openai.py merge_request_defaults() at request time
```

Every hop above has its own hand-maintained field list (ORM, three pydantic schemas, the `ModelItem(...)`
constructor in `list_models`, the zod schema, two copies of the form initial state, the Recipe model). That
drift is the systemic root cause of the reported bugs.

---

## 2. Root causes of the reported bugs

### RC-1  zod `ModelItemSchema` silently drops `selected_gpus` (and 17 other fields)
`frontend/src/lib/validators.ts` `ModelItemSchema` is a strict `z.object`; zod strips keys not declared. It does not
declare: `selected_gpus`, `draft_model_path`, `draft_n`, `draft_p_min`, `startup_timeout_sec`, `verbose_logging`,
`check_tensors`, `skip_warmup`, `chat_template`, `chat_template_file`, `jinja_enabled`, `defrag_thold`,
`lora_adapters_json`, `lora_init_without_apply`, `grammar_file`, `enable_embeddings`, `system_prompt`, `cont_batching`.

Effect: the configure modal receives no `selected_gpus`, `ModelWorkflowForm` falls back to `[0]`, only GPU 0 is
checked. `tp_size` *is* returned, so the summary still says "2 GPU(s)" while the container is launched with
`DeviceRequest(device_ids=["0"])` and `--tensor-parallel-size 2` (vLLM) or a stale two-way `--tensor-split`
(llama.cpp). This is exactly the "starts on just the one defaulted GPU" symptom.

### RC-2  Sampling defaults are never sent back to the UI
`ModelItem` (backend) has no `temperature/top_p/top_k/repetition_penalty/frequency_penalty/presence_penalty`
fields; only `request_defaults_json` is returned. The frontend never parses `request_defaults_json`, so
`ModelWorkflowForm` initialises with the hard-coded defaults (0.8 / 0.9 / 40 / 1.2 / 0.5 / 0.5). Pressing
"Apply & Restart" then PATCHes those defaults over the saved values. This is the "response and repetition
controls reset every time" symptom.

### RC-3  Custom request extensions are lost on every Apply
`custom_request_json` is also not reconstructed from `request_defaults_json` on load (shows empty), and
`update_model` rebuilds `request_defaults_json` from the six sampling fields plus whatever
`custom_request_json` was sent. Since the form sends `''`, any `vllm_xargs`, `stop`, etc. previously stored are
dropped.

### RC-4  `hf_token` is wiped on every Apply
GET never returns `hf_token` (correct), the form initialises it to `''`, PATCH sends `hf_token: ""`, and
`update_model` writes it because the key is present (`exclude_unset` does not help). Every configure of an
online/gated model erases the stored token.

### RC-5  Number inputs snap back to defaults while editing
Two handler patterns:
- `onChange('x', Number(e.target.value) || DEFAULT)` — clearing the field gives `Number('') === 0`, which is
  falsy, so the default is re-inserted immediately. Also impossible to type `0` (temperature 0, penalties 0,
  `cpu_offload_gb` 0), impossible to type a leading `-` for negative penalties, and typing `0.` collapses.
  Files: `RequestDefaultsSection.tsx` (6 inputs), `LlamaCppConfiguration.tsx` (8 inputs),
  `ResourceCalculatorModal.tsx` (7 inputs).
- `onChange('x', Number(e.target.value))` — clearing yields `0`, which is rendered as "0", so you can never get
  an empty field and must type around the existing digits. Files: `VLLMConfiguration.tsx`
  (`gpu_memory_utilization`, `max_model_len`, `max_num_batched_tokens`, `swap_space_gb`, `cpu_offload_gb`,
  `max_num_seqs`).
Root cause: parsing and defaulting on every keystroke in a controlled `type="number"` input. Fix is a shared
`NumberField` that keeps a text draft while focused and commits a number (or `undefined`) on change/blur, with
defaults applied at submit time instead of in the handler.

### RC-6  `/admin/system/gpus` returns `[]` when neither Prometheus/DCGM nor NVML is reachable
`routes/admin.py system_gpus` reads Prometheus first and falls back to NVML. Both fail on this dev box:
Prometheus never started (port 9090 is held by Cockpit; `cortex-prometheus-1` is stuck in "Created"), and the
gateway container is started without the NVIDIA runtime, so `pynvml` raises `NVML Shared Library Not Found`.
The UI then gets no GPU list, `gpuCount` stays at its default of 1, and the old `GpuSelector` rendered a single
GPU slot with no way to pick another index. On a multi-GPU box with a broken exporter the operator could not
re-select the other GPUs at all. This is an environment limitation, but the UI must degrade gracefully: keep
the saved selection visible and let the operator add GPU slots manually.

---

## 3. Other defects found during the trace

| # | Area | Finding |
|---|------|---------|
| O-1 | backend `routes/models.py` | `create_model` clears engine-specific fields for the *other* engine with two hand-written lists that disagree with each other (vLLM branch does not clear `ubatch_size`, `parallel_slots`, `cache_type_*`, `draft_*`; llama.cpp branch does not clear `dtype`, `enforce_eager`, `attention_backend`, …). `update_model` does no clearing at all, and the form submits both engines' fields, so a llama.cpp model ends up with `tp_size=1`, `gpu_memory_utilization=0.9`, and a vLLM model ends up with `ngl=999`, `tensor_split=''`, etc. |
| O-2 | backend `routes/models.py` | `update_model` both `setattr`s the ORM object and issues a second `UPDATE` statement; `updated_at` never changes (no `onupdate`). |
| O-3 | backend `routes/models.py` | `apply_model_changes` sets `state="running"` immediately, skipping the crash/health polling that `start_model` does, so a bad config shows RUNNING until the next readiness poll. It also restarts a model that was *stopped* when the user only wanted to save. |
| O-4 | backend `routes/models.py` | `selected_gpus: []` is stored as `"[]"`, normalised to `None`, and at start means "all GPUs" (`DeviceRequest(count=-1)`). The UI "Select None" button lets this happen silently; for vLLM it also yields `tp_size=0`. Needs validation (≥1 GPU when `device != cpu`) and `tp_size == len(selected_gpus)`. |
| O-5 | backend `schemas/models.py` | `ModelItem`, `CreateModelRequest`, `UpdateModelRequest` are three ~100-line parallel lists; `list_models` repeats it a fourth time with `getattr(r, ...)`. Needs one source of truth (derive from ORM columns). |
| O-6 | frontend `GpuSelector.tsx` | `[...selectedGpus, i].sort()` sorts lexicographically → `[0, 10, 2]` on >9-GPU hosts. |
| O-7 | frontend | `ModelForm.tsx` is dead code (only its `ModelFormValues` type is imported); `ModelWorkflowForm.tsx` duplicates its 80-line initial-state block with slightly different defaults (`tensor_split` `'0.25,0.25,0.25,0.25'` vs `''`). |
| O-8 | frontend `models/page.tsx` | The list query fetches `/admin/models`, then calls `/readiness` for every loading model, then fetches `/admin/models` again — N+2 requests per poll (every 3 s while loading). |
| O-9 | frontend `validators.ts` | `ModelItemSchema` has no automated parity check with the backend; it will drift again. |
| O-10 | backend `models.py` / `routes/recipes.py` | `Recipe` is a partial copy of `Model` (no `engine_image`, `request_defaults_json`, startup args/env, none of the "gap" fields). Saving a recipe from a model silently loses those. Out of scope for this pass; noted. |
| O-11 | backend | Pydantic v1 API (`body.dict()`, `@validator`) and FastAPI `@app.on_event` are deprecated. Cosmetic. |
| O-12 | backend | `alembic` is a dependency but `backend/alembic/versions` does not exist; schema is created by `create_all`, which will not add new columns to an existing database. Upgrade risk; noted, not changed here. |
| O-13 | frontend | `tsc --noEmit` reports 51 pre-existing errors (34 in `app/`, 13 in the model form components). Next dev mode does not type-check so they go unnoticed. |
| O-14 | frontend `ModelWorkflowForm.tsx` | Config mode hides the *Model Selection* step, so `tokenizer` / `hf_config_path` cannot be edited after creation even though `UpdateModelRequest` accepts them. Noted. |

---

## 4. Todo list

Legend: **[P0]** reported bug, **[P1]** data-loss / correctness adjacent, **[P2]** cleanup.

### Backend
- [x] **[P0] T-1** Return sampling defaults and custom extras from GET. Add `temperature`, `top_p`, `top_k`,
      `repetition_penalty`, `frequency_penalty`, `presence_penalty`, and a derived `custom_request_json` to
      `ModelItem`, computed from `request_defaults_json` (source of truth), falling back to legacy columns.
- [x] **[P0] T-2** `update_model`: preserve existing custom extras when the client does not send
      `custom_request_json`; treat `hf_token: ""` as "unchanged"; derive `tp_size` from `selected_gpus` for vLLM
      when both are present and disagree; validate `selected_gpus` non-empty for GPU mode.
- [x] **[P1] T-3** Single source of truth for model config fields: `MODEL_CONFIG_FIELDS` / engine field sets in one
      module; `ModelItem` built by a `model_to_item()` helper from ORM columns; `create_model` and `update_model`
      share one `clear_other_engine_fields()`; `updated_at` gets `onupdate`.
- [x] **[P1] T-4** `apply_model_changes`: only restart if the model was running/loading; otherwise just save.
      Reuse the start path (state `loading` + health polling) instead of setting `running` blindly.
- [x] **[P1] T-5** `/admin/system/gpus`: already falls back to NVML, but NVML needs the NVIDIA runtime in the
      gateway container (not enabled in the dev compose). No backend change; the UI degrades gracefully instead
      (see T-11). Operators who want GPU discovery without Prometheus can add `runtime: nvidia` to the gateway
      service.
- [x] **[P2] T-6** Drop the redundant second UPDATE in `update_model`; `model_dump` instead of `dict`.

### Frontend
- [x] **[P0] T-7** `ModelItemSchema`: add every missing field; add a parity test (see Tests) so it cannot drift again.
- [x] **[P0] T-8** One `buildInitialValues(defaults)` in a new `modelFormValues.ts`, used by `ModelWorkflowForm`;
      it reads `selected_gpus`, sampling fields and `custom_request_json` from the API item (parsing
      `request_defaults_json` if the server did not pre-split it). Delete the dead `ModelForm` component.
- [x] **[P0] T-9** `NumberField` component (text draft while editing, commits number/undefined, min/max/step,
      inline validation). Replace all `Number(e.target.value) || DEFAULT` and bare `Number(e.target.value)`
      handlers in `RequestDefaultsSection`, `LlamaCppConfiguration`, `VLLMConfiguration`, `ResourceCalculatorModal`.
- [x] **[P1] T-10** Configure submit: send only fields that `UpdateModelRequest` accepts; omit empty `hf_token`;
      send engine-appropriate fields only.
- [x] **[P1] T-11** `GpuSelector`: numeric sort; when GPU info is unavailable, render at least
      `max(selectedGpus)+1` slots so a saved multi-GPU selection is visible and editable.
- [x] **[P2] T-12** `models/page.tsx` list query: single fetch; readiness polling only for loading models, no
      second list fetch.
- [x] **[P2] T-13** Fix the pre-existing `tsc` errors in the files touched (`VLLMConfiguration`,
      `LlamaCppConfiguration`, `ResourceCalculatorModal`).

### Tests (write before fixing, keep green after)
- [x] **T-14** `backend/src/tests/test_model_crud_api.py` — HTTP integration against the running gateway
      (`CORTEX_GATEWAY_URL`, default `http://127.0.0.1:8084`, admin/admin): create vLLM + llama.cpp models with a
      full config → GET echoes every field (including `selected_gpus` and sampling values) → PATCH partial →
      GET → PATCH with `hf_token: ""` does not wipe → dry-run returns a command with the right
      `--tensor-parallel-size` / `--tensor-split` → start fails cleanly (no model files on this box) and leaves
      state `failed` → stop → archive → recipe from model → delete (cascade) → 404 afterwards.
- [x] **T-15** `backend/src/tests/test_model_schema_parity.py` — ORM columns vs `ModelItem` vs
      `UpdateModelRequest` vs the frontend zod schema (parses `validators.ts` keys) so any new column must be
      added everywhere.
- [x] **T-16** `backend/src/tests/test_docker_command_build.py` — `_build_command` / `_build_llamacpp_command`
      and GPU `DeviceRequest` selection for `[0,1]`, `[1]`, `None`, legacy double-encoded strings.
- [x] **T-17** `backend/src/tests/test_request_defaults.py` — build/merge/round-trip of `request_defaults_json`
      including custom extras; `merge_request_defaults` precedence.
- [x] **T-18** Frontend: vitest + testing-library for `buildInitialValues` (round trip from an API item) and
      `NumberField` (clear, type `0`, type `-0.5`, blur commits). Only if the install stays small; otherwise the
      parity test in T-15 covers the schema and the field is covered manually.

### Environment notes (not code changes)
- Prometheus cannot bind 9090 on this machine (Cockpit). Until `PROM_PORT` is changed, GPU metrics and the GPU
  list depend on T-5. Machine has ~8 GB RAM free and a single 8 GB laptop GPU; no engine images or model files
  are present, so container start is tested for clean failure only.

---

## 5. Status (2026-09-01)

All items above are implemented. Verification:

| Suite | Where | Result |
|-------|-------|--------|
| Backend unit + CRUD integration (`src/tests`, excluding deployment e2e) | gateway container, image rebuilt from source | 48 passed, 1 skipped (live inference needs `CORTEX_LIVE_GGUF`) |
| Baseline of the same suite before changes | gateway container | 24 passed, 13 failed (the persistence bugs), 1 collection error (new module) |
| Frontend unit (`vitest run`) | frontend container | 17 passed |
| Frontend `tsc --noEmit` | frontend container | 36 errors, all pre-existing in untouched `app/` pages (was 51; the 13 in the model form components are fixed) |
| Models page compile (`GET /models` on the Next dev server) | frontend container | 200, compiled without errors |
| Live inference (`test_live_llamacpp_inference.py`, Qwen2.5-0.5B Q4_K_M under `ghcr.io/ggml-org/llama.cpp:server-cuda`) | gateway container, RTX 4060 | passed in 78 s: create → configure round trip → dry-run → start (ready in 38 s) → chat via gateway with a real API key ("pong") → apply-restart with new context → built-in test endpoint → stop → delete |

Backend changes require rebuilding the gateway image (`docker compose -f docker.compose.dev.yaml build gateway`);
frontend changes hot-reload.

Not done (out of scope, noted in section 3): O-10 recipe field drift, O-11 pydantic/FastAPI deprecations,
O-12 missing Alembic migrations, O-14 tokenizer/hf_config_path not editable in Configure mode, and the
remaining 36 pre-existing TypeScript errors in guide/deployment/system/chat pages.

---

## 6. Addendum: login and LAN access (2026-09-01)

**Symptom.** From another LAN machine, `/auth/login` and `/auth/me` time out (`ERR_CONNECTION_TIMED_OUT`).
Locally, the first login attempt always failed and the second succeeded with the same credentials.

**Causes.**
1. *Timeout*: ufw is active with default deny. Port 3001 is a Docker-published port (Docker's own iptables
   chain admits it) but 8084 is the gateway on the host network with no allow rule. Fixed on this host with
   `ufw allow from 192.168.1.0/24 to any port 8084 proto tcp` (and the same for 3001). Revert with
   `sudo ufw delete allow from 192.168.1.0/24 to any port 8084 proto tcp`.
2. *First login fails*: `CORS_ALLOW_ORIGINS` ends with `*`. Starlette's `CORSMiddleware` with `allow_origins=["*"]`
   sends the literal `Access-Control-Allow-Origin: *` unless the request already carries a cookie. The admin
   UI uses `credentials: 'include'`, and browsers refuse a credentialed response with a wildcard origin, so the
   first `POST /auth/login` (no cookie yet) is rejected by the browser after the `Set-Cookie` was already
   stored; the second attempt carries the cookie, Starlette echoes the origin, and it works.
   Reproduced with curl: without a `Cookie` header the response had `access-control-allow-origin: *`, with one it
   had the request origin. Fixed in `backend/src/main.py` by translating `*` into `allow_origin_regex=".*"`.
3. *Wrong advertised address*: `scripts/detect-ip.sh` scored the libvirt bridge 192.168.122.1 equal to the LAN
   address 192.168.1.52 and the tie resolved arbitrarily. Fixed: virtual bridge subnets and virtual interface
   names are excluded and the default-route address wins ties. `make ip` now reports 192.168.1.52.

**Also changed.** Login page shows why login failed (401 vs gateway unreachable, with the gateway URL) and
disables the button while submitting; `UserProvider` only clears the remembered user on a real 401.

**Found while standing the model up for manual testing (2026-09-01, later).**
- Starting a vLLM model whose image is not cached pulled `vllm/vllm-openai:latest` *inside the request handler*
  with the synchronous Docker SDK; the single uvicorn worker was blocked for the whole pull and every other
  request (including the models list) hung. `_launch_model` now runs `start_container_for_model` in a worker
  thread (`asyncio.to_thread`). Follow-up for the audit: `stop`, `_ensure_image`, log tailing and readiness
  probes have the same blocking pattern.
- `services/config_validator.dry_run_validation` imported a non-existent `get_gpu_metrics`; every dry-run
  logged the ImportError and ran without GPU capacity data. Added `collect_gpu_metrics()` in `routes/admin.py`
  and a `get_gpu_metrics()` wrapper in `services/system_monitoring.py`.
- Test model left running for manual verification: id 95 "Qwen2.5 0.5B Instruct (llama.cpp)", served as
  `qwen2.5-0.5b`. Model 81 (same GGUF registered under vLLM by the user) left stopped.

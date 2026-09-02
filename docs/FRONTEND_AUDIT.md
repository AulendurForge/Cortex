# Frontend audit — findings and fix plan (2026-09-02)

Scope: the whole admin UI (`frontend/app`, `frontend/src`, 24,188 lines of TS/TSX) plus the
backend endpoints it renders. Four read-only passes (monitoring/usage/keys, playground/models,
guide/about/login/users/orgs, shared architecture) verified every claim against the code as it is
now and against the live gateway. Line references are to the current tree.

Severity: **Critical** = wrong data or a broken feature a user hits in normal use; **High** = a
bug or false statement with a workaround; **Medium** = maintainability/UX debt; **Low** = polish.

## 1. Critical — the UI shows wrong data or breaks a normal action

| # | Where | What is wrong | Fix |
|---|---|---|---|
| C1 | `usage/page.tsx:65`, `backend/routes/admin.py:593` | 7-day window sends `bucket=day`; the backend accepts only `hour\|minute` → 400, so the Requests/Tokens KPIs read 0 and the chart says "No data" while the table has rows | use `minute` ≤ 6h, `hour` otherwise (or accept `day`) |
| C2 | `usage/page.tsx:157`, `routes/openai.py:512-703` | Task filter offers `chat\|completions\|embeddings`; records store `generate\|embed`, so any task filter returns nothing | filter options `generate` ("Chat / Completions"), `embed` ("Embeddings") |
| C3 | `usage/page.tsx:51` | query key omits `page`/`limit`: pagination and the Rows selector never refetch | add them to the key |
| C4 | `keys/page.tsx:224`, `components/UI.tsx:30` | `Button` defaults to `type=submit`; the Cancel button inside the create-key form **creates a key** | `type="button"` default in `Button`, explicit `submit` where needed |
| C5 | `SideNav.tsx:88`, `main.py:195`, `routes/keys.py:126-175` | "My API Keys" links to `/keys` which calls admin-only endpoints; for a non-admin the page shows "No API keys" (403 swallowed). `/admin/me/keys` is also mounted behind `require_admin`, so self-service keys are impossible although the guide documents them | mount `/me/keys` on a user-session router with list/create/revoke; `/keys` branches on role and renders errors |
| C6 | `chat/ModelSelector.tsx:22-79`, `routes/chat.py:159-211` | embedding models appear in the chat model picker; chatting with one returns HTTP 500 from the engine | filter `task=embed` out in both UI and `/v1/models/running`; 400 in the proxy |
| C7 | `routes/chat.py:176-246`, `health.py:35` | the playground's running-model list is gated on the health poller (10 s period, 30 s TTL), not the supervisor: a model reported "running" is missing from the picker for up to 10 s, and any poller hiccup makes a healthy model vanish mid-conversation; server errors are swallowed into "no running models" | derive from the supervisor/registry state; propagate errors |
| C8 | `routes/users.py:12-16,90-128` | backend accepts empty username, empty password and arbitrary `role`/`status` strings (verified live: created a user with username `""` and role `Superuser`) | pydantic constraints: username 1–64 chars, password ≥ 8, `role ∈ {Admin, User}`, `status ∈ {active, disabled}` |
| C9 | `guide/sections/ApiKeys.tsx:323-352`, `keys/page.tsx:198`, `auth.py:105-154` | guide and placeholder tell admins to enter CIDR ranges in the key IP allowlist; the check is exact-string match, so a CIDR blocks every request | copy: exact IPs, comma-separated; optionally implement CIDR with `ipaddress` |
| C10 | `utils/ip_utils.py:104-116` | `X-Forwarded-For` is trusted from any client, so an IP allowlist is bypassable by header; the guide advertises XFF support | trust XFF only from configured proxy addresses; warn in the guide |
| C11 | five guide files (`EngineGuide.tsx:83…`, `ModelsOverview.tsx:75`, `AddingModels.tsx:383`, `TroubleshootingGuide.tsx:169`, `ConfigurationGuide.tsx:262`) | "GPT-OSS only runs on llama.cpp / vLLM cannot load it" — false for the pinned vLLM v0.28.0 (spec exposes `reasoning_parser=gpt_oss`, `quantization=mxfp4`); contradicted elsewhere in the same guide | rule is **GGUF ⇒ llama.cpp**; gpt-oss safetensors ⇒ vLLM |

## 2. High — bugs and false statements with workarounds

### Traffic / usage metering (backend + Usage page)
- **H1** streamed chats are metered when headers arrive: `total_tokens=0`, latency ≈ TTFB, status always 200 (`routes/openai.py:538`, `middleware/usage.py:66`). The Playground streams, so all its traffic undercounts. Record at stream end, capture the final `usage` chunk (`stream_options.include_usage`).
- **H2** `user_id`/`org_id` are never written (`record_usage` call sites pass only `key_id`; session calls have `key_id=None`), so user/org filters and the fetched `usersLookup`/`orgsLookup` are dead. Resolve from the key or session user.
- **H3** the KPIs ignore the Task/Status/Key filters (series/latency endpoints accept only `hours`+`model`); the guide says "filters apply to all views".
- **H4** "TTFT p50" is always 0.00 s: `admin.py:612-641` reads a private prometheus attribute with the wrong type. Query Prometheus (`histogram_quantile`) and show "—" without samples.
- **H5** series timestamps are epoch seconds but plotted as milliseconds (`usage/page.tsx:175` → 1970 tooltips).
- **H6** Model filter options come from the already-filtered top-models list, so after picking a model only it remains.

### System Monitor / Health (backend + pages)
- **H7** "Req/s", "p50", "p95" include the admin UI's own polling (`/metrics`, `/admin/*`); with zero inference they read 0.32 req/s. Filter `route=~"/v1/.*"` and label "Inference".
- **H8** "Prompt/Gen tok/s" query only `vllm:*` metrics → always 0 for llama.cpp; no unit shown. Add `llamacpp:` families.
- **H9** Health "TPS (P/G)" filters by upstream `instance`, but engines are scraped through the gateway (labels `served_model_name`/`model_id`) → always 0.0.
- **H10** System "Active Models" panel fetches `http://<container>:8000/metrics` without the key and only parses vLLM → four "—" tiles for every llama.cpp model. Reuse `supervisor.model_url` + internal key, as `/engine-metrics/{id}` does.
- **H11** GPU name and VRAM total are null under DCGM (`DCGM_FI_DEV_FB_TOTAL`/`DCGM_FI_DEV_NAME` don't exist; use `FB_USED+FB_FREE` and the `modelName` label); the "VRAM Total" tile sums *used* memory.
- **H12** time-range control offers 3h–24h but the backend clamps to 60 min; GPU trends are a 15-minute in-browser buffer lost on navigation.
- **H13** Health "Refresh" probes only static upstream lists, never managed models, and discards the result; the ONLINE badge ignores staleness; breaker/last_error never shown.
- **H14** hardcoded `http://192.168.1.181:8084` on the Health page; port 8084 hardcoded in `api-clients.ts`, `HostIpDisplay.tsx` and 29 guide snippets.
- **H15** `LineChart` treats the 600-unit viewBox as pixels: crosshair/tooltip drift and the right part of wide charts is dead (`Charts.tsx:64-293`); EMA smoothing is applied to discrete request counts and the tooltip shows the smoothed value.
- **H16** `Accordion` reads `localStorage` in a `useState` initializer → hydration mismatch on Health and System.

### Chat playground
- **H17** the real `completion_tokens` from the `usage` chunk is overwritten by the SSE chunk count (`chat-client.ts:216-229`, `useChat.ts:172-190`); tok/s divides by time including TTFT. Use `usage` (or llama.cpp `timings`) and time since first token.
- **H18** errored turns keep an empty assistant message and cancelled turns store the literal `[Cancelled]`; both are persisted and replayed to the model on the next request.
- **H19** a session row is created on every model selection with the engine hardcoded to `vllm` (orphan "New Chat" rows, wrong engine badge for llama.cpp).
- **H20** streaming is not aborted when switching chats or clicking New Chat in the sidebar; a fast second Enter double-submits.
- **H21** `chat-api.ts` swallows all errors (`[]`/`null`) so a 401 renders as "No conversations yet" and lost history is never reported; nine raw `fetch` calls bypass the shared client.
- **H22** there are no system-prompt or temperature controls at all; the request sends only `model, messages, stream, max_tokens`. Either add them or stop documenting them.

### Models page and wizard
- **H23** editing the display name of a running model rewrites its served name → Save & Apply fails with 409 (`BasicModelInfo.tsx:33-41`). Derive only until the admin edits it, never while running.
- **H24** Save & Apply toasts "Save failed" when the PATCH succeeded but the restart failed, and the modal stays open (`models/page.tsx:120-132`).
- **H25** Archive is enabled for running models and does not stop them; the archived table has no Stop.
- **H26** `hf_offline` checkbox is a dead control (stripped by the backend, never returned).
- **H27** the page fans out a `/readiness` probe for every loading model every 3 s; that endpoint mutates state outside the supervisor lock and races the startup tracker.
- **H28** "Request defaults take effect immediately — no restart" is false (registry only refreshed at launch) and the UI restarts anyway.
- **H29** resource calculator: `fits=true` when VRAM is unknown, 40 GiB hardcoded denominator, constant 0.9 recommendation, hardcoded `block_size`/`max_num_batched_tokens`.

### Users / Orgs / Login / Layout
- **H30** cannot unassign a user's org (`org_id: undefined` is dropped; backend skips `None`).
- **H31** create/update/delete errors (409 `username_exists`, `name_exists`) are never shown; `mutateAsync` inside a form action throws unhandled.
- **H32** user status is not editable although the backend supports it; an admin can delete or demote themselves; no guard for the last admin.
- **H33** Orgs delete first calls a nonexistent `/admin/upstreams/orgs/{id}` (404) then the real route.
- **H34** login drops the original URL (no `next=`), labels are not associated with inputs, no `autoComplete`, role is read from `localStorage` (a user can flip it to reveal admin nav), `UserProvider` defaults a missing role to `admin`.
- **H35** admin pages mount and fire their queries before the auth check resolves (each 401s, then redirect); no `middleware.ts`.
- **H36** no navigation at all below 768 px (`hidden md:flex`): the app is unusable on phones.
- **H37** "System IP" shows `NEXT_PUBLIC_HOST_IP`, which is baked at build time (runtime compose env has no effect), else the browser hostname.
- **H38** `Modal` re-runs its focus-trap effect whenever the parent re-renders (inline `onClose`): focus jumps out of the field being edited every 3 s poll tick on the Models page.
- **H39** `getGatewayBaseUrl()` returns `https://host:8084` behind the documented TLS proxy; `NEXT_PUBLIC_GATEWAY_URL` cannot reach the prod build (not a Dockerfile ARG).
- **H40** key expiry from `datetime-local` is sent naive and compared as UTC (shifts by the browser offset); revoke feedback/errors never rendered; revoked keys vanish (no `include_disabled`); Revoke button invisible to keyboard users.

## 3. Guide content — stale or false statements (46 found)
Full table in the audit transcript; the ones a reader would act on:
- API keys are "SHA-256 hashed" (bcrypt), tokens "`ctx_…`" (40 random chars, no prefix), "every `/v1` request needs a Bearer token" (session cookie accepted; dev bypass), 403 messages quoted wrongly, "usage written asynchronously".
- Usage "filterable by user/org", "Task chat/completions/embeddings", "TTFT p50/p95", "4xx includes auth failures/rate limits", "retains indefinitely" (30-day cap).
- Playground: sidebar "Refresh button" (none), context bar thresholds, "performance bar shows total tokens", "older messages truncated".
- Tutorial: statuses "Down/Starting/Loading/Running" (real: stopped/starting/loading/running/failed), emoji button labels that don't exist, field "Max Context" (real "Max model length"), `nvidia/cuda:12.0-base` (tag does not exist), driver table says CUDA 12.9 → 575 (pinned vLLM is CUDA 13 → driver ≥ 580; llama.cpp 12.8 → 570), "Ubuntu 20.04 / Docker 20.10 / 16 GB", badge "BETA 0.1" (version is 0.2.0).
- Welcome: "rate limits and usage quotas per key", "alerts", "export metrics", "multi-tenant isolation policies" — none exist.
- Recipes: "Save Recipe / Apply / Create / Export JSON" (dialog says "Blueprint", button "Load", no export; DELETE exists but is undocumented). Delete "preserves recipes" (it deletes linked recipes). Diagnostics "AI-assisted" (regex table). Test reports "TTFT, token counts" (latency only). Multi-part GGUF "merge with llama-gguf-split" (loads natively).
- Troubleshooting: `docker ps | grep cortex` (containers are `vllm-model-<id>`; use the `cortex.managed=1` label), `github.com/ggerganov/llama.cpp` (now `ggml-org`), `/path/to/models`.
- Config guide: `gpu_memory_utilization` default 0.9 (0.92), attention backend `auto` (no such option), `spec_type` default (inferred).
- "Users & Orgs" tab is a WIP stub; `SystemMonitor.tsx` section is never imported; "Start Tutorial →" button does nothing (hash set without a listener).
- About: title "Platform Architecture", claims "circuit breaking" and "vLLM clusters/pools" that don't exist, proposal-style quotes; no version, images, links. "Developed by Aulendur Labs" footers copied into 11 files at `text-white/20` (fails contrast).

Guide code: 7,452 lines across 20 files, ~35 locally re-implemented components (`StepItem`, `TroubleshootItem`, `Arrow`, `CommandBlock`, `FeatureCard`, copy buttons ×12), `:8084` hardcoded 29×, `/var/cortex/models` 15×, two `h1`s per view and no `h2` anywhere (`SectionTitle` is a `div`), body copy at 9–10 px / 40–50 % white (fails WCAG AA), ~150 decorative glyphs read aloud, `<Button>` inside `<Link>` ×12, sub-tab `aria-labelledby` pointing at ids that don't exist. Roughly 40 % of the guide is data (flag tables, scope tables, state lists, error tables, driver tables, SDK snippets) hand-written where the engine spec, `versions.env`, the backend constants and `docs/` already hold the truth.

## 4. Shared architecture (Medium unless noted)
- Dead files: `src/lib/chat-storage.ts` (288 lines), `src/lib/query-clients.ts`, `src/components/Glass.tsx`, `guide/sections/SystemMonitor.tsx`, six unused logo images (~3 MB), tracked `tsconfig.tsbuildinfo`; ~60 exports with no importer (list in the audit).
- Three HTTP client styles (`apiFetch`, raw `fetch` in `chat-client`/`chat-api`, raw `fetch` in layouts) with three error shapes; `apiFetch` throws a plain object, so nothing can `instanceof`; no central 401 handling; three `/auth/me` probes per cold load.
- Duplicated helpers: UUID ×4, host-IP detection ×4, `errMsg` ×6, relative time ×3, bytes ×4, short-number ×4, clipboard-with-toast ×8, zod `nStr/nNum` ×2, QueryClient ×2, local TS types shadowing zod schemas (`UsageItem`, `KeyRow`, `Org` ×2).
- react-query: mixed key styles, the same endpoint under two keys, `staleTime` values scattered, hand-rolled polling loops (`system/page.tsx:43-91`), query data copied into state via effects.
- 44 `any`s; no ESLint at all (`"lint": "echo 'no linter configured yet'"`); no tests for `api-clients`, `validators`, `Modal`, `Toast`, `UserProvider`; no `.dockerignore` (host `node_modules`, `.next`, 3 MB assets copied into images); `next.config.mjs` has no `output: 'standalone'`, no security headers; `MessageContent` imports full Prism.
- Styling: Tailwind theme (`brand.*`, `shadow-glass`, `darkMode`) unused; 40+ phantom `animate-in/fade-in` classes (`tailwindcss-animate` not installed); `custom-scrollbar`/`no-scrollbar` undefined; the same 45×/26×/21× class strings that should be primitives; arbitrary 8–13 px sizes instead of a scale.
- Primitives: `Button` has no `loading`/`type`; `Tabs` has no arrow-key navigation; nested live regions in Toast; `Modal` not portalled, no scroll lock; `StatTable` without caption/scope.

## 5. Largest files (lines)
`guide/sections/ApiKeys.tsx` 1029 · `EnvironmentDiagnostics.tsx` 713 · `FirstModelTutorial.tsx` 678 · `AboutUsage.tsx` 644 · `ChatPlayground.tsx` 542 · `TroubleshootingGuide.tsx` 508 · `ModelOperations.tsx` 496 · `AddingModels.tsx` 466 · `deployment/ImportWizard.tsx` 463 · `SpeculativeDecodingExplainer.tsx` 451 · `deployment/api.ts` 446 · `ExportWizard.tsx` 439 · `system/page.tsx` 430 · `EngineGuide.tsx` 424 · `Charts.tsx` 409 · `validators.ts` 402 · backend `routes/admin.py` 989, `routes/openai.py` 781, `routes/chat.py` 599.

## 6. Fix plan (ordered by value ÷ risk; each phase leaves the app working)

**Phase 1 — correctness, no restructuring (Critical + data-accuracy High).** C1–C11, H1–H13, H17–H27, H30–H33, H38, H40. Backend: usage metering at stream end with real tokens and user/org, filters on KPIs, Prometheus-based TTFT and inference-only throughput, llama.cpp metrics, DCGM fields, `/me/keys` router, user validation, embed exclusion, supervisor-driven running list, CIDR-free allowlist copy. Frontend: the page-level bugs above plus `Button type`, `Modal` effect deps, hydration fix. Verified by the existing suites plus new tests for usage series/filters, `/me/keys`, user validation, `Modal`, `Button`.

**Phase 2 — shared foundation.** `src/lib/{format,errors,ids,config,queryKeys}.ts`; one HTTP client with `ApiError`, central 401 → login with `next=`; auth gate in the admin layout; `useHostIP`; delete dead files/exports/images; `.dockerignore`, `output: 'standalone'`, security headers, `paths` alias, ESLint (`next lint`) in CI; `Button`/`Spinner`/`Eyebrow` primitives; mobile nav; runtime gateway URL (reverse-proxy safe).

**Phase 3 — pages.** Split `system/page.tsx`, `Charts.tsx`, `keys/page.tsx`, `usage/page.tsx`, `chat/page.tsx`, `validators.ts` as listed in the audit; move polling to react-query; user/org filters and columns on Usage; status/self-guard on Users; pagination on Keys/Users.

**Phase 4 — guide and about.** Content-as-data with one primitive set (`CodeBlock`, `Steps`, `Callout`, `Section` with real headings, `Attribution`), interpolated `{{GATEWAY_URL}}`/`{{MODELS_DIR}}`/`{{VLLM_IMAGE}}`/`{{VERSION}}` from a small `/admin/system/about` endpoint, generated sections from the engine spec / scopes / state list / error table, a Vitest lint that checks every `make` target, image tag, anchor and forbidden phrase. Rewrite About Cortex with version, pinned images, links, and an accurate Aulendur Labs blurb. Estimated 6–7 engineer-days; done tab by tab.

## 7. Progress log

### 2026-09-02 — Phase 1 (correctness) and Phase 2 (foundation) done
Backend: usage series accept `day` buckets and are zero-filled; task aliases (`chat`/`completions`→`generate`,
`embeddings`→`embed`); every usage endpoint takes the full filter set; streamed responses are metered at stream
end with the engine's `usage` chunk (injected upstream and stripped again unless the client asked for it);
usage rows carry `user_id`/`org_id`/`username`/`org_name` (from the key owner or the signed-in user); TTFT and
throughput come from Prometheus with inference-only selectors, both engine families, and `null` when there are
no samples; DCGM name/total fixed; host trends up to 24 h; model metrics scraped through the supervisor URL with
the internal key for vLLM *and* llama.cpp (starting/failed models included with their reason); health probe
extracted into `health.probe_upstream` and reused by the Refresh endpoint (managed models included, snapshot
returned); `/v1/models/running` derived from the supervisor state, embeddings excluded, errors propagated; chat
session engine resolved server-side; N+1 removed; self-service `/admin/me/keys` (list/create/revoke) on a
user-session router; user validation (`role`/`status` literals, 8-char passwords, 64-char usernames),
`org_id: null` unassigns, self-delete and last-admin guards; CIDR allowlists with entry validation;
`X-Forwarded-For` only from `TRUSTED_PROXY_IPS`; archive refused unless stopped/failed; key expiry parsed as UTC.
Tests: `test_usage_metering.py`, `test_access_rules.py` (backend suite 92 → green).

Frontend: Usage, Keys (with the non-admin "My API Keys" mode), Health, System Monitor, Chat Playground, Users,
Orgs, Login, admin layout (auth gate + `next=`), SideNav (NavGroup, mobile drawer, "Reached via"),
HostIpDisplay (gateway-derived ports) rewritten against the corrected API; `Button` defaults to
`type="button"` and gained `loading`; `Modal` keeps `onClose` in a ref (no focus jumps), locks body scroll;
`Accordion` no longer reads localStorage during render; `LineChart` maps pointer positions with the real
element width, positions overlays in percent, has unique gradient ids, y-axis ticks and no early return before
hooks; `useChat` tracks message status (`streaming`/`done`/`cancelled`/`failed`), never replays failed or
cancelled turns, uses the engine's usage/timings for tok/s, supports retry; sessions are created on the first
message with the engine resolved server-side; models page saves then applies (restart failures reported as such),
no readiness fan-out, served name derived only until edited and never for a running model, Archive gated,
`hf_offline` removed, calculator honest about unknown VRAM.
Foundation: `src/lib/errors.ts` (`ApiError` class, `errMsg`), `src/lib/format.ts`, one `apiFetch` that throws
`ApiError` and announces 401s (`UserProvider` flips to anonymous → login with `next=`), `useHostIP`, runtime
gateway URL via `/runtime-config.js` (`CORTEX_GATEWAY_URL`, `/` = same origin behind the TLS proxy),
`next.config.mjs` with `output: 'standalone'` + security headers and slim production Dockerfiles, `@/` path
alias (139 imports), ESLint (`next/core-web-vitals`) wired into `npm run lint`, CI and `make test-frontend`,
`.dockerignore` files, dead files/images removed, phantom animation classes stripped, scrollbar classes defined,
Prism light build. 84 vitest tests, typecheck and lint clean. Verified in the browser against the live gateway
(login redirect, playground with a llama.cpp model, usage attribution, health/system/keys/users pages).

### 2026-09-02 — Phase 3 (splits) and Phase 4 (guide as data) done
- Backend `routes/admin.py` split into `admin_system`, `admin_usage`, `admin_upstreams`, `admin_model_metrics`
  (+ `_admin_common`); route table and response shapes verified identical; new `/admin/system/about`.
- Model-form modules split into data + small components (`SpeculativeDecodingExplainer` 451→134 lines on the
  shared `Modal`, `GGUFGroupSelector` 379→153, `fields` → `fields/*`, calculator `autoFit` in `model-math` with
  tests, `LogsViewer` → `logHighlight` + `useLogPoller`, `ArchitectureCompatibility` table extracted); 19 unused
  exports removed; ARIA tab/panel nesting fixed; `Tabs` gained arrow-key navigation and an unknown-id fallback.
- Guide: `src/guide/` holds typed content blocks, fact interpolation from `/admin/system/about` (gateway URL,
  host, paths, pinned images, version, ports), accessible primitives (real headings, one copy button, tables
  with captions, ≥12 px body text) and a renderer. Every tab is now data (`content/*.ts`, 2,875 lines replacing
  ~7,400 lines of TSX); the per-flag configuration reference is generated from the engine spec at render time;
  tests enforce existing make targets, pinned image tags, no stale phrases, no hardcoded ports/paths/LAN IPs,
  unique section ids and known custom blocks. `frontend/app/(admin)/guide/sections/` is gone.
- Ops fix found on the way: `make build-offline ENV=dev` retagged the production image as the dev image; the
  dev tag now comes from a `dev` stage in `Dockerfile.offline`.

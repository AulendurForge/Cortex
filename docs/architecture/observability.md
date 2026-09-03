# Observability

Prometheus scrapes the gateway, the host/GPU/container exporters and **every running model
container**; the gateway reads Prometheus back (`PROMETHEUS_URL`) for the System Monitor page.
Configuration: `infra/prometheus/prometheus.yml`.

## Scrape topology

| Job | Target | How it is reached |
|---|---|---|
| `gateway` | `host.docker.internal:8084/metrics` | the gateway is on the host network; compose adds `host.docker.internal:host-gateway` to Prometheus |
| `cortex-models` | `host.docker.internal:8084/engine-metrics/<model_id>` | **HTTP service discovery** (`http_sd_configs` → `GET /prometheus/sd` on the gateway, one target per running model); the gateway proxies each engine's `/metrics` with the internal API key because engines listen on loopback and require it. Labels `model_id`, `served_model_name`, `engine`, `container`. Prometheus needs no Docker socket. |
| `node-exporter` | `node-exporter:9100` | compose network; `linux` profile |
| `dcgm-exporter` | `dcgm-exporter:9400` | compose network; `gpu` profile |
| `cadvisor` | `cadvisor:8080` | compose network (host loopback `8085`); `linux` profile |

Model containers need no static configuration: the gateway labels each container it starts
(`cortex.managed=1`, `cortex.model_id=<id>`, `cortex.engine=vllm|llamacpp`) and joins it to
`cortex_default`; Prometheus picks it up within `refresh_interval` (15 s) and drops it when it
stops. Both engines expose Prometheus text on port 8000 (`--metrics` is always passed to
llama-server). Check `http://<host>:<PROM_PORT>/targets` or `make monitoring-status`.

Prometheus's host port defaults to `19090` (`PROM_PORT`), avoiding Cockpit and other tools on
9090. The gateway's `PROMETHEUS_URL` follows `PROM_PORT`.
Retention: `PROM_RETENTION` (7d dev, 15d + `PROM_RETENTION_SIZE=10GB` prod).

## Gateway metrics (`/metrics`)

From `backend/src/metrics.py`:

- `gateway_requests_total{route,status}`
- `gateway_request_latency_seconds{route}` (histogram)
- `gateway_upstream_latency_seconds{path}`, `gateway_upstream_latency_by_upstream_seconds{path,base_url}`
- `gateway_stream_ttft_seconds{path}` - time to first token for streams
- `gateway_upstream_selected_total{path,base_url}`
- `gateway_key_auth_allowed_total{reason}`, `gateway_key_auth_blocked_total{reason}`
- `gateway_timeout_errors_total`, `gateway_request_cancellations_total`, `gateway_upstream_health_degradation_total`
- `cortex_model_start_total`, `cortex_model_start_seconds` (histogram), `cortex_model_state_transitions_total` - model lifecycle

## Engine metrics

vLLM (`vllm:` prefix): `num_requests_running`, `num_requests_waiting`,
`prompt_tokens_total`, `generation_tokens_total`, `time_to_first_token_seconds`,
`kv_cache_usage_perc`. llama.cpp (`llamacpp:` prefix, `--metrics` is passed when
`LLAMACPP_METRICS_ENABLED=true`, the default): `prompt_tokens_total`, `tokens_predicted_total`,
`kv_cache_usage_ratio`, `requests_processing`, `requests_deferred`. The gateway aggregates the important ones per model
at `GET /admin/models/metrics` (admin session) for the **System Monitor → Active Models**
panel; it queries the engines directly, so it works even when Prometheus is down.

## Host and GPU metrics

- node-exporter: CPU, memory, disk, network of the host (`--path.*` mounted from `/host`).
- dcgm-exporter: GPU utilization, memory, temperature, power (`DCGM_FI_DEV_*`); needs the
  NVIDIA runtime.
- cAdvisor: per-container CPU/memory/network, including model containers.
- The gateway's `GET /admin/system/gpus` uses NVML directly when the NVIDIA libraries are
  visible to it (the compose service sets `NVIDIA_VISIBLE_DEVICES=all` but does not require the
  NVIDIA runtime); without them the endpoint reports an empty list and the page falls back to
  DCGM data from Prometheus.

## Health

- `GET /health` on the gateway: liveness (used by the compose healthcheck).
- `GET /admin/models/{id}/readiness`: `status` = `stopped` / `loading` (+ `detail`) / `ready` /
  `error` (+ `detail` = `state_reason`) per model; the supervisor updates `state` from the same probe every `MODEL_RECONCILE_SEC`.
- Compose healthchecks on postgres (`pg_isready`), redis (`PING`), gateway (`/health`),
  prometheus (`/-/ready`), frontend (`/login`, prod).

## Tracing and logs

- OpenTelemetry is optional: `OTEL_ENABLED=true`, `OTEL_EXPORTER_OTLP_ENDPOINT`,
  `OTEL_SERVICE_NAME`; spans cover FastAPI and httpx upstream calls.
- Logs go to stdout (json-file driver, rotated in prod); every request carries an
  `X-Request-ID` echoed in the response. See the [runbooks](../operations/runbooks.md#where-the-logs-are).

## Dashboards

No Grafana ships with Cortex. The System Monitor page covers day-to-day needs; for Grafana,
point it at `http://<host>:<PROM_PORT>` and start from the vLLM and node-exporter community
dashboards, filtering model panels by the `model_id` / `engine` labels above.

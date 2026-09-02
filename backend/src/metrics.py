from prometheus_client import Counter, Histogram

# Request-level metrics
REQ_COUNT = Counter("gateway_requests_total", "Total requests", ["route", "status"]) 
LATENCY = Histogram("gateway_request_latency_seconds", "Request latency", ["route"]) 

# Upstream interaction metrics
UPSTREAM_LATENCY = Histogram("gateway_upstream_latency_seconds", "Upstream latency by path", ["path"]) 
UPSTREAM_LATENCY_BY_UPSTREAM = Histogram(
    "gateway_upstream_latency_by_upstream_seconds",
    "Upstream latency by path and base_url",
    ["path", "base_url"],
)
STREAM_TTFT_SECONDS = Histogram(
    "gateway_stream_ttft_seconds",
    "Time to first token (first upstream chunk) for streaming routes",
    ["path"],
)
UPSTREAM_SELECTED = Counter(
    "gateway_upstream_selected_total",
    "Count of upstream selections by path and base_url",
    ["path", "base_url"],
)

# Auth decision metrics
KEY_AUTH_ALLOWED = Counter(
    "gateway_key_auth_allowed_total",
    "API key auth accepted",
    ["reason"],
)
KEY_AUTH_BLOCKED = Counter(
    "gateway_key_auth_blocked_total",
    "API key auth blocked",
    ["reason"],
)

# Timeout and reliability metrics
TIMEOUT_ERRORS = Counter(
    "gateway_timeout_errors_total",
    "Request timeout errors by model and type",
    ["model", "error_type", "path"],
)
REQUEST_CANCELLATIONS = Counter(
    "gateway_request_cancellations_total", 
    "Request cancellations by model and reason",
    ["model", "reason", "path"],
)
UPSTREAM_HEALTH_DEGRADATION = Counter(
    "gateway_upstream_health_degradation_total",
    "Upstream health degradation events",
    ["base_url", "reason"],
)



# Model lifecycle (ModelSupervisor)
MODEL_START_TOTAL = Counter(
    "cortex_model_start_total", "Model start attempts by engine and outcome", ["engine", "result"]
)
MODEL_START_SECONDS = Histogram(
    "cortex_model_start_seconds", "Seconds from container start to ready", ["engine"],
    buckets=(5, 10, 20, 30, 60, 120, 300, 600, 1200),
)
MODEL_STATE_TRANSITIONS = Counter(
    "cortex_model_state_transitions_total", "Model state transitions", ["engine", "state"]
)

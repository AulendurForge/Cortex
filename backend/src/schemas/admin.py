"""Pydantic schemas for admin endpoints."""

from pydantic import BaseModel
from typing import Optional


class SystemSummary(BaseModel):
    """System resource summary."""
    cpu_count: int | None = None
    load_avg_1m: float | None = None
    mem_total_mb: float | None = None
    mem_used_mb: float | None = None
    disk_total_gb: float | None = None
    disk_used_gb: float | None = None
    gpus: int | None = None
    cuda_driver: str | None = None


class ThroughputSummary(BaseModel):
    """Inference throughput and latency (Prometheus, last minutes). Only /v1 inference routes count;
    token rates sum vLLM and llama.cpp engine metrics. Null = no samples in the window."""
    req_per_sec: float
    prompt_tokens_per_sec: float
    generation_tokens_per_sec: float
    latency_p50_ms: float | None
    latency_p95_ms: float | None
    ttft_p50_ms: float | None
    ttft_p95_ms: float | None
    scope: str = "inference"
    units: dict[str, str] = {"req_per_sec": "req/s", "prompt_tokens_per_sec": "tok/s", "generation_tokens_per_sec": "tok/s",
                             "latency_p50_ms": "ms", "latency_p95_ms": "ms", "ttft_p50_ms": "ms", "ttft_p95_ms": "ms"}


class GpuMetrics(BaseModel):
    """Per-GPU metrics."""
    index: int
    name: str | None = None
    utilization_pct: float | None = None
    mem_used_mb: float | None = None
    mem_total_mb: float | None = None
    temperature_c: float | None = None
    # Flash Attention compatibility (Gap #8)
    compute_capability: str | None = None  # e.g., "8.6" for SM 86
    architecture: str | None = None  # e.g., "Ampere", "Ada", "Hopper"
    flash_attention_supported: bool | None = None  # True if SM >= 80


class BootstrapRequest(BaseModel):
    """Request to bootstrap initial admin user."""
    username: str
    password: str
    org_name: str = ""


class RegistryEntry(BaseModel):
    """Model registry entry."""
    served_name: str
    url: str
    task: str


class UsageItem(BaseModel):
    """Individual usage record."""
    id: int
    key_id: int | None
    user_id: int | None = None
    org_id: int | None = None
    username: str | None = None
    org_name: str | None = None
    model_name: str
    task: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    latency_ms: int
    status_code: int
    req_id: str
    created_at: float


class UsageAggItem(BaseModel):
    """Aggregated usage by model."""
    model_name: str
    requests: int
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class UsageSeriesItem(BaseModel):
    """Time-series usage data point."""
    ts: float
    requests: int
    total_tokens: int


class LatencySummary(BaseModel):
    """Latency percentile summary over successful requests."""
    p50_ms: float
    p95_ms: float
    avg_ms: float
    samples: int = 0


class TtftSummary(BaseModel):
    """Time-to-first-token summary from Prometheus (null when there are no samples)."""
    p50_s: float | None
    p95_s: float | None
    samples: int = 0


class HealthRefreshRequest(BaseModel):
    """Request to refresh upstream health checks."""
    urls: list[str] | None = None


class HostSummary(BaseModel):
    """Host system metrics summary."""
    cpu_util_pct: float
    load_avg_1m: float | None = None
    mem_total_mb: float
    mem_used_mb: float
    disk_total_gb: float | None = None
    disk_used_gb: float | None = None
    disk_used_pct: float | None = None
    net_rx_bps: float
    net_tx_bps: float


class TimePoint(BaseModel):
    """Time-series data point."""
    ts: float
    value: float


class HostTrends(BaseModel):
    """Host system metrics trends over time."""
    cpu_util_pct: list[TimePoint]
    mem_used_mb: list[TimePoint]
    disk_used_pct: list[TimePoint]
    net_rx_bps: list[TimePoint]
    net_tx_bps: list[TimePoint]
    # Expanded breakdowns
    cpu_per_core_pct: dict[str, list[TimePoint]] | None = None
    disk_rw_bps: dict[str, dict[str, list[TimePoint]]] | None = None  # {device: {read: [], write: []}}
    net_per_iface_bps: dict[str, dict[str, list[TimePoint]]] | None = None  # {iface: {rx: [], tx: []}}


class PromTargets(BaseModel):
    """Prometheus targets health status."""
    up: bool
    nodeExporter: str | None = None
    dcgmExporter: str | None = None
    cadvisor: str | None = None


class Capabilities(BaseModel):
    """System capabilities and monitoring status."""
    os: str
    isContainer: bool
    isWSL: bool
    prometheus: PromTargets
    gpu: dict
    selectedProviders: dict
    suggestions: list[str]


class ModelMetrics(BaseModel):
    """Per-model engine metrics (vLLM and llama.cpp), scraped through the gateway."""
    model_id: int
    model_name: str
    served_name: str
    engine_type: str = "vllm"
    engine_metrics: str | None = None       # which metric family was parsed
    state_reason: str | None = None
    prompt_tokens_per_sec: float | None = None      # llama.cpp reports rates directly
    generation_tokens_per_sec: float | None = None
    time_to_first_token_avg_ms: float | None = None
    request_latency_avg_ms: float | None = None
    # Request metrics
    num_requests_running: float | None = None
    num_requests_waiting: float | None = None
    num_requests_swapped: float | None = None
    # Token metrics
    prompt_tokens_total: float | None = None
    generation_tokens_total: float | None = None
    # Latency metrics
    time_to_first_token_p50_ms: float | None = None
    time_to_first_token_p95_ms: float | None = None
    request_latency_p50_ms: float | None = None
    request_latency_p95_ms: float | None = None
    # System metrics
    gpu_cache_usage_pct: float | None = None
    cpu_cache_usage_pct: float | None = None
    # Status
    status: str = "unknown"  # "running", "loading", "stopped", "error"
    error: str | None = None


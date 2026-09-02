"""Admin routes: per-model engine metrics scraped from running vLLM / llama.cpp servers."""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends
from sqlalchemy import select

from ..config import get_settings
from ..auth import require_admin
from ..schemas.admin import ModelMetrics
from ._admin_common import _get_session, _get_http_client

router = APIRouter()


# ---------------------------
# Per-model vLLM Metrics (Gap #16)
# ---------------------------

def _num(text: str, pattern: str) -> float | None:
    m = re.search(pattern, text, re.M)
    return float(m.group(1)) if m else None


def parse_engine_metrics(text: str) -> dict:
    """Parse the Prometheus exposition of a vLLM or llama.cpp server into the ModelMetrics fields."""
    out: dict = {}
    if "vllm:" in text:
        out["engine_metrics"] = "vllm"
        out["num_requests_running"] = _num(text, r'^vllm:num_requests_running(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        out["num_requests_waiting"] = _num(text, r'^vllm:num_requests_waiting(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        out["num_requests_swapped"] = _num(text, r'^vllm:num_requests_swapped(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        out["gpu_cache_usage_pct"] = _num(text, r'^vllm:gpu_cache_usage_perc(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        out["cpu_cache_usage_pct"] = _num(text, r'^vllm:cpu_cache_usage_perc(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        out["prompt_tokens_total"] = _num(text, r'^vllm:prompt_tokens_total(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        out["generation_tokens_total"] = _num(text, r'^vllm:generation_tokens_total(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        s, c = _num(text, r'^vllm:time_to_first_token_seconds_sum(?:\{[^}]*\})?\s+([\d.eE+-]+)'), _num(text, r'^vllm:time_to_first_token_seconds_count(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        if s is not None and c:
            out["time_to_first_token_avg_ms"] = s / c * 1000
        s, c = _num(text, r'^vllm:e2e_request_latency_seconds_sum(?:\{[^}]*\})?\s+([\d.eE+-]+)'), _num(text, r'^vllm:e2e_request_latency_seconds_count(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        if s is not None and c:
            out["request_latency_avg_ms"] = s / c * 1000
    elif "llamacpp:" in text:
        out["engine_metrics"] = "llamacpp"
        out["num_requests_running"] = _num(text, r'^llamacpp:requests_processing(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        out["num_requests_waiting"] = _num(text, r'^llamacpp:requests_deferred(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        out["prompt_tokens_total"] = _num(text, r'^llamacpp:prompt_tokens_total(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        out["generation_tokens_total"] = _num(text, r'^llamacpp:tokens_predicted_total(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        pts = _num(text, r'^llamacpp:prompt_tokens_seconds(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        gts = _num(text, r'^llamacpp:predicted_tokens_seconds(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        out["prompt_tokens_per_sec"] = pts
        out["generation_tokens_per_sec"] = gts
        kv = _num(text, r'^llamacpp:kv_cache_usage_ratio(?:\{[^}]*\})?\s+([\d.eE+-]+)')
        out["gpu_cache_usage_pct"] = kv * 100 if kv is not None else None
    return out


async def _scrape_model_metrics(m) -> dict:
    """Fetch and parse /metrics of a managed model through the supervisor's URL with the internal key."""
    from ..services.model_supervisor import supervisor
    client = _get_http_client()
    if not client:
        raise RuntimeError("http client not ready")
    url = await supervisor.model_url(m)
    headers = {}
    key = get_settings().INTERNAL_VLLM_API_KEY
    if key:
        headers["Authorization"] = f"Bearer {key}"
    resp = await client.get(f"{url}/metrics", headers=headers, timeout=5.0)
    if resp.status_code != 200:
        raise RuntimeError(f"engine returned HTTP {resp.status_code} for /metrics")
    return parse_engine_metrics(resp.text)


@router.get("/models/metrics", response_model=list[ModelMetrics])
async def get_model_metrics(_: dict = Depends(require_admin)):
    """Get vLLM metrics for all running models (Gap #16).
    
    Scrapes the /metrics endpoint from each running vLLM container
    and returns parsed metrics for display in System Monitor.
    """
    from ..models import Model
    
    SessionLocal = _get_session()
    if SessionLocal is None:
        return []
    
    results = []
    
    async with SessionLocal() as session:
        res = await session.execute(
            select(Model).where(Model.state.in_(['starting', 'loading', 'running', 'failed']), Model.archived == False)  # noqa: E712
        )
        models = res.scalars().all()

        for m in models:
            entry = ModelMetrics(
                model_id=m.id,
                model_name=m.name,
                served_name=m.served_model_name or m.name,
                engine_type=m.engine_type or "vllm",
                status=m.state or "unknown",
                state_reason=getattr(m, "state_reason", None),
            )
            if m.state == 'running':
                try:
                    metrics = await _scrape_model_metrics(m)
                    for k, v in metrics.items():
                        if hasattr(entry, k):
                            setattr(entry, k, v)
                except Exception as e:
                    entry.error = f"metrics unavailable: {e}"
            results.append(entry)

    return results

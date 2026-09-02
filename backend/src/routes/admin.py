from __future__ import annotations

import logging
import os
import json
import re
import asyncio
import time

import httpx
import httpx as _httpx
from fastapi import APIRouter, HTTPException, Depends, Response, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from typing import Optional
from passlib.context import CryptContext

from ..models import User, Organization
from ..config import get_settings
from ..auth import require_admin
from ..state import snapshot_states, HEALTH_META, register_model_endpoint, unregister_model_endpoint, get_model_registry
from ..schemas.admin import (
    SystemSummary, ThroughputSummary, GpuMetrics, BootstrapRequest, RegistryEntry,
    UsageItem, UsageAggItem, UsageSeriesItem, LatencySummary, TtftSummary,
    HealthRefreshRequest, HostSummary, TimePoint, HostTrends, PromTargets, Capabilities,
    ModelMetrics,
)
from ..utils.prometheus_utils import prom_query, prom_range, prom_range_matrix, prom_instant_matrix
from ..services.usage_analytics import get_usage_records, get_usage_aggregate, get_usage_series, get_usage_latency
from ..services.system_monitoring import get_host_summary, get_host_trends, get_system_capabilities

logger = logging.getLogger(__name__)


def _get_session() -> Optional[object]:
    try:
        from ..main import SessionLocal  # type: ignore
        return SessionLocal
    except Exception:
        return None


def _get_http_client():
    try:
        from ..main import http_client  # type: ignore
        return http_client
    except Exception:
        return None

router = APIRouter()

@router.get("/system/summary", response_model=SystemSummary)
async def system_summary(_: dict = Depends(require_admin)):
    # Best-effort snapshot using /proc and environment hints; can be replaced with Prometheus API later
    try:
        import psutil  # type: ignore
    except Exception:
        psutil = None  # type: ignore
    cpu_count = os.cpu_count() or None
    load1 = None
    mem_total = mem_used = None
    disk_total = disk_used = None
    if psutil:
        try:
            la = psutil.getloadavg()
            load1 = float(la[0]) if la else None
        except Exception:
            pass
        try:
            vm = psutil.virtual_memory()
            mem_total = round(vm.total / (1024 * 1024), 2)
            mem_used = round((vm.total - vm.available) / (1024 * 1024), 2)
        except Exception:
            pass
        try:
            du = psutil.disk_usage('/')
            disk_total = round(du.total / (1024 * 1024 * 1024), 2)
            disk_used = round(du.used / (1024 * 1024 * 1024), 2)
        except Exception:
            pass
    # GPU hints via env (toolkit) or NVML fallback
    gpus = None
    cuda_driver = None
    try:
        from pynvml import nvmlInit, nvmlDeviceGetCount, nvmlShutdown, nvmlSystemGetDriverVersion  # type: ignore
        nvmlInit(); gpus = int(nvmlDeviceGetCount()); cuda_driver = nvmlSystemGetDriverVersion().decode(); nvmlShutdown()
    except Exception:
        try:
            vis = os.environ.get('NVIDIA_VISIBLE_DEVICES', '')
            if vis and vis != 'all':
                gpus = len([x for x in vis.split(',') if x and x != 'void'])
        except Exception:
            pass
    return SystemSummary(
        cpu_count=cpu_count,
        load_avg_1m=load1,
        mem_total_mb=mem_total,
        mem_used_mb=mem_used,
        disk_total_gb=disk_total,
        disk_used_gb=disk_used,
        gpus=gpus,
        cuda_driver=cuda_driver,
    )


async def prom_query(base: str, expr: str, timeout: float = 5.0) -> float | None:
    """Instant Prometheus query returning the first sample as float, or None when there is no
    sample / the value is NaN / Prometheus is unreachable. Runs off the event loop."""
    import math

    def _do() -> float | None:
        try:
            resp = httpx.get(f"{base.rstrip('/')}/api/v1/query", params={"query": expr}, timeout=timeout)
            res = resp.json().get("data", {}).get("result", [])
            if not res:
                return None
            val = float(res[0].get("value", [None, "nan"])[1])
            return None if math.isnan(val) else val
        except Exception:
            return None

    return await asyncio.to_thread(_do)


@router.get("/system/throughput", response_model=ThroughputSummary)
async def system_throughput(settings = Depends(get_settings), _: dict = Depends(require_admin)):
    """Summarize current throughput/latency via Prometheus API (best‑effort) with short TTL cache."""
    # Simple in‑memory cache to avoid hammering Prometheus
    now = time.monotonic()
    ttl = 5.0
    global _throughput_cache  # type: ignore
    try:
        ts, cached = _throughput_cache  # type: ignore
        if now - ts < ttl:
            return cached
    except Exception:
        pass

    base = settings.PROMETHEUS_URL.rstrip("/")
    rate_win = "1m"
    q_win = "5m"
    # Only inference routes: the admin UI's own polling of /admin/* and /metrics must not count as traffic
    inf = 'route=~"/v1/(chat/completions|completions|embeddings)"'
    req_per_sec = await prom_query(base, f"sum(rate(gateway_requests_total{{{inf}}}[{rate_win}]))") or 0.0
    pts = await prom_query(base, f"sum(rate(vllm:prompt_tokens_total[{rate_win}]) or vector(0)) + sum(rate(llamacpp:prompt_tokens_total[{rate_win}]) or vector(0))") or 0.0
    gts = await prom_query(base, f"sum(rate(vllm:generation_tokens_total[{rate_win}]) or vector(0)) + sum(rate(llamacpp:tokens_predicted_total[{rate_win}]) or vector(0))") or 0.0
    lat_p50 = await prom_query(base, f"histogram_quantile(0.5, sum by (le) (rate(gateway_request_latency_seconds_bucket{{{inf}}}[{q_win}])))")
    lat_p95 = await prom_query(base, f"histogram_quantile(0.95, sum by (le) (rate(gateway_request_latency_seconds_bucket{{{inf}}}[{q_win}])))")
    ttft_p50 = await prom_query(base, f"histogram_quantile(0.5, sum by (le) (rate(gateway_stream_ttft_seconds_bucket[{q_win}])))")
    ttft_p95 = await prom_query(base, f"histogram_quantile(0.95, sum by (le) (rate(gateway_stream_ttft_seconds_bucket[{q_win}])))")

    def ms(v):
        return None if v is None else v * 1000.0

    out = ThroughputSummary(
        req_per_sec=req_per_sec,
        prompt_tokens_per_sec=pts,
        generation_tokens_per_sec=gts,
        latency_p50_ms=ms(lat_p50),
        latency_p95_ms=ms(lat_p95),
        ttft_p50_ms=ms(ttft_p50),
        ttft_p95_ms=ms(ttft_p95),
    )
    _throughput_cache = (now, out)  # type: ignore
    return out


@router.get("/system/gpus", response_model=list[GpuMetrics])
async def system_gpus(_: dict = Depends(require_admin)):
    """Fetch per-GPU metrics (Prometheus/DCGM first, NVML fallback)."""
    return await collect_gpu_metrics()


async def collect_gpu_metrics() -> list[GpuMetrics]:
    """Per-GPU metrics via Prometheus DCGM exporter, supplemented/replaced by NVML (best effort).

    Returns an empty list when neither source is reachable.  Also used by the
    dry-run validator (services.system_monitoring.get_gpu_metrics).
    """
    settings = get_settings()
    url = f"{settings.PROMETHEUS_URL}/api/v1/query"
    # DCGM exposes used/free framebuffer (MiB) and the GPU name as the ``modelName`` label
    queries = {
        "util": 'DCGM_FI_DEV_GPU_UTIL',
        "mem_used": 'DCGM_FI_DEV_FB_USED',
        "mem_free": 'DCGM_FI_DEV_FB_FREE',
        "temp": 'DCGM_FI_DEV_GPU_TEMP',
    }
    # Short TTL cache
    now = time.monotonic()
    ttl = 5.0
    global _gpus_cache  # type: ignore
    try:
        ts, cached = _gpus_cache  # type: ignore
        if now - ts < ttl:
            return cached
    except Exception:
        pass

    results: dict[str, dict[str, float | str]] = {}
    async with _httpx.AsyncClient(timeout=5.0) as client:
        for key, q in queries.items():
            try:
                resp = await client.get(url, params={"query": q})
                data = resp.json()
                for r in data.get("data", {}).get("result", []):
                    idx = r.get("metric", {}).get("gpu") or r.get("metric", {}).get("GPU") or r.get("metric", {}).get("minor_number")
                    if idx is None:
                        continue
                    entry = results.setdefault(str(idx), {})
                    val = r.get("value", [None, None])[1]
                    model_name = r.get("metric", {}).get("modelName")
                    if model_name and "name" not in entry:
                        entry["name"] = str(model_name)
                    try:
                        entry[key] = float(val)
                    except Exception:
                        pass
            except Exception:
                # In dev, Prom may be unavailable; return what we can
                pass
    out: list[GpuMetrics] = []
    for k, v in sorted(results.items(), key=lambda kv: int(kv[0])):
        used = float(v["mem_used"]) if v.get("mem_used") is not None else None
        free = float(v["mem_free"]) if v.get("mem_free") is not None else None
        out.append(
            GpuMetrics(
                index=int(k),
                name=str(v.get("name")) if v.get("name") is not None else None,
                utilization_pct=float(v.get("util")) if v.get("util") is not None else None,
                mem_used_mb=used,
                mem_total_mb=(used + free) if (used is not None and free is not None) else None,
                temperature_c=float(v.get("temp")) if v.get("temp") is not None else None,
            )
        )
    
    # Always try NVML to get compute capability for Flash Attention check (Gap #8)
    # DCGM doesn't provide compute capability, so we supplement with NVML
    try:
        from pynvml import (
            nvmlInit, nvmlShutdown, nvmlDeviceGetCount, nvmlDeviceGetHandleByIndex,
            nvmlDeviceGetCudaComputeCapability
        )  # type: ignore
        nvmlInit()
        try:
            n = int(nvmlDeviceGetCount())
            for i in range(n):
                h = nvmlDeviceGetHandleByIndex(i)
                try:
                    major, minor = nvmlDeviceGetCudaComputeCapability(h)
                    compute_cap = f"{major}.{minor}"
                    architecture = _get_gpu_architecture(major, minor)
                    fa_supported = (major >= 8)
                    
                    # Update existing entry or create new one
                    if i < len(out):
                        out[i] = GpuMetrics(
                            index=out[i].index,
                            name=out[i].name,
                            utilization_pct=out[i].utilization_pct,
                            mem_used_mb=out[i].mem_used_mb,
                            mem_total_mb=out[i].mem_total_mb,
                            temperature_c=out[i].temperature_c,
                            compute_capability=compute_cap,
                            architecture=architecture,
                            flash_attention_supported=fa_supported
                        )
                except Exception:
                    pass
        finally:
            nvmlShutdown()
    except Exception:
        pass
    
    # NVML full fallback if DCGM results are empty (get all metrics from NVML)
    if not out:
        try:
            from pynvml import (
                nvmlInit, nvmlShutdown, nvmlDeviceGetCount, nvmlDeviceGetHandleByIndex,
                nvmlDeviceGetName, nvmlDeviceGetMemoryInfo, nvmlDeviceGetUtilizationRates,
                nvmlDeviceGetTemperature, NVML_TEMPERATURE_GPU, nvmlDeviceGetCudaComputeCapability
            )  # type: ignore
            nvmlInit()
            try:
                n = int(nvmlDeviceGetCount())
                for i in range(n):
                    h = nvmlDeviceGetHandleByIndex(i)
                    try:
                        name = nvmlDeviceGetName(h).decode()
                    except Exception:
                        name = None
                    try:
                        mem = nvmlDeviceGetMemoryInfo(h)
                        mem_used_mb = float(mem.used) / (1024 * 1024)
                        mem_total_mb = float(mem.total) / (1024 * 1024)
                    except Exception:
                        mem_used_mb = mem_total_mb = None
                    try:
                        util = nvmlDeviceGetUtilizationRates(h)
                        util_pct = float(util.gpu)
                    except Exception:
                        util_pct = None
                    try:
                        temp = float(nvmlDeviceGetTemperature(h, NVML_TEMPERATURE_GPU))
                    except Exception:
                        temp = None
                    # Get compute capability for Flash Attention check (Gap #8)
                    compute_cap = None
                    architecture = None
                    fa_supported = None
                    try:
                        major, minor = nvmlDeviceGetCudaComputeCapability(h)
                        compute_cap = f"{major}.{minor}"
                        # Determine architecture name based on SM version
                        architecture = _get_gpu_architecture(major, minor)
                        # Flash Attention 2 requires SM 80+ (Ampere and newer)
                        fa_supported = (major >= 8)
                    except Exception:
                        pass
                    out.append(GpuMetrics(
                        index=i, name=name, utilization_pct=util_pct, 
                        mem_used_mb=mem_used_mb, mem_total_mb=mem_total_mb, temperature_c=temp,
                        compute_capability=compute_cap, architecture=architecture, flash_attention_supported=fa_supported
                    ))
            finally:
                nvmlShutdown()
        except Exception:
            pass
    _gpus_cache = (now, out)  # type: ignore
    return out


def _get_gpu_architecture(major: int, minor: int) -> str:
    """Get GPU architecture name from compute capability (Gap #8)."""
    # Reference: https://developer.nvidia.com/cuda-gpus
    if major == 9:
        return "Hopper"  # H100, H200
    elif major == 8:
        if minor >= 9:
            return "Ada Lovelace"  # RTX 40xx, L40
        else:
            return "Ampere"  # RTX 30xx, A100, A10
    elif major == 7:
        if minor >= 5:
            return "Turing"  # RTX 20xx, T4
        else:
            return "Volta"  # V100
    elif major == 6:
        return "Pascal"  # GTX 10xx, P100
    elif major == 5:
        return "Maxwell"  # GTX 9xx
    elif major == 3:
        return "Kepler"  # GTX 6xx/7xx
    else:
        return f"SM {major}.{minor}"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.get("/upstreams")
async def upstreams_health():
    # Returns in-memory breaker, health snapshots, and diagnostics meta (no secrets)
    out = snapshot_states()
    
    # Add served names to metadata (for UI display)
    try:
        reg = get_model_registry()
        # Build reverse map: url -> [served_names]
        url_to_names: dict[str, list[str]] = {}
        for served_name, meta in reg.items():
            url = str(meta.get("url", ""))
            if url:
                url_to_names.setdefault(url, []).append(served_name)
        
        # Inject served_names into meta for each URL
        meta_dict = out.get("meta", {}) or {}
        for url, names in url_to_names.items():
            if url in meta_dict:
                meta_dict[url]["served_names"] = names
        out["meta"] = meta_dict
    except Exception:
        pass
    
    # Filter out stale URLs that are no longer part of active pools/registry
    try:
        settings = get_settings()
        from ..state import registry_urls as _reg_urls
        active: set[str] = set(settings.gen_urls() + settings.emb_urls() + _reg_urls())
        # Trim health/meta/breakers to active set only to avoid duplicates from old ephemeral ports
        health = out.get("health", {}) or {}
        meta = out.get("meta", {}) or {}
        breakers = out.get("circuit_breakers", {}) or {}
        out["health"] = {u: health[u] for u in list(health.keys()) if u in active}
        out["meta"] = {u: meta[u] for u in list(meta.keys()) if u in active}
        out["circuit_breakers"] = {u: breakers[u] for u in list(breakers.keys()) if u in active}
    except Exception:
        # best-effort filtering only
        pass
    # Derive breaker state summary and cooldown remaining per URL
    try:
        now = out.get("now") or time.time()
        breakers = out.get("circuit_breakers", {})
        meta = out.get("meta", {})
        for url, st in breakers.items():
            open_until = float(st.get("open_until", 0.0))
            cooldown = max(0.0, open_until - now)
            m = meta.setdefault(url, {})
            m["breaker"] = {
                "state": "OPEN" if cooldown > 0 else "CLOSED",
                "cooldown_remaining_sec": round(cooldown, 3),
                "consecutive_fails": int(st.get("fail", 0)),
            }
        out["meta"] = meta
    except Exception:
        pass
    out["health_ttl_sec"] = get_settings().HEALTH_CHECK_TTL_SEC
    # Optionally add per-engine tokens/sec via Prometheus (best-effort)
    try:
        settings = get_settings()
        base = settings.PROMETHEUS_URL.rstrip("/")
        # Build simple mapping from URL host:port (e.g., vllm-gen:8000) for instance label
        meta = out.get("meta", {})
        # Add/normalize category. Prefer existing category (from health poller/registry).
        # If missing or unknown, infer from configured pools or registry mapping.
        try:
            gen_urls = set(settings.gen_urls())
            emb_urls = set(settings.emb_urls())
            from ..state import get_model_registry as _get_reg
            reg = _get_reg()
            # Build quick reverse map: url -> task
            url_to_task: dict[str, str] = {}
            for _name, _meta in reg.items():
                try:
                    u = str(_meta.get("url")); t = str(_meta.get("task") or "generate")
                    if u:
                        url_to_task[u] = t
                except Exception:
                    pass
            for url in list(meta.keys()):
                cat = str(meta.get(url, {}).get("category") or "")
                if not cat or cat == "unknown":
                    if url in gen_urls:
                        cat = "generate"
                    elif url in emb_urls:
                        cat = "embed"
                    elif url in url_to_task:
                        cat = url_to_task.get(url, "unknown")
                    else:
                        cat = "unknown"
                    meta[url]["category"] = cat
        except Exception:
            pass
        # Engines are scraped through the gateway (see /prometheus/sd), so select by served model
        # name rather than by upstream instance; sum vLLM and llama.cpp families.
        for url in list(meta.keys()):
            names = [n for n in (url_to_names.get(url) or meta.get(url, {}).get("served_names") or []) if n]
            if not names:
                meta[url]["tokens_per_sec"] = None
                continue
            sel = 'served_model_name=~"' + "|".join(re.escape(n) for n in names) + '"'
            pts = await prom_query(base, f'sum(rate(vllm:prompt_tokens_total{{{sel}}}[1m]) or vector(0)) + sum(rate(llamacpp:prompt_tokens_total{{{sel}}}[1m]) or vector(0))')
            gts = await prom_query(base, f'sum(rate(vllm:generation_tokens_total{{{sel}}}[1m]) or vector(0)) + sum(rate(llamacpp:tokens_predicted_total{{{sel}}}[1m]) or vector(0))')
            meta[url]["tokens_per_sec"] = {"prompt": pts, "generation": gts} if (pts is not None or gts is not None) else None
        # Best-effort model list via /v1/models (requires internal key if enforced)
        try:
            for url in list(meta.keys()):
                try:
                    headers = {}
                    if settings.INTERNAL_VLLM_API_KEY:
                        headers["Authorization"] = f"Bearer {settings.INTERNAL_VLLM_API_KEY}"
                    r = httpx.get(f"{url}/v1/models", headers=headers, timeout=3.0)
                    data = r.json()
                    ids = [m.get("id") for m in (data.get("data") or []) if isinstance(m, dict) and m.get("id")]
                    if ids:
                        meta[url]["models"] = ids
                except Exception:
                    pass
        except Exception:
            pass
        # Final normalization: if any url matches a registry entry, force category from that task
        try:
            from ..state import get_model_registry as _get_reg2
            reg2 = _get_reg2()
            url_to_task2 = {str(v.get("url")): str(v.get("task") or "generate") for v in reg2.values() if isinstance(v, dict)}
            for url in list(meta.keys()):
                if url in url_to_task2:
                    meta[url]["category"] = url_to_task2[url]
            out["meta"] = meta
        except Exception:
            pass
    except Exception:
        pass
    # Always enforce registry category mapping even if previous block failed
    try:
        from ..state import get_model_registry as _reg_final
        reg_final = _reg_final()
        meta = out.get("meta", {}) or {}
        url_to_task_final = {str(v.get("url")): str(v.get("task") or "generate") for v in reg_final.values() if isinstance(v, dict)}
        for url, task in url_to_task_final.items():
            if url in meta:
                meta[url]["category"] = task
        out["meta"] = meta
    except Exception:
        pass
    return out


# ---------------------------
# Gateway model registry
# ---------------------------

@router.get("/models/registry", response_model=dict)
async def list_model_registry(_: dict = Depends(require_admin)):
    return get_model_registry()


@router.post("/models/registry")
async def add_model_registry(body: RegistryEntry, _: dict = Depends(require_admin)):
    if not body.served_name or not body.url:
        raise HTTPException(status_code=400, detail="invalid_registry_entry")
    register_model_endpoint(body.served_name, body.url, body.task or "generate")
    # Persist registry to ConfigKV (best-effort)
    try:
        SessionLocal = _get_session()
        if SessionLocal is not None:
            from ..models import ConfigKV  # type: ignore
            import json as _json
            async with SessionLocal() as s:
                val = _json.dumps(get_model_registry())
                from sqlalchemy import select as _select
                row = (await s.execute(_select(ConfigKV).where(ConfigKV.key == "model_registry"))).scalar_one_or_none()
                if row:
                    row.value = val
                else:
                    s.add(ConfigKV(key="model_registry", value=val))
                await s.commit()
    except Exception:
        pass
    return {"status": "ok"}


@router.delete("/models/registry/{served_name}")
async def remove_model_registry(served_name: str, _: dict = Depends(require_admin)):
    if not served_name:
        raise HTTPException(status_code=400, detail="invalid_served_name")
    unregister_model_endpoint(served_name)
    # Persist after removal
    try:
        SessionLocal = _get_session()
        if SessionLocal is not None:
            from ..models import ConfigKV  # type: ignore
            import json as _json
            async with SessionLocal() as s:
                val = _json.dumps(get_model_registry())
                from sqlalchemy import select as _select
                row = (await s.execute(_select(ConfigKV).where(ConfigKV.key == "model_registry"))).scalar_one_or_none()
                if row:
                    row.value = val
                else:
                    s.add(ConfigKV(key="model_registry", value=val))
                await s.commit()
    except Exception:
        pass
    return {"status": "ok"}


@router.get("/usage", response_model=list[UsageItem])
async def list_usage(
    limit: int = 50,
    offset: int = 0,
    hours: Optional[int] = None,
    model: Optional[str] = None,
    task: Optional[str] = None,
    key_id: Optional[int] = None,
    user_id: Optional[int] = None,
    org_id: Optional[int] = None,
    status: Optional[str] = None,
):
    """List usage records with filtering and pagination."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        return await get_usage_records(session, limit, offset, hours, model, task, key_id, user_id, org_id, status)


@router.get("/usage/aggregate", response_model=list[UsageAggItem])
async def usage_aggregate(hours: int = 24, model: Optional[str] = None, task: Optional[str] = None, key_id: Optional[int] = None,
                          user_id: Optional[int] = None, org_id: Optional[int] = None, status: Optional[str] = None):
    """Aggregated usage per model; accepts the same filters as /usage."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        return await get_usage_aggregate(session, hours, model, task=task, key_id=key_id, user_id=user_id, org_id=org_id, status=status)


@router.get("/usage/series", response_model=list[UsageSeriesItem])
async def usage_series(hours: int = 24, bucket: str = "hour", model: Optional[str] = None, task: Optional[str] = None,
                       key_id: Optional[int] = None, user_id: Optional[int] = None, org_id: Optional[int] = None, status: Optional[str] = None):
    """Requests/tokens per bucket (minute | hour | day), zero-filled; same filters as /usage."""
    if bucket not in ("minute", "hour", "day"):
        raise HTTPException(status_code=400, detail="invalid_bucket")
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        return await get_usage_series(session, hours, bucket, model, task=task, key_id=key_id, user_id=user_id, org_id=org_id, status=status)


@router.get("/usage/latency", response_model=LatencySummary)
async def usage_latency(hours: int = 24, model: Optional[str] = None, task: Optional[str] = None, key_id: Optional[int] = None,
                        user_id: Optional[int] = None, org_id: Optional[int] = None, status: Optional[str] = None):
    """Latency percentiles over successful requests; same filters as /usage."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        return await get_usage_latency(session, hours, model, task=task, key_id=key_id, user_id=user_id, org_id=org_id, status=status)


@router.get("/usage/ttft", response_model=TtftSummary)
async def usage_ttft(settings = Depends(get_settings)):
    """Time-to-first-token quantiles of streamed responses over the last 5 minutes, from Prometheus.
    Null when there are no streamed requests in the window (or Prometheus is unreachable)."""
    base = settings.PROMETHEUS_URL
    p50 = await prom_query(base, "histogram_quantile(0.5, sum by (le) (rate(gateway_stream_ttft_seconds_bucket[5m])))")
    p95 = await prom_query(base, "histogram_quantile(0.95, sum by (le) (rate(gateway_stream_ttft_seconds_bucket[5m])))")
    n = await prom_query(base, "sum(increase(gateway_stream_ttft_seconds_count[5m]))")
    return TtftSummary(p50_s=p50, p95_s=p95, samples=int(n or 0))


@router.get("/usage/export")
async def usage_export(
    hours: Optional[int] = None,
    model: Optional[str] = None,
    task: Optional[str] = None,
    key_id: Optional[int] = None,
    user_id: Optional[int] = None,
    org_id: Optional[int] = None,
    status: Optional[str] = None,
):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        from ..models import Usage
        from ..services.usage_analytics import apply_filters
        q = apply_filters(select(Usage), Usage, hours=hours, model=model, task=task, key_id=key_id, user_id=user_id, org_id=org_id, status=status)
        q = q.order_by(Usage.id.desc()).limit(50000)
        rows = (await session.execute(q)).scalars().all()
        import io, csv
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["id", "created_at", "key_id", "user_id", "org_id", "model", "task", "prompt_tokens", "completion_tokens", "total_tokens", "latency_ms", "status_code", "req_id"])
        for r in rows:
            ts = r.created_at.timestamp() if hasattr(r.created_at, 'timestamp') else 0.0
            writer.writerow([r.id, ts, r.key_id, r.user_id, r.org_id, r.model_name, r.task, r.prompt_tokens, r.completion_tokens, r.total_tokens, r.latency_ms, r.status_code, r.req_id])
        return Response(content=buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=usage_export.csv"})


@router.post("/upstreams/refresh-health")
async def refresh_upstreams_health(body: HealthRefreshRequest | None = None, settings = Depends(get_settings)):
    """Probe every upstream now (static pools, managed models and any extra URLs), update the
    shared health state and return the probe results plus the refreshed snapshot."""
    from ..health import probe_upstream, all_upstream_urls
    http_client = _get_http_client()
    if http_client is None:
        raise HTTPException(status_code=503, detail="HTTP client not ready")
    targets = sorted(set(((body.urls if body else None) or []) + all_upstream_urls(settings)))
    results = [await probe_upstream(http_client, u, settings) for u in targets]
    return {"results": results, "snapshot": await upstreams_health()}


# ---------------------------
# Node exporter host metrics
# ---------------------------

@router.get("/system/host/summary", response_model=HostSummary)
async def system_host_summary(settings = Depends(get_settings), _: dict = Depends(require_admin)):
    """Node exporter KPIs: CPU util, mem usage, disk usage, net throughput."""
    return await get_host_summary(settings)


@router.get("/system/host/trends", response_model=HostTrends)
async def system_host_trends(minutes: int = 15, step_s: int = 15, settings = Depends(get_settings), _: dict = Depends(require_admin)):
    """Return 5–15 min trend series for CPU, mem, disk, and network from node-exporter."""
    return await get_host_trends(settings, minutes, step_s)


# ---------------------------
# Capabilities detection
# ---------------------------

@router.get("/system/capabilities", response_model=Capabilities)
async def system_capabilities(settings = Depends(get_settings), _: dict = Depends(require_admin)):
    """Detect system capabilities and monitoring provider status."""
    return await get_system_capabilities(settings)


@router.get("/system/docker-images")
async def list_docker_images(_: dict = Depends(require_admin)):
    """List Docker image cache status for offline deployment readiness.
    
    Returns status of required base images (vLLM, llama.cpp, infrastructure).
    Useful for verifying offline deployment preparation.
    """
    from ..docker_manager import check_image_availability
    import docker
    
    settings = get_settings()
    
    # Check core engine images
    vllm_available, vllm_msg, vllm_details = check_image_availability('vllm')
    llamacpp_available, llamacpp_msg, llamacpp_details = check_image_availability('llamacpp')
    
    # Check infrastructure images (best-effort)
    cli = docker.from_env()
    infrastructure = []
    
    # pinned in versions.env and passed by compose as CORTEX_INFRA_IMAGES
    purposes = {"postgres": "Database", "redis": "Cache/rate limiting", "prometheus": "Metrics collection",
                "node-exporter": "Host metrics", "dcgm": "GPU metrics", "cadvisor": "Container metrics"}
    infra_images = []
    for ref in (settings.CORTEX_INFRA_IMAGES or "").split(","):
        ref = ref.strip()
        if ref:
            infra_images.append((ref, next((p for k, p in purposes.items() if k in ref), "Infrastructure")))
    
    for img_name, purpose in infra_images:
        try:
            img = cli.images.get(img_name)
            size_mb = round(img.attrs.get("Size", 0) / (1024 * 1024), 2)
            infrastructure.append({
                "name": img_name,
                "cached": True,
                "size_mb": size_mb,
                "purpose": purpose,
            })
        except docker.errors.ImageNotFound:
            infrastructure.append({
                "name": img_name,
                "cached": False,
                "purpose": purpose,
                "warning": "Not cached - may require download"
            })
    
    # Overall status
    all_critical_cached = vllm_available and llamacpp_available
    offline_ready = all_critical_cached and all(i["cached"] for i in infrastructure)
    
    return {
        "offline_mode": settings.OFFLINE_MODE,
        "offline_ready": offline_ready,
        "engines": {
            "vllm": vllm_details,
            "llamacpp": llamacpp_details,
        },
        "infrastructure": infrastructure,
        "summary": {
            "critical_images_cached": all_critical_cached,
            "total_images_checked": 2 + len(infrastructure),
            "cached_count": sum([
                1 if vllm_details.get("cached") else 0,
                1 if llamacpp_details.get("cached") else 0,
                sum(1 for i in infrastructure if i.get("cached"))
            ]),
        },
        "recommendations": _get_offline_recommendations(
            vllm_details.get("cached", False),
            llamacpp_details.get("cached", False),
            infrastructure,
            settings.OFFLINE_MODE
        )
    }


def _get_offline_recommendations(vllm_cached: bool, llamacpp_cached: bool, infra: list, offline_mode: bool) -> list[str]:
    """Generate recommendations for offline deployment preparation."""
    recs = []
    
    if not vllm_cached or not llamacpp_cached:
        recs.append(
            "Critical engine images missing. Run 'make prepare-offline' on an internet-connected "
            "machine, then transfer and load the package."
        )
    
    missing_infra = [i for i in infra if not i.get("cached")]
    if missing_infra:
        recs.append(
            f"{len(missing_infra)} infrastructure image(s) not cached. "
            f"Use 'make prepare-offline' to download all required images."
        )
    
    if not offline_mode and (not vllm_cached or not llamacpp_cached):
        recs.append(
            "System is in online mode. Images will be pulled automatically when needed, "
            "but this requires internet access and may take 5-15 minutes per image."
        )
    
    if vllm_cached and llamacpp_cached and not missing_infra:
        recs.append(
            "✓ All critical images cached. System is ready for offline operation. "
            "Set OFFLINE_MODE=True to prevent internet access."
        )
    
    return recs


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

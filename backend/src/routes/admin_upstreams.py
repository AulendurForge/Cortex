"""Admin routes: upstream health/breaker snapshot, on-demand health refresh and the gateway model registry."""
from __future__ import annotations

import re
import time

import httpx
from fastapi import APIRouter, HTTPException, Depends

from ..config import get_settings
from ..auth import require_admin
from ..state import snapshot_states, register_model_endpoint, unregister_model_endpoint, get_model_registry
from ..schemas.admin import RegistryEntry, HealthRefreshRequest
from ._admin_common import _get_session, _get_http_client
from .admin_system import prom_query

router = APIRouter()


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

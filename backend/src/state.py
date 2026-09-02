from __future__ import annotations
import time
from typing import Dict, Any

# In-memory circuit-breaker and health snapshots
CB_STATE: Dict[str, Dict[str, float | int]] = {}
HEALTH_STATE: Dict[str, Dict[str, float | bool]] = {}
# Additional per-upstream diagnostics and recent history for health checks
# Keys are base URLs, values include: last_status_code, last_latency_ms, last_ok_ts,
# last_fail_ts, consecutive_fails, history(list[{ts, ok, latency_ms, status_code}])
HEALTH_META: Dict[str, Dict[str, Any]] = {}
LB_INDEX: Dict[str, int] = {}

# Dynamic model registry: served name -> { url, task, engine_type, request_defaults_json }
MODEL_REGISTRY: Dict[str, Dict[str, Any]] = {}

def register_model_endpoint(
    served_name: str,
    url: str,
    task: str,
    engine_type: str = "vllm",
    request_defaults_json: str | None = None,
    vllm_v1_enabled: bool | None = None,
    authoritative: bool | None = None,
) -> None:
    """Register a model endpoint in the runtime registry.
    
    Args:
        served_name: Model name used in API requests
        url: Base URL for model endpoint
        task: Model task (generate/embed)
        engine_type: Engine type (vllm/llamacpp) for request translation
        request_defaults_json: JSON string of request defaults (Plane C)
        vllm_v1_enabled: Whether V1 engine is enabled (Gap #7)
    """
    # IMPORTANT: this function is called from two different contexts:
    # 1) Managed-model registration (authoritative): provides engine_type and request defaults.
    # 2) Health poller discovery (best-effort): may only know url/task and should NOT wipe
    #    existing richer metadata (engine_type, request_defaults_json).
    existing = MODEL_REGISTRY.get(served_name) if served_name else None
    if authoritative is None:
        is_discovery = (engine_type == "vllm" and request_defaults_json is None and vllm_v1_enabled is None)
    else:
        is_discovery = not authoritative

    if isinstance(existing, dict) and is_discovery:
        # Preserve richer fields; only refresh url and fill missing task.
        merged = dict(existing)
        if url:
            merged["url"] = url
        if task and (not merged.get("task") or str(merged.get("task")) == "unknown"):
            merged["task"] = task
        # Do NOT overwrite engine_type, request_defaults_json, or vllm_v1_enabled on discovery.
        MODEL_REGISTRY[served_name] = merged
        return

    # Authoritative (or first-time) registration: set/overwrite all fields.
    MODEL_REGISTRY[served_name] = {
        "url": url,
        "task": task,
        "engine_type": engine_type,
        "request_defaults_json": request_defaults_json,
        "vllm_v1_enabled": vllm_v1_enabled,
    }

def unregister_model_endpoint(served_name: str) -> None:
    try:
        MODEL_REGISTRY.pop(served_name, None)
    except Exception:
        pass

def get_model_registry() -> Dict[str, Dict[str, Any]]:
    return MODEL_REGISTRY.copy()

def set_model_registry(entries: Dict[str, Dict[str, Any]]) -> None:
    """Replace in-memory registry with provided entries (used on startup load)."""
    try:
        MODEL_REGISTRY.clear()
        for k, v in (entries or {}).items():
            url = str(v.get("url", "")) if isinstance(v, dict) else ""
            task = str(v.get("task", "generate")) if isinstance(v, dict) else "generate"
            engine_type = str(v.get("engine_type", "vllm")) if isinstance(v, dict) else "vllm"
            request_defaults_json = v.get("request_defaults_json") if isinstance(v, dict) else None
            vllm_v1_enabled = v.get("vllm_v1_enabled") if isinstance(v, dict) else None
            if url:
                MODEL_REGISTRY[str(k)] = {
                    "url": url, 
                    "task": task,
                    "engine_type": engine_type,
                    "request_defaults_json": request_defaults_json,
                    "vllm_v1_enabled": vllm_v1_enabled,
                }
    except Exception:
        # Best-effort load; ignore malformed entries
        pass

def registry_urls() -> list[str]:
    try:
        return sorted({meta.get("url", "") for meta in MODEL_REGISTRY.values() if meta.get("url")})
    except Exception:
        return []

def snapshot_states() -> dict[str, Any]:
    return {
        "circuit_breakers": CB_STATE.copy(),
        "health": HEALTH_STATE.copy(),
        "meta": HEALTH_META.copy(),
        "registry": MODEL_REGISTRY.copy(),
        "lb_index": LB_INDEX.copy(),
        "now": time.time(),
    }



from __future__ import annotations
import asyncio
import time
import httpx
from .config import get_settings
from .state import CB_STATE, HEALTH_STATE, HEALTH_META, register_model_endpoint, registry_urls
from prometheus_client import Gauge


async def poll_upstreams_periodically(http_client: httpx.AsyncClient) -> None:
    """Background health poller for upstream gen/emb pools.
    Uses HEAD/GET to HEALTH_CHECK_PATH, updates HEALTH_STATE and CB_STATE.
    """
    while True:
        settings = get_settings()
        try:
            # Poll static upstreams plus any dynamically registered managed model URLs
            urls = sorted(set(settings.gen_urls() + settings.emb_urls() + registry_urls()))
            for base in urls:
                start = time.time()
                status_code: int | None = None
                try:
                    # httpx 0.27 requires either a default or all four timeout params
                    resp = await http_client.get(
                        f"{base}{settings.HEALTH_CHECK_PATH}",
                        timeout=httpx.Timeout(connect=2.0, read=3.0, write=3.0, pool=5.0),
                    )
                    status_code = int(resp.status_code)
                    ok = 200 <= resp.status_code < 500
                except Exception as e:
                    ok = False
                    last_error = str(e.__class__.__name__)
                elapsed_ms = int((time.time() - start) * 1000)
                now_ts = time.time()
                HEALTH_STATE[base] = {"ok": ok, "ts": now_ts}
                meta = HEALTH_META.setdefault(base, {"history": []})
                if ok:
                    meta["last_ok_ts"] = now_ts
                    meta["consecutive_fails"] = 0
                    # clear last error on success
                    if "last_error" in meta:
                        meta.pop("last_error", None)
                    # Periodically discover models served by this upstream and register them
                    last_models_ts = float(meta.get("_models_ts", 0.0) or 0.0)
                    if now_ts - last_models_ts > 60.0:
                        try:
                            headers = {}
                            if settings.INTERNAL_VLLM_API_KEY:
                                headers["Authorization"] = f"Bearer {settings.INTERNAL_VLLM_API_KEY}"
                            r = await http_client.get(f"{base}/v1/models", headers=headers, timeout=httpx.Timeout(connect=2.0, read=4.0, write=3.0, pool=5.0))
                            if r.status_code < 500:
                                data = r.json()
                                ids = [m.get("id") for m in (data.get("data") or []) if isinstance(m, dict) and m.get("id")]
                                if ids:
                                    # Determine task category by whether base is in gen or emb pools
                                    cat = "generate"
                                    try:
                                        gen_set = set(settings.gen_urls())
                                        emb_set = set(settings.emb_urls())
                                        if base in emb_set:
                                            cat = "embed"
                                    except Exception:
                                        pass
                                    # If not matched, infer from registry entries that point to this base
                                    if cat == "generate":
                                        try:
                                            from .state import MODEL_REGISTRY  # local import
                                            for _name, meta2 in MODEL_REGISTRY.items():
                                                if isinstance(meta2, dict) and meta2.get("url") == base and meta2.get("task"):
                                                    cat = str(meta2.get("task"))
                                                    break
                                        except Exception:
                                            pass
                                    # Persist category for UI grouping
                                    meta["category"] = cat
                                    for mid in ids:
                                        try:
                                            register_model_endpoint(str(mid), base, cat, authoritative=False)
                                        except Exception:
                                            pass
                                    meta["models"] = ids
                                meta["_models_ts"] = now_ts
                        except Exception:
                            pass
                else:
                    meta["last_fail_ts"] = now_ts
                    meta["consecutive_fails"] = int(meta.get("consecutive_fails", 0)) + 1
                    meta["last_error"] = last_error if "last_error" in dir() else "error"
                meta["last_status_code"] = status_code
                meta["last_latency_ms"] = elapsed_ms
                # Maintain short history ring buffer (max 50)
                hist = meta.get("history", [])
                hist.append({"ts": now_ts, "ok": ok, "latency_ms": elapsed_ms, "status_code": status_code})
                if len(hist) > 50:
                    hist = hist[-50:]
                meta["history"] = hist
                try:
                    UPSTREAM_HEALTH.labels(base_url=base).set(1 if ok else 0)
                except Exception:
                    pass
                if not ok:
                    # Increment breaker failure count; trip if threshold reached
                    st = CB_STATE.setdefault(base, {"fail": 0, "open_until": 0.0})
                    st["fail"] = int(st.get("fail", 0)) + 1
                    if st["fail"] >= settings.CB_FAILURE_THRESHOLD:
                        st["open_until"] = time.time() + settings.CB_COOLDOWN_SEC
                else:
                    st = CB_STATE.setdefault(base, {"fail": 0, "open_until": 0.0})
                    st["fail"] = 0
                    st["open_until"] = 0.0
        except asyncio.CancelledError:
            # Graceful shutdown: exit the loop quietly
            break
        except Exception:
            # Never crash the poller
            pass
        try:
            await asyncio.sleep(max(1, int(settings.HEALTH_POLL_SEC)))
        except asyncio.CancelledError:
            break

# Prometheus gauge for upstream health (1=up, 0=down)
UPSTREAM_HEALTH = Gauge("gateway_upstream_health", "Upstream health status (1 up, 0 down)", ["base_url"])



import random
import httpx
from typing import AsyncIterator
import asyncio
import uuid
from prometheus_client import Counter
from ..metrics import UPSTREAM_LATENCY, UPSTREAM_LATENCY_BY_UPSTREAM, STREAM_TTFT_SECONDS, UPSTREAM_SELECTED, TIMEOUT_ERRORS, REQUEST_CANCELLATIONS
from starlette.background import BackgroundTask
from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from ..auth import require_api_key
from ..config import get_settings
from ..middleware.usage import record_usage
from ..services.sse_usage import SseUsageTee
from ..middleware.ratelimit import acquire_stream_slot, release_stream_slot
from ..schemas.openai import ChatCompletionRequest, CompletionRequest, EmbeddingsRequest
import time
from ..state import CB_STATE as _CB_STATE  # centralize shared breaker state
from ..state import HEALTH_STATE as _HEALTH_STATE
from ..state import LB_INDEX as _LB_INDEX
from ..state import MODEL_REGISTRY as _MODEL_REGISTRY
from ..token_estimator import estimate_chat_prompt_tokens, rough_token_count

router = APIRouter()
def _get_http_client() -> httpx.AsyncClient | None:
    try:
        from ..main import http_client as _hc  # type: ignore
        return _hc
    except Exception:
        return None

# Simple circuit breaker state per upstream base URL
_CB_STATE: dict[str, dict[str, float | int]] = {}

# Metrics
UPSTREAM_SUCCESS = Counter("gateway_upstream_success_total", "Successful upstream responses", ["path"]) 
UPSTREAM_ERROR = Counter("gateway_upstream_error_total", "Errored upstream responses", ["path"]) 
RETRY_COUNT = Counter("gateway_upstream_retries_total", "Retries attempted for upstream calls", ["path"]) 
BREAKER_OPENED = Counter("gateway_breaker_open_total", "Circuit breaker opened events", ["base_url"]) 
STREAM_BLOCKED = Counter("gateway_stream_blocked_total", "Concurrent stream requests blocked", ["identifier"]) 

# Build a naive prompt from chat messages for models without chat templates
def _messages_to_prompt(messages: list[dict]) -> str:
    try:
        parts: list[str] = []
        for m in messages or []:
            role = str(m.get("role", "")).lower()
            content = m.get("content", "")
            if isinstance(content, list):
                text = " ".join(seg.get("text", "") for seg in content if isinstance(seg, dict))
            else:
                text = str(content)
            label = "System" if role == "system" else ("User" if role == "user" else "Assistant")
            if text:
                parts.append(f"{label}: {text}")
        parts.append("Assistant:")
        return "\n\n".join(parts)
    except Exception:
        return ""

def _identity(auth_ctx) -> dict:
    """key/user/org attribution for usage rows (API key owner, or the signed-in admin UI user)."""
    if not auth_ctx:
        return {"key_id": None, "user_id": None, "org_id": None}
    return {"key_id": auth_ctx.get("key_id"), "user_id": auth_ctx.get("user_id"), "org_id": auth_ctx.get("org_id")}



# ============================================================================
# Plane C: Request Defaults & Engine Translation (Phase 1)
# ============================================================================

# Engine-specific parameter name translation map
# Maps OpenAI-standard keys to engine-specific keys
ENGINE_TRANSLATION_MAP = {
    "vllm": {
        # OpenAI standard → vLLM request key (mostly 1:1, but explicit for clarity)
        "temperature": "temperature",
        "top_p": "top_p",
        "top_k": "top_k",
        "repetition_penalty": "repetition_penalty",
        "frequency_penalty": "frequency_penalty",
        "presence_penalty": "presence_penalty",
        "max_tokens": "max_tokens",
        "stop": "stop",
        "stream": "stream",
        "n": "n",
        "logprobs": "logprobs",
        "echo": "echo",
        "best_of": "best_of",
        "logit_bias": "logit_bias",
        "user": "user",
    },
    "llamacpp": {
        # OpenAI standard → llama.cpp request key (has differences!)
        "temperature": "temp",  # Different!
        "top_p": "top_p",
        "top_k": "top_k",
        "repetition_penalty": "repeat_penalty",  # Different!
        "frequency_penalty": "frequency_penalty",
        "presence_penalty": "presence_penalty",
        "max_tokens": "n_predict",  # Different!
        "stop": "stop",
        "stream": "stream",
        # llama.cpp doesn't support: n, logprobs, echo, best_of, logit_bias
    },
}


def merge_request_defaults(request_payload: dict, model_defaults: dict) -> dict:
    """Merge model defaults into request, only for missing keys.
    
    Client-specified values always take precedence over model defaults.
    This implements Plane C merge strategy.
    
    Args:
        request_payload: Original client request
        model_defaults: Model's configured defaults (from request_defaults_json)
        
    Returns:
        Merged request payload
    """
    merged = request_payload.copy()
    for key, default_value in (model_defaults or {}).items():
        # Only apply default if client didn't specify the key
        if key not in merged or merged[key] is None:
            merged[key] = default_value
    return merged


def translate_request_for_engine(request: dict, engine_type: str) -> dict:
    """Translate OpenAI-standard keys to engine-specific keys.
    
    Different engines use different parameter names for the same concept.
    For example, llama.cpp uses 'temp' instead of 'temperature'.
    
    This implements engine-aware translation (Plane C).
    
    Args:
        request: Request payload with OpenAI-standard keys
        engine_type: Target engine ('vllm' or 'llamacpp')
        
    Returns:
        Translated request payload with engine-specific keys
    """
    translation = ENGINE_TRANSLATION_MAP.get(engine_type, ENGINE_TRANSLATION_MAP["vllm"])
    translated = {}
    
    for openai_key, value in request.items():
        # Translate if mapping exists, otherwise pass through unchanged
        engine_key = translation.get(openai_key, openai_key)
        translated[engine_key] = value
    
    return translated


# ============================================================================
# Gap #4: Error Translation for llama.cpp API
# ============================================================================

def normalize_llamacpp_error(error_response: dict, status_code: int) -> dict:
    """Normalize llama.cpp error responses to OpenAI-compatible format.
    
    llama.cpp returns errors in a slightly different format than OpenAI:
    - llama.cpp: {"error": {"code": 503, "message": "...", "type": "unavailable_error"}}
    - OpenAI:    {"error": {"message": "...", "type": "...", "code": "..."}}
    
    This function normalizes llama.cpp errors to match OpenAI's format.
    
    Args:
        error_response: The error response from llama.cpp
        status_code: HTTP status code
        
    Returns:
        Normalized error response in OpenAI format
    """
    # Extract error object
    error = error_response.get("error", {})
    
    # If it's already a string, wrap it
    if isinstance(error, str):
        return {
            "error": {
                "message": error,
                "type": "server_error",
                "code": str(status_code)
            }
        }
    
    # Map llama.cpp error types to OpenAI types
    llamacpp_type = error.get("type", "")
    message = error.get("message", "Unknown error")
    code = error.get("code", status_code)
    
    # Type mapping
    type_mapping = {
        "unavailable_error": "service_unavailable",
        "invalid_request_error": "invalid_request_error",
        "server_error": "server_error",
        "rate_limit_error": "rate_limit_error",
    }
    
    openai_type = type_mapping.get(llamacpp_type, "server_error")
    
    # Handle specific llama.cpp error messages
    if "Loading model" in message or "loading model" in message.lower():
        return {
            "error": {
                "message": "Model is still loading. Please wait and retry.",
                "type": "service_unavailable",
                "code": "model_loading",
                "retry_after": 30
            }
        }
    
    if "slot unavailable" in message.lower():
        return {
            "error": {
                "message": "All inference slots are busy. Please retry in a moment.",
                "type": "rate_limit_error",
                "code": "slot_unavailable",
                "retry_after": 5
            }
        }
    
    if "context length" in message.lower() or "context size" in message.lower():
        return {
            "error": {
                "message": f"Request exceeds model's context length. {message}",
                "type": "invalid_request_error",
                "code": "context_length_exceeded"
            }
        }
    
    # Default normalization
    return {
        "error": {
            "message": message,
            "type": openai_type,
            "code": str(code)
        }
    }


def translate_error_response(response_content: dict, status_code: int, engine_type: str) -> dict:
    """Translate engine-specific error responses to OpenAI format.
    
    Args:
        response_content: The error response content
        status_code: HTTP status code
        engine_type: The engine type ('vllm' or 'llamacpp')
        
    Returns:
        Normalized error response
    """
    if engine_type == "llamacpp":
        return normalize_llamacpp_error(response_content, status_code)
    
    # vLLM errors are mostly OpenAI-compatible, pass through
    return response_content


def _cb_is_available(url: str) -> bool:
    settings = get_settings()
    if not settings.CB_ENABLED:
        return True
    state = _CB_STATE.get(url)
    if not state:
        return True
    open_until = float(state.get("open_until", 0.0))
    return time.time() >= open_until

async def _health_check(url: str) -> None:
    settings = get_settings()
    client = _get_http_client()
    if client is None:
        return
    try:
        t0 = time.time()
        # Use explicit 4-field timeout for httpx 0.27 compatibility
        resp = await client.get(
            f"{url}{settings.HEALTH_CHECK_PATH}",
            timeout=httpx.Timeout(connect=2.0, read=3.0, write=3.0, pool=5.0),
        )
        if 200 <= resp.status_code < 500:
            _HEALTH_STATE[url] = {"ok": True, "ts": time.time()}
            _cb_record_success(url)
        else:
            _HEALTH_STATE[url] = {"ok": False, "ts": time.time()}
            _cb_record_failure(url)
        UPSTREAM_LATENCY.labels(path="/health").observe(time.time() - t0)
    except Exception:
        _HEALTH_STATE[url] = {"ok": False, "ts": time.time()}
        _cb_record_failure(url)

def _cb_record_success(url: str):
    settings = get_settings()
    if not settings.CB_ENABLED:
        return
    st = _CB_STATE.setdefault(url, {"fail": 0, "open_until": 0.0})
    st["fail"] = 0
    st["open_until"] = 0.0

def _cb_record_failure(url: str):
    settings = get_settings()
    if not settings.CB_ENABLED:
        return
    st = _CB_STATE.setdefault(url, {"fail": 0, "open_until": 0.0})
    st["fail"] = int(st.get("fail", 0)) + 1
    if st["fail"] >= settings.CB_FAILURE_THRESHOLD:
        st["open_until"] = time.time() + settings.CB_COOLDOWN_SEC
        BREAKER_OPENED.labels(base_url=url).inc()

def choose_url(urls):
    # Prefer healthy (recently OK) and breaker-closed URLs; use simple round-robin among pool
    now = time.time()
    ttl = get_settings().HEALTH_CHECK_TTL_SEC
    pool = [
        u for u in urls
        if _cb_is_available(u) and (
            _HEALTH_STATE.get(u, {}).get("ok", False)
            and (now - float(_HEALTH_STATE.get(u, {}).get("ts", 0.0)) <= ttl)
        )
    ] or urls
    if not pool:
        # No upstreams configured; raise a clear error instead of ZeroDivision
        raise HTTPException(status_code=503, detail="no_upstreams_available")
    key = ",".join(pool)
    idx = _LB_INDEX.get(key, 0) % len(pool)
    _LB_INDEX[key] = idx + 1
    chosen = pool[idx]
    # Best-effort: increment selection once per call site using path stored later
    return chosen

def get_timeout_for_request(model_name: str, max_tokens: int, is_streaming: bool) -> httpx.Timeout:
    """Calculate appropriate timeout with intelligent fallback.
    
    Phase 1/3 improvement: Removed model name heuristics (Issue 3 fix).
    
    Priority:
    1. Use explicit timeout from model registry (if configured)
    2. Estimate based on max_tokens (typical throughput: ~20 tokens/sec)
    
    Args:
        model_name: Model being called (for registry lookup)
        max_tokens: Maximum tokens requested
        is_streaming: Whether request is streaming
        
    Returns:
        httpx.Timeout object
    """
    # Try to get explicit timeout from model registry
    if model_name and model_name in _MODEL_REGISTRY:
        entry = _MODEL_REGISTRY.get(model_name) or {}
        # Note: request_timeout_sec and stream_timeout_sec will be added to registry
        # in future when we persist them from Model table (currently just defaults)
        try:
            import json
            if entry.get("request_defaults_json"):
                defaults = json.loads(entry["request_defaults_json"])
                timeout_sec = defaults.get("stream_timeout_sec" if is_streaming else "request_timeout_sec")
                if timeout_sec and isinstance(timeout_sec, (int, float)):
                    return httpx.Timeout(connect=5.0, read=float(timeout_sec), write=10.0, pool=5.0)
        except Exception:
            pass
    
    # Fallback: Estimate based on max_tokens
    # Assumption: typical inference throughput ~20 tokens/sec for 70B-class models
    # Add base overhead for model processing (15s) + token generation time
    base_overhead = 20 if is_streaming else 15
    token_time = max_tokens / 20.0  # ~20 tokens/sec average
    estimated_sec = base_overhead + token_time
    
    # Cap at reasonable limits
    read_timeout = max(30, min(300, estimated_sec))  # 30s min, 5min max
    
    return httpx.Timeout(connect=5.0, read=read_timeout, write=10.0, pool=5.0)


def choose_by_model_or_task(model: str | None, task_hint: str | None, settings) -> tuple[str, str]:
    """Return (base_url, path_prefix) based on model registry or task hint.
    Defaults to generation pool when unknown.
    """
    try:
        if model and model in _MODEL_REGISTRY:
            entry = _MODEL_REGISTRY.get(model) or {}
            url = str(entry.get("url") or "")
            task = str(entry.get("task") or "generate")
            if url:
                return url, task
    except Exception:
        pass
    # Fallback by hint
    t = (task_hint or "").lower()
    if t.startswith("embed"):
        return choose_url(settings.emb_urls()), "embed"
    return choose_url(settings.gen_urls()), "generate"

def _require_scope(scopes: set[str], path: str):
    if path.endswith("/embeddings"):
        needed = "embeddings"
    elif path.endswith("/completions"):
        needed = "completions"
    else:
        needed = "chat"
    if needed not in scopes and "*" not in scopes:
        raise HTTPException(status_code=403, detail="insufficient_scope")


# V1 Engine incompatible parameters (Gap #7)
# These features are removed or changed in vLLM V1 engine
V1_INCOMPATIBLE_PARAMS = {
    "best_of": "V1 engine removed best_of sampling support. Use n=1 instead.",
    "logit_bias": "V1 engine has limited logit_bias support. Some models may not work.",
}


def check_v1_compatibility(model_name: str, payload: dict) -> list[str]:
    """Check request parameters for V1 engine compatibility issues.
    
    Args:
        model_name: Name of the target model
        payload: Request payload
        
    Returns:
        List of warning messages for incompatible parameters
    """
    warnings = []
    
    # Check if model has V1 enabled
    try:
        if model_name and model_name in _MODEL_REGISTRY:
            entry = _MODEL_REGISTRY.get(model_name) or {}
            if entry.get("vllm_v1_enabled"):
                # Check for incompatible parameters
                for param, warning_msg in V1_INCOMPATIBLE_PARAMS.items():
                    if param in payload and payload[param] not in (None, 1):
                        # best_of=1 is equivalent to not using best_of
                        if param == "best_of" and payload[param] == 1:
                            continue
                        warnings.append(f"Parameter '{param}' may not work: {warning_msg}")
    except Exception:
        pass
    
    return warnings


async def forward_json(request: Request, base_url: str, path: str, internal_key: str, auth_ctx: dict | None):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # ============================================================================
    # Phase 1: Apply request defaults and engine translation (Plane C)
    # ============================================================================
    model_name = payload.get("model", "")
    v1_warnings: list[str] = []  # V1 compatibility warnings (Gap #7)
    engine_type = "vllm"  # default for static upstreams not in the registry
    
    if model_name and model_name in _MODEL_REGISTRY:
        entry = _MODEL_REGISTRY.get(model_name) or {}
        
        # 1. Merge request defaults (only for keys client didn't specify)
        if entry.get("request_defaults_json"):
            try:
                import json
                model_defaults = json.loads(entry["request_defaults_json"])
                payload = merge_request_defaults(payload, model_defaults)
            except Exception:
                pass  # Best-effort; don't fail request if defaults are malformed
        
        # 2. Check V1 compatibility BEFORE translation (Gap #7)
        v1_warnings = check_v1_compatibility(model_name, payload)
        
        # 3. Translate to engine-specific keys
        engine_type = entry.get("engine_type", "vllm")
        payload = translate_request_for_engine(payload, engine_type)
    # ============================================================================

    headers = {"Content-Type": "application/json"}
    if internal_key:
        headers["Authorization"] = f"Bearer {internal_key}"
    # Propagate/generate request id
    req_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    headers["x-request-id"] = req_id

    # Enforce scopes (consider task from registry if available)
    if auth_ctx is not None:
        _require_scope(auth_ctx.get("scopes", set()), path)

    # Handle streaming passthrough for chat/completions
    is_stream = bool(payload.get("stream")) and path in ("/v1/chat/completions", "/v1/completions")
    if is_stream:
        start_ns = time.time_ns()
        client = _get_http_client()
        if client is None:
            raise HTTPException(status_code=503, detail="HTTP client not ready")
        # Acquire concurrency slot (per-identifier)
        identifier = request.headers.get("authorization", "")[7:15] or (request.client.host if request.client else "unknown")
        ok = await acquire_stream_slot(identifier)
        if not ok:
            STREAM_BLOCKED.labels(identifier=identifier).inc()
            raise HTTPException(status_code=429, detail="too_many_concurrent_streams")
        # Ask the engine for the final usage chunk so streamed requests are metered with real
        # token counts; the chunk is stripped again unless the client asked for it.
        so = payload.get("stream_options") if isinstance(payload.get("stream_options"), dict) else {}
        client_wants_usage = bool(so.get("include_usage"))
        payload["stream_options"] = {**so, "include_usage": True}
        # Dynamic timeout based on model size and request complexity
        timeout = get_timeout_for_request(payload.get("model", ""), payload.get("max_tokens", 1000), True)
        # Manually manage stream context so it stays open until response completes
        resp_ctx = client.stream("POST", f"{base_url}{path}", headers=headers, json=payload, timeout=timeout)
        resp = await resp_ctx.__aenter__()
        if resp.status_code >= 400:
            data = await resp.aread()
            await resp_ctx.__aexit__(None, None, None)
            try:
                content = httpx.Response(200, content=data).json()
                # Gap #4: Translate llama.cpp errors to OpenAI format
                content = translate_error_response(content, resp.status_code, engine_type)
                r = JSONResponse(status_code=resp.status_code, content=content)
            except Exception:
                r = JSONResponse(status_code=resp.status_code, content={"error": data.decode(errors="ignore")})
            await record_usage(request, r, start_ns, payload.get("model", ""), "generate", **_identity(auth_ctx))
            if resp.status_code >= 500:
                _cb_record_failure(base_url)
                UPSTREAM_ERROR.labels(path=path).inc()
            return r

        first = True
        tee = SseUsageTee(forward_usage_chunk=client_wants_usage)
        recorded = False

        async def _record_stream(status: int):
            nonlocal recorded
            if recorded:
                return
            recorded = True
            pt, ct, tt = tee.tokens()
            await record_usage(request, None, start_ns, payload.get("model", ""), "generate", **_identity(auth_ctx),
                               prompt_tokens=pt, completion_tokens=ct, total_tokens=tt, req_id=req_id, status_code=status,
                               end_ns=time.time_ns())

        async def agen() -> AsyncIterator[bytes]:
            nonlocal first
            start = time.time()
            try:
                async for chunk in resp.aiter_raw():
                    if chunk:
                        if first:
                            first = False
                            STREAM_TTFT_SECONDS.labels(path=path).observe(time.time() - start)
                        out = tee.feed(chunk)
                        if out:
                            yield out
                tail = tee.flush()
                if tail:
                    yield tail
            finally:
                # metered once the stream ends (or the client disconnects): real token counts and duration
                await _record_stream(resp.status_code)

        async def close_and_release():
            try:
                await resp_ctx.__aexit__(None, None, None)
            finally:
                await release_stream_slot(identifier)

        ctype = resp.headers.get("content-type", "text/event-stream")
        background = BackgroundTask(close_and_release)
        sr = StreamingResponse(agen(), media_type=ctype, background=background)
        if 200 <= resp.status_code < 500:
            _cb_record_success(base_url)
            UPSTREAM_SUCCESS.labels(path=path).inc()
        return sr

    # Non-stream path
    client = _get_http_client()
    if client is None:
        raise HTTPException(status_code=503, detail="HTTP client not ready")
    start_ns = time.time_ns()
    # Retries with backoff for transient errors (simple inline loop; avoid for streams)
    retries = 2
    last_exc = None
    for attempt in range(retries + 1):
        try:
            # Dynamic timeout based on model size and request complexity
            timeout = get_timeout_for_request(payload.get("model", ""), payload.get("max_tokens", 1000), False)
            t0 = time.time()
            resp = await client.post(f"{base_url}{path}", headers=headers, json=payload, timeout=timeout)
            elapsed = time.time() - t0
            UPSTREAM_LATENCY.labels(path=path).observe(elapsed)
            UPSTREAM_LATENCY_BY_UPSTREAM.labels(path=path, base_url=base_url).observe(elapsed)
            break
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout) as exc:
            last_exc = exc
            if attempt == retries:
                _cb_record_failure(base_url)
                # Provide informative error messages for timeouts
                if isinstance(exc, httpx.ReadTimeout):
                    model_name = payload.get("model", "unknown")
                    TIMEOUT_ERRORS.labels(model=model_name, error_type="read_timeout", path=path).inc()
                    raise HTTPException(
                        status_code=408,
                        detail="Request timeout - the model is processing but taking longer than expected. "
                               "Retry with a shorter prompt or fewer tokens.",
                        headers={"Retry-After": "30"},
                    )
                else:
                    raise HTTPException(status_code=502, detail="upstream_unreachable")
            await asyncio.sleep(0.2 * (attempt + 1))
            RETRY_COUNT.labels(path=path).inc()
    else:
        _cb_record_failure(base_url)
        raise HTTPException(status_code=502, detail="upstream_unreachable")
    # Fallback: if chat/completions fails due to missing chat template, retry via completions
    if resp.status_code >= 400 and path == "/v1/chat/completions":
        try:
            err = resp.json()
        except Exception:
            err = {}
        # vLLM returns message string describing chat template requirement (HF 4.44 change)
        msg = str(err.get("message") or err.get("error") or "").lower()
        if "chat template" in msg:
            try:
                # Convert messages→prompt and call /v1/completions upstream
                messages = payload.get("messages") if isinstance(payload, dict) else []
                prompt = _messages_to_prompt(messages or [])
                comp_payload = {
                    "model": payload.get("model"),
                    "prompt": prompt,
                    "max_tokens": payload.get("max_tokens") or 128,
                    "temperature": payload.get("temperature", 0.7),
                    "stream": False,
                }
                timeout = get_timeout_for_request(payload.get("model", ""), comp_payload.get("max_tokens", 128), False)
                t1 = time.time()
                comp_resp = await client.post(f"{base_url}/v1/completions", headers=headers, json=comp_payload, timeout=timeout)
                UPSTREAM_LATENCY.labels(path="/v1/completions").observe(time.time() - t1)
                if comp_resp.status_code < 400:
                    data_c = comp_resp.json()
                    # Normalize to chat schema for clients expecting chat.completions
                    try:
                        new_choices = []
                        for ch in (data_c.get("choices") or []):
                            txt = ch.get("text", "") if isinstance(ch, dict) else str(ch)
                            new_choices.append({
                                "index": ch.get("index", 0) if isinstance(ch, dict) else 0,
                                "message": {"role": "assistant", "content": txt},
                                "finish_reason": ch.get("finish_reason") if isinstance(ch, dict) else None,
                            })
                        normalized = {
                            "id": data_c.get("id"),
                            "object": "chat.completion",
                            "created": data_c.get("created"),
                            "model": data_c.get("model", payload.get("model")),
                            "choices": new_choices,
                            "usage": data_c.get("usage"),
                        }
                    except Exception:
                        normalized = {"object": "chat.completion", "choices": [{"message": {"role": "assistant", "content": data_c}}]}
                    r = JSONResponse(status_code=200, content=normalized)
                    await record_usage(request, r, start_ns, payload.get("model", ""), "generate", **_identity(auth_ctx))
                    _cb_record_success(base_url)
                    UPSTREAM_SUCCESS.labels(path=path).inc()
                    return r
            except Exception:
                pass
    if resp.status_code >= 400:
        # Standardized error envelope
        try:
            content = resp.json()
            # Gap #4: Translate llama.cpp errors to OpenAI format
            content = translate_error_response(content, resp.status_code, engine_type)
        except Exception:
            content = {"error": resp.text}
        r = JSONResponse(status_code=resp.status_code, content=content)
        await record_usage(request, r, start_ns, payload.get("model", ""), "embed" if path.endswith("embeddings") else "generate", **_identity(auth_ctx))
        if resp.status_code >= 500:
            _cb_record_failure(base_url)
        else:
            _cb_record_success(base_url)
        UPSTREAM_ERROR.labels(path=path).inc()
        return r
    data = resp.json()
    # Token usage capture if present
    usage = data.get("usage") if isinstance(data, dict) else None
    pt = usage.get("prompt_tokens") if isinstance(usage, dict) else None
    ct = usage.get("completion_tokens") if isinstance(usage, dict) else None
    tt = usage.get("total_tokens") if isinstance(usage, dict) else None
    # Fallback token estimation if engines do not report usage
    if (pt is None or ct is None or tt is None) and get_settings().TOKEN_ESTIMATION_ENABLED:
        try:
            if path.endswith("/embeddings"):
                # Roughly estimate tokens from input length
                inp = (data.get("input") if isinstance(data, dict) else None) or payload.get("input")
                if isinstance(inp, str):
                    est = rough_token_count(inp)
                    pt = pt if pt is not None else est
                    tt = tt if tt is not None else est
                elif isinstance(inp, list):
                    est = sum(rough_token_count(x) for x in inp if isinstance(x, str))
                    pt = pt if pt is not None else est
                    tt = tt if tt is not None else est
            elif path.endswith("/chat/completions"):
                msgs = payload.get("messages") or []
                est = estimate_chat_prompt_tokens(msgs)
                pt = pt if pt is not None else est
                # completion may be empty; best-effort
                tt = tt if tt is not None else (pt + (ct or 0))
            else:
                # /completions
                prompt = payload.get("prompt")
                if isinstance(prompt, str):
                    est = rough_token_count(prompt)
                elif isinstance(prompt, list):
                    est = sum(rough_token_count(p) for p in prompt if isinstance(p, str))
                else:
                    est = 0
                pt = pt if pt is not None else est
                tt = tt if tt is not None else (pt + (ct or 0))
        except Exception:
            pass
    # Build response with optional V1 warnings (Gap #7)
    response_headers = {}
    if v1_warnings:
        # Add warnings to response header for client visibility
        response_headers["X-Cortex-Warnings"] = "; ".join(v1_warnings)
    
    r = JSONResponse(status_code=200, content=data, headers=response_headers if response_headers else None)
    await record_usage(
        request,
        r,
        start_ns,
        payload.get("model", ""),
        "embed" if path.endswith("embeddings") else "generate",
        **_identity(auth_ctx),
        prompt_tokens=pt,
        completion_tokens=ct,
        total_tokens=tt,
        req_id=req_id,
    )
    _cb_record_success(base_url)
    UPSTREAM_SUCCESS.labels(path=path).inc()
    return r

@router.post("/chat/completions")
async def chat_completions(request: Request, body: ChatCompletionRequest, auth_ctx = Depends(require_api_key), settings = Depends(get_settings)):
    model = (body.model or "") if hasattr(body, "model") else ""
    base, _ = choose_by_model_or_task(model, "generate", settings)
    try:
        UPSTREAM_SELECTED.labels(path="/v1/chat/completions", base_url=base).inc()
    except Exception:
        pass
    return await forward_json(request, base, "/v1/chat/completions", settings.INTERNAL_VLLM_API_KEY, auth_ctx)

@router.post("/completions")
async def completions(request: Request, body: CompletionRequest, auth_ctx = Depends(require_api_key), settings = Depends(get_settings)):
    model = (body.model or "") if hasattr(body, "model") else ""
    base, _ = choose_by_model_or_task(model, "generate", settings)
    try:
        UPSTREAM_SELECTED.labels(path="/v1/completions", base_url=base).inc()
    except Exception:
        pass
    return await forward_json(request, base, "/v1/completions", settings.INTERNAL_VLLM_API_KEY, auth_ctx)

@router.post("/embeddings")
async def embeddings(request: Request, body: EmbeddingsRequest, auth_ctx = Depends(require_api_key), settings = Depends(get_settings)):
    model = (body.model or "") if hasattr(body, "model") else ""
    base, _ = choose_by_model_or_task(model, "embed", settings)
    try:
        UPSTREAM_SELECTED.labels(path="/v1/embeddings", base_url=base).inc()
    except Exception:
        pass
    return await forward_json(request, base, "/v1/embeddings", settings.INTERNAL_VLLM_API_KEY, auth_ctx)


@router.get("/models")
async def list_models(settings = Depends(get_settings)):
    """Return available served models (from registry and any autodiscovered health poller models)."""
    try:
        data = []
        # Registry entries
        for name, meta in (_MODEL_REGISTRY or {}).items():
            data.append({"id": name, "url": meta.get("url"), "task": meta.get("task")})
        return {"data": data}
    except Exception:
        return {"data": []}


@router.get("/models/status")
async def models_status(settings = Depends(get_settings)):
    """Public, read-only status for served models: running/down by health TTL.
    Does not expose secrets.
    """
    try:
        now = time.time()
        ttl = settings.HEALTH_CHECK_TTL_SEC
        out = []
        for name, meta in (_MODEL_REGISTRY or {}).items():
            url = str((meta or {}).get("url") or "")
            task = str((meta or {}).get("task") or "generate")
            h = _HEALTH_STATE.get(url) or {}
            ok = bool(h.get("ok")) and (now - float(h.get("ts", 0.0)) <= ttl)
            state = "running" if ok else "down"
            out.append({
                "name": name,
                "served_model_name": name,
                "task": task,
                "state": state,
                "url": url,
            })
        return {"data": out}
    except Exception:
        return {"data": []}
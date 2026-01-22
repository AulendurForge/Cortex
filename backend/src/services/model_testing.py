"""Model testing and readiness checking utilities."""

import httpx
import time
from typing import Any, Dict
from pydantic import BaseModel, Field
from typing import Optional


class ModelTestResult(BaseModel):
    success: bool
    test_type: str
    request: dict[str, Any]
    response: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    latency_ms: int
    timestamp: float


class ReadinessResp(BaseModel):
    status: str  # 'ready' | 'loading' | 'stopped' | 'error'
    detail: Optional[str] = None


async def test_chat_model(base_url: str, model_name: str, internal_key: str = "") -> Dict[str, Any]:
    """Send test chat completion request to verify model is responding.
    
    Args:
        base_url: Model endpoint URL
        model_name: Served model name
        internal_key: Optional internal API key
        
    Returns:
        Dict with 'request' and 'response' keys
        
    Raises:
        Exception: If model returns error or invalid response
    """
    from ..main import http_client  # type: ignore
    
    request_data = {
        "model": model_name,
        "messages": [{"role": "user", "content": "Hello"}],
        "max_tokens": 50,
        "temperature": 0.7
    }
    
    headers = {"Content-Type": "application/json"}
    if internal_key:
        headers["Authorization"] = f"Bearer {internal_key}"
    
    response = await http_client.post(
        f"{base_url}/v1/chat/completions",
        json=request_data,
        headers=headers,
        timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0)  # Increased to 2 minutes for large models
    )
    
    # Fallback: if chat fails due to missing chat template, retry via completions
    # (transformers v4.44+ requires chat templates; some models don't have them)
    if response.status_code >= 400:
        try:
            err = response.json()
            msg = str(err.get("message") or err.get("error") or "").lower()
            
            if "chat template" in msg:
                # Convert messages to prompt and try /v1/completions
                messages = request_data.get("messages", [])
                prompt = "\n\n".join([
                    f"{m.get('role', 'user').title()}: {m.get('content', '')}" 
                    for m in messages
                ]) + "\n\nAssistant:"
                
                comp_request = {
                    "model": model_name,
                    "prompt": prompt,
                    "max_tokens": request_data.get("max_tokens", 50),
                    "temperature": request_data.get("temperature", 0.7),
                }
                
                comp_response = await http_client.post(
                    f"{base_url}/v1/completions",
                    json=comp_request,
                    headers=headers,
                    timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0)  # Increased to 2 minutes
                )
                
                if comp_response.status_code >= 400:
                    raise Exception(f"Model returned HTTP {comp_response.status_code}: {comp_response.text[:200]}")
                
                comp_data = comp_response.json()
                
                # Convert completions response to chat format for consistency
                response_data = {
                    "id": comp_data.get("id"),
                    "object": "chat.completion",
                    "created": comp_data.get("created"),
                    "model": comp_data.get("model", model_name),
                    "choices": [{
                        "index": 0,
                        "message": {
                            "role": "assistant",
                            "content": comp_data.get("choices", [{}])[0].get("text", "")
                        },
                        "finish_reason": comp_data.get("choices", [{}])[0].get("finish_reason")
                    }],
                    "usage": comp_data.get("usage")
                }
                
                return {
                    "request": request_data,
                    "response": response_data
                }
        except Exception:
            pass
        
        # No fallback worked, raise original error
        raise Exception(f"Model returned HTTP {response.status_code}: {response.text[:200]}")
    
    response_data = response.json()
    
    # Verify response format
    if not response_data.get("choices"):
        raise Exception("Invalid response: missing 'choices' field")
    
    return {
        "request": request_data,
        "response": response_data
    }


async def test_embedding_model(base_url: str, model_name: str, internal_key: str = "") -> Dict[str, Any]:
    """Send test embeddings request to verify model is responding.
    
    Args:
        base_url: Model endpoint URL
        model_name: Served model name
        internal_key: Optional internal API key
        
    Returns:
        Dict with 'request' and 'response' keys
        
    Raises:
        Exception: If model returns error or invalid response
    """
    from ..main import http_client  # type: ignore
    
    request_data = {
        "model": model_name,
        "input": "test"
    }
    
    headers = {"Content-Type": "application/json"}
    if internal_key:
        headers["Authorization"] = f"Bearer {internal_key}"
    
    response = await http_client.post(
        f"{base_url}/v1/embeddings",
        json=request_data,
        headers=headers,
        timeout=httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0)
    )
    
    if response.status_code >= 400:
        raise Exception(f"Model returned HTTP {response.status_code}: {response.text[:200]}")
    
    response_data = response.json()
    
    # Verify embedding format
    if not response_data.get("data") or not isinstance(response_data["data"], list):
        raise Exception("Invalid response: missing or invalid 'data' field")
    
    if not response_data["data"][0].get("embedding"):
        raise Exception("Invalid response: missing 'embedding' in data")
    
    return {
        "request": request_data,
        "response": response_data
    }


async def check_model_readiness(container_name: str, served_model_name: str, host_port: int | None = None) -> ReadinessResp:
    """Check if a model is ready to serve requests.
    
    Uses a two-phase approach:
    1. First check the /health endpoint (fast, lightweight) - if 200, model is ready
    2. For llama.cpp with 503 "Loading model", report as loading
    
    This avoids the timeout issues with chat completion checks on large models,
    since health endpoints respond in milliseconds while chat may take seconds.
    
    Handles both Docker bridge network (container name) and host network (localhost:port).
    
    Args:
        container_name: Docker container name
        served_model_name: Model's served name
        host_port: Optional host port for when gateway is on host network
        
    Returns:
        ReadinessResp with status and optional detail
    """
    # Determine base URL: try container name first, fall back to localhost if needed
    import socket
    try:
        socket.gethostbyname(container_name)
        base_url = f"http://{container_name}:8000"
    except socket.gaierror:
        # Container name doesn't resolve - gateway is on host network
        if host_port:
            base_url = f"http://127.0.0.1:{host_port}"
        else:
            # Try common localhost as last resort
            base_url = f"http://127.0.0.1:8000"
    
    try:
        from ..main import http_client  # type: ignore
        from ..config import get_settings
        settings = get_settings()
        api_key = settings.INTERNAL_VLLM_API_KEY or "dev-internal-token"
        
        # Phase 1: Check health endpoint first (fast and reliable)
        # Both vLLM and llama.cpp expose /health that returns 200 when ready
        try:
            health_resp = await http_client.get(
                f"{base_url}/health",
                timeout=httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=5.0),
            )
            
            if health_resp.status_code == 200:
                # Model is healthy and ready to serve
                return ReadinessResp(status="ready")
            
            if health_resp.status_code == 503:
                # Server is up but model not ready yet (vLLM loading state)
                try:
                    j = health_resp.json()
                    msg = str(j.get("detail") or j.get("error") or j.get("message") or "")
                except Exception:
                    msg = health_resp.text[:200]
                
                if "loading" in msg.lower() or "initializing" in msg.lower():
                    return ReadinessResp(status="loading", detail="model_loading")
                return ReadinessResp(status="loading", detail=f"health_503: {msg[:100]}")
                
        except httpx.TimeoutException:
            # Health check timed out - server may still be starting
            return ReadinessResp(status="loading", detail="health_timeout")
        except httpx.ConnectError:
            # Can't connect - server not up yet
            return ReadinessResp(status="loading", detail="connection_refused")
        except Exception as health_err:
            # Log but continue to chat check as fallback
            pass
        
        # Phase 2: Fallback to /v1/models endpoint (lighter than chat completion)
        # This verifies the model is registered and serving
        try:
            models_resp = await http_client.get(
                f"{base_url}/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
                timeout=httpx.Timeout(connect=3.0, read=5.0, write=3.0, pool=5.0),
            )
            
            if models_resp.status_code == 200:
                try:
                    data = models_resp.json()
                    models = data.get("data", [])
                    # Check if our model is in the list
                    for m in models:
                        if m.get("id") == served_model_name:
                            return ReadinessResp(status="ready")
                    # Model not found in list but endpoint works - might still be loading
                    if not models:
                        return ReadinessResp(status="loading", detail="models_list_empty")
                except Exception:
                    pass
                # Models endpoint works, assume ready
                return ReadinessResp(status="ready")
                
            if models_resp.status_code == 503:
                try:
                    j = models_resp.json()
                    msg = (j or {}).get("error", {}).get("message", "")
                except Exception:
                    msg = models_resp.text[:200]
                
                if "Loading model" in msg or "loading" in msg.lower():
                    return ReadinessResp(status="loading", detail="loading_model")
                return ReadinessResp(status="loading", detail=f"503: {msg[:100]}")
                
        except httpx.TimeoutException:
            return ReadinessResp(status="loading", detail="models_timeout")
        except httpx.ConnectError:
            return ReadinessResp(status="loading", detail="connection_refused")
        except Exception:
            pass
        
        # Phase 3: Last resort - try a minimal chat completion with longer timeout
        # Only used if health and models endpoints are inconclusive
        request_data = {
            "model": served_model_name,
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 1,
            "temperature": 0.0,
        }
        
        r = await http_client.post(
            f"{base_url}/v1/chat/completions",
            json=request_data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            # Increased timeout: large models (30B+) may take 10+ seconds for first token
            timeout=httpx.Timeout(connect=5.0, read=30.0, write=5.0, pool=10.0),
        )
        
        if r.status_code == 200:
            return ReadinessResp(status="ready")
        
        if r.status_code == 503:
            try:
                j = r.json()
                msg = (j or {}).get("error", {}).get("message", "")
            except Exception:
                msg = r.text[:200]
            
            if "Loading model" in msg:
                return ReadinessResp(status="loading", detail="loading_model")
            return ReadinessResp(status="error", detail=f"503: {msg[:100]}")
        
        return ReadinessResp(status="error", detail=f"HTTP {r.status_code}")
        
    except httpx.TimeoutException:
        # Timeout likely means model is still loading or very slow
        return ReadinessResp(status="loading", detail="request_timeout")
    except httpx.ConnectError:
        return ReadinessResp(status="loading", detail="connection_refused")
    except Exception as e:
        return ReadinessResp(status="error", detail=str(e)[:200])

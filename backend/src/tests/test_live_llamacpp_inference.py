"""Live end-to-end test: register a real GGUF, start it under llama.cpp, chat through the gateway.

Skipped unless CORTEX_LIVE_GGUF points at a .gguf file relative to CORTEX_MODELS_DIR
(e.g. ``qwen2.5-0.5b-instruct/qwen2.5-0.5b-instruct-q4_k_m.gguf``) and the gateway
is reachable.  The llama.cpp image must already be present locally unless you are
happy to wait for the pull.

Run inside the gateway container:
    docker exec -e CORTEX_LIVE_GGUF=qwen2.5-0.5b-instruct/qwen2.5-0.5b-instruct-q4_k_m.gguf \
        cortex-gateway-1 python -m pytest src/tests/test_live_llamacpp_inference.py -v -s
"""
from __future__ import annotations

import json
import os
import time
import uuid

import httpx
import pytest

BASE = os.environ.get("CORTEX_GATEWAY_URL", "http://127.0.0.1:8084").rstrip("/")
MODELS_DIR = os.environ.get("CORTEX_MODELS_DIR", "/var/cortex/models")
GGUF = os.environ.get("CORTEX_LIVE_GGUF", "")
NGL = int(os.environ.get("CORTEX_LIVE_NGL", "99"))
STARTUP_TIMEOUT = float(os.environ.get("CORTEX_LIVE_STARTUP_TIMEOUT", "300"))


def _gateway_up() -> bool:
    try:
        return httpx.get(f"{BASE}/health", timeout=3.0).status_code == 200
    except Exception:
        return False


pytestmark = [pytest.mark.live, pytest.mark.skipif(
    not GGUF or not os.path.isfile(os.path.join(MODELS_DIR, GGUF)) or not _gateway_up(),
    reason="set CORTEX_LIVE_GGUF to a GGUF under CORTEX_MODELS_DIR and run against a live gateway",
)]


@pytest.fixture(scope="module")
def client():
    c = httpx.Client(base_url=BASE, timeout=60.0)
    r = c.post("/auth/login", json={"username": os.environ.get("CORTEX_TEST_ADMIN_USER", "admin"),
                                     "password": os.environ.get("CORTEX_TEST_ADMIN_PASS", "admin")})
    assert r.status_code == 200, r.text
    yield c
    c.close()


def _model(client, model_id):
    for m in client.get("/admin/models").json():
        if m["id"] == model_id:
            return m
    return None


def test_live_llamacpp_lifecycle(client):
    tag = uuid.uuid4().hex[:6]
    served = f"live-qwen-{tag}"
    payload = {
        "mode": "offline",
        "engine_type": "llamacpp",
        "local_path": GGUF,
        "name": f"live-qwen-{tag}",
        "served_model_name": served,
        "task": "generate",
        "selected_gpus": [0],
        "ngl": NGL,
        "context_size": 2048,
        "parallel_slots": 1,
        "batch_size": 512,
        "ubatch_size": 256,
        "threads": 4,
        "flash_attn": "auto",
        "cache_type_k": "f16",
        "cache_type_v": "f16",
        "temperature": 0.0,
        "top_k": 1,
        "custom_request_json": json.dumps({"stop": ["<|im_end|>"]}),
    }
    r = client.post("/admin/models", json=payload)
    assert r.status_code == 200, r.text
    model_id = r.json()["id"]
    key_id = None
    try:
        # Configure round trip on a real model before starting it
        m = _model(client, model_id)
        assert m["selected_gpus"] == [0]
        assert m["temperature"] == 0.0
        assert m["top_k"] == 1
        assert json.loads(m["custom_request_json"]) == {"stop": ["<|im_end|>"]}

        r = client.patch(f"/admin/models/{model_id}", json={"context_size": 4096, "temperature": 0.1})
        assert r.status_code == 200, r.text
        m = _model(client, model_id)
        assert m["context_size"] == 4096
        assert m["temperature"] == 0.1
        assert m["top_k"] == 1
        assert json.loads(m["custom_request_json"]) == {"stop": ["<|im_end|>"]}

        # Dry run should produce a real command
        r = client.post(f"/admin/models/{model_id}/dry-run")
        assert r.status_code == 200, r.text
        cmd = r.json()["command"]
        assert cmd and cmd[0] == "-m" and cmd[1].endswith(".gguf"), cmd
        assert cmd[cmd.index("--ctx-size") + 1] == "4096"

        # Start and wait for readiness
        t0 = time.time()
        r = client.post(f"/admin/models/{model_id}/start", timeout=STARTUP_TIMEOUT + 60)
        assert r.status_code == 200, r.text
        state = None
        while time.time() - t0 < STARTUP_TIMEOUT:
            rr = client.get(f"/admin/models/{model_id}/readiness")
            assert rr.status_code == 200, rr.text
            state = rr.json()
            if state.get("status") == "ready":
                break
            m = _model(client, model_id)
            assert m["state"] != "failed", f"model failed to start: {client.get(f'/admin/models/{model_id}/logs').text[-2000:]}"
            time.sleep(2.0)
        assert state and state.get("status") == "ready", f"not ready in time: {state}"
        m = _model(client, model_id)
        assert m["state"] == "running"
        print(f"\n[live] model ready in {time.time() - t0:.1f}s on port {m['port']}")

        # Chat through the gateway with a real API key (request defaults are merged by the gateway)
        r = client.post("/admin/keys", json={"scopes": "chat,completions,embeddings"})
        assert r.status_code == 200, r.text
        key = r.json()
        api_key, key_id = key["token"], key["id"]
        r = client.post(
            "/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": served,
                "messages": [{"role": "user", "content": "Reply with exactly one word: pong"}],
                "max_tokens": 8,
                "stream": False,
            },
            timeout=120.0,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        text = body["choices"][0]["message"]["content"]
        print(f"[live] completion: {text!r} usage={body.get('usage')}")
        assert text.strip(), "empty completion"

        # Apply on a running model restarts it with the new config
        r = client.patch(f"/admin/models/{model_id}", json={"context_size": 2048})
        assert r.status_code == 200, r.text
        r = client.post(f"/admin/models/{model_id}/apply", timeout=STARTUP_TIMEOUT + 60)
        assert r.status_code == 200, r.text
        assert r.json().get("restarted") is True
        rr = {}
        t1 = time.time()
        while time.time() - t1 < STARTUP_TIMEOUT:
            rr = client.get(f"/admin/models/{model_id}/readiness").json()
            if rr.get("status") == "ready":
                break
            time.sleep(2.0)
        assert rr.get("status") == "ready", rr
        r = client.post(f"/admin/models/{model_id}/dry-run")
        assert r.json()["command"][r.json()["command"].index("--ctx-size") + 1] == "2048"

        # Built-in test endpoint
        r = client.post(f"/admin/models/{model_id}/test", timeout=120.0)
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True, r.text

        # Stop
        r = client.post(f"/admin/models/{model_id}/stop")
        assert r.status_code == 200, r.text
        assert _model(client, model_id)["state"] == "stopped"
    finally:
        try:
            client.post(f"/admin/models/{model_id}/stop")
        except Exception:
            pass
        client.delete(f"/admin/models/{model_id}")
        try:
            client.delete(f"/admin/keys/{key_id}")
        except Exception:
            pass
    assert _model(client, model_id) is None

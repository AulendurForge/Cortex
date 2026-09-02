"""Live matrix: chat + embedding models on both engines, full lifecycle through the public API.

Models (all small enough for a single 8 GB GPU, one at a time):
- llama.cpp chat      : qwen2.5-0.5b-instruct/qwen2.5-0.5b-instruct-q4_k_m.gguf
- llama.cpp embedding : nomic-embed-text-v1.5-gguf/nomic-embed-text-v1.5.Q8_0.gguf
- vLLM chat           : qwen2.5-0.5b-instruct-safetensors  (Qwen/Qwen2.5-0.5B-Instruct)
- vLLM embedding      : bge-small-en-v1.5                  (BAAI/bge-small-en-v1.5)

Each case: create → GET echoes config → PATCH (configure round trip) → dry-run →
start → readiness → inference through the gateway with a real API key →
built-in test endpoint → apply (restart) → stop → delete.

Skipped per case when the files are missing under CORTEX_MODELS_DIR. Runs inside the
gateway container: `make test-live` or
    docker exec cortex-gateway-1 python -m pytest src/tests/test_live_model_matrix.py -v -s
"""
from __future__ import annotations

import json
import os
import time
import uuid

import httpx
import pytest

pytestmark = pytest.mark.live

BASE = os.environ.get("CORTEX_GATEWAY_URL", "http://127.0.0.1:8084").rstrip("/")
MODELS_DIR = os.environ.get("CORTEX_MODELS_DIR", "/var/cortex/models")
STARTUP_TIMEOUT = float(os.environ.get("CORTEX_LIVE_STARTUP_TIMEOUT", "600"))

CASES = {
    "llamacpp-chat": {
        "engine_type": "llamacpp", "task": "generate",
        "local_path": "qwen2.5-0.5b-instruct/qwen2.5-0.5b-instruct-q4_k_m.gguf",
        "config": {"selected_gpus": [0], "ngl": 99, "context_size": 2048, "parallel_slots": 1, "batch_size": 512,
                   "ubatch_size": 256, "flash_attn": "auto", "cache_type_k": "f16", "cache_type_v": "f16",
                   "temperature": 0.0, "top_k": 1, "custom_request_json": json.dumps({"stop": ["<|im_end|>"]})},
        "patch": {"context_size": 4096},
    },
    "llamacpp-embed": {
        "engine_type": "llamacpp", "task": "embed",
        "local_path": "nomic-embed-text-v1.5-gguf/nomic-embed-text-v1.5.Q8_0.gguf",
        "config": {"selected_gpus": [0], "ngl": 99, "context_size": 2048, "parallel_slots": 1, "ubatch_size": 2048,
                   "batch_size": 2048, "pooling": "mean", "enable_embeddings": True},
        "patch": {"parallel_slots": 2},
    },
    "vllm-chat": {
        "engine_type": "vllm", "task": "generate",
        "local_path": "qwen2.5-0.5b-instruct-safetensors",
        "config": {"selected_gpus": [0], "tp_size": 1, "dtype": "auto", "gpu_memory_utilization": 0.45,
                   "max_model_len": 2048, "max_num_seqs": 8, "enforce_eager": True,
                   "temperature": 0.0, "custom_request_json": json.dumps({"stop": ["<|im_end|>"]})},
        "patch": {"max_model_len": 4096},
    },
    "vllm-embed": {
        "engine_type": "vllm", "task": "embed",
        "local_path": "bge-small-en-v1.5",
        "config": {"selected_gpus": [0], "tp_size": 1, "dtype": "auto", "gpu_memory_utilization": 0.3,
                   "max_model_len": 512, "enforce_eager": True},
        "patch": {"max_num_seqs": 16},
    },
}


def _gateway_up() -> bool:
    try:
        return httpx.get(f"{BASE}/health", timeout=3.0).status_code == 200
    except Exception:
        return False


@pytest.fixture(scope="module")
def client():
    if not _gateway_up():
        pytest.skip(f"gateway not reachable at {BASE}")
    c = httpx.Client(base_url=BASE, timeout=60.0)
    r = c.post("/auth/login", json={"username": os.environ.get("CORTEX_TEST_ADMIN_USER", "admin"),
                                     "password": os.environ.get("CORTEX_TEST_ADMIN_PASS", "admin")})
    assert r.status_code == 200, r.text
    yield c
    c.close()


@pytest.fixture(scope="module")
def api_key(client):
    r = client.post("/admin/keys", json={"scopes": "chat,completions,embeddings"})
    assert r.status_code == 200, r.text
    key = r.json()
    yield key["token"]
    client.delete(f"/admin/keys/{key['id']}")


def _model(client, model_id):
    for m in client.get("/admin/models").json():
        if m["id"] == model_id:
            return m
    return None


def _wait_ready(client, model_id, timeout):
    t0 = time.time()
    last = None
    while time.time() - t0 < timeout:
        last = client.get(f"/admin/models/{model_id}/readiness").json()
        if last.get("status") == "ready":
            return time.time() - t0
        m = _model(client, model_id)
        if m["state"] == "failed":
            logs = client.get(f"/admin/models/{model_id}/logs?tail=60").text[-3000:]
            raise AssertionError(f"model failed: {m.get('state_reason')}\n{logs}")
        time.sleep(2.0)
    raise AssertionError(f"not ready within {timeout}s: {last}")


@pytest.mark.parametrize("case", list(CASES))
def test_model_lifecycle(client, api_key, case):
    spec = CASES[case]
    if not os.path.exists(os.path.join(MODELS_DIR, spec["local_path"])):
        pytest.skip(f"{spec['local_path']} not present under {MODELS_DIR}")
    tag = uuid.uuid4().hex[:6]
    served = f"live-{case}-{tag}"
    payload = {"mode": "offline", "engine_type": spec["engine_type"], "task": spec["task"], "local_path": spec["local_path"],
               "name": served, "served_model_name": served, **spec["config"]}
    r = client.post("/admin/models", json=payload)
    assert r.status_code == 200, r.text
    model_id = r.json()["id"]
    try:
        # GET echoes every configured field
        m = _model(client, model_id)
        for k, v in spec["config"].items():
            if k == "custom_request_json":
                assert json.loads(m["custom_request_json"]) == json.loads(v)
            elif isinstance(v, float):
                assert m[k] == pytest.approx(v), k
            else:
                assert m[k] == v, k

        # Configure round trip
        r = client.patch(f"/admin/models/{model_id}", json=spec["patch"])
        assert r.status_code == 200, r.text
        m = _model(client, model_id)
        for k, v in spec["patch"].items():
            assert m[k] == v, k
        for k, v in spec["config"].items():
            if k not in spec["patch"] and k not in ("custom_request_json",) and not isinstance(v, float):
                assert m[k] == v, f"{k} lost after PATCH"

        # Dry run on the saved row and on unsaved form values
        r = client.post(f"/admin/models/{model_id}/dry-run")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["command"], d
        assert d["image_cached"] is True, f"engine image not cached: {d['image']}"
        errors = [w for w in d["warnings"] if w["severity"] == "error"]
        assert not errors, errors
        r = client.post("/admin/models/dry-run", json={**payload, "model_id": model_id, "startup_timeout_sec": 900})
        assert r.status_code == 200 and r.json()["command"], r.text

        # Start and wait
        r = client.post(f"/admin/models/{model_id}/start", timeout=120.0)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "loading"
        secs = _wait_ready(client, model_id, STARTUP_TIMEOUT)
        m = _model(client, model_id)
        assert m["state"] == "running" and m["port"]
        print(f"\n[live:{case}] ready in {secs:.1f}s")

        headers = {"Authorization": f"Bearer {api_key}"}
        if spec["task"] == "embed":
            r = client.post("/v1/embeddings", headers=headers, json={"model": served, "input": ["hello world", "cortex"]}, timeout=120.0)
            assert r.status_code == 200, r.text
            data = r.json()["data"]
            assert len(data) == 2 and len(data[0]["embedding"]) > 100
            print(f"[live:{case}] embedding dims={len(data[0]['embedding'])}")
        else:
            r = client.post("/v1/chat/completions", headers=headers,
                            json={"model": served, "messages": [{"role": "user", "content": "Reply with exactly one word: pong"}],
                                  "max_tokens": 8, "stream": False}, timeout=120.0)
            assert r.status_code == 200, r.text
            text = r.json()["choices"][0]["message"]["content"]
            assert text.strip(), "empty completion"
            print(f"[live:{case}] completion={text!r}")
            # streaming path
            with client.stream("POST", "/v1/chat/completions", headers=headers,
                               json={"model": served, "messages": [{"role": "user", "content": "Say hi"}], "max_tokens": 5, "stream": True},
                               timeout=120.0) as sr:
                assert sr.status_code == 200
                chunks = [ln for ln in sr.iter_lines() if ln.startswith("data:")]
            assert chunks, "no SSE chunks"

        # Built-in test endpoint
        r = client.post(f"/admin/models/{model_id}/test", timeout=120.0)
        assert r.status_code == 200 and r.json().get("success") is True, r.text

        # Apply → restart with a changed setting
        r = client.patch(f"/admin/models/{model_id}", json={"startup_timeout_sec": 600})
        assert r.status_code == 200
        r = client.post(f"/admin/models/{model_id}/apply", timeout=120.0)
        assert r.status_code == 200 and r.json().get("restarted") is True, r.text
        _wait_ready(client, model_id, STARTUP_TIMEOUT)

        # Stop
        r = client.post(f"/admin/models/{model_id}/stop")
        assert r.status_code == 200, r.text
        assert _model(client, model_id)["state"] == "stopped"
        r = client.post(f"/admin/models/{model_id}/apply")
        assert r.json().get("status") == "saved"
    finally:
        client.post(f"/admin/models/{model_id}/stop")
        client.delete(f"/admin/models/{model_id}")
    assert _model(client, model_id) is None

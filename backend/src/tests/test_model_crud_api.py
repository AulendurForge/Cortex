"""End-to-end CRUD test for /admin/models against a running gateway.

Runs every model lifecycle endpoint and asserts that what was written is what
comes back.  This is the regression test for the "Configure Model loses my
GPUs / sampling settings" bug.

Requirements:
- A running gateway (default http://127.0.0.1:8084, override CORTEX_GATEWAY_URL).
- The admin bootstrap user (admin/admin, override CORTEX_TEST_ADMIN_USER/PASS).
- No real model files are required: placeholder files are created under
  CORTEX_MODELS_DIR so path validation and dry-run pass, and the engine image is
  a non-existent name so "start" fails fast without pulling anything.

Run inside the gateway container:
    docker exec cortex-gateway-1 python -m pytest src/tests/test_model_crud_api.py -v
"""
from __future__ import annotations

import json
import os
import uuid

import httpx
import pytest

BASE = os.environ.get("CORTEX_GATEWAY_URL", "http://127.0.0.1:8084").rstrip("/")
ADMIN_USER = os.environ.get("CORTEX_TEST_ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("CORTEX_TEST_ADMIN_PASS", "admin")

SAMPLING = {
    "temperature": 0.3,
    "top_p": 0.55,
    "top_k": 12,
    "repetition_penalty": 1.05,
    "frequency_penalty": 0.1,
    "presence_penalty": -0.2,
}
CUSTOM_REQUEST = {"stop": ["###"], "vllm_xargs": {"min_thinking_tokens": 7}}


def _gateway_up() -> bool:
    try:
        return httpx.get(f"{BASE}/health", timeout=3.0).status_code == 200
    except Exception:
        return False


pytestmark = [pytest.mark.integration, pytest.mark.skipif(not _gateway_up(), reason=f"gateway not reachable at {BASE}")]


@pytest.fixture(scope="module")
def client():
    c = httpx.Client(base_url=BASE, timeout=30.0)
    r = c.post("/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    yield c
    c.close()


def _get_model(client: httpx.Client, model_id: int) -> dict | None:
    r = client.get("/admin/models")
    assert r.status_code == 200, r.text
    for m in r.json():
        if m["id"] == model_id:
            return m
    return None


def _cleanup(client: httpx.Client, model_id: int | None) -> None:
    if model_id is None:
        return
    try:
        client.post(f"/admin/models/{model_id}/stop")
    except Exception:
        pass
    try:
        client.delete(f"/admin/models/{model_id}")
    except Exception:
        pass


MODELS_DIR = os.environ.get("CORTEX_MODELS_DIR", "/var/cortex/models")
# An image that cannot exist, so a start attempt fails at image resolution
# instead of pulling gigabytes or touching the GPU.
BOGUS_IMAGE = "cortex-crud-test/does-not-exist:0"


def _make_placeholder_files(rel_path: str, gguf: bool) -> None:
    """Create just enough on disk for path validation / dry-run to pass.

    The gateway container has CORTEX_MODELS_DIR mounted read-write; when the
    test runs elsewhere and the directory is not writable we simply skip the
    filesystem-dependent assertions.
    """
    try:
        full = os.path.join(MODELS_DIR, rel_path)
        if gguf:
            os.makedirs(os.path.dirname(full), exist_ok=True)
            open(full, "wb").close()
        else:
            os.makedirs(full, exist_ok=True)
            with open(os.path.join(full, "config.json"), "w") as f:
                f.write("{}")
            open(os.path.join(full, "model.safetensors"), "wb").close()
    except OSError:
        pass


def _remove_placeholder_files(rel_path: str) -> None:
    import shutil
    try:
        top = os.path.join(MODELS_DIR, rel_path.split("/")[0])
        if os.path.isdir(top) and top.startswith(MODELS_DIR) and "crud-test" in top:
            shutil.rmtree(top, ignore_errors=True)
    except OSError:
        pass


def _files_present(rel_path: str) -> bool:
    return os.path.exists(os.path.join(MODELS_DIR, rel_path))


def _db_hf_token(model_id: int) -> str | None:
    """Read hf_token directly from Postgres (the API never returns it)."""
    import asyncio
    import asyncpg

    url = os.environ.get("DATABASE_URL", "postgresql+asyncpg://cortex:cortex@127.0.0.1:15432/cortex").replace("+asyncpg", "")

    async def _q():
        conn = await asyncpg.connect(url)
        try:
            return await conn.fetchval("SELECT hf_token FROM models WHERE id = $1", model_id)
        finally:
            await conn.close()

    return asyncio.run(_q())


@pytest.fixture
def vllm_model(client):
    """Create a fully-configured multi-GPU vLLM model and delete it afterwards."""
    tag = uuid.uuid4().hex[:8]
    payload = {
        "mode": "offline",
        "local_path": f"crud-test/vllm-{tag}",
        "name": f"crud-vllm-{tag}",
        "served_model_name": f"crud-vllm-{tag}",
        "task": "generate",
        "engine_type": "vllm",
        "dtype": "bfloat16",
        "selected_gpus": [0, 1],
        "tp_size": 2,
        "gpu_memory_utilization": 0.85,
        "max_model_len": 12288,
        "max_num_batched_tokens": 4096,
        "kv_cache_dtype": "fp8",
        "enforce_eager": False,
        "trust_remote_code": True,
        "max_num_seqs": 64,
        "cpu_offload_gb": 0,
        "enable_prefix_caching": True,
        "attention_backend": "FLASH_ATTN",
        "engine_image": BOGUS_IMAGE,
        "hf_token": "hf_secret_token_should_survive",
        "engine_startup_args_json": json.dumps([{"flag": "--max-loras", "type": "int", "value": 4}]),
        "engine_startup_env_json": json.dumps([{"key": "VLLM_TEST_ENV", "value": "1"}]),
        "custom_request_json": json.dumps(CUSTOM_REQUEST),
        **SAMPLING,
    }
    _make_placeholder_files(payload["local_path"], gguf=False)
    r = client.post("/admin/models", json=payload)
    assert r.status_code == 200, r.text
    model_id = r.json()["id"]
    yield model_id, payload
    _cleanup(client, model_id)
    _remove_placeholder_files(payload["local_path"])


@pytest.fixture
def llamacpp_model(client):
    tag = uuid.uuid4().hex[:8]
    payload = {
        "mode": "offline",
        "local_path": f"crud-test/llama-{tag}/model.gguf",
        "name": f"crud-llama-{tag}",
        "served_model_name": f"crud-llama-{tag}",
        "task": "generate",
        "engine_type": "llamacpp",
        "selected_gpus": [0, 1],
        "tensor_split": "0.5,0.5",
        "ngl": 99,
        "context_size": 4096,
        "parallel_slots": 4,
        "batch_size": 1024,
        "ubatch_size": 256,
        "threads": 8,
        "flash_attn": "on",
        "load_mode": "mmap",
        "cache_type_k": "q4_0",
        "cache_type_v": "q4_0",
        "draft_model_path": "crud-test/draft.gguf",
        "draft_n": 8,
        "draft_p_min": 0.4,
        "custom_request_json": json.dumps({"stop": ["<|eot|>"]}),
        "engine_image": BOGUS_IMAGE,
        **SAMPLING,
    }
    _make_placeholder_files(payload["local_path"], gguf=True)
    r = client.post("/admin/models", json=payload)
    assert r.status_code == 200, r.text
    model_id = r.json()["id"]
    yield model_id, payload
    _cleanup(client, model_id)
    _remove_placeholder_files(payload["local_path"])


# ---------------------------------------------------------------------------
# READ after CREATE
# ---------------------------------------------------------------------------

def test_create_vllm_roundtrip_every_field(client, vllm_model):
    model_id, payload = vllm_model
    m = _get_model(client, model_id)
    assert m is not None, "created model missing from list"

    # Identity / engine
    for k in ("name", "served_model_name", "task", "engine_type", "local_path", "dtype", "engine_image"):
        assert m[k] == payload[k], k

    # GPU selection is the headline regression
    assert m["selected_gpus"] == [0, 1]
    assert m["tp_size"] == 2

    # Core tuning fields
    for k in ("gpu_memory_utilization", "max_model_len", "max_num_batched_tokens", "kv_cache_dtype",
              "enforce_eager", "trust_remote_code", "max_num_seqs", "enable_prefix_caching",
              "attention_backend", "engine_startup_args_json", "engine_startup_env_json"):
        assert m[k] == payload[k], k

    # Sampling defaults must be readable as individual fields, not only as JSON
    for k, v in SAMPLING.items():
        assert m.get(k) == pytest.approx(v), f"{k} not echoed back (got {m.get(k)!r})"

    # request_defaults_json is the source of truth and must carry custom extras
    rd = json.loads(m["request_defaults_json"])
    for k, v in SAMPLING.items():
        assert rd[k] == pytest.approx(v)
    assert rd["stop"] == ["###"]
    assert rd["vllm_xargs"] == {"min_thinking_tokens": 7}

    # The UI needs the extras back as editable JSON
    assert json.loads(m["custom_request_json"]) == CUSTOM_REQUEST

    # Secrets never leak through the list endpoint
    assert "hf_token" not in m or m["hf_token"] in (None, "")


def test_create_llamacpp_roundtrip_every_field(client, llamacpp_model):
    model_id, payload = llamacpp_model
    m = _get_model(client, model_id)
    assert m is not None
    assert m["engine_type"] == "llamacpp"
    assert m["selected_gpus"] == [0, 1]
    assert m["tensor_split"] == "0.5,0.5"
    for k in ("ngl", "context_size", "parallel_slots", "batch_size", "ubatch_size", "threads",
              "flash_attn", "load_mode", "cache_type_k", "cache_type_v",
              "draft_model_path", "draft_n", "draft_p_min"):
        assert m[k] == payload[k], k
    for k, v in SAMPLING.items():
        assert m.get(k) == pytest.approx(v), k
    assert json.loads(m["custom_request_json"]) == {"stop": ["<|eot|>"]}
    # vLLM-only fields must not have been persisted for a llama.cpp model
    assert m["gpu_memory_utilization"] is None
    assert m["kv_cache_dtype"] is None


# ---------------------------------------------------------------------------
# UPDATE
# ---------------------------------------------------------------------------

def test_partial_patch_keeps_everything_else(client, vllm_model):
    model_id, _ = vllm_model
    r = client.patch(f"/admin/models/{model_id}", json={"max_model_len": 4096})
    assert r.status_code == 200, r.text
    m = _get_model(client, model_id)
    assert m["max_model_len"] == 4096
    assert m["selected_gpus"] == [0, 1]
    assert m["tp_size"] == 2
    assert m["temperature"] == pytest.approx(SAMPLING["temperature"])
    rd = json.loads(m["request_defaults_json"])
    assert rd["stop"] == ["###"], "custom request extras were dropped by an unrelated PATCH"


def test_patch_sampling_only_preserves_custom_extras(client, vllm_model):
    model_id, _ = vllm_model
    r = client.patch(f"/admin/models/{model_id}", json={"temperature": 0.9, "top_k": 3})
    assert r.status_code == 200, r.text
    m = _get_model(client, model_id)
    rd = json.loads(m["request_defaults_json"])
    assert rd["temperature"] == pytest.approx(0.9)
    assert rd["top_k"] == 3
    assert rd["top_p"] == pytest.approx(SAMPLING["top_p"]), "untouched sampling field was lost"
    assert rd["stop"] == ["###"], "custom request extras were dropped when only sampling fields changed"
    assert rd["vllm_xargs"] == {"min_thinking_tokens": 7}


def test_patch_custom_request_json_replaces_extras(client, vllm_model):
    model_id, _ = vllm_model
    r = client.patch(f"/admin/models/{model_id}", json={"custom_request_json": json.dumps({"stop": ["END"]})})
    assert r.status_code == 200, r.text
    m = _get_model(client, model_id)
    rd = json.loads(m["request_defaults_json"])
    assert rd["stop"] == ["END"]
    assert "vllm_xargs" not in rd, "explicit custom JSON should replace the previous extras"
    assert rd["temperature"] == pytest.approx(SAMPLING["temperature"])


def test_patch_gpu_selection_changes_device_and_tp(client, vllm_model):
    model_id, _ = vllm_model
    r = client.patch(f"/admin/models/{model_id}", json={"selected_gpus": [1]})
    assert r.status_code == 200, r.text
    m = _get_model(client, model_id)
    assert m["selected_gpus"] == [1]
    assert m["tp_size"] == 1, "tp_size must follow the GPU selection for vLLM"

    r = client.patch(f"/admin/models/{model_id}", json={"selected_gpus": [0, 1], "tp_size": 2})
    assert r.status_code == 200, r.text
    m = _get_model(client, model_id)
    assert m["selected_gpus"] == [0, 1]
    assert m["tp_size"] == 2


def test_patch_rejects_empty_gpu_selection_for_gpu_model(client, vllm_model):
    model_id, _ = vllm_model
    r = client.patch(f"/admin/models/{model_id}", json={"selected_gpus": []})
    assert r.status_code == 400, r.text
    m = _get_model(client, model_id)
    assert m["selected_gpus"] == [0, 1]


def test_full_form_patch_like_the_ui_does_not_wipe_token_or_extras(client, vllm_model):
    """Simulate the Configure modal: it submits every form field, including
    an empty hf_token and an empty custom_request_json when the user did not
    touch them."""
    model_id, payload = vllm_model
    body = dict(payload)
    body.pop("mode")
    body.pop("local_path")
    body["hf_token"] = ""
    body["custom_request_json"] = ""
    body["max_model_len"] = 2048
    r = client.patch(f"/admin/models/{model_id}", json=body)
    assert r.status_code == 200, r.text

    m = _get_model(client, model_id)
    assert m["max_model_len"] == 2048
    assert m["selected_gpus"] == [0, 1]
    rd = json.loads(m["request_defaults_json"])
    assert rd["stop"] == ["###"], "empty custom_request_json must mean 'unchanged', not 'clear'"

    # hf_token is never returned by the API; read it straight from the database to prove it survived
    assert _db_hf_token(model_id) == payload["hf_token"], "empty hf_token in PATCH wiped the stored token"

    # and recipes never leak it either
    r = client.post(f"/admin/recipes/from-model/{model_id}", json={"name": f"crud-recipe-{model_id}"})
    assert r.status_code == 200, r.text
    recipe = r.json()
    try:
        assert "hf_token" not in recipe.get("config", {})
        assert recipe["config"]["selected_gpus"] == [0, 1]
        assert recipe["config"]["temperature"] == pytest.approx(SAMPLING["temperature"])
    finally:
        client.delete(f"/admin/recipes/{recipe['id']}")


def test_patch_unknown_model_is_404(client):
    r = client.patch("/admin/models/999999999", json={"max_model_len": 1})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# DRY RUN / START / STOP
# ---------------------------------------------------------------------------

def test_dry_run_command_reflects_gpu_config(client, vllm_model, llamacpp_model):
    vid, vpayload = vllm_model
    if not _files_present(vpayload["local_path"]):
        pytest.skip(f"cannot create placeholder model files under {MODELS_DIR}")
    r = client.post(f"/admin/models/{vid}/dry-run")
    assert r.status_code == 200, r.text
    cmd = r.json()["command"]
    assert cmd, "dry-run returned no command preview"
    assert "--tensor-parallel-size" in cmd and cmd[cmd.index("--tensor-parallel-size") + 1] == "2"
    assert "--max-loras" in cmd, "custom startup args missing from command"

    lid, _ = llamacpp_model
    r = client.post(f"/admin/models/{lid}/dry-run")
    assert r.status_code == 200, r.text
    cmd = r.json()["command"]
    assert "--tensor-split" in cmd and cmd[cmd.index("--tensor-split") + 1] == "0.5,0.5"
    assert "--ctx-size" in cmd and cmd[cmd.index("--ctx-size") + 1] == "4096"
    assert "--spec-draft-n-max" in cmd and cmd[cmd.index("--spec-draft-n-max") + 1] == "8"
    assert "--api-key" not in cmd or cmd[cmd.index("--api-key") + 1] == "<redacted>", "secrets must be redacted in dry-run"


def test_start_without_files_fails_cleanly_then_stop(client, vllm_model):
    model_id, _ = vllm_model
    r = client.post(f"/admin/models/{model_id}/start", timeout=120.0)
    # Either a validation 400 (path missing) or a 5xx from Docker; must not be 200
    assert r.status_code != 200, r.text
    m = _get_model(client, model_id)
    assert m["state"] == "failed"
    assert m.get("state_reason"), "failed state must carry a reason"

    r = client.post(f"/admin/models/{model_id}/stop")
    assert r.status_code == 200, r.text
    m = _get_model(client, model_id)
    assert m["state"] == "stopped"


def test_apply_on_stopped_model_saves_without_starting(client, vllm_model):
    """Configure → Apply on a stopped model must not try to launch a container."""
    model_id, _ = vllm_model
    r = client.post(f"/admin/models/{model_id}/apply", timeout=120.0)
    assert r.status_code == 200, r.text
    assert r.json().get("status") in ("saved", "applied")
    m = _get_model(client, model_id)
    assert m["state"] == "stopped"


# ---------------------------------------------------------------------------
# ARCHIVE / DELETE
# ---------------------------------------------------------------------------

def test_archive_then_delete_cascades(client, vllm_model):
    model_id, _ = vllm_model
    r = client.post(f"/admin/models/{model_id}/archive")
    assert r.status_code == 200, r.text
    m = _get_model(client, model_id)
    assert m["archived"] is True

    r = client.post(f"/admin/recipes/from-model/{model_id}", json={"name": f"crud-recipe-del-{model_id}"})
    assert r.status_code == 200, r.text
    recipe_id = r.json()["id"]

    r = client.delete(f"/admin/models/{model_id}")
    assert r.status_code == 200, r.text
    assert r.json()["recipes_deleted"] >= 1
    assert _get_model(client, model_id) is None
    assert client.get(f"/admin/recipes/{recipe_id}").status_code == 404
    assert client.delete(f"/admin/models/{model_id}").status_code == 404


def test_vllm_rejects_gguf_and_duplicate_served_names(client, llamacpp_model):
    lid, lpayload = llamacpp_model
    r = client.post("/admin/models", json={**lpayload, "engine_type": "vllm", "name": lpayload["name"] + "-v",
                                            "served_model_name": lpayload["served_model_name"] + "-v"})
    assert r.status_code == 400 and "gguf_requires_llamacpp" in r.text
    r = client.post("/admin/models", json={**lpayload, "name": lpayload["name"] + "-dup"})
    assert r.status_code == 409, r.text


def test_custom_args_forbidden_flags_rejected(client, vllm_model):
    vid, _ = vllm_model
    r = client.patch(f"/admin/models/{vid}", json={"engine_startup_args_json": json.dumps([{"flag": "--port", "type": "int", "value": 9}])})
    assert r.status_code == 400 and "custom_arg_forbidden" in r.text
    r = client.patch(f"/admin/models/{vid}", json={"engine_startup_env_json": json.dumps([{"key": "HF_HUB_OFFLINE", "value": "0"}])})
    assert r.status_code == 400 and "env_var_protected" in r.text


def test_dry_run_of_unsaved_form_values(client, vllm_model):
    vid, payload = vllm_model
    body = {**payload, "model_id": vid, "max_model_len": 2048, "hf_token": ""}
    r = client.post("/admin/models/dry-run", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    if _files_present(payload["local_path"]):
        assert "--max-model-len" in d["command"] and d["command"][d["command"].index("--max-model-len") + 1] == "2048"
    assert isinstance(d["warnings"], list)
    assert "engines" not in d
    r = client.get("/admin/engines/spec")
    assert r.status_code == 200
    spec = r.json()
    assert any(f["name"] == "flash_attn" for f in spec["fields"])
    assert spec["policies"]["gguf_engine"] == "llamacpp"

"""Unit tests for the engine adapters (spec-driven command/env construction) and GPU selection.

These exercise exactly the code that turns a Model row into a container launch, so a
model configured for GPUs [0, 1] must produce `--tensor-parallel-size 2` and a
DeviceRequest limited to those devices, and llama.cpp must get the current flag names.
"""
from __future__ import annotations

import json

import pytest

from src import docker_manager
from src.engines import ConfigError, get_adapter
from src.engines.base import merge_custom_args, parse_custom_args, to_container_path
from src.engines.spec import ALL_FIELDS, FIELD_BY_NAME, fields_for
from src.models import Model
from src.utils.gpu_utils import normalize_gpu_selection, parse_gpu_selection


@pytest.fixture
def models_dir(tmp_path, monkeypatch):
    """Point CORTEX_MODELS_DIR at a temp dir so path validation passes."""
    base = tmp_path / "models"
    base.mkdir()
    real = docker_manager.get_settings()
    patched = real.model_copy(update={"CORTEX_MODELS_DIR": str(base), "CORTEX_MODELS_DIR_HOST": str(base), "INTERNAL_VLLM_API_KEY": "internal-secret"})
    monkeypatch.setattr(docker_manager, "get_settings", lambda: patched)
    return base


def _flag_value(cmd: list[str], flag: str) -> str | None:
    return cmd[cmd.index(flag) + 1] if flag in cmd else None


# ---------------------------------------------------------------------------
# Spec sanity
# ---------------------------------------------------------------------------

def test_spec_has_no_duplicate_names_and_valid_forms():
    names = [f.name for f in ALL_FIELDS]
    assert len(names) == len(set(names))
    for f in ALL_FIELDS:
        if f.form not in ("internal", "env", "custom"):
            assert f.flag, f.name
        if f.form == "env":
            assert f.env, f.name


def test_spec_removed_obsolete_flags():
    emitted = {f.flag_for("vllm") for f in fields_for("vllm")} | {f.flag_for("llamacpp") for f in fields_for("llamacpp")}
    for gone in ("--swap-space", "--cuda-graph-sizes", "--gguf-weight-format", "--disable-log-requests",
                 "--draft", "--system-prompt-file", "--defrag-thold", "--mlock", "--no-mmap"):
        assert gone not in emitted, gone
    assert "vllm_v1_enabled" not in FIELD_BY_NAME


# ---------------------------------------------------------------------------
# GPU selection
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw,expected", [
    (None, []), ("[0, 1]", [0, 1]), ('"[0, 1]"', [0, 1]), ([2, 3], [2, 3]), ("not json", []), ("[]", []),
])
def test_parse_gpu_selection(raw, expected):
    assert parse_gpu_selection(raw) == expected


def test_normalize_gpu_selection_empty_is_none():
    assert normalize_gpu_selection("[]") is None
    assert normalize_gpu_selection("[1]") == [1]


def test_gpu_device_requests_limits_to_selected_gpus():
    m = Model(engine_type="vllm", selected_gpus=json.dumps([0, 1]), device="cuda")
    reqs = docker_manager.gpu_device_requests(m)
    assert len(reqs) == 1 and reqs[0]["DeviceIDs"] == ["0", "1"]


def test_gpu_device_requests_all_gpus_when_unset():
    reqs = docker_manager.gpu_device_requests(Model(engine_type="vllm", selected_gpus=None, device="cuda"))
    assert len(reqs) == 1 and reqs[0]["Count"] == -1


def test_gpu_device_requests_none_for_cpu():
    assert docker_manager.gpu_device_requests(Model(engine_type="vllm", selected_gpus=json.dumps([0]), device="cpu")) is None
    assert docker_manager.gpu_device_requests(Model(engine_type="llamacpp", selected_gpus=json.dumps([0]), ngl=0)) is None


# ---------------------------------------------------------------------------
# Custom args helpers
# ---------------------------------------------------------------------------

def test_container_path_mapping_rejects_escapes():
    assert to_container_path("folder/model.gguf") == "/models/folder/model.gguf"
    assert to_container_path("/models/x/y.gguf") == "/models/x/y.gguf"
    with pytest.raises(ConfigError):
        to_container_path("../etc/passwd")
    with pytest.raises(ConfigError):
        to_container_path("/etc/passwd")


def test_parse_custom_args_forms():
    args = parse_custom_args(json.dumps([
        {"flag": "--enable-lora", "type": "bool", "value": True},
        {"flag": "--max-loras", "type": "int", "value": 8},
        {"flag": "-c", "type": "int", "value": 8192},
        {"flag": "--jinja", "type": "bool", "value": False},
        {"flag": "--stop", "type": "string_list", "value": ["a", "b"]},
    ]), "llamacpp")
    assert args == ["--enable-lora", "--max-loras", "8", "--ctx-size", "8192", "--no-jinja", "--stop", "a", "b"]


def test_merge_custom_args_overrides_standard():
    std = ["--model", "x", "--max-model-len", "8192", "--enable-prefix-caching", "--seed", "1"]
    out = merge_custom_args(std, ["--max-model-len", "131072", "--no-enable-prefix-caching"], {"--max-model-len", "--seed"})
    assert out == ["--model", "x", "--seed", "1", "--max-model-len", "131072", "--no-enable-prefix-caching"]


# ---------------------------------------------------------------------------
# vLLM
# ---------------------------------------------------------------------------

def _vllm_model(**kw) -> Model:
    base = dict(name="t", served_model_name="t-served", task="generate", engine_type="vllm", repo_id="org/model",
                local_path=None, dtype="bfloat16", tp_size=2, selected_gpus=json.dumps([0, 1]),
                gpu_memory_utilization=0.85, max_model_len=8192)
    base.update(kw)
    return Model(**base)


def test_vllm_command_uses_tp_size_and_core_flags(models_dir):
    cmd = docker_manager._build_command(_vllm_model())
    assert cmd[:2] == ["--model", "org/model"]
    assert _flag_value(cmd, "--served-model-name") == "t-served"
    assert _flag_value(cmd, "--tensor-parallel-size") == "2"
    assert _flag_value(cmd, "--dtype") == "bfloat16"
    assert _flag_value(cmd, "--gpu-memory-utilization") == "0.85"
    assert _flag_value(cmd, "--max-model-len") == "8192"
    assert _flag_value(cmd, "--api-key") == "internal-secret"
    assert "--swap-space" not in cmd and "VLLM_USE_V1" not in cmd


def test_vllm_single_gpu_omits_tp_and_embed_uses_pooling_runner(models_dir):
    cmd = docker_manager._build_command(_vllm_model(tp_size=1, selected_gpus=json.dumps([1]), task="embed"))
    assert "--tensor-parallel-size" not in cmd
    assert _flag_value(cmd, "--runner") == "pooling"


def test_vllm_negatable_and_json_fields(models_dir):
    m = _vllm_model(enable_prefix_caching=False, enable_chunked_prefill=True, enforce_eager=True,
                    cuda_graph_sizes="1,2,4", hf_overrides_json='{"rope_parameters": {"factor": 2}}',
                    speculative_config_json='{"method": "ngram", "num_speculative_tokens": 4}',
                    enable_lora=True, lora_modules_json='[{"name": "a", "path": "adapters/a"}]')
    cmd = docker_manager._build_command(m)
    assert "--no-enable-prefix-caching" in cmd and "--enable-chunked-prefill" in cmd and "--enforce-eager" in cmd
    i = cmd.index("--cudagraph-capture-sizes")
    assert cmd[i + 1:i + 4] == ["1", "2", "4"]
    assert json.loads(_flag_value(cmd, "--hf-overrides")) == {"rope_parameters": {"factor": 2}}
    assert json.loads(_flag_value(cmd, "--speculative-config"))["method"] == "ngram"
    assert "--enable-lora" in cmd and cmd[cmd.index("--lora-modules") + 1] == "a=/models/adapters/a"


def test_vllm_custom_args_override_standard_flags(models_dir):
    m = _vllm_model(engine_startup_args_json=json.dumps([
        {"flag": "--max-model-len", "type": "int", "value": 131072},
        {"flag": "--enable-lora", "type": "bool", "value": True},
    ]))
    cmd = docker_manager._build_command(m)
    assert cmd.count("--max-model-len") == 1 and _flag_value(cmd, "--max-model-len") == "131072"
    assert "--enable-lora" in cmd


def test_vllm_env_from_spec(models_dir):
    m = _vllm_model(debug_logging=True, engine_request_timeout=120, engine_startup_env_json='[{"key": "VLLM_USE_FLASHINFER_SAMPLER", "value": "0"}]')
    env = get_adapter("vllm").build_env(m, docker_manager.get_settings())
    assert env["VLLM_LOGGING_LEVEL"] == "DEBUG"
    assert env["VLLM_ENGINE_ITERATION_TIMEOUT_S"] == "120"
    assert env["VLLM_USE_FLASHINFER_SAMPLER"] == "0"
    assert "HF_HUB_OFFLINE" not in env  # online model


def test_vllm_local_path_validates_and_maps_to_container(models_dir):
    (models_dir / "my-model").mkdir()
    (models_dir / "my-model" / "model.safetensors").write_bytes(b"")
    cmd = docker_manager._build_command(_vllm_model(repo_id=None, local_path="my-model"))
    assert cmd[:2] == ["--model", "/models/my-model"]
    env = get_adapter("vllm").build_env(_vllm_model(repo_id=None, local_path="my-model"), docker_manager.get_settings())
    assert env["HF_HUB_OFFLINE"] == "1"


def test_vllm_missing_local_path_and_gguf_raise(models_dir):
    with pytest.raises(ConfigError):
        docker_manager._build_command(_vllm_model(repo_id=None, local_path="does-not-exist"))
    (models_dir / "g").mkdir()
    (models_dir / "g" / "m.gguf").write_bytes(b"")
    with pytest.raises(ConfigError, match="llama.cpp"):
        docker_manager._build_command(_vllm_model(repo_id=None, local_path="g/m.gguf"))


def test_vllm_validate_flags_tp_mismatch(models_dir):
    issues = get_adapter("vllm").validate(_vllm_model(tp_size=4), docker_manager.get_settings())
    assert any(i.severity == "error" and i.field == "tp_size" for i in issues)


def test_plan_redacts_secrets(models_dir):
    plan = get_adapter("vllm").plan(_vllm_model(), docker_manager.get_settings(), hf_token="hf_secret")
    assert "internal-secret" in plan.args and "<redacted>" in plan.redacted_args()
    assert plan.redacted_env().get("HF_TOKEN") == "<redacted>"


# ---------------------------------------------------------------------------
# llama.cpp
# ---------------------------------------------------------------------------

def _llama_model(models_dir, **kw) -> Model:
    d = models_dir / "gguf-model"
    d.mkdir(exist_ok=True)
    (d / "model.gguf").write_bytes(b"")
    base = dict(name="l", served_model_name="l-served", task="generate", engine_type="llamacpp",
                local_path="gguf-model/model.gguf", selected_gpus=json.dumps([0, 1]), tensor_split="1,1",
                ngl=99, context_size=4096, parallel_slots=4, batch_size=1024, ubatch_size=256, threads=8, flash_attn="on")
    base.update(kw)
    return Model(**base)


def test_llamacpp_command_core_flags(models_dir):
    cmd = docker_manager._build_llamacpp_command(_llama_model(models_dir))
    assert cmd[:2] == ["-m", "/models/gguf-model/model.gguf"]
    assert _flag_value(cmd, "--alias") == "l-served"
    assert _flag_value(cmd, "--ctx-size") == "4096"
    assert _flag_value(cmd, "--n-gpu-layers") == "99"
    assert _flag_value(cmd, "--batch-size") == "1024"
    assert _flag_value(cmd, "--ubatch-size") == "256"
    assert _flag_value(cmd, "--threads") == "8"
    assert _flag_value(cmd, "--parallel") == "4"
    assert _flag_value(cmd, "--tensor-split") == "1,1"
    assert _flag_value(cmd, "--flash-attn") == "on"
    assert _flag_value(cmd, "--api-key") == "internal-secret"
    assert "--metrics" in cmd and "--log-timestamps" in cmd
    for gone in ("--draft", "--system-prompt-file", "--defrag-thold", "--mlock", "--no-mmap", "--cont-batching", "-c", "-ngl"):
        assert gone not in cmd, gone


def test_llamacpp_unset_fields_are_omitted(models_dir):
    m = _llama_model(models_dir, ngl=None, parallel_slots=None, threads=None, batch_size=None, ubatch_size=None, context_size=None, flash_attn=None, tensor_split=None)
    cmd = docker_manager._build_llamacpp_command(m)
    for flag in ("--n-gpu-layers", "--parallel", "--threads", "--batch-size", "--ubatch-size", "--ctx-size", "--flash-attn", "--tensor-split"):
        assert flag not in cmd, flag


def test_llamacpp_quantized_v_cache_forces_flash_attention(models_dir):
    cmd = docker_manager._build_llamacpp_command(_llama_model(models_dir, cache_type_v="q8_0", flash_attn=None))
    assert _flag_value(cmd, "--flash-attn") == "on"
    issues = get_adapter("llamacpp").validate(_llama_model(models_dir, cache_type_v="q8_0", flash_attn="off"), docker_manager.get_settings())
    assert any(i.severity == "error" and i.field == "flash_attn" for i in issues)


def test_llamacpp_speculative_lora_and_load_mode(models_dir):
    (models_dir / "gguf-model").mkdir(exist_ok=True)
    (models_dir / "gguf-model" / "draft.gguf").write_bytes(b"")
    m = _llama_model(models_dir, draft_model_path="gguf-model/draft.gguf", draft_n=8, spec_draft_n_min=2, draft_p_min=0.4,
                     spec_type="draft-simple", load_mode="mlock", cont_batching=False, jinja_enabled=False,
                     lora_adapters_json=json.dumps(["loras/a.gguf", {"path": "loras/b.gguf", "scale": 0.5}]),
                     enable_embeddings=True, pooling="mean")
    cmd = docker_manager._build_llamacpp_command(m)
    assert _flag_value(cmd, "--model-draft") == "/models/gguf-model/draft.gguf"
    assert _flag_value(cmd, "--spec-draft-n-max") == "8" and _flag_value(cmd, "--spec-draft-n-min") == "2"
    assert _flag_value(cmd, "--spec-draft-p-min") == "0.4" and _flag_value(cmd, "--spec-type") == "draft-simple"
    assert _flag_value(cmd, "--load-mode") == "mlock"
    assert "--no-cont-batching" in cmd and "--no-jinja" in cmd
    assert cmd[cmd.index("--lora") + 1] == "/models/loras/a.gguf"
    i = cmd.index("--lora-scaled")
    assert cmd[i + 1:i + 3] == ["/models/loras/b.gguf", "0.5"]
    assert "--embeddings" in cmd and _flag_value(cmd, "--pooling") == "mean"


def test_llamacpp_embed_task_adds_embeddings_flag(models_dir):
    cmd = docker_manager._build_llamacpp_command(_llama_model(models_dir, task="embed"))
    assert cmd.count("--embeddings") == 1


def test_llamacpp_sharded_gguf_uses_first_part(models_dir):
    d = models_dir / "big"
    d.mkdir()
    for i in (1, 2, 3):
        (d / f"big-q4-0000{i}-of-00003.gguf").write_bytes(b"")
    cmd = docker_manager._build_llamacpp_command(_llama_model(models_dir, local_path="big/big-q4-00002-of-00003.gguf"))
    assert cmd[1] == "/models/big/big-q4-00001-of-00003.gguf"
    # a directory with two quant sets must be disambiguated by the admin
    (d / "big-q8.gguf").write_bytes(b"")
    with pytest.raises(ConfigError, match="select the file"):
        docker_manager._build_llamacpp_command(_llama_model(models_dir, local_path="big"))


def test_llamacpp_custom_short_alias_overrides(models_dir):
    m = _llama_model(models_dir, engine_startup_args_json=json.dumps([{"flag": "-c", "type": "int", "value": 65536}]))
    cmd = docker_manager._build_llamacpp_command(m)
    assert cmd.count("--ctx-size") == 1 and _flag_value(cmd, "--ctx-size") == "65536"

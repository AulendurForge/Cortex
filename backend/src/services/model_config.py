"""Model configuration helpers shared by the create/update/list/dry-run routes.

- ``model_to_item``: ORM row → API item (no secrets, sampling knobs split out).
- ``clear_other_engine_fields``: drop/NULL the other engine's fields.
- ``normalize_gpu_fields``: keep selected_gpus / tp_size / tensor_split consistent.
- ``validate_custom_startup``: enforce forbidden flags / protected env vars at save time.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Mapping

from ..engines import ConfigError, get_adapter
from ..engines.spec import ALL_FIELDS, field_names_for, other_engine_only_fields
from ..models import Model
from ..schemas.models import ModelItem
from ..utils.gpu_utils import normalize_gpu_selection, parse_gpu_selection
from .request_defaults import SAMPLING_FIELDS, split_request_defaults

logger = logging.getLogger(__name__)


class ModelConfigError(ValueError):
    """Raised for invalid configuration combinations (mapped to HTTP 400)."""


NON_COLUMN_REQUEST_FIELDS: frozenset[str] = frozenset({"mode", "hf_offline", "custom_request_json", "model_id"})
_COLUMN_NAMES: frozenset[str] = frozenset(c.name for c in Model.__table__.columns)
SPEC_FIELD_NAMES: frozenset[str] = frozenset(f.name for f in ALL_FIELDS)

# Flags Cortex manages itself; custom args may not set them.
FORBIDDEN_CUSTOM_FLAGS: frozenset[str] = frozenset({
    "--host", "--port", "-p", "--api-key", "--api-key-file", "--ssl-keyfile", "--ssl-certfile", "--ssl-ca-certs",
    "--root-path", "--model", "-m", "--served-model-name", "--alias", "-a", "--uvicorn-log-level",
})
PROTECTED_ENV_VARS: frozenset[str] = frozenset({
    "NVIDIA_VISIBLE_DEVICES", "CUDA_VISIBLE_DEVICES", "HF_HUB_OFFLINE", "VLLM_API_KEY", "LLAMA_API_KEY",
    "LLAMA_ARG_HOST", "LLAMA_ARG_PORT", "LLAMA_ARG_MODEL", "LLAMA_ARG_API_KEY",
})


def fields_for_other_engine(engine_type: str) -> frozenset[str]:
    return other_engine_only_fields(engine_type)


def clear_other_engine_fields(values: dict[str, Any], engine_type: str, *, drop: bool = False) -> dict[str, Any]:
    """Return ``values`` with the other engine's fields set to None (or removed)."""
    other = fields_for_other_engine(engine_type)
    out = dict(values)
    for key in other:
        if key in out:
            if drop:
                out.pop(key)
            else:
                out[key] = None
    return out


def _equal_tensor_split(n: int) -> str:
    return ",".join(["1"] * n)


def normalize_gpu_fields(values: dict[str, Any], engine_type: str, current: Model | None) -> None:
    """Validate and reconcile ``selected_gpus`` / ``tp_size`` / ``tensor_split`` in place."""

    def _get(key: str) -> Any:
        if key in values:
            return values[key]
        return getattr(current, key, None) if current is not None else None

    if "selected_gpus" not in values:
        if engine_type != "llamacpp" and ("tp_size" in values or "pipeline_parallel_size" in values):
            gpus = parse_gpu_selection(getattr(current, "selected_gpus", None)) if current is not None else []
            tp = _get("tp_size") or 1
            pp = _get("pipeline_parallel_size") or 1
            if gpus and tp * pp > len(gpus):
                raise ModelConfigError(
                    f"tp_size_mismatch: tensor_parallel_size ({tp}) x pipeline_parallel_size ({pp}) "
                    f"exceeds the {len(gpus)} selected GPU(s)"
                )
        return

    raw = values.get("selected_gpus")
    if raw is None:
        values["selected_gpus"] = None
        return
    try:
        gpus = sorted({int(g) for g in raw})
    except (TypeError, ValueError):
        raise ModelConfigError("selected_gpus must be a list of GPU indices")
    if any(g < 0 for g in gpus):
        raise ModelConfigError("selected_gpus indices must be non-negative")

    if not gpus:
        if engine_type == "llamacpp":
            ngl = _get("ngl")
            if ngl is None or int(ngl) > 0:
                raise ModelConfigError("selected_gpus_required: select at least one GPU, or set GPU layers (ngl) to 0 for CPU-only")
        else:
            device = (_get("device") or "cuda").lower()
            if device != "cpu":
                raise ModelConfigError("selected_gpus_required: select at least one GPU, or set device to cpu")
        values["selected_gpus"] = None
        return

    values["selected_gpus"] = gpus
    if engine_type == "llamacpp":
        if len(gpus) == 1:
            values["tensor_split"] = None
        else:
            ts = _get("tensor_split")
            parts = [p for p in str(ts or "").split(",") if p.strip()]
            if len(parts) != len(gpus):
                values["tensor_split"] = _equal_tensor_split(len(gpus))
        return
    pp = _get("pipeline_parallel_size") or 1
    tp = values.get("tp_size")
    if tp is None:
        values["tp_size"] = max(1, len(gpus) // int(pp))
    elif int(tp) * int(pp) > len(gpus):
        raise ModelConfigError(
            f"tp_size_mismatch: tensor_parallel_size ({tp}) x pipeline_parallel_size ({pp}) exceeds the {len(gpus)} selected GPU(s)"
        )


def serialize_selected_gpus(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        parsed = parse_gpu_selection(value)
        return json.dumps(parsed) if parsed else None
    try:
        gpus = [int(g) for g in value]
    except (TypeError, ValueError):
        return None
    return json.dumps(gpus) if gpus else None


def validate_custom_startup(values: Mapping[str, Any]) -> None:
    """Reject forbidden custom flags / protected env vars (raises ModelConfigError)."""
    args_json = values.get("engine_startup_args_json")
    if args_json:
        try:
            items = json.loads(args_json)
        except (TypeError, ValueError):
            raise ModelConfigError("engine_startup_args_json must be valid JSON")
        if not isinstance(items, list):
            raise ModelConfigError("engine_startup_args_json must be a JSON array")
        seen: set[str] = set()
        for item in items:
            if not isinstance(item, dict):
                continue
            flag = str(item.get("flag", "")).strip()
            if not flag:
                continue
            if flag in FORBIDDEN_CUSTOM_FLAGS:
                raise ModelConfigError(f"custom_arg_forbidden: {flag} is managed by Cortex")
            if flag in seen:
                raise ModelConfigError(f"custom_arg_duplicate: {flag} appears more than once")
            seen.add(flag)
    env_json = values.get("engine_startup_env_json")
    if env_json:
        try:
            items = json.loads(env_json)
        except (TypeError, ValueError):
            raise ModelConfigError("engine_startup_env_json must be valid JSON")
        if not isinstance(items, list):
            raise ModelConfigError("engine_startup_env_json must be a JSON array")
        for item in items:
            key = str((item or {}).get("key", "")).strip() if isinstance(item, dict) else ""
            if key in PROTECTED_ENV_VARS:
                raise ModelConfigError(f"env_var_protected: {key} is managed by Cortex")


def model_to_item(m: Model) -> ModelItem:
    """Build the API representation from the ORM row (all columns, no secrets)."""
    data: dict[str, Any] = {name: getattr(m, name, None) for name in _COLUMN_NAMES if name != "hf_token"}
    data["selected_gpus"] = normalize_gpu_selection(getattr(m, "selected_gpus", None))
    sampling, extras = split_request_defaults(getattr(m, "request_defaults_json", None))
    for field in SAMPLING_FIELDS:
        data[field] = sampling.get(field)
    data["custom_request_json"] = json.dumps(extras) if extras else None
    data["engine_type"] = getattr(m, "engine_type", None) or "vllm"
    data["task"] = getattr(m, "task", None) or "generate"
    data["archived"] = bool(getattr(m, "archived", False))
    return ModelItem(**data)


def column_values(values: Mapping[str, Any]) -> dict[str, Any]:
    """Keep only keys that are real ``Model`` columns."""
    return {k: v for k, v in values.items() if k in _COLUMN_NAMES}


def config_snapshot(m: Model) -> dict[str, Any]:
    """Every spec field of ``m`` as a JSON-serialisable dict (used by recipes)."""
    out: dict[str, Any] = {}
    for f in ALL_FIELDS:
        v = getattr(m, f.name, None)
        if f.name == "selected_gpus":
            v = normalize_gpu_selection(v)
        out[f.name] = v
    return out


def transient_model(values: Mapping[str, Any], base: Model | None = None) -> Model:
    """An unsaved Model with ``values`` applied over ``base`` (for dry-run)."""
    m = Model()
    if base is not None:
        for c in _COLUMN_NAMES:
            setattr(m, c, getattr(base, c, None))
    for k, v in values.items():
        if k in _COLUMN_NAMES:
            setattr(m, k, v)
    if isinstance(getattr(m, "selected_gpus", None), list):
        m.selected_gpus = serialize_selected_gpus(m.selected_gpus)
    if m.id is None:
        m.id = 0
    return m

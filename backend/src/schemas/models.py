"""Pydantic schemas for model management endpoints.

The tunable engine fields are generated from ``engines/spec.py`` so the API,
the ORM and the frontend cannot drift (see ``test_model_schema_parity``).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, create_model

from ..engines.spec import ALL_FIELDS
from ..utils.gguf_utils import GGUFGroup

_PY_TYPES = {"int": int, "float": float, "bool": bool, "str": str, "json": str}


def _config_field_definitions() -> dict[str, tuple[Any, Any]]:
    defs: dict[str, tuple[Any, Any]] = {}
    for f in ALL_FIELDS:
        if f.name == "selected_gpus":
            defs[f.name] = (Optional[List[int]], None)
        else:
            defs[f.name] = (Optional[_PY_TYPES[f.kind]], None)
    return defs


ModelConfigFields = create_model(  # type: ignore[call-overload]
    "ModelConfigFields",
    __config__=ConfigDict(extra="ignore"),
    **_config_field_definitions(),
)
ModelConfigFields.__doc__ = "Every editable engine configuration column on Model (all optional)."

SAMPLING_SCHEMA_FIELDS = ("temperature", "top_p", "top_k", "repetition_penalty", "frequency_penalty", "presence_penalty")


class _SamplingFields(BaseModel):
    """Sampling knobs exposed as individual fields; stored inside request_defaults_json."""
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    top_k: Optional[int] = None
    repetition_penalty: Optional[float] = None
    frequency_penalty: Optional[float] = None
    presence_penalty: Optional[float] = None
    # Everything in request_defaults_json that is not a sampling knob, as a JSON object string
    custom_request_json: Optional[str] = None


class ModelItem(ModelConfigFields, _SamplingFields):  # type: ignore[misc,valid-type]
    """Model item returned by the list endpoint."""
    id: int
    name: str
    served_model_name: str
    task: str
    repo_id: Optional[str] = None
    local_path: Optional[str] = None
    engine_type: str = "vllm"
    # Runtime state
    state: str
    state_reason: Optional[str] = None
    archived: bool
    port: Optional[int] = None
    container_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CreateModelRequest(ModelConfigFields, _SamplingFields):  # type: ignore[misc,valid-type]
    """Request body for creating a new model."""
    mode: str
    repo_id: Optional[str] = None
    local_path: Optional[str] = None
    name: str
    served_model_name: str
    task: str = "generate"
    engine_type: str = "vllm"
    hf_offline: Optional[bool] = None
    hf_token: Optional[str] = None


class UpdateModelRequest(ModelConfigFields, _SamplingFields):  # type: ignore[misc,valid-type]
    """Request body for updating an existing model (only fields present are applied)."""
    name: Optional[str] = None
    served_model_name: Optional[str] = None
    archived: Optional[bool] = None
    hf_token: Optional[str] = None


class DryRunRequest(CreateModelRequest):
    """Validate an unsaved configuration. ``model_id`` merges over an existing model."""
    mode: str = "offline"
    name: str = ""
    served_model_name: str = ""
    model_id: Optional[int] = None


class BaseDirCfg(BaseModel):
    base_dir: str


class GGUFValidationSummary(BaseModel):
    total_files: int
    valid_files: int
    invalid_files: int
    warnings: list[str]
    errors: list[str]


class EngineRecommendation(BaseModel):
    recommended: str  # 'vllm', 'llamacpp', or 'either'
    reason: str
    has_multipart_gguf: bool
    has_safetensors: bool
    has_gguf: bool
    vllm_gguf_compatible: bool
    options: list[dict]


class SafeTensorInfo(BaseModel):
    files: list[str]
    total_size_gb: float
    file_count: int
    architecture: str | None = None
    model_type: str | None = None
    vocab_size: int | None = None
    max_position_embeddings: int | None = None
    torch_dtype: str | None = None
    tie_word_embeddings: bool | None = None


class InspectFolderResp(BaseModel):
    has_safetensors: bool
    safetensor_info: SafeTensorInfo | None = None
    gguf_files: list[str]
    gguf_groups: list[GGUFGroup]
    tokenizer_files: list[str]
    config_files: list[str]
    warnings: list[str]
    params_b: float | None = None
    hidden_size: int | None = None
    num_hidden_layers: int | None = None
    num_attention_heads: int | None = None
    engine_recommendation: EngineRecommendation | None = None
    gguf_validation: GGUFValidationSummary | None = None


class HfConfigResp(BaseModel):
    hidden_size: int | None = None
    num_hidden_layers: int | None = None
    num_attention_heads: int | None = None
    params_b: float | None = None

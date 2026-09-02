"""Engine adapters: one class per inference engine, driven by ``spec.py``."""
from __future__ import annotations

from .base import ConfigError, EngineAdapter, Issue, LaunchPlan
from .llamacpp import LlamaCppAdapter
from .spec import ALL_FIELDS, FIELD_BY_NAME, fields_for, other_engine_only_fields, spec_as_json
from .vllm import VllmAdapter

ADAPTERS: dict[str, EngineAdapter] = {
    "vllm": VllmAdapter(),
    "llamacpp": LlamaCppAdapter(),
}


def get_adapter(engine_type: str | None) -> EngineAdapter:
    key = (engine_type or "vllm").lower()
    if key not in ADAPTERS:
        raise ConfigError(f"unknown engine_type '{engine_type}'")
    return ADAPTERS[key]


__all__ = [
    "ADAPTERS", "ALL_FIELDS", "FIELD_BY_NAME", "ConfigError", "EngineAdapter", "Issue", "LaunchPlan",
    "LlamaCppAdapter", "VllmAdapter", "fields_for", "get_adapter", "other_engine_only_fields", "spec_as_json",
]

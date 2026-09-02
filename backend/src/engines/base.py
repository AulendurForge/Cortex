"""Engine adapter base: renders a Model row into container args/env using the spec.

An adapter is the ONLY place that knows how a Cortex field becomes a CLI flag
or environment variable for its engine.  Engine-specific quirks live in the
subclasses; everything table-driven lives here.
"""
from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from typing import Any, Iterable

from .spec import FieldSpec, LLAMACPP_FLAG_ALIASES, fields_for, value_flags_for

logger = logging.getLogger(__name__)

CONTAINER_MODELS_DIR = "/models"


class ConfigError(ValueError):
    """Invalid model configuration (surfaces as HTTP 400 / dry-run error)."""


@dataclass
class Issue:
    severity: str          # error | warning | info
    field: str | None
    message: str
    fix: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {"severity": self.severity, "field": self.field, "message": self.message, "fix": self.fix}


@dataclass
class LaunchPlan:
    """Everything needed to start a container, with secrets separated for redaction."""
    image: str
    container_name: str
    args: list[str]
    env: dict[str, str]
    entrypoint: list[str] | None = None
    secret_values: list[str] = field(default_factory=list)

    def redacted_args(self) -> list[str]:
        out = []
        for a in self.args:
            out.append("<redacted>" if a and a in self.secret_values else a)
        return out

    def redacted_env(self) -> dict[str, str]:
        return {k: ("<redacted>" if v in self.secret_values or k.upper().endswith(("TOKEN", "KEY", "SECRET", "PASSWORD")) else v)
                for k, v in self.env.items()}


# ---------------------------------------------------------------------------
# Value helpers
# ---------------------------------------------------------------------------

def is_unset(v: Any) -> bool:
    return v is None or (isinstance(v, str) and v.strip() == "")


def to_container_path(value: str) -> str:
    """Map a models-dir-relative path to the container mount; reject escapes."""
    v = str(value).strip().replace("\\", "/")
    if v.startswith(CONTAINER_MODELS_DIR + "/"):
        rel = v[len(CONTAINER_MODELS_DIR) + 1:]
    elif v.startswith("/"):
        raise ConfigError(f"Path '{value}' must be relative to the models directory")
    else:
        rel = v
    norm = os.path.normpath(rel)
    if norm.startswith("..") or norm == "." or os.path.isabs(norm):
        raise ConfigError(f"Path '{value}' escapes the models directory")
    return f"{CONTAINER_MODELS_DIR}/{norm}"


def safe_host_path(base_dir: str, rel: str) -> str:
    """Join ``rel`` under ``base_dir`` refusing absolute paths and ``..``."""
    v = str(rel).strip().replace("\\", "/")
    if v.startswith(CONTAINER_MODELS_DIR + "/"):
        v = v[len(CONTAINER_MODELS_DIR) + 1:]
    if v.startswith("/"):
        raise ConfigError(f"Path '{rel}' must be relative to the models directory")
    norm = os.path.normpath(v)
    if norm.startswith("..") or os.path.isabs(norm):
        raise ConfigError(f"Path '{rel}' escapes the models directory")
    return os.path.join(base_dir, norm)


def render_field(spec: FieldSpec, value: Any, engine: str) -> list[str]:
    """Render one field to CLI args according to its form."""
    flag = spec.flag_for(engine)
    if not flag or spec.form in ("internal", "env", "custom"):
        return []
    if spec.form == "switch":
        return [flag] if value else []
    if spec.form == "negatable":
        if value is None:
            return []
        if value:
            return [flag]
        return [flag.replace("--", "--no-", 1)]
    if spec.form == "no_only":
        return [flag.replace("--", "--no-", 1)] if value is False else []
    if spec.form == "onoff":
        if value is None:
            return []
        return [flag, "on" if value else "off"]
    if is_unset(value):
        return []
    if spec.emit_if == "gt1" and not (isinstance(value, (int, float)) and value > 1):
        return []
    if spec.emit_if == "gt0" and not (isinstance(value, (int, float)) and value > 0):
        return []
    if spec.form == "csv":
        parts = [p.strip() for p in str(value).split(",") if p.strip()]
        return [flag, *parts] if parts else []
    if spec.form == "json":
        text = value if isinstance(value, str) else json.dumps(value)
        try:
            json.loads(text)
        except (TypeError, ValueError):
            raise ConfigError(f"{spec.name} must be valid JSON")
        return [flag, text]
    if spec.path:
        return [flag, to_container_path(str(value))]
    if spec.kind == "bool":
        return [flag, "true" if value else "false"]
    return [flag, str(value)]


def parse_custom_args(args_json: str | None, engine: str) -> list[str]:
    """Structured custom args → CLI list (short aliases normalised for llama.cpp)."""
    if not args_json:
        return []
    try:
        items = json.loads(args_json)
    except (TypeError, ValueError):
        raise ConfigError("engine_startup_args_json must be valid JSON")
    if not isinstance(items, list):
        raise ConfigError("engine_startup_args_json must be a JSON array")
    out: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        flag = str(item.get("flag", "")).strip()
        if not flag:
            continue
        if engine == "llamacpp":
            flag = LLAMACPP_FLAG_ALIASES.get(flag, flag)
        kind = str(item.get("type", "string")).lower()
        value = item.get("value")
        if kind in ("bool", "flag"):
            if value in (True, "true", "1", 1, None) and kind == "flag" or (kind == "bool" and value in (True, "true", "1", 1)):
                out.append(flag)
            elif kind == "bool" and value in (False, "false", "0", 0):
                # Explicit false: emit the --no- form when the flag has one, else omit
                out.append(flag.replace("--", "--no-", 1) if flag.startswith("--") and not flag.startswith("--no-") else flag)
            continue
        if value is None or (isinstance(value, str) and value.strip() == ""):
            out.append(flag)
            continue
        if isinstance(value, (list, tuple)):
            out.append(flag)
            out.extend(str(v) for v in value)
        elif isinstance(value, (dict,)):
            out.extend([flag, json.dumps(value)])
        else:
            out.extend([flag, str(value)])
    return out


def merge_custom_args(standard: list[str], custom: list[str], value_flags: set[str]) -> list[str]:
    """Let custom args override standard ones: any flag present in ``custom``
    is removed (with its value) from ``standard`` before appending custom."""
    if not custom:
        return list(standard)
    custom_flags = {a for a in custom if a.startswith("-") and not _looks_numeric(a)}
    # also treat --no-x as overriding --x and vice versa
    expanded = set(custom_flags)
    for f in custom_flags:
        if f.startswith("--no-"):
            expanded.add("--" + f[5:])
        elif f.startswith("--"):
            expanded.add("--no-" + f[2:])
    out: list[str] = []
    i = 0
    while i < len(standard):
        a = standard[i]
        if a in expanded:
            # drop the flag and every value token that follows it
            i += 1
            while i < len(standard) and (not standard[i].startswith("-") or _looks_numeric(standard[i])):
                i += 1
            continue
        out.append(a)
        i += 1
    return out + list(custom)


def _looks_numeric(s: str) -> bool:
    return bool(re.fullmatch(r"-?\d+(\.\d+)?", s or ""))


def parse_custom_env(env_json: str | None) -> dict[str, str]:
    if not env_json:
        return {}
    try:
        items = json.loads(env_json)
    except (TypeError, ValueError):
        raise ConfigError("engine_startup_env_json must be valid JSON")
    if not isinstance(items, list):
        raise ConfigError("engine_startup_env_json must be a JSON array")
    out: dict[str, str] = {}
    for item in items:
        if isinstance(item, dict):
            key = str(item.get("key", "")).strip()
            if key:
                out[key] = str(item.get("value", ""))
    return out


def validate_against_spec(values: dict[str, Any], engine: str) -> list[Issue]:
    """Type/choice/range/requires checks derived from the spec."""
    issues: list[Issue] = []
    for spec in fields_for(engine):
        v = values.get(spec.name)
        if is_unset(v):
            continue
        if spec.choices and str(v) not in spec.choices:
            issues.append(Issue("error", spec.name, f"{spec.label or spec.name}: '{v}' is not one of {', '.join(spec.choices)}"))
        if spec.kind in ("int", "float") and isinstance(v, (int, float)):
            if spec.min is not None and v < spec.min:
                issues.append(Issue("error", spec.name, f"{spec.label or spec.name} must be ≥ {spec.min}"))
            if spec.max is not None and v > spec.max:
                issues.append(Issue("error", spec.name, f"{spec.label or spec.name} must be ≤ {spec.max}"))
        if spec.kind == "json" and isinstance(v, str):
            try:
                json.loads(v)
            except ValueError:
                issues.append(Issue("error", spec.name, f"{spec.label or spec.name} must be valid JSON"))
        if spec.path:
            try:
                to_container_path(str(v))
            except ConfigError as e:
                issues.append(Issue("error", spec.name, str(e)))
        for req_field, req_val in spec.requires.items():
            if values.get(req_field) != req_val:
                issues.append(Issue("warning", spec.name, f"{spec.label or spec.name} has no effect unless {req_field} = {req_val}"))
    return issues


class EngineAdapter:
    """Base class; subclasses implement the engine-specific parts."""

    name: str = ""
    container_prefix: str = ""
    container_port: int = 8000

    # --- identity -------------------------------------------------------
    def container_name(self, m: Any) -> str:
        return f"{self.container_prefix}-model-{m.id}"

    def image(self, m: Any, settings: Any) -> str:
        raise NotImplementedError

    # --- rendering ------------------------------------------------------
    def spec_args(self, m: Any) -> list[str]:
        args: list[str] = []
        for spec in fields_for(self.name):
            if spec.form in ("internal", "env", "custom"):
                continue
            args.extend(render_field(spec, getattr(m, spec.name, None), self.name))
        return args

    def spec_env(self, m: Any) -> dict[str, str]:
        env: dict[str, str] = {}
        for spec in fields_for(self.name):
            if spec.form != "env" or not spec.env:
                continue
            v = getattr(m, spec.name, None)
            if is_unset(v):
                continue
            if spec.kind == "bool":
                if v:
                    env[spec.env] = spec.env_value or "1"
            else:
                env[spec.env] = str(v)
        return env

    def finalize_args(self, m: Any, args: list[str]) -> list[str]:
        custom = parse_custom_args(getattr(m, "engine_startup_args_json", None), self.name)
        return merge_custom_args(args, custom, value_flags_for(self.name))

    # --- to implement ---------------------------------------------------
    def build_args(self, m: Any, settings: Any) -> list[str]:
        raise NotImplementedError

    def build_env(self, m: Any, settings: Any, hf_token: str | None = None) -> dict[str, str]:
        raise NotImplementedError

    def validate(self, m: Any, settings: Any) -> list[Issue]:
        return validate_against_spec({f.name: getattr(m, f.name, None) for f in fields_for(self.name)}, self.name)

    def healthcheck(self, m: Any, settings: Any) -> dict[str, Any]:
        raise NotImplementedError

    def secret_values(self, settings: Any) -> list[str]:
        return [s for s in (getattr(settings, "INTERNAL_VLLM_API_KEY", "") or "",) if s]

"""llama.cpp adapter (ghcr.io/ggml-org/llama.cpp:server-cuda, llama-server b10731 CLI surface)."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from .base import (
    CONTAINER_MODELS_DIR, ConfigError, EngineAdapter, Issue, LaunchPlan, is_unset, parse_custom_env,
    safe_host_path, to_container_path,
)

logger = logging.getLogger(__name__)

_QUANTIZED_CACHE = {"q8_0", "q4_0", "q4_1", "iq4_nl", "q5_0", "q5_1"}
_SHARD_RE = re.compile(r"^(?P<base>.+)-(?P<idx>\d{5})-of-(?P<total>\d{5})\.gguf$", re.IGNORECASE)


class LlamaCppAdapter(EngineAdapter):
    name = "llamacpp"
    container_prefix = "llamacpp"

    def image(self, m: Any, settings: Any) -> str:
        return getattr(m, "engine_image", None) or settings.LLAMACPP_IMAGE

    # --- model path -----------------------------------------------------
    def resolve_model_path(self, m: Any, settings: Any) -> str:
        """Container path of the GGUF to load.

        - A file path is used as-is; if it is shard N of a set, the first shard of
          the SAME set is used (llama.cpp loads the rest automatically).
        - A directory must contain exactly one GGUF set; otherwise the admin has to pick a file.
        """
        if not m.local_path:
            raise ConfigError("llama.cpp requires local_path")
        host_path = safe_host_path(settings.CORTEX_MODELS_DIR, m.local_path)
        rel = str(m.local_path).replace("\\", "/")
        if rel.lower().endswith(".gguf"):
            if not os.path.isfile(host_path):
                raise ConfigError(f"GGUF file not found: {m.local_path}")
            fname = os.path.basename(rel)
            mt = _SHARD_RE.match(fname)
            if mt and mt.group("idx") != "00001":
                first = f"{mt.group('base')}-00001-of-{mt.group('total')}.gguf"
                rel = f"{os.path.dirname(rel)}/{first}" if os.path.dirname(rel) else first
                if not os.path.isfile(safe_host_path(settings.CORTEX_MODELS_DIR, rel)):
                    raise ConfigError(f"First shard {first} not found next to {fname}")
            return to_container_path(rel)
        if os.path.isdir(host_path):
            files = sorted(f for f in os.listdir(host_path) if f.lower().endswith(".gguf"))
            if not files:
                raise ConfigError(f"No GGUF files found in directory: {m.local_path}")
            firsts = [f for f in files if not _SHARD_RE.match(f) or _SHARD_RE.match(f).group("idx") == "00001"]
            if len(firsts) != 1:
                raise ConfigError(
                    f"Directory {m.local_path} contains {len(firsts)} GGUF sets ({', '.join(firsts[:4])}); "
                    f"select the file to load"
                )
            return to_container_path(f"{rel}/{firsts[0]}")
        raise ConfigError(f"Invalid local_path: {m.local_path} - must be a .gguf file or a directory containing one")

    # --- args -----------------------------------------------------------
    def build_args(self, m: Any, settings: Any) -> list[str]:
        args: list[str] = ["-m", self.resolve_model_path(m, settings), "--host", "0.0.0.0", "--port", str(self.container_port)]
        if m.served_model_name:
            args += ["--alias", str(m.served_model_name)]
        args += self.spec_args(m)
        # Server-managed flags (not per-model fields)
        args += ["--timeout", str(settings.LLAMACPP_SERVER_TIMEOUT)]
        if settings.LLAMACPP_METRICS_ENABLED:
            args.append("--metrics")
        if settings.LLAMACPP_LOG_TIMESTAMPS:
            args.append("--log-timestamps")
        # Embeddings for embedding-task models even if the field is unset
        if (m.task or "").lower().startswith("embed") and "--embeddings" not in args:
            args.append("--embeddings")
        # Quantized V cache needs flash attention: force it on unless explicitly off
        ctv = getattr(m, "cache_type_v", None)
        if ctv in _QUANTIZED_CACHE:
            fa = getattr(m, "flash_attn", None)
            if fa in (None, "", "auto"):
                if "--flash-attn" in args:
                    i = args.index("--flash-attn")
                    args[i + 1] = "on"
                else:
                    args += ["--flash-attn", "on"]
        # LoRA (custom form): repeated --lora FNAME / --lora-scaled FNAME SCALE
        lora_json = getattr(m, "lora_adapters_json", None)
        if lora_json:
            try:
                adapters = json.loads(lora_json)
            except ValueError:
                raise ConfigError("lora_adapters_json must be valid JSON")
            for a in adapters if isinstance(adapters, list) else []:
                if isinstance(a, str) and a.strip():
                    args += ["--lora", to_container_path(a)]
                elif isinstance(a, dict) and a.get("path"):
                    scale = a.get("scale")
                    if scale is None:
                        args += ["--lora", to_container_path(str(a["path"]))]
                    else:
                        args += ["--lora-scaled", to_container_path(str(a["path"])), str(scale)]
        key = settings.INTERNAL_VLLM_API_KEY
        if key:
            args += ["--api-key", str(key)]
        return self.finalize_args(m, args)

    # --- env ------------------------------------------------------------
    def build_env(self, m: Any, settings: Any, hf_token: str | None = None) -> dict[str, str]:
        env = {"NVIDIA_DRIVER_CAPABILITIES": "compute,utility"}
        env.update(self.spec_env(m))
        env.update(parse_custom_env(getattr(m, "engine_startup_env_json", None)))
        return env

    # --- validation -----------------------------------------------------
    def validate(self, m: Any, settings: Any) -> list[Issue]:
        issues = super().validate(m, settings)
        if getattr(m, "cache_type_v", None) in _QUANTIZED_CACHE and getattr(m, "flash_attn", None) == "off":
            issues.append(Issue("error", "flash_attn", "A quantized V cache requires flash attention",
                                "Set flash attention to on/auto or use f16 for cache_type_v"))
        ctx = getattr(m, "context_size", None)
        slots = getattr(m, "parallel_slots", None)
        if ctx and slots and slots > 1 and not getattr(m, "kv_unified", None):
            per = ctx // slots
            issues.append(Issue("info", "parallel_slots", f"Each of the {slots} slots gets ~{per} tokens of the {ctx} context",
                                "Enable unified KV cache or raise context_size if requests need more"))
            if ctx % slots:
                issues.append(Issue("warning", "context_size", f"context_size {ctx} is not divisible by {slots} slots; llama.cpp rounds down"))
        if getattr(m, "draft_model_path", None) and not getattr(m, "spec_type", None):
            issues.append(Issue("info", "spec_type", "Speculative type will be inferred from the draft model metadata; sharded drafts need an explicit type"))
        return issues

    # --- runtime --------------------------------------------------------
    def healthcheck(self, m: Any, settings: Any) -> dict[str, Any]:
        start = int(getattr(m, "startup_timeout_sec", None) or settings.LLAMACPP_STARTUP_TIMEOUT)
        return {
            "Test": ["CMD-SHELL", "curl -sf http://localhost:8000/health -o /dev/null || exit 1"],
            "Interval": 10_000_000_000,
            "Timeout": 8_000_000_000,
            "Retries": 3,
            "StartPeriod": start * 1_000_000_000,
        }

    def plan(self, m: Any, settings: Any, hf_token: str | None = None) -> LaunchPlan:
        return LaunchPlan(
            image=self.image(m, settings),
            container_name=self.container_name(m),
            args=self.build_args(m, settings),
            env=self.build_env(m, settings, hf_token),
            entrypoint=None,
            secret_values=self.secret_values(settings),
        )

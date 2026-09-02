"""vLLM adapter (vllm/vllm-openai image, v0.28 CLI surface)."""
from __future__ import annotations

import json
import logging
import os
from typing import Any

from .base import (
    CONTAINER_MODELS_DIR, ConfigError, EngineAdapter, Issue, LaunchPlan, is_unset, safe_host_path,
    to_container_path, parse_custom_env,
)

logger = logging.getLogger(__name__)


class VllmAdapter(EngineAdapter):
    name = "vllm"
    container_prefix = "vllm"

    def image(self, m: Any, settings: Any) -> str:
        return getattr(m, "engine_image", None) or settings.VLLM_IMAGE

    # --- model path -----------------------------------------------------
    def resolve_model_arg(self, m: Any, settings: Any) -> str:
        """``--model`` value: HF repo id, or the container path of a local folder."""
        if m.repo_id and not m.local_path:
            return m.repo_id
        if not m.local_path:
            raise ConfigError("vLLM offline model requires local_path")
        host_path = safe_host_path(settings.CORTEX_MODELS_DIR, m.local_path)
        if not os.path.exists(host_path):
            raise ConfigError(
                f"Model path not found: {m.local_path} (checked {host_path}). "
                f"Verify the folder exists under CORTEX_MODELS_DIR."
            )
        if str(m.local_path).lower().endswith(".gguf"):
            raise ConfigError(
                "GGUF files are served by llama.cpp. vLLM's GGUF support is an out-of-tree plugin that is not "
                "included in the official image; create this model with engine_type=llamacpp."
            )
        return to_container_path(m.local_path)

    # --- args -----------------------------------------------------------
    def build_args(self, m: Any, settings: Any) -> list[str]:
        args: list[str] = ["--model", self.resolve_model_arg(m, settings), "--host", "0.0.0.0", "--port", str(self.container_port)]
        if m.served_model_name:
            args += ["--served-model-name", str(m.served_model_name)]
        if (m.task or "").lower().startswith("embed"):
            args += ["--runner", "pooling"]
        args += self.spec_args(m)
        # chat template: file path relative to models dir or inline string
        args = self._fix_chat_template(args)
        # LoRA modules (custom form): --lora-modules name=path ...
        lora_json = getattr(m, "lora_modules_json", None)
        if lora_json and getattr(m, "enable_lora", None):
            try:
                mods = json.loads(lora_json)
            except ValueError:
                raise ConfigError("lora_modules_json must be valid JSON")
            entries = []
            for mod in mods if isinstance(mods, list) else []:
                if isinstance(mod, dict) and mod.get("name") and mod.get("path"):
                    entries.append(f"{mod['name']}={to_container_path(str(mod['path']))}")
                elif isinstance(mod, str) and "=" in mod:
                    n, p = mod.split("=", 1)
                    entries.append(f"{n}={to_container_path(p)}")
            if entries:
                args += ["--lora-modules", *entries]
        key = settings.INTERNAL_VLLM_API_KEY
        if key:
            args += ["--api-key", str(key)]
        if settings.HF_CACHE_DIR:
            args += ["--download-dir", "/root/.cache/huggingface"]
        return self.finalize_args(m, args)

    @staticmethod
    def _fix_chat_template(args: list[str]) -> list[str]:
        try:
            i = args.index("--chat-template")
        except ValueError:
            return args
        val = args[i + 1]
        if (val.endswith((".jinja", ".j2", ".txt")) or "/" in val) and not val.strip().startswith("{"):
            args[i + 1] = to_container_path(val)
        return args

    def entrypoint(self, m: Any) -> list[str] | None:
        override = getattr(m, "entrypoint_override", None)
        if override:
            parts = [p.strip() for p in str(override).split(",") if p.strip()]
            return parts or None
        return None  # use the image ENTRYPOINT (`vllm serve`)

    # --- env ------------------------------------------------------------
    def build_env(self, m: Any, settings: Any, hf_token: str | None = None) -> dict[str, str]:
        env: dict[str, str] = {}
        if m.local_path:
            env["HF_HUB_OFFLINE"] = "1"
        else:
            token = hf_token or os.environ.get("HUGGING_FACE_HUB_TOKEN") or os.environ.get("HF_TOKEN")
            if token:
                env["HF_TOKEN"] = str(token)
                env["HUGGING_FACE_HUB_TOKEN"] = str(token)
                env.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "1")
        # Multi-GPU stability defaults inside containers
        env.setdefault("NCCL_P2P_DISABLE", "1")
        env.setdefault("NCCL_IB_DISABLE", "1")
        env.setdefault("NCCL_DEBUG", "WARN")
        env.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
        env.setdefault("VLLM_NO_USAGE_STATS", "1")
        env.update(self.spec_env(m))
        if getattr(m, "trace_mode", None):
            env["CUDA_LAUNCH_BLOCKING"] = "1"
        env.update(parse_custom_env(getattr(m, "engine_startup_env_json", None)))
        return env

    # --- validation -----------------------------------------------------
    def validate(self, m: Any, settings: Any) -> list[Issue]:
        issues = super().validate(m, settings)
        if m.local_path and str(m.local_path).lower().endswith(".gguf"):
            issues.append(Issue("error", "engine_type", "GGUF models must use the llama.cpp engine",
                                "Re-create the model with engine_type=llamacpp"))
        tp = getattr(m, "tp_size", None) or 1
        pp = getattr(m, "pipeline_parallel_size", None) or 1
        gpus = getattr(m, "selected_gpus", None)
        try:
            n = len(json.loads(gpus)) if isinstance(gpus, str) else (len(gpus) if gpus else 0)
        except Exception:
            n = 0
        if n and tp * pp > n:
            issues.append(Issue("error", "tp_size", f"tensor_parallel ({tp}) × pipeline_parallel ({pp}) exceeds the {n} selected GPU(s)"))
        if (getattr(m, "device", None) or "cuda") != "cpu" and n == 0 and gpus is not None:
            issues.append(Issue("warning", "selected_gpus", "No GPU pinned; the container will see every GPU on the host"))
        return issues

    # --- runtime --------------------------------------------------------
    def healthcheck(self, m: Any, settings: Any) -> dict[str, Any]:
        start = int(getattr(m, "startup_timeout_sec", None) or settings.VLLM_STARTUP_TIMEOUT)
        return {
            "Test": ["CMD-SHELL", "curl -sf http://localhost:8000/health -o /dev/null || exit 1"],
            "Interval": 10_000_000_000,
            "Timeout": 5_000_000_000,
            "Retries": 3,
            "StartPeriod": start * 1_000_000_000,
        }

    def plan(self, m: Any, settings: Any, hf_token: str | None = None) -> LaunchPlan:
        return LaunchPlan(
            image=self.image(m, settings),
            container_name=self.container_name(m),
            args=self.build_args(m, settings),
            env=self.build_env(m, settings, hf_token),
            entrypoint=self.entrypoint(m),
            secret_values=self.secret_values(settings) + ([hf_token] if hf_token else []),
        )

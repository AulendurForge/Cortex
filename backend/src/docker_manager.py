from __future__ import annotations

import docker
import os
import re
import json
import logging
from docker.models.containers import Container
from docker.types import DeviceRequest
from typing import Optional, Tuple, List
from .config import get_settings
from .models import Model
from .utils.gpu_utils import parse_gpu_selection

logger = logging.getLogger(__name__)


# Legacy alias for backward compatibility - use parse_gpu_selection from utils.gpu_utils
_parse_gpu_selection = parse_gpu_selection


def _parse_vllm_version(image_tag: str) -> tuple[int, int, int] | None:
    """Parse vLLM version from Docker image tag.
    
    Args:
        image_tag: Docker image tag like "vllm/vllm-openai:v0.6.3" or "v0.8.0"
        
    Returns:
        Tuple of (major, minor, patch) or None if parsing fails
    """
    # Extract version from tag (handles both full image names and just tags)
    # Examples: "vllm/vllm-openai:v0.6.3", "v0.6.3", "0.6.3", "latest"
    version_patterns = [
        r'v?(\d+)\.(\d+)\.(\d+)',  # v0.6.3 or 0.6.3
        r'v?(\d+)\.(\d+)',          # v0.6 or 0.6
    ]
    
    for pattern in version_patterns:
        match = re.search(pattern, image_tag)
        if match:
            groups = match.groups()
            major = int(groups[0])
            minor = int(groups[1])
            patch = int(groups[2]) if len(groups) > 2 else 0
            return (major, minor, patch)
    
    return None


def _get_vllm_entrypoint(image: str, entrypoint_override: str | None = None) -> list[str]:
    """Get the appropriate vLLM entrypoint based on image version.
    
    vLLM entrypoints by version:
    - v0.6.x and earlier: python3 -m vllm.entrypoints.openai.api_server
    - v0.7.x to v0.12.x: Same module, but `vllm serve` CLI also available
    - v0.13.x+: May require `vllm serve` or different entrypoint
    
    Args:
        image: Full Docker image name with tag
        entrypoint_override: Optional custom entrypoint string (comma-separated)
        
    Returns:
        List of entrypoint command components
    """
    # If user provided an override, use it
    if entrypoint_override:
        # Support comma-separated format for complex entrypoints
        # e.g., "vllm,serve" or "python3,-m,vllm.entrypoints.openai.api_server"
        parts = [p.strip() for p in entrypoint_override.split(',') if p.strip()]
        if parts:
            logger.info(f"Using custom entrypoint override: {parts}")
            return parts
    
    # Parse version from image tag
    version = _parse_vllm_version(image)
    
    if version is None:
        # Can't determine version (e.g., "latest" tag) - use conservative default
        logger.warning(f"Cannot determine vLLM version from image '{image}', using module entrypoint")
        return ["python3", "-m", "vllm.entrypoints.openai.api_server"]
    
    major, minor, patch = version
    logger.info(f"Detected vLLM version: {major}.{minor}.{patch} from image '{image}'")
    
    # Version-specific entrypoint selection
    # v0.6.x and below: Use module entrypoint (most compatible)
    # v0.7.x - v0.12.x: Module still works, but vllm serve also available
    # v0.13.x+: May change - we'll use module for now and add support as needed
    
    if major == 0 and minor >= 13:
        # vLLM 0.13+ might use different entrypoint
        # For now, still use module entrypoint as it should work
        # TODO: Update when v0.13 release is finalized
        logger.info("vLLM 0.13+ detected - using module entrypoint (monitor for changes)")
        return ["python3", "-m", "vllm.entrypoints.openai.api_server"]
    
    # Default: Use module entrypoint (works for all current versions)
    return ["python3", "-m", "vllm.entrypoints.openai.api_server"]


class OfflineImageUnavailableError(Exception):
    """Raised when Docker image is not available locally and system is in offline mode."""
    pass


def _client() -> docker.DockerClient:
    return docker.from_env()


def _is_network_available() -> bool:
    """Check if internet connectivity is available.
    
    Returns:
        bool: True if network is available, False otherwise
    """
    import socket
    try:
        # Try to resolve Docker Hub registry
        socket.create_connection(("registry-1.docker.io", 443), timeout=3)
        return True
    except OSError:
        return False


# Cache for network validation
_NETWORK_VALIDATED = False
_NETWORK_NAME = "cortex_default"


def _ensure_docker_network() -> str:
    """Ensure the Docker network exists for model containers.
    
    Model containers need to be on the same network as the gateway to enable
    service-to-service communication (container name resolution).
    
    Returns:
        str: Name of the Docker network to use
        
    Behavior:
    - If cortex_default exists: use it
    - If not: create it with a warning
    - On failure: log warning and return None (Docker will use bridge)
    """
    global _NETWORK_VALIDATED
    
    if _NETWORK_VALIDATED:
        return _NETWORK_NAME
    
    cli = _client()
    try:
        # Check if network exists
        cli.networks.get(_NETWORK_NAME)
        logger.info(f"Docker network '{_NETWORK_NAME}' found")
        _NETWORK_VALIDATED = True
        return _NETWORK_NAME
    except docker.errors.NotFound:
        # Network doesn't exist - try to create it
        logger.warning(f"Docker network '{_NETWORK_NAME}' not found. Creating...")
        try:
            cli.networks.create(
                _NETWORK_NAME,
                driver="bridge",
                labels={"com.docker.compose.project": "cortex"}
            )
            logger.info(f"Created Docker network '{_NETWORK_NAME}'")
            _NETWORK_VALIDATED = True
            return _NETWORK_NAME
        except Exception as create_err:
            logger.warning(
                f"Could not create network '{_NETWORK_NAME}': {create_err}. "
                "Model containers may not be reachable from gateway. "
                "Ensure 'make up' has been run to create the Compose network."
            )
            return None
    except Exception as e:
        logger.warning(f"Error checking network '{_NETWORK_NAME}': {e}. Using Docker default.")
        return None


def _ensure_image(image: str) -> None:
    """Ensure Docker image is available locally.
    
    Behavior depends on offline mode configuration:
    - OFFLINE_MODE=True: Only check local cache, never pull
    - OFFLINE_MODE=False + Auto-detect: Pull if needed and network available
    - REQUIRE_IMAGE_PRECACHE=True: Always fail if not cached (strict offline)
    
    Args:
        image: Full image name with tag (e.g., "vllm/vllm-openai:v0.6.3")
        
    Raises:
        OfflineImageUnavailableError: When image unavailable in offline mode
        docker.errors.DockerException: When pull fails
    """
    settings = get_settings()
    cli = _client()
    
    # First, check if image exists locally
    try:
        cli.images.get(image)
        logger.info(f"Using cached Docker image: {image}")
        return
    except docker.errors.ImageNotFound:
        logger.debug(f"Image {image} not found in local cache")
    
    # Image not cached - determine if we can/should pull
    offline_mode_active = settings.OFFLINE_MODE
    
    # Auto-detect offline mode if enabled
    if not offline_mode_active and settings.OFFLINE_MODE_AUTO_DETECT:
        if not _is_network_available():
            logger.warning("Network unavailable - auto-enabling offline mode for this operation")
            offline_mode_active = True
    
    # Check strict precache requirement
    if settings.REQUIRE_IMAGE_PRECACHE or offline_mode_active:
        # Cannot pull - fail with helpful message
        error_msg = (
            f"Docker image '{image}' is not available locally.\n\n"
        )
        
        if offline_mode_active:
            error_msg += "System is in OFFLINE MODE - cannot download from internet.\n\n"
        else:
            error_msg += "REQUIRE_IMAGE_PRECACHE is enabled - only cached images allowed.\n\n"
        
        error_msg += (
            "To resolve this issue:\n"
            "─────────────────────────────────────────────────────────────\n"
            "Option 1: Load image from offline package\n"
            "  1. On an internet-connected machine, run:\n"
            f"     make prepare-offline\n"
            "  2. Transfer cortex-offline-images/ directory to this machine\n"
            "  3. Load images:\n"
            "     make load-offline\n\n"
            "Option 2: Load individual image\n"
            "  1. On an internet-connected machine:\n"
            f"     docker pull {image}\n"
            f"     docker save -o cortex-image.tar {image}\n"
            "  2. Transfer cortex-image.tar to this machine\n"
            "  3. Load:\n"
            "     docker load -i cortex-image.tar\n\n"
            "Option 3: Disable offline mode (if network available)\n"
            "  - Set OFFLINE_MODE=False in backend/.env\n"
            "  - Restart: make restart\n"
            "─────────────────────────────────────────────────────────────"
        )
        
        raise OfflineImageUnavailableError(error_msg)
    
    # Online mode - attempt pull
    logger.warning(
        f"Image {image} not found locally. Pulling from registry "
        f"(this may take 5-15 minutes and requires internet access)..."
    )
    
    try:
        # Pull image (Docker SDK handles authentication from daemon config)
        cli.images.pull(image)
        logger.info(f"Successfully pulled {image}")
    except docker.errors.APIError as e:
        error_str = str(e).lower()
        if "connection" in error_str or "network" in error_str or "timeout" in error_str:
            raise OfflineImageUnavailableError(
                f"Cannot pull image {image} - network error.\n\n"
                f"The system may be offline or the registry is unreachable.\n\n"
                f"To resolve:\n"
                f"1. Check internet connectivity\n"
                f"2. Verify Docker can reach registry\n"
                f"3. Or pre-load image: docker load -i <image.tar>\n"
                f"4. Or enable offline mode: OFFLINE_MODE=True"
            ) from e
        raise


def check_image_availability(engine_type: str) -> tuple[bool, str, dict]:
    """Check if required Docker image is available locally.
    
    Args:
        engine_type: 'vllm' or 'llamacpp'
        
    Returns:
        Tuple of (is_available: bool, status_message: str, details: dict)
    """
    settings = get_settings()
    image = settings.LLAMACPP_IMAGE if engine_type == 'llamacpp' else settings.VLLM_IMAGE
    cli = _client()
    
    try:
        img = cli.images.get(image)
        size_mb = round(img.attrs.get("Size", 0) / (1024 * 1024), 2)
        created = img.attrs.get("Created", "unknown")
        
        details = {
            "image": image,
            "cached": True,
            "size_mb": size_mb,
            "created": created,
            "tags": img.tags,
        }
        
        message = f"Image {image} is cached locally ({size_mb} MB)"
        return True, message, details
        
    except docker.errors.ImageNotFound:
        details = {
            "image": image,
            "cached": False,
            "offline_mode": settings.OFFLINE_MODE,
        }
        
        if settings.OFFLINE_MODE:
            message = (
                f"Image {image} not available locally. "
                f"System is in OFFLINE_MODE. Please pre-load image."
            )
            return False, message, details
        else:
            message = (
                f"Image {image} not cached. Will pull from registry when starting model "
                f"(requires internet, 5-15 min download)."
            )
            # Available but requires download
            return True, message, details


def _build_command(m: Model) -> list[str]:
    """Build args for the vllm/vllm-openai image (api_server.py flags).
    Note: This image expects only flags, not a `vllm serve` prefix.
    """
    # Validate and resolve model path (raises ValueError if invalid)
    model_arg = _resolve_vllm_model_path(m)
    cmd: list[str] = [
        "--model", model_arg,
        "--host", "0.0.0.0",
        "--port", "8000",
    ]
    # GGUF handling: if using a local .gguf file or repo_id that endswith .gguf, pass tokenizer and optional hf-config-path
    try:
        is_gguf = str(model_arg).lower().endswith('.gguf')
    except Exception:
        is_gguf = False
    if is_gguf:
        try:
            # Only pass --tokenizer if provided; otherwise rely on --hf-config-path to locate local tokenizer files
            tok = getattr(m, 'tokenizer', None)
            hf_cfg = getattr(m, 'hf_config_path', None)
            if tok:
                cmd += ["--tokenizer", str(m.tokenizer)]
            elif hf_cfg:
                # vLLM can accept a local directory path as tokenizer id; ensure it's a string
                cmd += ["--tokenizer", str(hf_cfg)]
        except Exception:
            pass
        try:
            if getattr(m, 'hf_config_path', None):
                cmd += ["--hf-config-path", str(m.hf_config_path)]
        except Exception:
            pass
    # Served name allows routing stability via our registry
    if getattr(m, "served_model_name", None):
        cmd += ["--served-model-name", str(m.served_model_name)]
    # vLLM 0.11+: `--task` is deprecated; embeddings/pooling models should use the pooling runner.
    # This also enables vLLM's "Chat Embeddings" extension that accepts `messages` at /v1/embeddings.
    if m.task and m.task.lower().startswith("embed"):
        cmd += ["--runner", "pooling"]
    if m.dtype:
        cmd += ["--dtype", m.dtype]
    if m.tp_size and m.tp_size > 1:
        cmd += ["--tensor-parallel-size", str(m.tp_size)]
    # Optional distributed/pipeline parallel
    try:
        if getattr(m, "pipeline_parallel_size", None):
            cmd += ["--pipeline-parallel-size", str(int(m.pipeline_parallel_size))]
    except Exception:
        pass
    if m.gpu_memory_utilization:
        cmd += ["--gpu-memory-utilization", str(m.gpu_memory_utilization)]
    
    # Phase 2: Parse custom startup args early to check for overrides (Plane B)
    # This allows custom args to override standard args (e.g., max-model-len > 131072)
    custom_cli_args = []
    custom_args_set = set()  # Track which flags are in custom args
    try:
        from .utils import parse_custom_args_to_cli
        custom_args_json = getattr(m, 'engine_startup_args_json', None)
        if custom_args_json:
            custom_cli_args = parse_custom_args_to_cli(custom_args_json)
            if custom_cli_args:
                # Build set of flags that are overridden by custom args
                # This allows custom args to override standard args (e.g., max-model-len)
                i = 0
                while i < len(custom_cli_args):
                    arg = custom_cli_args[i]
                    if arg.startswith('--') or arg.startswith('-'):
                        custom_args_set.add(arg.lower())
                        # Skip the value if this is a flag with value
                        if i + 1 < len(custom_cli_args) and not custom_cli_args[i + 1].startswith('-'):
                            i += 1
                    i += 1
    except Exception as e:
        logger.warning(f"Failed to parse custom startup args for model {m.id}: {e}")
    
    # Max context length: skip if overridden by custom args
    # For embedding models, vLLM auto-detects from model config (max_position_embeddings).
    # However, some models (like BGE-Large) have incorrect config values, so allow override.
    # For generation models, always pass through when provided.
    # Custom args can override this to exceed UI slider limits (e.g., 262144 for Nemotron)
    if m.max_model_len and '--max-model-len' not in custom_args_set:
        # Allow override for embedding models (some have incorrect max_position_embeddings in config)
        # For generation models, always pass through
        try:
            cmd += ["--max-model-len", str(int(m.max_model_len))]
        except Exception:
            cmd += ["--max-model-len", str(m.max_model_len)]
    # Optional tuning flags
    try:
        if getattr(m, "max_num_batched_tokens", None):
            cmd += ["--max-num-batched-tokens", str(int(m.max_num_batched_tokens))]
    except Exception:
        pass
    try:
        if getattr(m, "kv_cache_dtype", None):
            cmd += ["--kv-cache-dtype", str(m.kv_cache_dtype)]
    except Exception:
        pass
    try:
        if getattr(m, "quantization", None):
            cmd += ["--quantization", str(m.quantization)]
    except Exception:
        pass
    try:
        if getattr(m, "block_size", None):
            cmd += ["--block-size", str(int(m.block_size))]
    except Exception:
        pass
    try:
        if getattr(m, "swap_space_gb", None):
            cmd += ["--swap-space", str(int(m.swap_space_gb))]
    except Exception:
        pass
    try:
        if getattr(m, "enforce_eager", None):
            if bool(m.enforce_eager):
                cmd += ["--enforce-eager"]
    except Exception:
        pass
    # Advanced: trust remote code
    try:
        if getattr(m, "trust_remote_code", None):
            if bool(m.trust_remote_code):
                cmd += ["--trust-remote-code"]
    except Exception:
        pass
    # Advanced cache/offload/prefix/chunked/scheduler
    try:
        if getattr(m, "cpu_offload_gb", None):
            val = int(m.cpu_offload_gb) if m.cpu_offload_gb is not None else 0
            if val > 0:
                cmd += ["--cpu-offload-gb", str(val)]
    except Exception:
        pass
    try:
        if getattr(m, "enable_prefix_caching", None) is not None:
            if bool(m.enable_prefix_caching):
                cmd += ["--enable-prefix-caching"]
            else:
                cmd += ["--no-enable-prefix-caching"]
    except Exception:
        pass
    try:
        algo = getattr(m, "prefix_caching_hash_algo", None)
        if algo:
            cmd += ["--prefix-caching-hash-algo", str(algo)]
    except Exception:
        pass
    try:
        if getattr(m, "enable_chunked_prefill", None):
            if bool(m.enable_chunked_prefill):
                cmd += ["--enable-chunked-prefill"]
    except Exception:
        pass
    try:
        if getattr(m, "max_num_seqs", None):
            cmd += ["--max-num-seqs", str(int(m.max_num_seqs))]
    except Exception:
        pass
    try:
        sizes = getattr(m, "cuda_graph_sizes", None)
        if sizes:
            parts = [p.strip() for p in str(sizes).split(",") if p.strip()]
            if parts:
                cmd += ["--cuda-graph-sizes", *parts]
    except Exception:
        pass
    # Advanced vLLM engine args (Gap #4)
    try:
        attention_backend = getattr(m, "attention_backend", None)
        if attention_backend:
            cmd += ["--attention-backend", str(attention_backend)]
    except Exception:
        pass
    # GGUF weight format (Gap #7)
    try:
        gguf_weight_format = getattr(m, "gguf_weight_format", None)
        if gguf_weight_format and gguf_weight_format != "auto":
            cmd += ["--gguf-weight-format", str(gguf_weight_format)]
    except Exception:
        pass
    try:
        if getattr(m, "disable_log_requests", None):
            cmd += ["--disable-log-requests"]
    except Exception:
        pass
    try:
        if getattr(m, "disable_log_stats", None):
            cmd += ["--disable-log-stats"]
    except Exception:
        pass
    # Max log len (Gap #13) - valid vLLM CLI argument
    try:
        max_log_len = getattr(m, "max_log_len", None)
        if max_log_len and int(max_log_len) > 0:
            cmd += ["--max-log-len", str(int(max_log_len))]
    except Exception:
        pass
    # Note: engine_request_timeout is handled via environment variables, not CLI args
    # See _build_environment() for VLLM_ENGINE_ITERATION_TIMEOUT_S
    # Use internal API key so gateway can authenticate to this upstream
    try:
        from .config import get_settings as _gs  # local import to avoid cycles
        key = _gs().INTERNAL_VLLM_API_KEY
        if key:
            cmd += ["--api-key", str(key)]
    except Exception:
        pass
    # If we mounted an HF cache dir in online mode, hint the download dir
    try:
        from .config import get_settings as _gs2
        if _gs2().HF_CACHE_DIR:
            cmd += ["--download-dir", "/root/.cache/huggingface"]
    except Exception:
        pass
    
    # NOTE: Sampling parameters (temperature, top_p, repetition_penalty, etc.)
    # are request-time parameters, NOT container startup args.
    # They will be applied by the gateway when forwarding requests (Plane C).
    # See cortexSustainmentPlan.md for details.
    
    # Phase 2: Append custom startup args (Plane B) - these override standard args
    # Custom args were parsed earlier to check for overrides (see above)
    if custom_cli_args:
        cmd.extend(custom_cli_args)
        logger.info(f"Added {len(custom_cli_args)} custom startup args for model {m.id}")
        if custom_args_set:
            logger.debug(f"Custom args override standard args for: {sorted(custom_args_set)}")
    
    return cmd


def _build_llamacpp_command(m: Model) -> list[str]:
    """Build llama-server command arguments for llama.cpp containers.
    Note: The official image has ENTRYPOINT ["/app/llama-server"], so we only pass arguments.
    """
    model_path = _resolve_llamacpp_model_path(m)
    
    # Don't include 'llama-server' - it's already in the ENTRYPOINT
    cmd: list[str] = [
        "-m", model_path,
        "--host", "0.0.0.0",
        "--port", "8000",
    ]
    
    # Core parameters with defaults from settings
    settings = get_settings()
    context_size = getattr(m, 'context_size', None) or settings.LLAMACPP_DEFAULT_CONTEXT
    ngl = getattr(m, 'ngl', None) or settings.LLAMACPP_DEFAULT_NGL
    batch_size = getattr(m, 'batch_size', None) or settings.LLAMACPP_DEFAULT_BATCH_SIZE
    ubatch_size = getattr(m, 'ubatch_size', None) or settings.LLAMACPP_DEFAULT_UBATCH_SIZE
    threads = getattr(m, 'threads', None) or settings.LLAMACPP_DEFAULT_THREADS
    parallel_slots = getattr(m, 'parallel_slots', None) or settings.LLAMACPP_MAX_PARALLEL
    cache_type_k = getattr(m, 'cache_type_k', None) or settings.LLAMACPP_CACHE_TYPE_K
    cache_type_v = getattr(m, 'cache_type_v', None) or settings.LLAMACPP_CACHE_TYPE_V
    
    cmd += ["-c", str(context_size)]
    cmd += ["-ngl", str(ngl)]
    cmd += ["-b", str(batch_size)]
    cmd += ["-ub", str(ubatch_size)]
    cmd += ["-t", str(threads)]
    
    # GPU tensor split
    if getattr(m, 'tensor_split', None):
        cmd += ["--tensor-split", str(m.tensor_split)]
    
    # Performance flags
    if getattr(m, 'flash_attention', None) is not None:
        cmd += ["--flash-attn", "on" if m.flash_attention else "off"]
    if getattr(m, 'mlock', None) and m.mlock:
        cmd += ["--mlock"]
    # Note: --no-mmap removed for better memory management and faster loading
    # Memory-mapping is more efficient than loading entire model into RAM
    if getattr(m, 'numa_policy', None):
        cmd += ["--numa", str(m.numa_policy)]
    
    # RoPE parameters
    if getattr(m, 'rope_freq_base', None):
        cmd += ["--rope-freq-base", str(m.rope_freq_base)]
    if getattr(m, 'rope_freq_scale', None):
        cmd += ["--rope-freq-scale", str(m.rope_freq_scale)]
    
    # Speculative decoding (Gap #6)
    # Uses a smaller draft model to predict tokens for faster inference
    draft_model_path = getattr(m, 'draft_model_path', None)
    if draft_model_path:
        # Draft model path should be relative to the container's model directory
        # e.g., /models/alamios_Mistral-Small-3.1-DRAFT-0.5B-GGUF/model.gguf
        cmd += ["--model-draft", draft_model_path]
        
        # Number of tokens to draft (default: 16)
        draft_n = getattr(m, 'draft_n', None)
        if draft_n:
            cmd += ["--draft", str(draft_n)]
        
        # Minimum probability for draft acceptance (default: 0.5)
        draft_p_min = getattr(m, 'draft_p_min', None)
        if draft_p_min:
            cmd += ["--draft-p-min", str(draft_p_min)]
    
    # Server-side timeout controls for multi-user stability
    cmd += ["--timeout", str(settings.LLAMACPP_SERVER_TIMEOUT)]
    cmd += ["--parallel", str(parallel_slots)]
    
    # Enable continuous batching for better throughput (Gap #15)
    # Per-model override takes precedence over global setting
    cont_batching = getattr(m, 'cont_batching', None)
    if cont_batching is None:
        cont_batching = settings.LLAMACPP_CONT_BATCHING
    if cont_batching:
        cmd += ["--cont-batching"]
    
    # KV cache quantization for 50% memory reduction
    cmd += ["--cache-type-k", cache_type_k]
    cmd += ["--cache-type-v", cache_type_v]
    
    # Monitoring and observability (Gap #1)
    # Enable Prometheus metrics endpoint at /metrics
    if settings.LLAMACPP_METRICS_ENABLED:
        cmd += ["--metrics"]
    # Enable slots status endpoint at /slots
    if settings.LLAMACPP_SLOTS_ENABLED:
        cmd += ["--slots"]
    
    # Logging configuration (Gap #3)
    # Verbose logging for debugging (has performance impact)
    verbose_logging = getattr(m, 'verbose_logging', None)
    if verbose_logging is None:
        verbose_logging = settings.LLAMACPP_LOG_VERBOSE
    if verbose_logging:
        cmd += ["--log-verbose"]
    # Enable timestamps in logs for easier debugging
    if settings.LLAMACPP_LOG_TIMESTAMPS:
        cmd += ["--log-timestamps"]
    # Log colors (useful for terminal viewing)
    if settings.LLAMACPP_LOG_COLORS:
        cmd += ["--log-colors", settings.LLAMACPP_LOG_COLORS]
    
    # Startup options (Gap #6)
    # Check tensor integrity on load (catches corrupted GGUFs)
    check_tensors = getattr(m, 'check_tensors', None)
    if check_tensors is None:
        check_tensors = settings.LLAMACPP_CHECK_TENSORS
    if check_tensors:
        cmd += ["--check-tensors"]
    # Skip warmup for faster startup (useful for development/testing)
    skip_warmup = getattr(m, 'skip_warmup', None)
    if skip_warmup is None:
        skip_warmup = settings.LLAMACPP_SKIP_WARMUP
    if skip_warmup:
        cmd += ["--no-warmup"]
    
    # Chat template options (Gap #7)
    # Enable/disable Jinja template engine
    jinja_enabled = getattr(m, 'jinja_enabled', None)
    if jinja_enabled is None:
        jinja_enabled = settings.LLAMACPP_JINJA_ENABLED
    if jinja_enabled:
        cmd += ["--jinja"]
    else:
        cmd += ["--no-jinja"]
    
    # Custom chat template (preset name or inline template)
    chat_template = getattr(m, 'chat_template', None)
    if chat_template:
        cmd += ["--chat-template", chat_template]
    
    # Custom chat template file (must be mounted in container)
    chat_template_file = getattr(m, 'chat_template_file', None)
    if chat_template_file:
        # Template file path should be relative to models directory
        container_template_path = f"/models/{chat_template_file}"
        cmd += ["--chat-template-file", container_template_path]
    
    # Memory management (Gap #8)
    # KV cache defragmentation threshold (-1 = disabled, 0.1 = defrag at 10% fragmentation)
    defrag_thold = getattr(m, 'defrag_thold', None)
    if defrag_thold is None:
        defrag_thold = settings.LLAMACPP_DEFRAG_THOLD
    if defrag_thold >= 0:
        cmd += ["--defrag-thold", str(defrag_thold)]
    
    # LoRA adapter support (Gap #10)
    # Load LoRA adapters from JSON array
    lora_adapters_json = getattr(m, 'lora_adapters_json', None)
    if lora_adapters_json:
        try:
            import json
            lora_adapters = json.loads(lora_adapters_json)
            if isinstance(lora_adapters, list) and lora_adapters:
                # Process each adapter
                simple_paths = []
                scaled_paths = []
                for adapter in lora_adapters:
                    if isinstance(adapter, str):
                        # Simple path
                        simple_paths.append(f"/models/{adapter}")
                    elif isinstance(adapter, dict):
                        # Path with scale: {"path": "...", "scale": 1.0}
                        path = adapter.get('path', '')
                        scale = adapter.get('scale', 1.0)
                        if path:
                            scaled_paths.append(f"/models/{path}:{scale}")
                
                # Add flags
                if simple_paths:
                    cmd += ["--lora", ",".join(simple_paths)]
                if scaled_paths:
                    cmd += ["--lora-scaled", ",".join(scaled_paths)]
        except Exception:
            pass  # Best effort - don't fail model start
    
    # Option to load LoRAs without applying (can apply via API later)
    lora_init_without_apply = getattr(m, 'lora_init_without_apply', None)
    if lora_init_without_apply:
        cmd += ["--lora-init-without-apply"]
    
    # Grammar support (Gap #11)
    grammar_file = getattr(m, 'grammar_file', None)
    if grammar_file:
        # Grammar file path should be relative to models directory
        container_grammar_path = f"/models/{grammar_file}"
        cmd += ["--grammar-file", container_grammar_path]
    
    # Model alias (Gap #12) - Use served_model_name as alias
    served_model_name = getattr(m, 'served_model_name', None)
    if served_model_name:
        cmd += ["--alias", served_model_name]
    
    # Embedding mode (Gap #13)
    task = getattr(m, 'task', None)
    enable_embeddings = getattr(m, 'enable_embeddings', None)
    # Enable embeddings if task is 'embed' or explicitly enabled
    if task == 'embed' or enable_embeddings:
        cmd += ["--embeddings"]
    
    # System prompt (Gap #14)
    system_prompt = getattr(m, 'system_prompt', None)
    system_prompt_path = None
    if system_prompt:
        # Write system prompt to a file in the models config directory
        import os
        config_dir = os.path.join(settings.CORTEX_MODELS_DIR_HOST or settings.CORTEX_MODELS_DIR, ".cortex_configs")
        os.makedirs(config_dir, exist_ok=True)
        prompt_filename = f"system_prompt_{m.id}.txt"
        prompt_path = os.path.join(config_dir, prompt_filename)
        with open(prompt_path, 'w') as f:
            f.write(system_prompt)
        # Container path uses the mounted models directory
        container_prompt_path = f"/models/.cortex_configs/{prompt_filename}"
        cmd += ["--system-prompt-file", container_prompt_path]
        system_prompt_path = prompt_path
    
    # NOTE: Sampling parameters (temperature, top_p, repetition_penalty, etc.)
    # are request-time parameters, NOT container startup args.
    # They will be applied by the gateway when forwarding requests (Plane C).
    # Note: llama.cpp uses different names: --temp (not --temperature),
    # --repeat-penalty (not --repetition-penalty).
    # Gateway will handle translation. See cortexSustainmentPlan.md for details.
    
    # Phase 2: Append custom startup args (Plane B)
    try:
        from .utils import parse_custom_args_to_cli
        custom_args_json = getattr(m, 'engine_startup_args_json', None)
        if custom_args_json:
            custom_cli_args = parse_custom_args_to_cli(custom_args_json)
            if custom_cli_args:
                cmd.extend(custom_cli_args)
                logger.info(f"Added {len(custom_cli_args)} custom startup args for llama.cpp model {m.id}")
    except Exception as e:
        logger.warning(f"Failed to parse custom startup args for llama.cpp model {m.id}: {e}")
    
    return cmd


def _resolve_vllm_model_path(m: Model) -> str:
    """Resolve and validate vLLM model path (directory or repo_id).
    
    Args:
        m: Model database object with local_path or repo_id set
        
    Returns:
        str: Validated model path (container path for local_path, or repo_id)
        
    Raises:
        ValueError: If local_path invalid or not found
    """
    # Online mode: use repo_id
    if m.repo_id and not m.local_path:
        return m.repo_id
    
    # Offline mode: validate local_path exists
    if not m.local_path:
        raise ValueError("vLLM offline model requires local_path to be set")
    
    settings = get_settings()
    host_base = settings.CORTEX_MODELS_DIR
    host_path = os.path.join(host_base, m.local_path)
    
    # Check if path exists
    if not os.path.exists(host_path):
        raise ValueError(
            f"Model path not found: {m.local_path}\n"
            f"Checked host path: {host_path}\n"
            f"Models directory: {host_base}\n"
            f"Please verify:\n"
            f"  1. Path exists in {host_base}\n"
            f"  2. CORTEX_MODELS_DIR is correctly configured\n"
            f"  3. Model files are in the expected location"
        )
    
    # For directories, check if it contains expected files (safetensors, bin, etc.)
    if os.path.isdir(host_path):
        files = os.listdir(host_path)
        has_model_files = any(
            f.endswith(('.safetensors', '.bin', '.pt', '.pth', '.gguf'))
            for f in files
        )
        if not has_model_files:
            logger.warning(
                f"Directory {m.local_path} exists but contains no recognized model files. "
                f"vLLM may still load if config.json is present."
            )
    
    # Return container path
    container_path = f"/models/{m.local_path}"
    logger.info(f"Resolved vLLM model path: {host_path} -> {container_path}")
    return container_path


def _resolve_llamacpp_model_path(m: Model) -> str:
    """Resolve and validate GGUF file path for llama.cpp.
    
    Args:
        m: Model database object with local_path set
        
    Returns:
        str: Validated absolute path to GGUF file in container (/models/...)
        
    Raises:
        ValueError: If local_path invalid, file not found, or multiple GGUFs without selection
    """
    if not m.local_path:
        raise ValueError("llama.cpp requires local_path to be set")
    
    settings = get_settings()
    # Container path (what llama-server will see)
    container_path = f"/models/{m.local_path}"
    # Host path (for validation - gateway has models dir mounted)
    host_base = settings.CORTEX_MODELS_DIR
    host_path = os.path.join(host_base, m.local_path)
    
    # Case 1: Direct .gguf file path
    if m.local_path.lower().endswith('.gguf'):
        # If the selected file exists, but we also find a multi-part set in the
        # same directory, prefer the first part so llama.cpp can auto-load all parts.
        if not os.path.isfile(host_path):
            raise ValueError(f"GGUF file not found: {m.local_path}")
        try:
            parent_dir = os.path.dirname(host_path)
            # Look for any file like <base>-00001-of-<total>.gguf
            part_candidates = []
            for name in os.listdir(parent_dir):
                if re.match(r".+-00001-of-\d{5}\.gguf$", name, re.IGNORECASE):
                    part_candidates.append(name)
            if part_candidates:
                part_candidates.sort()
                first_part = part_candidates[0]
                return f"/models/{os.path.relpath(os.path.join(parent_dir, first_part), settings.CORTEX_MODELS_DIR)}"
        except Exception:
            # Fall back to the provided file
            pass
        return container_path
    
    # Case 2: Directory - scan for .gguf files
    # NOTE: Removed GPT-OSS special-case logic (Phase 3, Issue 2 fix)
    # All models now use explicit path selection in UI
    if os.path.isdir(host_path):
        try:
            files = os.listdir(host_path)
            gguf_files = sorted([f for f in files if f.lower().endswith('.gguf')])
            
            if not gguf_files:
                raise ValueError(f"No GGUF files found in directory: {m.local_path}")
            
            if len(gguf_files) > 1:
                print(f"[WARNING] Multiple GGUF files found in {m.local_path}: {gguf_files}", flush=True)
                print(f"[WARNING] Using first file: {gguf_files[0]}", flush=True)
            
            # Use first GGUF file found
            return f"/models/{m.local_path}/{gguf_files[0]}"
        except OSError as e:
            raise ValueError(f"Cannot read directory {m.local_path}: {e}")
    
    # Case 4: Path doesn't exist or invalid
    raise ValueError(f"Invalid local_path: {m.local_path} - must be a .gguf file or directory containing GGUF files")


def start_llamacpp_container_for_model(m: Model) -> Tuple[str, int]:
    """Create llama.cpp container for the model."""
    settings = get_settings()
    # Use model-specific engine_image if set, otherwise fall back to system default
    image = getattr(m, 'engine_image', None) or settings.LLAMACPP_IMAGE
    _ensure_image(image)
    
    name = f"llamacpp-model-{m.id}"
    cli = _client()
    
    # Stop existing container
    try:
        existing = cli.containers.get(name)
        try:
            existing.stop(timeout=10)
        except Exception:
            pass
        try:
            existing.remove(force=True)
        except Exception:
            pass
    except Exception:
        pass
    
    # Set up volumes - same as vLLM for models directory
    binds = {
        settings.CORTEX_MODELS_DIR_HOST or settings.CORTEX_MODELS_DIR: 
        {"bind": "/models", "mode": "ro"}
    }
    
    # Get ngl setting to determine if GPU is needed
    ngl = getattr(m, 'ngl', None) or settings.LLAMACPP_DEFAULT_NGL
    
    # Environment variables for GPU access
    # When using nvidia runtime, these env vars tell it to expose all GPUs
    environment = {
        "NVIDIA_VISIBLE_DEVICES": "all",
        "NVIDIA_DRIVER_CAPABILITIES": "compute,utility",
    }
    
    # Phase 2: Merge custom environment variables (Plane B)
    try:
        from .utils import parse_custom_env_to_dict
        custom_env_json = getattr(m, 'engine_startup_env_json', None)
        if custom_env_json:
            custom_env = parse_custom_env_to_dict(custom_env_json)
            if custom_env:
                environment.update(custom_env)
                logger.info(f"Added {len(custom_env)} custom env vars for llama.cpp model {m.id}")
    except Exception as e:
        logger.warning(f"Failed to parse custom env vars for llama.cpp model {m.id}: {e}")
    
    # GPU configuration for Docker API (used with nvidia runtime)
    device_requests = None
    if ngl > 0:
        # Use selected_gpus if available, otherwise use all GPUs (Gap #15 fix)
        gpu_indices = _parse_gpu_selection(getattr(m, 'selected_gpus', None))
        if gpu_indices:
            # Create device request for specific GPUs
            device_ids = [str(gpu_id) for gpu_id in gpu_indices]
            device_requests = [DeviceRequest(device_ids=device_ids, capabilities=[["gpu"]])]
            # Update NVIDIA_VISIBLE_DEVICES to only show selected GPUs
            environment["NVIDIA_VISIBLE_DEVICES"] = ",".join(device_ids)
        else:
            # No specific GPUs selected, use all available GPUs
            device_requests = [DeviceRequest(count=-1, capabilities=[["gpu"]])]
    
    # Health check - llama.cpp server responds to /v1/models endpoint
    # StartPeriod is configurable via model.startup_timeout_sec or config default (Gap #2)
    startup_timeout = getattr(m, 'startup_timeout_sec', None) or settings.LLAMACPP_STARTUP_TIMEOUT
    healthcheck = {
        "Test": ["CMD-SHELL", "curl -f http://localhost:8000/v1/models || exit 1"],
        "Interval": 10_000_000_000,  # 10s
        "Timeout": 8_000_000_000,    # 8s (llama.cpp may be slower)
        "Retries": 3,
        "StartPeriod": startup_timeout * 1_000_000_000,  # Convert seconds to nanoseconds
    }
    
    # Build command
    cmd = _build_llamacpp_command(m)
    
    print(f"[docker_manager] starting llamacpp model {m.id}, cmd: {cmd}", flush=True)
    print(f"[docker_manager] ngl={ngl}, device_requests={device_requests}", flush=True)
    
    # Ensure network exists for container-to-gateway communication
    network_name = _ensure_docker_network()
    
    # Use containers.run() with runtime parameter (supported per Docker SDK docs)
    # The nvidia runtime ensures CUDA libraries are mounted from the host
    run_kwargs = {
        "image": image,
        "name": name,
        "command": cmd,
        "detach": True,
        "environment": environment,
        "volumes": binds,
        "healthcheck": healthcheck,
        "restart_policy": {"Name": "no"},
        "ports": {"8000/tcp": ("0.0.0.0", 0)},
        "labels": {"com.docker.compose.project": "cortex"},
        "shm_size": "8g",
        "ipc_mode": "host",
    }
    if network_name:
        run_kwargs["network"] = network_name
    
    # Add runtime and device_requests for GPU support
    # Both are required for nvidia runtime to expose GPUs
    if ngl > 0 and device_requests:
        run_kwargs["runtime"] = "nvidia"
        run_kwargs["device_requests"] = device_requests
        print(f"[docker_manager] GPU mode: runtime=nvidia, device_requests={device_requests}", flush=True)
    else:
        print(f"[docker_manager] CPU mode: ngl={ngl}", flush=True)
    
    container: Container = cli.containers.run(**run_kwargs)
    
    container.reload()
    port_info = container.attrs.get("NetworkSettings", {}).get("Ports", {}).get("8000/tcp", [])
    host_port = 0
    if port_info:
        try:
            host_port = int(port_info[0].get("HostPort"))
        except Exception:
            host_port = 0
    
    return name, host_port


def start_vllm_container_for_model(m: Model, hf_token: Optional[str] | None = None) -> Tuple[str, int]:
    """Create (or recreate) a vLLM container for the model.
    Returns (container_name, host_port).
    """
    settings = get_settings()
    # Use model-specific engine_image if set, otherwise fall back to system default
    image = getattr(m, 'engine_image', None) or settings.VLLM_IMAGE
    _ensure_image(image)

    name = f"vllm-model-{m.id}"
    cli = _client()

    # stop existing with same name
    try:
        existing = cli.containers.get(name)
        try:
            existing.stop(timeout=5)
        except Exception:
            pass
        try:
            existing.remove(force=True)
        except Exception:
            pass
    except Exception:
        pass

    binds = {}
    environment = {}
    if m.local_path:
        # bind host models dir at /models (RO)
        binds[settings.CORTEX_MODELS_DIR_HOST or settings.CORTEX_MODELS_DIR] = {"bind": "/models", "mode": "ro"}
        # Also mount HF cache so offline models can use pre-cached tokenizers/configs when
        # users provide a HuggingFace tokenizer id for GGUF (no downloads in offline mode).
        try:
            if settings.HF_CACHE_DIR_HOST or settings.HF_CACHE_DIR:
                binds[settings.HF_CACHE_DIR_HOST or settings.HF_CACHE_DIR] = {"bind": "/root/.cache/huggingface", "mode": "rw"}
        except Exception:
            pass
        # offline mode optional; we always allow offline
        environment["HF_HUB_OFFLINE"] = "1"
    else:
        # online: share HF cache (optional)
        if settings.HF_CACHE_DIR_HOST or settings.HF_CACHE_DIR:
            binds[settings.HF_CACHE_DIR_HOST or settings.HF_CACHE_DIR] = {"bind": "/root/.cache/huggingface", "mode": "rw"}
        # Pass through HF token (per-model overrides process env)
        try:
            token = hf_token or os.environ.get("HUGGING_FACE_HUB_TOKEN") or os.environ.get("HF_TOKEN")
            if token:
                environment["HUGGING_FACE_HUB_TOKEN"] = str(token)
                # Enable faster transfer backend when downloading from HF
                environment.setdefault("HF_HUB_ENABLE_HF_TRANSFER", "1")
        except Exception:
            pass

    # GPU vs CPU mode
    device_mode = (getattr(m, "device", None) or "cuda").lower()
    device_requests = None
    if device_mode != "cpu":
        # Use selected_gpus if available, otherwise use all GPUs (Gap #15 fix)
        gpu_indices = _parse_gpu_selection(getattr(m, 'selected_gpus', None))
        if gpu_indices:
            # Create device request for specific GPUs
            device_requests = [DeviceRequest(device_ids=[str(gpu_id) for gpu_id in gpu_indices], capabilities=[["gpu"]])]
        else:
            # No specific GPUs selected, use all available GPUs
            device_requests = [DeviceRequest(count=-1, capabilities=[["gpu"]])]

    # NCCL/SHM defaults to improve multi-GPU stability inside containers
    # These settings prevent indefinite hangs and improve error reporting
    try:
        environment.setdefault("NCCL_P2P_DISABLE", "1")  # safer default across docker hosts
        environment.setdefault("NCCL_IB_DISABLE", "1")   # disable InfiniBand when not present
        environment.setdefault("NCCL_SHM_DISABLE", "0")  # allow SHM for intra-node comms
        # Critical: Prevent indefinite hangs on NCCL errors
        environment.setdefault("NCCL_TIMEOUT", "1800")   # 30 minute timeout (in seconds)
        environment.setdefault("NCCL_DEBUG", "WARN")     # Production default: warnings only
        environment.setdefault("NCCL_BLOCKING_WAIT", "0")  # Non-blocking wait for better responsiveness
        environment.setdefault("NCCL_LAUNCH_MODE", "GROUP")  # Recommended for deterministic behavior
        # Reduce CUDA memory fragmentation in PyTorch allocator
        environment.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    except Exception:
        pass
    
    # vLLM V1 engine selection (Gap #4 / #9)
    try:
        if getattr(m, "vllm_v1_enabled", None):
            environment["VLLM_USE_V1"] = "1"
            logger.info(f"Model {m.id}: Enabling vLLM V1 engine")
    except Exception:
        pass
    
    # Debug logging configuration (Gap #11)
    try:
        if getattr(m, "debug_logging", None):
            environment["VLLM_LOGGING_LEVEL"] = "DEBUG"
            logger.info(f"Model {m.id}: Enabling debug logging")
        if getattr(m, "trace_mode", None):
            environment["VLLM_TRACE_FUNCTION"] = "1"
            environment["CUDA_LAUNCH_BLOCKING"] = "1"  # Sync CUDA for debugging
            logger.warning(f"Model {m.id}: Trace mode enabled - significant performance impact!")
    except Exception:
        pass
    
    # Request timeout configuration (Gap #13) - via environment variables
    try:
        engine_request_timeout = getattr(m, "engine_request_timeout", None)
        if engine_request_timeout and int(engine_request_timeout) > 0:
            # VLLM_ENGINE_ITERATION_TIMEOUT_S is the correct env var for server timeout
            environment["VLLM_ENGINE_ITERATION_TIMEOUT_S"] = str(int(engine_request_timeout))
            logger.info(f"Model {m.id}: Setting engine timeout to {engine_request_timeout}s")
    except Exception:
        pass
    
    # Phase 2: Merge custom environment variables (Plane B)
    try:
        from .utils import parse_custom_env_to_dict
        custom_env_json = getattr(m, 'engine_startup_env_json', None)
        if custom_env_json:
            custom_env = parse_custom_env_to_dict(custom_env_json)
            if custom_env:
                environment.update(custom_env)
                logger.info(f"Added {len(custom_env)} custom env vars for model {m.id}")
    except Exception as e:
        logger.warning(f"Failed to parse custom env vars for model {m.id}: {e}")

    # Healthcheck: hit local /health.
    # Health check using curl with fallback to Python for compatibility.
    # Distinguishes between:
    #   - 200: healthy (engine running and ready)
    #   - 503: unhealthy (EngineDeadError - engine crashed)
    #   - No response: starting (engine not yet listening)
    # 
    # The vLLM /health endpoint returns:
    #   - 200 OK when engine is healthy
    #   - 503 Service Unavailable when engine is dead (EngineDeadError)
    # StartPeriod is configurable via model.startup_timeout_sec or config default (Gap #2)
    startup_timeout = getattr(m, 'startup_timeout_sec', None) or settings.VLLM_STARTUP_TIMEOUT
    healthcheck = {
        "Test": [
            "CMD-SHELL",
            # Try curl first (faster, more robust), fallback to Python
            "(curl -sf http://localhost:8000/health -o /dev/null 2>/dev/null && exit 0) || "
            "(python3 -c \"import urllib.request; r=urllib.request.urlopen('http://localhost:8000/health', timeout=3); exit(0 if r.status==200 else 1)\" 2>/dev/null && exit 0) || "
            "exit 1",
        ],
        "Interval": 10_000_000_000,  # 10s ns
        "Timeout": 5_000_000_000,    # 5s ns
        "Retries": 3,
        "StartPeriod": startup_timeout * 1_000_000_000,  # Convert seconds to nanoseconds
    }

    # publish container port 8000 to an ephemeral host port (still useful for logs/debug),
    # but we'll prefer service-to-service via container name on the compose network
    ports = {"8000/tcp": ("0.0.0.0", 0)}

    # Ensure managed container joins the same compose network as gateway
    network_name = _ensure_docker_network()

    # Build final command and log for troubleshooting.
    # Version-aware entrypoint selection (Gap #5):
    # Different vLLM versions may require different entrypoints. We detect the version
    # from the image tag and select the appropriate entrypoint, or use a custom override.
    entrypoint_override = getattr(m, 'entrypoint_override', None)
    entrypoint = _get_vllm_entrypoint(image, entrypoint_override)
    
    preview_cmd = _build_command(m)
    try:
        print(f"[docker_manager] starting model {m.id} with entrypoint: {entrypoint}, cmd: {preview_cmd}", flush=True)
    except Exception:
        pass
    run_kwargs = {
        "image": image,
        "name": name,
        "entrypoint": entrypoint,
        "command": preview_cmd,
        "detach": True,
        "environment": environment,
        "volumes": binds,
        "device_requests": device_requests,
        "healthcheck": healthcheck,
        "restart_policy": {"Name": "no"},  # No auto-restart - models start only when admin clicks Start
        "ports": ports,
        "labels": {"com.docker.compose.project": "cortex"},
        "shm_size": "2g",
        "ipc_mode": "host",
    }
    if network_name:
        run_kwargs["network"] = network_name
    
    container: Container = cli.containers.run(**run_kwargs)

    container.reload()
    port_info = container.attrs.get("NetworkSettings", {}).get("Ports", {}).get("8000/tcp", [])
    host_port = 0
    if port_info:
        try:
            host_port = int(port_info[0].get("HostPort"))
        except Exception:
            host_port = 0
    return name, host_port


def start_container_for_model(m: Model, hf_token: Optional[str] | None = None) -> Tuple[str, int]:
    """Route to appropriate engine based on model.engine_type."""
    engine_type = getattr(m, 'engine_type', 'vllm')
    
    if engine_type == 'llamacpp':
        return start_llamacpp_container_for_model(m)
    else:
        return start_vllm_container_for_model(m, hf_token)


def stop_container_for_model(m: Model) -> None:
    """Stop container regardless of engine type."""
    cli = _client()
    engine_type = getattr(m, 'engine_type', 'vllm')
    prefix = 'llamacpp' if engine_type == 'llamacpp' else 'vllm'
    name = f"{prefix}-model-{m.id}"
    
    try:
        c = cli.containers.get(name)
        try:
            timeout = 10 if engine_type == 'llamacpp' else 5
            c.stop(timeout=timeout)
        except Exception:
            pass
        try:
            c.remove(force=True)
        except Exception:
            pass
    except Exception:
        pass


def tail_logs_for_model(m: Model, tail: int = 1000) -> str:
    """Get container logs regardless of engine type."""
    cli = _client()
    engine_type = getattr(m, 'engine_type', 'vllm')
    prefix = 'llamacpp' if engine_type == 'llamacpp' else 'vllm'
    name = f"{prefix}-model-{m.id}"
    
    try:
        c = cli.containers.get(name)
        out = c.logs(tail=tail)
        try:
            return out.decode("utf-8", errors="ignore")
        except Exception:
            return str(out)
    except Exception:
        return ""



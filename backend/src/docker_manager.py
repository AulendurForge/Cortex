"""Docker lifecycle for model containers.

Command lines and environments come from the engine adapters (``engines/``);
this module only knows how to talk to the Docker daemon.  Every function here
is synchronous and must be called via ``asyncio.to_thread`` from request
handlers (see ``services/model_supervisor.py``).
"""
from __future__ import annotations

import logging
import socket
from typing import Any, Optional, Tuple

import docker
from docker.models.containers import Container
from docker.types import DeviceRequest

from .config import get_settings
from .engines import ConfigError, LaunchPlan, get_adapter
from .models import Model
from .utils.gpu_utils import parse_gpu_selection

logger = logging.getLogger(__name__)

# Backwards-compatible aliases (older modules import these names)
_parse_gpu_selection = parse_gpu_selection
CORTEX_LABEL = "cortex.managed"


class OfflineImageUnavailableError(Exception):
    """Raised when a Docker image is not available locally and cannot be pulled."""


def _client() -> docker.DockerClient:
    return docker.from_env()


# ---------------------------------------------------------------------------
# GPU device requests
# ---------------------------------------------------------------------------

def gpu_device_requests(m: Model) -> list[DeviceRequest] | None:
    """DeviceRequests honouring the model's GPU selection.

    None for CPU mode (vLLM device=cpu, llama.cpp ngl=0); pinned to
    ``selected_gpus`` when set; otherwise every GPU on the host.
    """
    engine_type = getattr(m, "engine_type", None) or "vllm"
    if engine_type == "llamacpp":
        ngl = getattr(m, "ngl", None)
        if ngl is not None and int(ngl) <= 0:
            return None
    elif (getattr(m, "device", None) or "cuda").lower() == "cpu":
        return None
    gpu_indices = parse_gpu_selection(getattr(m, "selected_gpus", None))
    if gpu_indices:
        return [DeviceRequest(device_ids=[str(i) for i in gpu_indices], capabilities=[["gpu"]])]
    return [DeviceRequest(count=-1, capabilities=[["gpu"]])]


# ---------------------------------------------------------------------------
# Network / image helpers
# ---------------------------------------------------------------------------

def _is_network_available() -> bool:
    try:
        socket.create_connection(("registry-1.docker.io", 443), timeout=3)
        return True
    except OSError:
        return False


_NETWORK_NAME = "cortex_default"


def _ensure_docker_network() -> str | None:
    """Return the compose network model containers should join (created if missing)."""
    cli = _client()
    try:
        cli.networks.get(_NETWORK_NAME)
        return _NETWORK_NAME
    except docker.errors.NotFound:
        try:
            cli.networks.create(_NETWORK_NAME, driver="bridge")
            logger.warning("Created Docker network %s", _NETWORK_NAME)
            return _NETWORK_NAME
        except Exception as e:  # pragma: no cover - environment specific
            logger.warning("Could not create Docker network %s: %s", _NETWORK_NAME, e)
            return None
    except Exception as e:  # pragma: no cover
        logger.warning("Could not inspect Docker network %s: %s", _NETWORK_NAME, e)
        return None


def image_is_cached(image: str) -> bool:
    try:
        _client().images.get(image)
        return True
    except docker.errors.ImageNotFound:
        return False


def _ensure_image(image: str) -> None:
    """Make sure ``image`` exists locally, pulling it unless offline mode forbids it."""
    settings = get_settings()
    cli = _client()
    if image_is_cached(image):
        return
    offline = settings.OFFLINE_MODE
    if not offline and settings.OFFLINE_MODE_AUTO_DETECT and not _is_network_available():
        logger.warning("Network unavailable - treating image pull for %s as offline", image)
        offline = True
    if settings.REQUIRE_IMAGE_PRECACHE or offline:
        raise OfflineImageUnavailableError(
            f"Docker image '{image}' is not available locally"
            + (" and the system is in OFFLINE MODE." if offline else " and REQUIRE_IMAGE_PRECACHE is enabled.")
            + " Load it with `make load-offline` or `docker load -i <image.tar>`, or pull it on a connected host "
            f"(`docker pull {image}`), then retry."
        )
    logger.warning("Pulling image %s (this can take several minutes)", image)
    try:
        cli.images.pull(image)
    except docker.errors.APIError as e:
        msg = str(e).lower()
        if any(k in msg for k in ("connection", "network", "timeout")):
            raise OfflineImageUnavailableError(
                f"Cannot pull image {image}: network error. Check connectivity or pre-load the image."
            ) from e
        raise


def check_image_availability(engine_type: str, image: str | None = None) -> tuple[bool, str, dict]:
    """Report whether the engine image (or a specific override) is cached locally."""
    settings = get_settings()
    image = image or (settings.LLAMACPP_IMAGE if engine_type == "llamacpp" else settings.VLLM_IMAGE)
    cli = _client()
    try:
        img = cli.images.get(image)
        size_mb = round(img.attrs.get("Size", 0) / (1024 * 1024), 2)
        details = {"image": image, "cached": True, "size_mb": size_mb, "created": img.attrs.get("Created", "unknown"), "tags": img.tags}
        return True, f"Image {image} is cached locally ({size_mb} MB)", details
    except docker.errors.ImageNotFound:
        details = {"image": image, "cached": False, "size_mb": 0, "created": None, "tags": []}
        return False, f"Image {image} is not cached locally", details


# ---------------------------------------------------------------------------
# Container lifecycle
# ---------------------------------------------------------------------------

def _remove_existing(cli: docker.DockerClient, name: str) -> None:
    try:
        existing = cli.containers.get(name)
    except docker.errors.NotFound:
        return
    try:
        existing.stop(timeout=10)
    except Exception:
        pass
    existing.remove(force=True)


def build_launch_plan(m: Model, hf_token: Optional[str] = None) -> LaunchPlan:
    """Adapter plan for ``m`` (raises ConfigError for invalid config)."""
    return get_adapter(getattr(m, "engine_type", None)).plan(m, get_settings(), hf_token)


def start_container_for_model(m: Model, hf_token: Optional[str] = None) -> Tuple[str, int]:
    """Create and start the container for ``m``. Returns (container_name, host_port).

    Ports are published on the loopback interface only: the gateway reaches the
    engine via the compose network (container name) or via 127.0.0.1:<port> when
    it runs on the host network. LAN clients must go through the gateway.
    """
    settings = get_settings()
    adapter = get_adapter(getattr(m, "engine_type", None))
    plan = adapter.plan(m, settings, hf_token)
    _ensure_image(plan.image)
    cli = _client()
    _remove_existing(cli, plan.container_name)

    models_host = settings.CORTEX_MODELS_DIR_HOST or settings.CORTEX_MODELS_DIR
    hf_host = settings.HF_CACHE_DIR_HOST or settings.HF_CACHE_DIR
    binds: dict[str, dict[str, str]] = {models_host: {"bind": "/models", "mode": "ro"}}
    if adapter.name == "vllm" and hf_host:
        binds[hf_host] = {"bind": "/root/.cache/huggingface", "mode": "rw"}

    env = dict(plan.env)
    device_requests = gpu_device_requests(m)
    if device_requests:
        ids = parse_gpu_selection(getattr(m, "selected_gpus", None))
        env["NVIDIA_VISIBLE_DEVICES"] = ",".join(str(i) for i in ids) if ids else "all"
    else:
        env["NVIDIA_VISIBLE_DEVICES"] = "void"

    run_kwargs: dict[str, Any] = {
        "image": plan.image,
        "name": plan.container_name,
        "command": plan.args,
        "detach": True,
        "environment": env,
        "volumes": binds,
        "healthcheck": adapter.healthcheck(m, settings),
        "restart_policy": {"Name": "no"},
        "ports": {f"{adapter.container_port}/tcp": ("127.0.0.1", 0)},
        "labels": {"com.docker.compose.project": "cortex", CORTEX_LABEL: "1", "cortex.model_id": str(m.id), "cortex.engine": adapter.name},
        "ipc_mode": "host",
    }
    if plan.entrypoint:
        run_kwargs["entrypoint"] = plan.entrypoint
    network = _ensure_docker_network()
    if network:
        run_kwargs["network"] = network
    if device_requests:
        run_kwargs["device_requests"] = device_requests
        run_kwargs["runtime"] = "nvidia"

    logger.info("Starting %s model %s: image=%s args=%s", adapter.name, m.id, plan.image, " ".join(plan.redacted_args()))
    container: Container = cli.containers.run(**run_kwargs)
    container.reload()
    host_port = 0
    port_info = container.attrs.get("NetworkSettings", {}).get("Ports", {}).get(f"{adapter.container_port}/tcp") or []
    if port_info:
        try:
            host_port = int(port_info[0].get("HostPort"))
        except (TypeError, ValueError):
            host_port = 0
    return plan.container_name, host_port


def container_name_for(m: Model) -> str:
    return get_adapter(getattr(m, "engine_type", None)).container_name(m)


def container_status(m: Model) -> str | None:
    """Docker status string ('running', 'exited', ...) or None when the container is gone."""
    try:
        c = _client().containers.get(getattr(m, "container_name", None) or container_name_for(m))
        return c.status
    except docker.errors.NotFound:
        return None


def stop_container_for_model(m: Model) -> bool:
    """Stop and remove the container. Returns True if it existed. Raises on daemon errors."""
    cli = _client()
    name = getattr(m, "container_name", None) or container_name_for(m)
    try:
        c = cli.containers.get(name)
    except docker.errors.NotFound:
        return False
    try:
        c.stop(timeout=10)
    except docker.errors.APIError as e:
        logger.warning("stop %s: %s", name, e)
    c.remove(force=True)
    return True


def tail_logs_for_model(m: Model, tail: int = 1000) -> str:
    try:
        c = _client().containers.get(getattr(m, "container_name", None) or container_name_for(m))
        out = c.logs(tail=tail)
        return out.decode("utf-8", errors="ignore") if isinstance(out, bytes) else str(out)
    except docker.errors.NotFound:
        return ""


def list_managed_containers() -> list[dict[str, Any]]:
    """All containers Cortex started (for reconciliation)."""
    out = []
    for c in _client().containers.list(all=True, filters={"label": CORTEX_LABEL}):
        labels = c.labels or {}
        out.append({"name": c.name, "status": c.status, "model_id": labels.get("cortex.model_id"), "engine": labels.get("cortex.engine")})
    return out


# ---------------------------------------------------------------------------
# Backwards-compatible helpers used by the validator and tests
# ---------------------------------------------------------------------------

def _build_command(m: Model) -> list[str]:
    return get_adapter("vllm").build_args(m, get_settings())


def _build_llamacpp_command(m: Model) -> list[str]:
    return get_adapter("llamacpp").build_args(m, get_settings())

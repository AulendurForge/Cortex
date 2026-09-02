"""ModelSupervisor: the single owner of model lifecycle state.

Responsibilities
- one asyncio.Lock per model so start/stop/apply cannot interleave,
- every Docker / DNS call runs in a worker thread (the gateway keeps serving),
- startup tracking in a background task (container death, health probe, timeout),
- the routing registry is derived from models that are actually ``running``,
- reconciliation on startup and on a timer: DB state ↔ containers ↔ registry.

States: stopped → starting → loading → running → (stopping) → stopped, any → failed.
"""
from __future__ import annotations

import asyncio
import logging
import socket
import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx
from sqlalchemy import select

from .. import docker_manager as dm
from ..config import get_settings
from ..engines import ConfigError, get_adapter
from ..metrics import MODEL_START_SECONDS, MODEL_START_TOTAL, MODEL_STATE_TRANSITIONS
from ..models import Model
from ..state import register_model_endpoint, unregister_model_endpoint
from .registry_persistence import persist_model_registry

logger = logging.getLogger(__name__)

ACTIVE_STATES = ("starting", "loading", "running")


class SupervisorError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


@dataclass
class Probe:
    status: str            # ready | loading | dead | unreachable
    detail: str | None = None


class ModelSupervisor:
    def __init__(self) -> None:
        self._locks: dict[int, asyncio.Lock] = {}
        self._trackers: dict[int, asyncio.Task] = {}
        self._url_cache: dict[str, str] = {}
        self._reconcile_task: asyncio.Task | None = None
        self._dead_counts: dict[int, int] = {}

    # ------------------------------------------------------------------ infra
    def _session_factory(self):
        from ..main import SessionLocal  # type: ignore
        if SessionLocal is None:
            raise SupervisorError(503, "database_unavailable")
        return SessionLocal

    def _lock(self, model_id: int) -> asyncio.Lock:
        return self._locks.setdefault(model_id, asyncio.Lock())

    _own_client: httpx.AsyncClient | None = None

    def _fallback_client(self) -> httpx.AsyncClient:
        """One shared client for probes when the app's client is not up yet (tests, early startup)."""
        if self._own_client is None:
            self._own_client = httpx.AsyncClient(timeout=5.0)
        return self._own_client

    async def _get(self, session, model_id: int) -> Model:
        m = (await session.execute(select(Model).where(Model.id == model_id))).scalar_one_or_none()
        if not m:
            raise SupervisorError(404, "not_found")
        return m

    async def _set_state(self, model_id: int, state: str, reason: str | None = None, **extra: Any) -> None:
        SessionLocal = self._session_factory()
        async with SessionLocal() as session:
            m = await self._get(session, model_id)
            if m.state != state:
                MODEL_STATE_TRANSITIONS.labels(engine=m.engine_type or "vllm", state=state).inc()
                logger.info("model %s: %s -> %s%s", model_id, m.state, state, f" ({reason})" if reason else "")
            m.state = state
            m.state_reason = reason
            for k, v in extra.items():
                setattr(m, k, v)
            await session.commit()

    async def model_url(self, m: Model) -> str:
        """Base URL the gateway uses to reach the container (container name on the compose
        network, else the loopback-published port when the gateway runs on the host network)."""
        name = m.container_name or dm.container_name_for(m)
        cached = self._url_cache.get(name)
        if cached:
            return cached

        def _resolve() -> str:
            try:
                socket.gethostbyname(name)
                return f"http://{name}:{get_adapter(m.engine_type).container_port}"
            except socket.gaierror:
                return f"http://127.0.0.1:{m.port or 8000}"

        url = await asyncio.to_thread(_resolve)
        self._url_cache[name] = url
        return url

    # ------------------------------------------------------------------ probes
    async def probe(self, m: Model) -> Probe:
        """Interpret the engine's /health according to its semantics."""
        from ..main import http_client  # type: ignore
        client = http_client or self._fallback_client()
        url = await self.model_url(m)
        engine = (m.engine_type or "vllm").lower()
        try:
            r = await client.get(f"{url}/health", timeout=httpx.Timeout(connect=2.0, read=5.0, write=3.0, pool=5.0))
        except httpx.ConnectError:
            # vLLM binds its socket only when the engine is up; llama.cpp answers 503 while loading
            return Probe("loading" if engine == "vllm" else "unreachable", "connection_refused")
        except httpx.TimeoutException:
            return Probe("loading", "health_timeout")
        except Exception as e:  # pragma: no cover
            return Probe("unreachable", str(e)[:120])
        if r.status_code == 200:
            # /health is public on both engines; /v1/models needs the internal key, so it detects a
            # container started with a previous INTERNAL_VLLM_API_KEY (every request would fail with 401)
            key = get_settings().INTERNAL_VLLM_API_KEY
            if key:
                try:
                    k = await client.get(f"{url}/v1/models", headers={"Authorization": f"Bearer {key}"},
                                         timeout=httpx.Timeout(connect=2.0, read=5.0, write=3.0, pool=5.0))
                    if k.status_code in (401, 403):
                        return Probe("dead", "engine rejects INTERNAL_VLLM_API_KEY (the key changed after this model was started): restart the model")
                except httpx.HTTPError:
                    pass
            return Probe("ready")
        if r.status_code == 503:
            if engine == "llamacpp":
                return Probe("loading", "model_loading")
            return Probe("dead", "engine_reported_503")
        return Probe("loading", f"health_{r.status_code}")

    # ------------------------------------------------------------------ registry
    async def _register(self, m: Model) -> None:
        if not m.served_model_name:
            return
        url = await self.model_url(m)
        register_model_endpoint(
            m.served_model_name, url, m.task or "generate",
            engine_type=m.engine_type or "vllm",
            request_defaults_json=getattr(m, "request_defaults_json", None),
            authoritative=True,
        )
        await persist_model_registry()

    async def _unregister(self, m: Model) -> None:
        if m.served_model_name:
            unregister_model_endpoint(m.served_model_name)
            await persist_model_registry()

    # ------------------------------------------------------------------ launch
    async def launch(self, model_id: int) -> dict[str, Any]:
        async with self._lock(model_id):
            SessionLocal = self._session_factory()
            async with SessionLocal() as session:
                m = await self._get(session, model_id)
                if m.state in ("starting", "loading"):
                    raise SupervisorError(409, f"model is already {m.state}")
                settings = get_settings()
                adapter = get_adapter(m.engine_type)
                # Validate before touching Docker
                issues = adapter.validate(m, settings)
                errors = [i.message for i in issues if i.severity == "error"]
                if errors:
                    m.state, m.state_reason = "failed", "; ".join(errors)[:1000]
                    await session.commit()
                    raise SupervisorError(400, "; ".join(errors))
                try:
                    adapter.plan(m, settings, getattr(m, "hf_token", None))
                except ConfigError as e:
                    m.state, m.state_reason = "failed", str(e)[:1000]
                    await session.commit()
                    raise SupervisorError(400, str(e))
                m.state, m.state_reason = "starting", None
                await session.commit()
                hf_token = getattr(m, "hf_token", None)
                self._url_cache.pop(m.container_name or dm.container_name_for(m), None)

            try:
                name, host_port = await asyncio.to_thread(dm.start_container_for_model, m, hf_token)
            except dm.OfflineImageUnavailableError as e:
                await self._set_state(model_id, "failed", str(e)[:1000])
                raise SupervisorError(503, str(e))
            except ConfigError as e:
                await self._set_state(model_id, "failed", str(e)[:1000])
                raise SupervisorError(400, str(e))
            except Exception as e:
                logger.exception("start failed for model %s", model_id)
                await self._set_state(model_id, "failed", f"start_failed: {e}"[:1000])
                raise SupervisorError(502, f"start_failed: {e}")

            await self._set_state(model_id, "loading", None, container_name=name, port=host_port)
            self._start_tracker(model_id)
            return {"status": "loading", "container": name, "port": host_port}

    def _start_tracker(self, model_id: int) -> None:
        old = self._trackers.pop(model_id, None)
        if old and not old.done():
            old.cancel()
        self._trackers[model_id] = asyncio.create_task(self._track_startup(model_id))

    async def _track_startup(self, model_id: int) -> None:
        """Poll until the container is ready, exits, or the startup timeout elapses."""
        try:
            SessionLocal = self._session_factory()
            async with SessionLocal() as session:
                m = await self._get(session, model_id)
                settings = get_settings()
                default_timeout = settings.LLAMACPP_STARTUP_TIMEOUT if (m.engine_type == "llamacpp") else settings.VLLM_STARTUP_TIMEOUT
                timeout = float(getattr(m, "startup_timeout_sec", None) or default_timeout)
            engine = m.engine_type or "vllm"
            t_start = time.monotonic()
            deadline = t_start + timeout
            interval = 1.0
            while time.monotonic() < deadline:
                await asyncio.sleep(interval)
                interval = min(3.0, interval + 0.5)
                async with SessionLocal() as session:
                    m = await self._get(session, model_id)
                    if m.state != "loading":
                        return  # stopped/failed by someone else
                status = await asyncio.to_thread(dm.container_status, m)
                if status is None:
                    MODEL_START_TOTAL.labels(engine=engine, result="container_missing").inc()
                    await self._set_state(model_id, "failed", "container_not_found")
                    return
                if status not in ("running", "created", "restarting"):
                    tail = (await asyncio.to_thread(dm.tail_logs_for_model, m, 40)).strip().splitlines()
                    last = tail[-1][:300] if tail else ""
                    MODEL_START_TOTAL.labels(engine=engine, result="container_exited").inc()
                    await self._set_state(model_id, "failed", f"container_{status}: {last}")
                    return
                p = await self.probe(m)
                if p.status == "ready":
                    MODEL_START_TOTAL.labels(engine=engine, result="ready").inc()
                    MODEL_START_SECONDS.labels(engine=engine).observe(time.monotonic() - t_start)
                    await self._set_state(model_id, "running", None)
                    async with SessionLocal() as session:
                        m = await self._get(session, model_id)
                    await self._register(m)
                    logger.info("model %s is running at %s", model_id, await self.model_url(m))
                    return
                if p.status == "dead":
                    MODEL_START_TOTAL.labels(engine=engine, result="engine_unhealthy").inc()
                    await self._set_state(model_id, "failed", f"engine_unhealthy: {p.detail}")
                    return
            MODEL_START_TOTAL.labels(engine=engine, result="timeout").inc()
            await self._set_state(model_id, "failed", f"startup_timeout_after_{int(timeout)}s")
            try:
                async with SessionLocal() as session:
                    m = await self._get(session, model_id)
                await asyncio.to_thread(dm.stop_container_for_model, m)
            except Exception:
                pass
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("startup tracker for model %s crashed", model_id)

    # ------------------------------------------------------------------ stop / apply
    async def stop(self, model_id: int) -> dict[str, Any]:
        async with self._lock(model_id):
            return await self._stop_locked(model_id)

    async def _stop_locked(self, model_id: int) -> dict[str, Any]:
        tracker = self._trackers.pop(model_id, None)
        if tracker and not tracker.done():
            tracker.cancel()
        SessionLocal = self._session_factory()
        async with SessionLocal() as session:
            m = await self._get(session, model_id)
        await self._set_state(model_id, "stopping", None)
        try:
            await asyncio.to_thread(dm.stop_container_for_model, m)
        except Exception as e:
            logger.exception("stop failed for model %s", model_id)
            await self._set_state(model_id, "failed", f"stop_failed: {e}"[:500])
            raise SupervisorError(500, f"stop_failed: {e}")
        await self._unregister(m)
        await self._set_state(model_id, "stopped", None, container_name=None, port=None)
        return {"status": "stopped"}

    async def apply(self, model_id: int) -> dict[str, Any]:
        """Restart a running/loading model with its saved config; otherwise just report saved."""
        async with self._lock(model_id):
            SessionLocal = self._session_factory()
            async with SessionLocal() as session:
                m = await self._get(session, model_id)
                was_active = m.state in ACTIVE_STATES
            if not was_active:
                return {"status": "saved", "state": m.state}
            await self._stop_locked(model_id)
        result = await self.launch(model_id)
        result["restarted"] = True
        return result

    async def delete_cleanup(self, model_id: int) -> None:
        """Stop the container and drop the route before the row is deleted."""
        tracker = self._trackers.pop(model_id, None)
        if tracker and not tracker.done():
            tracker.cancel()
        SessionLocal = self._session_factory()
        async with SessionLocal() as session:
            m = await self._get(session, model_id)
        try:
            await asyncio.to_thread(dm.stop_container_for_model, m)
        except Exception as e:
            logger.warning("cleanup stop for model %s: %s", model_id, e)
        await self._unregister(m)

    # ------------------------------------------------------------------ readiness
    async def readiness(self, model_id: int) -> dict[str, Any]:
        SessionLocal = self._session_factory()
        async with SessionLocal() as session:
            m = await self._get(session, model_id)
        if m.state == "stopped":
            return {"status": "stopped"}
        if m.state == "failed":
            return {"status": "error", "detail": m.state_reason or "model_failed"}
        if m.state in ("starting", "stopping"):
            return {"status": "loading", "detail": m.state}
        p = await self.probe(m)
        if p.status == "ready":
            if m.state != "running":
                await self._set_state(model_id, "running", None)
                await self._register(m)
            return {"status": "ready"}
        if p.status == "dead":
            await self._set_state(model_id, "failed", f"engine_unhealthy: {p.detail}")
            await self._unregister(m)
            return {"status": "error", "detail": p.detail}
        return {"status": "loading", "detail": p.detail or "model_initializing"}

    # ------------------------------------------------------------------ reconcile
    async def reconcile(self, *, startup: bool = False) -> None:
        """Bring DB state, containers and the registry back in line."""
        try:
            SessionLocal = self._session_factory()
        except SupervisorError:
            return
        async with SessionLocal() as session:
            rows = (await session.execute(select(Model).where(Model.state.in_(ACTIVE_STATES + ("stopping",))))).scalars().all()
        for m in rows:
            try:
                status = await asyncio.to_thread(dm.container_status, m)
                if m.state == "stopping":
                    await self._set_state(m.id, "stopped", None, container_name=None, port=None)
                    await self._unregister(m)
                    continue
                if status is None:
                    await self._set_state(m.id, "failed", "container_not_found_on_reconcile" if not startup else "container_missing_after_gateway_restart")
                    await self._unregister(m)
                    continue
                if status not in ("running", "created", "restarting"):
                    await self._set_state(m.id, "failed", f"container_{status}")
                    await self._unregister(m)
                    continue
                if m.state in ("starting", "loading"):
                    if m.id not in self._trackers or self._trackers[m.id].done():
                        if m.state == "starting":
                            await self._set_state(m.id, "loading", None)
                        self._start_tracker(m.id)
                    continue
                # running: verify health, re-register after a gateway restart
                p = await self.probe(m)
                if p.status == "ready":
                    self._dead_counts.pop(m.id, None)
                    if startup:
                        await self._register(m)
                elif p.status == "dead" or self._dead_counts.get(m.id, 0) >= 3:
                    await self._set_state(m.id, "failed", f"engine_unhealthy: {p.detail}")
                    await self._unregister(m)
                    self._dead_counts.pop(m.id, None)
                else:
                    self._dead_counts[m.id] = self._dead_counts.get(m.id, 0) + 1
            except Exception:
                logger.exception("reconcile failed for model %s", m.id)

    async def run_forever(self) -> None:
        settings = get_settings()
        await self.reconcile(startup=True)
        while True:
            try:
                await asyncio.sleep(max(5, int(settings.MODEL_RECONCILE_SEC)))
                await self.reconcile()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("supervisor loop error")

    def start_background(self) -> None:
        if self._reconcile_task is None or self._reconcile_task.done():
            self._reconcile_task = asyncio.create_task(self.run_forever())

    async def shutdown(self, stop_models: bool) -> None:
        if self._reconcile_task:
            self._reconcile_task.cancel()
        for t in self._trackers.values():
            t.cancel()
        if not stop_models:
            return
        try:
            SessionLocal = self._session_factory()
        except SupervisorError:
            return
        async with SessionLocal() as session:
            rows = (await session.execute(select(Model).where(Model.state.in_(ACTIVE_STATES)))).scalars().all()
        for m in rows:
            try:
                await self._stop_locked(m.id)
            except Exception:
                pass


supervisor = ModelSupervisor()

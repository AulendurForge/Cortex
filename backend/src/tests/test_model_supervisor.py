"""ModelSupervisor state-machine tests with a fake Docker layer.

Uses the real database (rows are created and removed by the test) but replaces
every docker_manager call, so the lifecycle logic is exercised without containers.
Marked ``integration`` because it needs Postgres.
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src import docker_manager as dm
from src import main as app_main
from src.models import Model
from src.services import model_supervisor as ms
from src.services.model_supervisor import ModelSupervisor, SupervisorError
from src.state import MODEL_REGISTRY

pytestmark = pytest.mark.integration

_BASE_URL = os.environ.get("DATABASE_URL", "postgresql+asyncpg://cortex:cortex@127.0.0.1:15432/cortex")
# A dedicated database so these tests never race the live gateway's own supervisor.
DATABASE_URL = _BASE_URL.rsplit("/", 1)[0] + "/cortex_test"


@pytest.fixture(scope="module", autouse=True)
def _test_database():
    import asyncpg
    from src.services.migrations import run_migrations

    async def _ensure():
        admin_url = _BASE_URL.replace("+asyncpg", "").rsplit("/", 1)[0] + "/postgres"
        conn = await asyncpg.connect(admin_url)
        try:
            exists = await conn.fetchval("SELECT 1 FROM pg_database WHERE datname = 'cortex_test'")
            if not exists:
                await conn.execute("CREATE DATABASE cortex_test")
        finally:
            await conn.close()

    asyncio.run(_ensure())
    run_migrations(DATABASE_URL)


class FakeDocker:
    """Scriptable stand-in for the docker_manager functions the supervisor uses."""

    def __init__(self):
        self.status = "running"
        self.started: list[int] = []
        self.stopped: list[int] = []
        self.fail_start: Exception | None = None
        self.fail_stop: Exception | None = None

    def start(self, m, hf_token=None):
        if self.fail_start:
            raise self.fail_start
        self.started.append(m.id)
        return f"fake-model-{m.id}", 40000 + m.id

    def stop(self, m):
        if self.fail_stop:
            raise self.fail_stop
        self.stopped.append(m.id)
        return True

    def container_status(self, m):
        return self.status

    def tail(self, m, tail=1000):
        return "boom: out of memory\n"


class _Db:
    """Creates the async engine inside the test's event loop (asyncpg connections are loop-bound)."""

    def __init__(self, monkeypatch):
        self._mp = monkeypatch
        self.engine = None
        self.SessionLocal = None

    def open(self):
        from sqlalchemy.pool import NullPool
        self.engine = create_async_engine(DATABASE_URL, poolclass=NullPool)
        self.SessionLocal = async_sessionmaker(self.engine, expire_on_commit=False)
        self._mp.setattr(app_main, "SessionLocal", self.SessionLocal)
        self._mp.setattr(app_main, "http_client", None)
        return self.SessionLocal

    async def close(self):
        if self.engine is not None:
            await self.engine.dispose()

    def __call__(self):
        return self.SessionLocal()


@pytest.fixture
def db(monkeypatch):
    return _Db(monkeypatch)


@pytest.fixture
def fake(monkeypatch):
    f = FakeDocker()
    monkeypatch.setattr(dm, "start_container_for_model", f.start)
    monkeypatch.setattr(dm, "stop_container_for_model", f.stop)
    monkeypatch.setattr(dm, "container_status", f.container_status)
    monkeypatch.setattr(dm, "tail_logs_for_model", f.tail)
    monkeypatch.setattr(dm, "container_name_for", lambda m: f"fake-model-{m.id}")
    # registry persistence touches ConfigKV; keep it out of the way
    async def _noop():
        return True
    monkeypatch.setattr(ms, "persist_model_registry", _noop)
    return f


def _run(coro):
    return asyncio.run(coro)


async def _make_model(SessionLocal, **kw) -> int:
    tag = uuid.uuid4().hex[:6]
    async with SessionLocal() as s:
        fields = dict(name=f"sup-{tag}", served_model_name=f"sup-{tag}", task="generate", engine_type="llamacpp",
                      local_path=f"sup-{tag}/model.gguf", selected_gpus=json.dumps([0]), state="stopped")
        fields.update(kw)
        m = Model(**fields)
        s.add(m)
        await s.commit()
        return m.id


async def _state(SessionLocal, model_id) -> tuple[str, str | None]:
    async with SessionLocal() as s:
        m = (await s.execute(select(Model).where(Model.id == model_id))).scalar_one()
        return m.state, m.state_reason


async def _cleanup(SessionLocal, model_id):
    async with SessionLocal() as s:
        await s.execute(delete(Model).where(Model.id == model_id))
        await s.commit()


def _patched_supervisor(monkeypatch, probe_results):
    sup = ModelSupervisor()
    results = list(probe_results)

    async def _probe(m):
        return results.pop(0) if len(results) > 1 else results[0]

    monkeypatch.setattr(sup, "probe", _probe)
    monkeypatch.setattr(sup, "model_url", lambda m: asyncio.sleep(0, result=f"http://fake-model-{m.id}:8000"))
    # validation/plan need real files; bypass by faking the adapter plan
    import src.engines as engines
    class _A:
        def validate(self, m, s): return []
        def plan(self, m, s, t=None): return None
    monkeypatch.setattr(ms, "get_adapter", lambda e: _A())
    return sup


def test_launch_reaches_running_and_registers(db, fake, monkeypatch):
    sup = _patched_supervisor(monkeypatch, [ms.Probe("loading"), ms.Probe("ready")])

    async def flow():
        db.open()
        mid = await _make_model(db)
        try:
            r = await sup.launch(mid)
            assert r["status"] == "loading" and r["container"] == f"fake-model-{mid}"
            assert (await _state(db, mid))[0] == "loading"
            await asyncio.wait_for(sup._trackers[mid], timeout=15)
            state, reason = await _state(db, mid)
            assert state == "running" and reason is None
            async with db() as s:
                m = (await s.execute(select(Model).where(Model.id == mid))).scalar_one()
            assert m.served_model_name in MODEL_REGISTRY
            assert MODEL_REGISTRY[m.served_model_name]["url"] == f"http://fake-model-{mid}:8000"
            # second launch while running is a restart-free no-op guard? no: launch again should work only after stop
            await sup.stop(mid)
            assert (await _state(db, mid))[0] == "stopped"
            assert fake.stopped == [mid]
            assert m.served_model_name not in MODEL_REGISTRY
        finally:
            await _cleanup(db, mid)
            await db.close()

    _run(flow())


def test_container_exit_marks_failed_with_reason(db, fake, monkeypatch):
    sup = _patched_supervisor(monkeypatch, [ms.Probe("loading")])
    fake.status = "exited"

    async def flow():
        db.open()
        mid = await _make_model(db)
        try:
            await sup.launch(mid)
            await asyncio.wait_for(sup._trackers[mid], timeout=15)
            state, reason = await _state(db, mid)
            assert state == "failed"
            assert "container_exited" in reason and "out of memory" in reason
        finally:
            await _cleanup(db, mid)
            await db.close()

    _run(flow())


def test_start_failure_is_reported_and_state_failed(db, fake, monkeypatch):
    sup = _patched_supervisor(monkeypatch, [ms.Probe("loading")])
    fake.fail_start = dm.OfflineImageUnavailableError("image missing")

    async def flow():
        db.open()
        mid = await _make_model(db)
        try:
            with pytest.raises(SupervisorError) as ei:
                await sup.launch(mid)
            assert ei.value.status_code == 503
            state, reason = await _state(db, mid)
            assert state == "failed" and "image missing" in reason
        finally:
            await _cleanup(db, mid)
            await db.close()

    _run(flow())


def test_startup_timeout_marks_failed(db, fake, monkeypatch):
    sup = _patched_supervisor(monkeypatch, [ms.Probe("loading")])

    async def flow():
        db.open()
        mid = await _make_model(db, startup_timeout_sec=2)
        try:
            await sup.launch(mid)
            await asyncio.wait_for(sup._trackers[mid], timeout=20)
            state, reason = await _state(db, mid)
            assert state == "failed" and "startup_timeout" in reason
            assert mid in fake.stopped
        finally:
            await _cleanup(db, mid)
            await db.close()

    _run(flow())


def test_apply_on_stopped_is_saved_and_stop_failure_is_visible(db, fake, monkeypatch):
    sup = _patched_supervisor(monkeypatch, [ms.Probe("ready")])

    async def flow():
        db.open()
        mid = await _make_model(db)
        try:
            assert (await sup.apply(mid))["status"] == "saved"
            await sup.launch(mid)
            await asyncio.wait_for(sup._trackers[mid], timeout=15)
            assert (await _state(db, mid)) == ("running", None)
            fake.fail_stop = RuntimeError("daemon down")
            with pytest.raises(SupervisorError):
                await sup.stop(mid)
            state, reason = await _state(db, mid)
            assert state == "failed" and "stop_failed" in reason
        finally:
            fake.fail_stop = None
            await _cleanup(db, mid)
            await db.close()

    _run(flow())


def test_reconcile_detects_missing_container_and_dead_engine(db, fake, monkeypatch):
    sup = _patched_supervisor(monkeypatch, [ms.Probe("dead", "engine_reported_503")])

    async def flow():
        db.open()
        gone = await _make_model(db, state="running", container_name="fake-gone")
        dead = await _make_model(db, state="running", container_name="fake-dead")
        try:
            # first: container missing
            fake.status = None
            await sup.reconcile()
            assert (await _state(db, gone))[0] == "failed"
            assert (await _state(db, dead))[0] == "failed"
            # now: container present but engine dead
            async with db() as s:
                m = (await s.execute(select(Model).where(Model.id == dead))).scalar_one()
                m.state, m.state_reason = "running", None
                await s.commit()
            fake.status = "running"
            await sup.reconcile()
            state, reason = await _state(db, dead)
            assert state == "failed" and "engine_unhealthy" in reason
        finally:
            await _cleanup(db, gone)
            await _cleanup(db, dead)
            await db.close()

    _run(flow())

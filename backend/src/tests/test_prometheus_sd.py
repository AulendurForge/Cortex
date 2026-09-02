"""Prometheus HTTP service discovery served by the gateway (integration: needs the live gateway)."""
from __future__ import annotations

import os

import httpx
import pytest

BASE = os.environ.get("CORTEX_GATEWAY_URL", "http://127.0.0.1:8084").rstrip("/")


def test_prometheus_sd_lists_running_models():
    try:
        r = httpx.get(f"{BASE}/prometheus/sd", timeout=5.0)
    except Exception:
        pytest.skip(f"gateway not reachable at {BASE}")
    assert r.status_code == 200, r.text
    targets = r.json()
    assert isinstance(targets, list)
    running = [m for m in httpx.get(f"{BASE}/admin/models", cookies=_login(), timeout=10.0).json() if m["state"] == "running"]
    assert len(targets) == len(running)
    for t in targets:
        assert t["targets"] == ["host.docker.internal:8084"]
        assert t["labels"]["__metrics_path__"] == f"/engine-metrics/{t['labels']['model_id']}"
        # the proxied metrics endpoint answers for every advertised target
        m = httpx.get(f"{BASE}{t['labels']['__metrics_path__']}", timeout=10.0)
        assert m.status_code == 200 and b"# HELP" in m.content


def _login() -> dict:
    c = httpx.Client(base_url=BASE, timeout=10.0)
    r = c.post("/auth/login", json={"username": os.environ.get("CORTEX_TEST_ADMIN_USER", "admin"),
                                     "password": os.environ.get("CORTEX_TEST_ADMIN_PASS", "admin")})
    assert r.status_code == 200, r.text
    return dict(c.cookies)

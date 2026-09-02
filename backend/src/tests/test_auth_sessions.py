"""Signed session tokens: forgery, tampering and expiry must all be rejected."""
from __future__ import annotations

import base64
import time

import pytest

from src import auth


@pytest.fixture(autouse=True)
def secret():
    auth.set_session_secret("unit-test-secret")
    yield
    auth.set_session_secret("")


def test_roundtrip_and_username_recovery():
    tok = auth.create_session_token("admin", ttl_hours=1)
    assert auth.verify_session_token(tok) == "admin"


def test_bare_username_cookie_is_rejected():
    # The old scheme stored the username in clear text; that must never authenticate again.
    assert auth.verify_session_token("admin") is None
    assert auth.verify_session_token("") is None
    assert auth.verify_session_token(None) is None


def test_tampered_payload_is_rejected():
    tok = auth.create_session_token("user1", ttl_hours=1)
    payload_b64, sig = tok.split(".", 1)
    pad = "=" * (-len(payload_b64) % 4)
    payload = base64.urlsafe_b64decode(payload_b64 + pad).decode()
    forged = payload.replace("user1", "admin").encode()
    forged_b64 = base64.urlsafe_b64encode(forged).decode().rstrip("=")
    assert auth.verify_session_token(f"{forged_b64}.{sig}") is None


def test_wrong_secret_is_rejected():
    tok = auth.create_session_token("admin", ttl_hours=1)
    auth.set_session_secret("another-secret")
    assert auth.verify_session_token(tok) is None


def test_expired_token_is_rejected(monkeypatch):
    tok = auth.create_session_token("admin", ttl_hours=1)
    real_time = time.time
    monkeypatch.setattr(time, "time", lambda: real_time() + 2 * 3600)
    assert auth.verify_session_token(tok) is None

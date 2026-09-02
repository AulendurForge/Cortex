"""Pure tests: IP allowlists (exact + CIDR), trusted-proxy header handling, user validation."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.auth import ip_allowed, _parse_ip_allowlist
from src.utils.ip_utils import parse_networks, ip_in_networks, validate_allowlist
from src.routes.users import UserCreate, UserUpdate


def test_allowlist_exact_and_cidr():
    allow = _parse_ip_allowlist("10.0.0.5, 192.168.1.0/24,2001:db8::/32")
    assert ip_allowed("10.0.0.5", allow)
    assert ip_allowed("192.168.1.77", allow)
    assert ip_allowed("2001:db8::1", allow)
    assert not ip_allowed("10.0.0.6", allow)
    assert not ip_allowed("192.168.2.1", allow)
    assert ip_allowed("anything", [])          # empty allowlist allows all
    assert not ip_allowed(None, allow)


def test_validate_allowlist_reports_bad_entries():
    assert validate_allowlist("10.0.0.1, 10.0.0.0/8") == []
    assert validate_allowlist("10.0.0.1, not-an-ip, 300.1.1.1") == ["not-an-ip", "300.1.1.1"]


def test_trusted_proxy_networks():
    nets = parse_networks("127.0.0.1, 172.16.0.0/12, junk")
    assert ip_in_networks("127.0.0.1", nets)
    assert ip_in_networks("172.20.3.4", nets)
    assert not ip_in_networks("192.168.1.1", nets)


class _Req:
    def __init__(self, peer, headers):
        self.client = type("c", (), {"host": peer})()
        self.headers = headers


def test_forwarded_headers_only_from_trusted_proxy(monkeypatch):
    from src import config as cfg
    from src.utils import ip_utils
    settings = cfg.get_settings()
    monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", "10.0.0.0/8")
    spoof = _Req("203.0.113.9", {"X-Forwarded-For": "10.0.0.5"})
    assert ip_utils.get_client_ip(spoof) == "203.0.113.9"
    via_proxy = _Req("10.0.0.1", {"X-Forwarded-For": "203.0.113.9, 10.0.0.1"})
    assert ip_utils.get_client_ip(via_proxy) == "203.0.113.9"
    monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", "")
    assert ip_utils.get_client_ip(via_proxy) == "10.0.0.1"


def test_user_create_validation():
    u = UserCreate(username="  ops.user@site  ", password="longenough", role="admin")
    assert u.username == "ops.user@site" and u.role == "Admin"
    with pytest.raises(ValidationError):
        UserCreate(username="", password="longenough")
    with pytest.raises(ValidationError):
        UserCreate(username="ok", password="short")
    with pytest.raises(ValidationError):
        UserCreate(username="ok", password="longenough", role="Superuser")
    with pytest.raises(ValidationError):
        UserCreate(username="bad name!", password="longenough")


def test_user_update_org_unassign_is_explicit():
    assert "org_id" not in UserUpdate().model_fields_set
    assert "org_id" in UserUpdate(org_id=None).model_fields_set
    with pytest.raises(ValidationError):
        UserUpdate(status="frozen")
    assert UserUpdate(role="user").role == "User"

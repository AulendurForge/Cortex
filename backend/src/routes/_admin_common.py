"""Helpers shared by the admin route modules (admin_system, admin_usage, admin_upstreams, admin_model_metrics)."""
from __future__ import annotations

from typing import Optional


def _get_session() -> Optional[object]:
    try:
        from ..main import SessionLocal  # type: ignore
        return SessionLocal
    except Exception:
        return None


def _get_http_client():
    try:
        from ..main import http_client  # type: ignore
        return http_client
    except Exception:
        return None

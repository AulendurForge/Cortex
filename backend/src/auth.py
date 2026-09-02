"""Authentication: API keys for /v1, signed session cookies for the admin UI."""
from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import secrets
import time
from datetime import datetime

from fastapi import Depends, Header, HTTPException, Request

from .config import get_settings
from .crypto import verify_key
from .metrics import KEY_AUTH_ALLOWED, KEY_AUTH_BLOCKED
from .models import APIKey
from .utils.ip_utils import get_client_ip
from sqlalchemy import select

logger = logging.getLogger(__name__)

SESSION_COOKIE = "cortex_session"
_session_secret: str | None = None


# ---------------------------------------------------------------------------
# Session signing
# ---------------------------------------------------------------------------

def set_session_secret(secret: str) -> None:
    global _session_secret
    _session_secret = secret


def get_session_secret() -> str:
    if not _session_secret:
        raise HTTPException(status_code=503, detail="session_secret_not_ready")
    return _session_secret


async def load_or_create_session_secret(SessionLocal) -> str:
    """Use SESSION_SECRET from settings, else a random secret persisted in ConfigKV."""
    settings = get_settings()
    if settings.SESSION_SECRET:
        set_session_secret(settings.SESSION_SECRET)
        return settings.SESSION_SECRET
    from .models import ConfigKV
    async with SessionLocal() as session:
        row = (await session.execute(select(ConfigKV).where(ConfigKV.key == "session_secret"))).scalar_one_or_none()
        if row and row.value:
            set_session_secret(row.value)
            return row.value
        secret = secrets.token_urlsafe(48)
        session.add(ConfigKV(key="session_secret", value=secret))
        await session.commit()
        set_session_secret(secret)
        logger.warning("Generated a new session secret (set SESSION_SECRET to make it explicit)")
        return secret


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def create_session_token(username: str, ttl_hours: int | None = None) -> str:
    settings = get_settings()
    ttl = int(ttl_hours or settings.SESSION_TTL_HOURS)
    payload = f"{username}|{int(time.time()) + ttl * 3600}".encode()
    sig = hmac.new(get_session_secret().encode(), payload, hashlib.sha256).digest()
    return f"{_b64(payload)}.{_b64(sig)}"


def verify_session_token(token: str | None) -> str | None:
    """Return the username for a valid, unexpired token; None otherwise."""
    if not token or "." not in token:
        return None
    try:
        p, s = token.split(".", 1)
        payload = _unb64(p)
        sig = _unb64(s)
    except Exception:
        return None
    expected = hmac.new(get_session_secret().encode(), payload, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        username, exp = payload.decode().rsplit("|", 1)
        if int(exp) < time.time():
            return None
    except Exception:
        return None
    return username


# ---------------------------------------------------------------------------
# API keys (/v1)
# ---------------------------------------------------------------------------

def _parse_ip_allowlist(raw: str) -> list[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


_ALL_SCOPES = {"chat", "completions", "embeddings"}


async def require_api_key(request: Request, authorization: str = Header(None), settings=Depends(get_settings)):
    from .main import SessionLocal  # type: ignore

    if not authorization:
        # The admin UI's chat playground calls /v1 with the signed session cookie instead of an API key.
        session_user = verify_session_token(request.cookies.get(SESSION_COOKIE))
        if session_user:
            KEY_AUTH_ALLOWED.labels(reason="session").inc()
            return {"key_id": None, "scopes": set(_ALL_SCOPES), "session_user": session_user}
        if settings.GATEWAY_DEV_ALLOW_ALL_KEYS:
            KEY_AUTH_ALLOWED.labels(reason="dev_bypass").inc()
            return {"key_id": None, "scopes": set(_ALL_SCOPES)}
        KEY_AUTH_BLOCKED.labels(reason="missing_token").inc()
        raise HTTPException(status_code=401, detail="Missing bearer token")
    if not authorization.lower().startswith("bearer "):
        KEY_AUTH_BLOCKED.labels(reason="format").inc()
        raise HTTPException(status_code=401, detail="Authorization header must be 'Bearer <key>'")
    key = authorization.split(" ", 1)[1].strip()
    if len(key) < 12:
        KEY_AUTH_BLOCKED.labels(reason="format").inc()
        raise HTTPException(status_code=401, detail="Invalid API key format")

    prefix = key[:8]
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        row = (await session.execute(select(APIKey).where(APIKey.prefix == prefix, APIKey.disabled == False))).scalar_one_or_none()  # noqa: E712
        if not row:
            KEY_AUTH_BLOCKED.labels(reason="not_found").inc()
            raise HTTPException(status_code=401, detail="Invalid API key")
        if row.expires_at and row.expires_at < datetime.utcnow():
            KEY_AUTH_BLOCKED.labels(reason="expired").inc()
            raise HTTPException(status_code=401, detail="API key expired")
        if not verify_key(key, row.hash):
            KEY_AUTH_BLOCKED.labels(reason="hash_mismatch").inc()
            raise HTTPException(status_code=401, detail="Invalid API key")
        client_ip = get_client_ip(request)
        allowlist = _parse_ip_allowlist(row.ip_allowlist)
        if allowlist and client_ip and client_ip not in allowlist:
            KEY_AUTH_BLOCKED.labels(reason="ip").inc()
            raise HTTPException(status_code=403, detail=f"IP {client_ip} not allowed. Allowed IPs: {', '.join(allowlist)}")
        try:
            row.last_used_at = datetime.utcnow()
            await session.commit()
        except Exception:
            await session.rollback()
        scopes = {s.strip() for s in (row.scopes or "").split(",") if s.strip()}
        key_id = row.id
    KEY_AUTH_ALLOWED.labels(reason="ok").inc()
    return {"key_id": key_id, "scopes": scopes}


# ---------------------------------------------------------------------------
# Admin / user sessions
# ---------------------------------------------------------------------------

async def _session_user(request: Request) -> dict:
    from .main import SessionLocal  # type: ignore
    from .models import User

    username = verify_session_token(request.cookies.get(SESSION_COOKIE))
    if not username:
        raise HTTPException(status_code=401, detail="unauthenticated")
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.username == username))).scalar_one_or_none()
        if not user or (user.status or "active") != "active":
            raise HTTPException(status_code=401, detail="unauthenticated")
        return {"username": user.username, "role": (user.role or "").lower(), "user_id": user.id}


async def require_admin(request: Request):
    ctx = await _session_user(request)
    if ctx["role"] != "admin":
        raise HTTPException(status_code=403, detail="forbidden")
    return ctx


async def require_user_session(request: Request):
    return await _session_user(request)

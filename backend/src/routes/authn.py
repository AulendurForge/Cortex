"""Admin UI session endpoints (signed cookie sessions)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import func, select

from ..auth import SESSION_COOKIE, create_session_token, verify_session_token
from ..config import get_settings
from ..crypto import pwd_context

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class BootstrapRequest(BaseModel):
    username: str
    password: str
    org_name: str | None = None


def _session_factory():
    from ..main import SessionLocal  # type: ignore
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    return SessionLocal


@router.post("/login")
async def login(body: LoginRequest, response: Response, settings=Depends(get_settings)):
    from ..models import User
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.username == body.username))).scalar_one_or_none()
        if not user or not user.password_hash or not pwd_context.verify(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="invalid_credentials")
        if (user.status or "active") != "active":
            raise HTTPException(status_code=403, detail="account_disabled")
        token = create_session_token(user.username)
        response.set_cookie(
            key=SESSION_COOKIE,
            value=token,
            httponly=True,
            samesite="lax",
            secure=bool(settings.SESSION_COOKIE_SECURE),
            max_age=int(settings.SESSION_TTL_HOURS) * 3600,
            path="/",
        )
        return {"status": "ok", "user": {"username": user.username, "role": user.role}}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"status": "ok"}


@router.get("/me")
async def me(request: Request):
    from ..models import User
    username = verify_session_token(request.cookies.get(SESSION_COOKIE))
    if not username:
        raise HTTPException(status_code=401, detail="unauthenticated")
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        user = (await session.execute(select(User).where(User.username == username))).scalar_one_or_none()
        if not user or (user.status or "active") != "active":
            raise HTTPException(status_code=401, detail="unauthenticated")
        return {"username": user.username, "role": user.role}


@router.post("/bootstrap-owner")
async def bootstrap_owner(body: BootstrapRequest):
    """Create the first admin. No-op (and unauthenticated by design) once any admin exists."""
    from ..models import Organization, User
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        cnt = (await session.execute(select(func.count()).select_from(User).where(User.role == "Admin"))).scalar_one()
        if int(cnt or 0) > 0:
            return {"status": "skipped"}
        org_id = None
        if body.org_name:
            org = Organization(name=body.org_name)
            session.add(org)
            await session.flush()
            org_id = org.id
        user = User(username=body.username, role="Admin", org_id=org_id, password_hash=pwd_context.hash(body.password))
        session.add(user)
        await session.commit()
        return {"status": "ok", "owner_id": user.id}

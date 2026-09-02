from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy import select
from datetime import datetime
from typing import Optional
def _get_session() -> Optional[object]:
    try:
        from ..main import SessionLocal  # type: ignore
        return SessionLocal
    except Exception:
        return None
from ..models import APIKey, User
from ..crypto import generate_api_key, hash_key
from ..auth import require_user_session, require_admin
from ..utils.ip_utils import ensure_host_ip_in_allowlist, validate_allowlist
from datetime import timezone

router = APIRouter()
# Self-service keys: any signed-in user manages their own keys (mounted without the admin guard)
me_router = APIRouter()


def _check_allowlist(raw: str) -> str:
    bad = validate_allowlist(raw)
    if bad:
        raise HTTPException(status_code=422, detail=f"invalid IP allowlist entries: {', '.join(bad)} (use IPs or CIDR ranges, comma-separated)")
    return ensure_host_ip_in_allowlist(raw)


def _utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class CreateKeyRequest(BaseModel):
    scopes: str = "chat,completions,embeddings"
    expires_at: datetime | None = None
    ip_allowlist: str = ""
    user_id: int | None = None
    org_id: int | None = None


class CreateKeyResponse(BaseModel):
    id: int
    prefix: str
    token: str  # shown once


class KeyItem(BaseModel):
    id: int
    prefix: str
    scopes: str
    expires_at: datetime | None
    last_used_at: datetime | None
    disabled: bool
    user_id: int | None = None
    org_id: int | None = None
    created_at: datetime | None = None
    username: str | None = None
    org_name: str | None = None


@router.get("/keys", response_model=list[KeyItem])
async def list_keys(
    include_disabled: bool = False,
    org_id: int | None = None,
    user_id: int | None = None,
    q: str | None = None,
    sort: str | None = None,
    include_names: bool = True,
    limit: int = 100,
    offset: int = 0,
):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        stmt = select(APIKey)
        if not include_disabled:
            stmt = stmt.where(APIKey.disabled == False)  # noqa: E712
        if org_id is not None:
            stmt = stmt.where(APIKey.org_id == org_id)
        if user_id is not None:
            stmt = stmt.where(APIKey.user_id == user_id)
        if q:
            stmt = stmt.where(APIKey.prefix.ilike(f"%{q}%"))
        # sorting
        sort_field = APIKey.id
        sort_desc = True
        if sort:
            try:
                field, direction = (sort.split(":", 1) + ["desc"])[:2]
                field = field or "id"
                sort_desc = (direction or "desc").lower() == "desc"
                if field == "created_at":
                    from sqlalchemy import desc
                    sort_field = APIKey.created_at
                elif field == "last_used_at":
                    sort_field = APIKey.last_used_at
                else:
                    sort_field = APIKey.id
            except Exception:
                pass
        from sqlalchemy import desc
        stmt = stmt.order_by(desc(sort_field) if sort_desc else sort_field.asc()).limit(max(1, min(limit, 500))).offset(max(0, offset))
        result = await session.execute(stmt)
        rows = result.scalars().all()
        items = []
        id_to_username: dict[int, str] = {}
        id_to_orgname: dict[int, str] = {}
        if include_names and rows:
            from ..models import User, Organization
            user_ids = sorted({getattr(r, 'user_id', None) for r in rows if getattr(r, 'user_id', None) is not None})
            org_ids = sorted({getattr(r, 'org_id', None) for r in rows if getattr(r, 'org_id', None) is not None})
            if user_ids:
                users = (await session.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
                id_to_username = {u.id: u.username for u in users}
            if org_ids:
                orgs = (await session.execute(select(Organization).where(Organization.id.in_(org_ids)))).scalars().all()
                id_to_orgname = {o.id: o.name for o in orgs}
        for r in rows:
            items.append(
                KeyItem(
                    id=r.id,
                    prefix=r.prefix,
                    scopes=r.scopes,
                    expires_at=r.expires_at,
                    last_used_at=r.last_used_at,
                    disabled=r.disabled,
                    user_id=getattr(r, 'user_id', None),
                    org_id=getattr(r, 'org_id', None),
                    created_at=getattr(r, 'created_at', None),
                    username=id_to_username.get(getattr(r, 'user_id', None) or -1),
                    org_name=id_to_orgname.get(getattr(r, 'org_id', None) or -1),
                )
            )
        return items


# Self-service: manage own keys using session cookie
@me_router.get("/me/keys", response_model=list[KeyItem])
async def list_my_keys(include_disabled: bool = False, user = Depends(require_user_session)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        # Look up current user id
        u = (await session.execute(select(User).where(User.username == user["username"])) ).scalar_one_or_none()
        if not u:
            return []
        stmt = select(APIKey).where(APIKey.user_id == u.id)
        if not include_disabled:
            stmt = stmt.where(APIKey.disabled == False)  # noqa: E712
        rows = (await session.execute(stmt.order_by(APIKey.id.desc()))).scalars().all()
        return [
            KeyItem(
                id=r.id,
                prefix=r.prefix,
                scopes=r.scopes,
                expires_at=r.expires_at,
                last_used_at=r.last_used_at,
                disabled=r.disabled,
                user_id=getattr(r, 'user_id', None),
                org_id=getattr(r, 'org_id', None),
                created_at=getattr(r, 'created_at', None),
            ) for r in rows
        ]


class CreateMyKeyRequest(BaseModel):
    scopes: str = "chat,completions,embeddings"
    expires_at: datetime | None = None
    ip_allowlist: str = ""


@me_router.post("/me/keys", response_model=CreateKeyResponse)
async def create_my_key(body: CreateMyKeyRequest, user = Depends(require_user_session)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    token, prefix = generate_api_key()
    hashed = hash_key(token)
    final_allowlist = _check_allowlist(body.ip_allowlist)
    async with SessionLocal() as session:
        u = (await session.execute(select(User).where(User.username == user["username"])) ).scalar_one_or_none()
        if not u:
            raise HTTPException(status_code=401, detail="unauthenticated")
        rec = APIKey(prefix=prefix, hash=hashed, scopes=body.scopes, expires_at=_utc(body.expires_at), ip_allowlist=final_allowlist, user_id=u.id, org_id=u.org_id)
        session.add(rec)
        await session.commit()
        await session.refresh(rec)
        return CreateKeyResponse(id=rec.id, prefix=rec.prefix, token=token)


@me_router.delete("/me/keys/{key_id}")
async def revoke_my_key(key_id: int, user = Depends(require_user_session)):
    """Revoke one of the caller's own keys (other users' keys are reported as not found)."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        u = (await session.execute(select(User).where(User.username == user["username"])) ).scalar_one_or_none()
        if not u:
            raise HTTPException(status_code=401, detail="unauthenticated")
        rec = (await session.execute(select(APIKey).where(APIKey.id == key_id, APIKey.user_id == u.id))).scalar_one_or_none()
        if not rec:
            raise HTTPException(status_code=404, detail="Not found")
        rec.disabled = True
        await session.commit()
    return {"status": "ok"}


@router.post("/keys", response_model=CreateKeyResponse)
async def create_key(body: CreateKeyRequest):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    token, prefix = generate_api_key()
    hashed = hash_key(token)
    final_allowlist = _check_allowlist(body.ip_allowlist)
    async with SessionLocal() as session:
        rec = APIKey(prefix=prefix, hash=hashed, scopes=body.scopes, expires_at=_utc(body.expires_at), ip_allowlist=final_allowlist)
        # attribution (optional)
        try:
            if body.user_id is not None:
                rec.user_id = body.user_id
        except Exception:
            pass
        try:
            if body.org_id is not None:
                rec.org_id = body.org_id
        except Exception:
            pass
        session.add(rec)
        await session.commit()
        await session.refresh(rec)
        return CreateKeyResponse(id=rec.id, prefix=rec.prefix, token=token)


@router.delete("/keys/{key_id}")
async def revoke_key(key_id: int):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        result = await session.execute(select(APIKey).where(APIKey.id == key_id))
        rec = result.scalar_one_or_none()
        if not rec:
            raise HTTPException(status_code=404, detail="Not found")
        rec.disabled = True
        await session.commit()
    return {"status": "ok"}


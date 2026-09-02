"""Create or reset the admin account.

    printf '%s' "$PASSWORD" | CORTEX_ADMIN_USERNAME=admin python -m src.tools.set_admin [--rotate-session-secret]

The password is read from stdin so it never appears in process arguments or shell history.
``ensure_admin`` is also what the gateway uses at startup to bootstrap the first admin from
ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from ..config import get_settings
from ..crypto import pwd_context
from ..models import ConfigKV, Organization, User

MIN_PASSWORD_LEN = 8


async def ensure_admin(session: AsyncSession, username: str, password: str, org_name: str = "Default",
                       *, only_if_no_admin: bool = False) -> dict:
    """Create ``username`` as an active admin or reset its password/role.

    With ``only_if_no_admin`` nothing happens when any admin already exists (startup bootstrap).
    Returns {"action": "created"|"updated"|"skipped", "username": ..., "id": ...}.
    """
    username = (username or "").strip()
    if not username:
        raise ValueError("username is empty")
    if len(password or "") < MIN_PASSWORD_LEN:
        raise ValueError(f"password must be at least {MIN_PASSWORD_LEN} characters")
    if only_if_no_admin:
        admins = (await session.execute(select(func.count()).select_from(User).where(User.role == "Admin"))).scalar_one()
        if int(admins or 0) > 0:
            return {"action": "skipped", "username": username, "id": None, "reason": "an admin already exists"}
    user = (await session.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if user is None:
        org = None
        if org_name:
            org = (await session.execute(select(Organization).where(Organization.name == org_name))).scalar_one_or_none()
            if org is None:
                org = Organization(name=org_name)
                session.add(org)
                await session.flush()
        user = User(username=username, role="Admin", status="active", org_id=org.id if org else None,
                    password_hash=pwd_context.hash(password))
        session.add(user)
        await session.commit()
        return {"action": "created", "username": username, "id": user.id}
    user.password_hash = pwd_context.hash(password)
    user.role = "Admin"
    user.status = "active"
    await session.commit()
    return {"action": "updated", "username": username, "id": user.id}


async def rotate_stored_session_secret(session: AsyncSession) -> bool:
    """Drop the auto-generated session secret (ConfigKV) so the next gateway start mints a new one.
    Only relevant when SESSION_SECRET is not provided through the environment."""
    res = await session.execute(delete(ConfigKV).where(ConfigKV.key == "session_secret"))
    await session.commit()
    return bool(res.rowcount)


async def _main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--username", default=os.environ.get("CORTEX_ADMIN_USERNAME", ""))
    ap.add_argument("--org", default=os.environ.get("ADMIN_BOOTSTRAP_ORG") or "Default")
    ap.add_argument("--rotate-session-secret", action="store_true", help="invalidate every signed-in session (gateway restart needed)")
    args = ap.parse_args()
    password = sys.stdin.read().rstrip("\r\n")
    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
    try:
        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as session:
            out = await ensure_admin(session, args.username, password, args.org)
            if args.rotate_session_secret:
                out["stored_session_secret_dropped"] = await rotate_stored_session_secret(session)
                out["note"] = ("SESSION_SECRET comes from the environment: rotate it in .env and recreate the gateway"
                               if settings.SESSION_SECRET else "restart the gateway to sign out all sessions")
    finally:
        await engine.dispose()
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(_main()))
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(2)

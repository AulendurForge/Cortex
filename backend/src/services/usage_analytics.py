"""Usage analytics and reporting services."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional, List

from sqlalchemy import select, func

from ..schemas.admin import UsageItem, UsageAggItem, UsageSeriesItem, LatencySummary

MAX_HOURS = 24 * 30
BUCKETS = {"minute": 60, "hour": 3600, "day": 86400}

# Records store the engine task (``generate`` / ``embed``); the UI and API also accept the endpoint
# names so a filter for "embeddings" or "chat" works.
_TASK_ALIASES = {
    "chat": "generate", "completions": "generate", "completion": "generate", "generate": "generate",
    "embeddings": "embed", "embedding": "embed", "embed": "embed",
}


def normalize_task(task: Optional[str]) -> Optional[str]:
    if not task:
        return None
    return _TASK_ALIASES.get(task.strip().lower(), task.strip())


def clamp_hours(hours: Optional[int], default: int = 24) -> int:
    return max(1, min(int(hours if hours is not None else default), MAX_HOURS))


def _since(hours: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=hours)


def apply_filters(q, Usage, *, hours: Optional[int] = None, model: Optional[str] = None, task: Optional[str] = None,
                  key_id: Optional[int] = None, user_id: Optional[int] = None, org_id: Optional[int] = None,
                  status: Optional[str] = None):
    """Apply the common usage filters to a select on ``Usage``."""
    if hours is not None:
        q = q.where(Usage.created_at >= _since(clamp_hours(hours)))
    if model:
        q = q.where(Usage.model_name == model)
    t = normalize_task(task)
    if t:
        q = q.where(Usage.task == t)
    if key_id is not None:
        q = q.where(Usage.key_id == key_id)
    if user_id is not None:
        q = q.where(Usage.user_id == user_id)
    if org_id is not None:
        q = q.where(Usage.org_id == org_id)
    if status:
        s = status.strip().lower()
        if s.endswith("xx") and len(s) == 3 and s[0].isdigit():
            base = int(s[0]) * 100
            q = q.where(Usage.status_code >= base, Usage.status_code < base + 100)
        else:
            try:
                q = q.where(Usage.status_code == int(s))
            except ValueError:
                pass
    return q


async def _names(session, user_ids: set[int], org_ids: set[int]) -> tuple[dict[int, str], dict[int, str]]:
    from ..models import User, Organization
    users: dict[int, str] = {}
    orgs: dict[int, str] = {}
    if user_ids:
        for uid, name in (await session.execute(select(User.id, User.username).where(User.id.in_(user_ids)))).all():
            users[uid] = name
    if org_ids:
        for oid, name in (await session.execute(select(Organization.id, Organization.name).where(Organization.id.in_(org_ids)))).all():
            orgs[oid] = name
    return users, orgs


async def get_usage_records(
    session,
    limit: int = 50,
    offset: int = 0,
    hours: Optional[int] = None,
    model: Optional[str] = None,
    task: Optional[str] = None,
    key_id: Optional[int] = None,
    user_id: Optional[int] = None,
    org_id: Optional[int] = None,
    status: Optional[str] = None,
) -> List[UsageItem]:
    """Query usage records with filtering and pagination (newest first)."""
    from ..models import Usage
    q = apply_filters(select(Usage), Usage, hours=hours, model=model, task=task, key_id=key_id,
                      user_id=user_id, org_id=org_id, status=status)
    q = q.order_by(Usage.id.desc()).limit(max(1, min(limit, 1000))).offset(max(0, offset))
    rows = (await session.execute(q)).scalars().all()
    users, orgs = await _names(session, {r.user_id for r in rows if r.user_id}, {r.org_id for r in rows if r.org_id})
    return [
        UsageItem(
            id=r.id, key_id=r.key_id, user_id=r.user_id, org_id=r.org_id,
            username=users.get(r.user_id) if r.user_id else None, org_name=orgs.get(r.org_id) if r.org_id else None,
            model_name=r.model_name, task=r.task,
            prompt_tokens=r.prompt_tokens, completion_tokens=r.completion_tokens, total_tokens=r.total_tokens,
            latency_ms=r.latency_ms, status_code=r.status_code, req_id=r.req_id,
            created_at=r.created_at.timestamp() if hasattr(r.created_at, "timestamp") else 0.0,
        )
        for r in rows
    ]


async def get_usage_aggregate(session, hours: int = 24, model: Optional[str] = None, **filters) -> List[UsageAggItem]:
    """Aggregated usage per model (requests and tokens) for the window and filters."""
    from ..models import Usage
    q = (
        select(
            Usage.model_name.label("model_name"),
            func.count(Usage.id).label("requests"),
            func.coalesce(func.sum(Usage.prompt_tokens), 0).label("prompt_tokens"),
            func.coalesce(func.sum(Usage.completion_tokens), 0).label("completion_tokens"),
            func.coalesce(func.sum(Usage.total_tokens), 0).label("total_tokens"),
        )
        .group_by(Usage.model_name)
        .order_by(func.count(Usage.id).desc())
    )
    q = apply_filters(q, Usage, hours=clamp_hours(hours), model=model, **filters)
    rows = (await session.execute(q)).all()
    return [
        UsageAggItem(model_name=r.model_name, requests=int(r.requests or 0), prompt_tokens=int(r.prompt_tokens or 0),
                     completion_tokens=int(r.completion_tokens or 0), total_tokens=int(r.total_tokens or 0))
        for r in rows
    ]


def zero_fill(points: dict[float, tuple[int, int]], hours: int, bucket: str, now: Optional[datetime] = None) -> List[UsageSeriesItem]:
    """Emit one point per bucket across the window (missing buckets are zero) so charts show gaps."""
    step = BUCKETS[bucket]
    end = (now or datetime.now(timezone.utc)).timestamp()
    end_b = (int(end) // step) * step
    start_b = end_b - clamp_hours(hours) * 3600
    start_b = (start_b // step) * step
    out: List[UsageSeriesItem] = []
    for ts in range(int(start_b), int(end_b) + step, step):
        req, tok = points.get(float(ts), (0, 0))
        out.append(UsageSeriesItem(ts=float(ts), requests=req, total_tokens=tok))
    return out


async def get_usage_series(session, hours: int = 24, bucket: str = "hour", model: Optional[str] = None, **filters) -> List[UsageSeriesItem]:
    """Requests/tokens per ``minute`` | ``hour`` | ``day`` bucket, zero-filled across the window."""
    from ..models import Usage
    if bucket not in BUCKETS:
        raise ValueError("invalid_bucket")
    hours = clamp_hours(hours)
    trunc = func.date_trunc(bucket, Usage.created_at).label("bucket")
    q = (
        select(trunc, func.count(Usage.id).label("requests"), func.coalesce(func.sum(Usage.total_tokens), 0).label("total_tokens"))
        .group_by(trunc)
        .order_by(trunc.asc())
    )
    q = apply_filters(q, Usage, hours=hours, model=model, **filters)
    rows = (await session.execute(q)).all()
    points: dict[float, tuple[int, int]] = {}
    for r in rows:
        try:
            ts = float(r.bucket.timestamp())
        except Exception:
            continue
        points[ts] = (int(r.requests or 0), int(r.total_tokens or 0))
    return zero_fill(points, hours, bucket)


async def get_usage_latency(session, hours: int = 24, model: Optional[str] = None, **filters) -> LatencySummary:
    """Latency percentiles over successful (2xx) requests for the window and filters."""
    from ..models import Usage
    q = select(Usage.latency_ms)
    q = apply_filters(q, Usage, hours=clamp_hours(hours), model=model, **filters)
    if not filters.get("status"):
        q = q.where(Usage.status_code >= 200, Usage.status_code < 300)
    q = q.order_by(Usage.latency_ms.asc()).limit(50000)
    vals = [int(v or 0) for v in (await session.execute(q)).scalars().all()]
    if not vals:
        return LatencySummary(p50_ms=0.0, p95_ms=0.0, avg_ms=0.0, samples=0)
    n = len(vals)

    def percentile(p: float) -> float:
        k = max(0, min(n - 1, int(round(p * (n - 1)))))
        return float(vals[k])

    return LatencySummary(p50_ms=percentile(0.5), p95_ms=percentile(0.95), avg_ms=sum(vals) / n, samples=n)

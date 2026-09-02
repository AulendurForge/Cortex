"""Admin routes: usage records, aggregates, time series, latency, TTFT and CSV export."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Depends, Response
from sqlalchemy import select
from typing import Optional

from ..config import get_settings
from ..schemas.admin import (
    UsageItem, UsageAggItem, UsageSeriesItem, LatencySummary, TtftSummary,
)
from ..services.usage_analytics import get_usage_records, get_usage_aggregate, get_usage_series, get_usage_latency
from ._admin_common import _get_session
from .admin_system import prom_query

router = APIRouter()


@router.get("/usage", response_model=list[UsageItem])
async def list_usage(
    limit: int = 50,
    offset: int = 0,
    hours: Optional[int] = None,
    model: Optional[str] = None,
    task: Optional[str] = None,
    key_id: Optional[int] = None,
    user_id: Optional[int] = None,
    org_id: Optional[int] = None,
    status: Optional[str] = None,
):
    """List usage records with filtering and pagination."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        return await get_usage_records(session, limit, offset, hours, model, task, key_id, user_id, org_id, status)


@router.get("/usage/aggregate", response_model=list[UsageAggItem])
async def usage_aggregate(hours: int = 24, model: Optional[str] = None, task: Optional[str] = None, key_id: Optional[int] = None,
                          user_id: Optional[int] = None, org_id: Optional[int] = None, status: Optional[str] = None):
    """Aggregated usage per model; accepts the same filters as /usage."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        return await get_usage_aggregate(session, hours, model, task=task, key_id=key_id, user_id=user_id, org_id=org_id, status=status)


@router.get("/usage/series", response_model=list[UsageSeriesItem])
async def usage_series(hours: int = 24, bucket: str = "hour", model: Optional[str] = None, task: Optional[str] = None,
                       key_id: Optional[int] = None, user_id: Optional[int] = None, org_id: Optional[int] = None, status: Optional[str] = None):
    """Requests/tokens per bucket (minute | hour | day), zero-filled; same filters as /usage."""
    if bucket not in ("minute", "hour", "day"):
        raise HTTPException(status_code=400, detail="invalid_bucket")
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        return await get_usage_series(session, hours, bucket, model, task=task, key_id=key_id, user_id=user_id, org_id=org_id, status=status)


@router.get("/usage/latency", response_model=LatencySummary)
async def usage_latency(hours: int = 24, model: Optional[str] = None, task: Optional[str] = None, key_id: Optional[int] = None,
                        user_id: Optional[int] = None, org_id: Optional[int] = None, status: Optional[str] = None):
    """Latency percentiles over successful requests; same filters as /usage."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        return await get_usage_latency(session, hours, model, task=task, key_id=key_id, user_id=user_id, org_id=org_id, status=status)


@router.get("/usage/ttft", response_model=TtftSummary)
async def usage_ttft(settings = Depends(get_settings)):
    """Time-to-first-token quantiles of streamed responses over the last 5 minutes, from Prometheus.
    Null when there are no streamed requests in the window (or Prometheus is unreachable)."""
    base = settings.PROMETHEUS_URL
    p50 = await prom_query(base, "histogram_quantile(0.5, sum by (le) (rate(gateway_stream_ttft_seconds_bucket[5m])))")
    p95 = await prom_query(base, "histogram_quantile(0.95, sum by (le) (rate(gateway_stream_ttft_seconds_bucket[5m])))")
    n = await prom_query(base, "sum(increase(gateway_stream_ttft_seconds_count[5m]))")
    return TtftSummary(p50_s=p50, p95_s=p95, samples=int(n or 0))


@router.get("/usage/export")
async def usage_export(
    hours: Optional[int] = None,
    model: Optional[str] = None,
    task: Optional[str] = None,
    key_id: Optional[int] = None,
    user_id: Optional[int] = None,
    org_id: Optional[int] = None,
    status: Optional[str] = None,
):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not ready")
    async with SessionLocal() as session:
        from ..models import Usage
        from ..services.usage_analytics import apply_filters
        q = apply_filters(select(Usage), Usage, hours=hours, model=model, task=task, key_id=key_id, user_id=user_id, org_id=org_id, status=status)
        q = q.order_by(Usage.id.desc()).limit(50000)
        rows = (await session.execute(q)).scalars().all()
        import io, csv
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["id", "created_at", "key_id", "user_id", "org_id", "model", "task", "prompt_tokens", "completion_tokens", "total_tokens", "latency_ms", "status_code", "req_id"])
        for r in rows:
            ts = r.created_at.timestamp() if hasattr(r.created_at, 'timestamp') else 0.0
            writer.writerow([r.id, ts, r.key_id, r.user_id, r.org_id, r.model_name, r.task, r.prompt_tokens, r.completion_tokens, r.total_tokens, r.latency_ms, r.status_code, r.req_id])
        return Response(content=buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=usage_export.csv"})

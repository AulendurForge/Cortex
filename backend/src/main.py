import json
from typing import List, Optional
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from .metrics import REQ_COUNT, LATENCY, UPSTREAM_LATENCY, UPSTREAM_LATENCY_BY_UPSTREAM, STREAM_TTFT_SECONDS, UPSTREAM_SELECTED
from .config import Settings, get_settings
from .routes.openai import router as openai_router
from .routes.keys import router as keys_router, me_router as me_keys_router
from .routes.admin import router as admin_router
from .routes.authn import router as authn_router
from .routes.orgs import router as orgs_router
from .routes.users import router as users_router
from .routes.models import router as models_router
from .routes.recipes import router as recipes_router
from .routes.deployment import router as deployment_router
from .routes.bundles import router as bundles_router
from .routes.chat import router as chat_router
from .middleware.ratelimit import check_rate_limit
import httpx
import asyncio
import redis.asyncio as redis_async
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from .models import Base
from .health import poll_upstreams_periodically
from .otel import init_otel_if_enabled
from fastapi.middleware.cors import CORSMiddleware
import os
import uuid
from .state import set_model_registry as _set_model_registry
from .auth import require_admin, load_or_create_session_secret
from .services.model_supervisor import supervisor
from .services.migrations import run_migrations
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Cortex Gateway", version="0.1.0")

# Configure CORS at app creation time (cannot add middleware during startup)
try:
    _settings_for_cors = get_settings()
    if _settings_for_cors.CORS_ENABLED:
        allow = [o.strip() for o in _settings_for_cors.CORS_ALLOW_ORIGINS.split(",") if o.strip()]
        # The admin UI authenticates with a cookie (credentialed fetch).  Browsers refuse a
        # credentialed response whose Access-Control-Allow-Origin is the literal "*", and
        # Starlette only echoes the request origin for "*" when the request already carries a
        # cookie.  Net effect of a bare "*": the very first login (no cookie yet) is rejected by
        # the browser while the cookie is still stored, so the second attempt "works".
        # Translate "*" into an allow-all regex so the origin is always echoed explicitly.
        allow_any = "*" in allow
        allow = [o for o in allow if o != "*"]
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allow,
            allow_origin_regex=r".*" if allow_any else None,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
except Exception:
    # Fail-open: if settings access fails at import-time, CORS just won't be enabled
    pass


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    # Ensure every request has an x-request-id; propagate to response
    req_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.req_id = req_id
    response = await call_next(request)
    try:
        response.headers.setdefault("x-request-id", req_id)
    except Exception:
        pass
    return response

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    route = request.url.path
    with LATENCY.labels(route=route).time():
        # rate-limit check (fail-open on error)
        rl = await check_rate_limit(request)
        if rl is not None:
            response = rl
        else:
            response = await call_next(request)
    # Security headers
    try:
        if get_settings().SECURITY_HEADERS_ENABLED:
            if isinstance(response, Response):
                response.headers.setdefault("X-Content-Type-Options", "nosniff")
                response.headers.setdefault("X-Frame-Options", "DENY")
                response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
                response.headers.setdefault("X-XSS-Protection", "0")
                response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
                response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    except Exception:
        pass
    REQ_COUNT.labels(route=route, status=str(response.status_code)).inc()
    return response

# Standardized error handlers to harmonize error JSON structure
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    rid = getattr(request.state, "req_id", request.headers.get("x-request-id", ""))
    content = {"error": {"code": exc.status_code, "message": exc.detail}, "request_id": rid}
    return JSONResponse(status_code=exc.status_code, content=content)

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    rid = getattr(request.state, "req_id", request.headers.get("x-request-id", ""))
    logger.exception("unhandled error on %s %s (request_id=%s)", request.method, request.url.path, rid)
    content = {"error": {"code": 500, "message": "internal_server_error"}, "request_id": rid}
    return JSONResponse(status_code=500, content=content)

@app.middleware("http")
async def size_limit_middleware(request: Request, call_next):
    # Enforce max body size when Content-Length is present
    try:
        settings = get_settings()
        cl = request.headers.get("content-length")
        if cl and int(cl) > settings.REQUEST_MAX_BODY_BYTES:
            return JSONResponse(status_code=413, content={"error": "Request entity too large"})
    except Exception:
        pass
    return await call_next(request)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/metrics")
async def metrics():
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)


@app.get("/prometheus/sd")
async def prometheus_sd():
    """Prometheus HTTP service discovery: one target per running model, scraped through
    ``/engine-metrics/{model_id}`` (see infra/prometheus/prometheus.yml). Unauthenticated like
    /metrics; it reveals only model ids, served names and engine types."""
    from sqlalchemy import select as _select
    from .models import Model as _Model
    if SessionLocal is None:
        return JSONResponse(status_code=503, content=[])
    async with SessionLocal() as session:
        rows = (await session.execute(_select(_Model).where(_Model.state == "running"))).scalars().all()
    host = os.environ.get("PROMETHEUS_SCRAPE_HOST", "host.docker.internal:8084")
    return [
        {"targets": [host],
         "labels": {"__metrics_path__": f"/engine-metrics/{m.id}", "model_id": str(m.id),
                    "served_model_name": m.served_model_name or "", "engine": m.engine_type or "",
                    "container": m.container_name or ""}}
        for m in rows
    ]


@app.get("/engine-metrics/{model_id}")
async def engine_metrics(model_id: int):
    """Proxy a running model's Prometheus metrics.

    Engine containers listen on the loopback interface and require the internal API key,
    so Prometheus scrapes them through the gateway (see infra/prometheus/prometheus.yml).
    Like /metrics this endpoint is unauthenticated; it exposes only engine counters.
    """
    from sqlalchemy import select as _select
    from .models import Model as _Model
    if SessionLocal is None or http_client is None:
        raise HTTPException(status_code=503, detail="not_ready")
    async with SessionLocal() as session:
        m = (await session.execute(_select(_Model).where(_Model.id == model_id))).scalar_one_or_none()
    if not m or m.state != "running":
        raise HTTPException(status_code=404, detail="model_not_running")
    url = await supervisor.model_url(m)
    headers = {}
    key = get_settings().INTERNAL_VLLM_API_KEY
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        r = await http_client.get(f"{url}/metrics", headers=headers, timeout=httpx.Timeout(connect=2.0, read=5.0, write=3.0, pool=5.0))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"engine_unreachable: {e.__class__.__name__}")
    return Response(content=r.content, status_code=r.status_code, media_type=r.headers.get("content-type", "text/plain"))

# OpenAI-compatible endpoints under /v1/*
app.include_router(openai_router, prefix="/v1")
# Chat playground endpoints (accessible by any authenticated user)
app.include_router(chat_router, prefix="/v1")
# Admin endpoints
# Every /admin route requires an admin session (individual routes may add more checks).
_admin_only = [Depends(require_admin)]
app.include_router(keys_router, prefix="/admin", dependencies=_admin_only)
# self-service keys: signed-in users (any role) manage their own keys
app.include_router(me_keys_router, prefix="/admin")
app.include_router(admin_router, prefix="/admin", dependencies=_admin_only)
app.include_router(authn_router, prefix="/auth")
app.include_router(orgs_router, prefix="/admin", dependencies=_admin_only)
app.include_router(users_router, prefix="/admin", dependencies=_admin_only)
app.include_router(models_router, prefix="/admin")
app.include_router(recipes_router, prefix="/admin", dependencies=_admin_only)
app.include_router(deployment_router, prefix="/admin", dependencies=_admin_only)
app.include_router(bundles_router, prefix="/admin", dependencies=_admin_only)


# Shared resources: httpx client, redis
http_client: httpx.AsyncClient | None = None
redis: redis_async.Redis | None = None
engine = None
SessionLocal: async_sessionmaker[AsyncSession] | None = None
_bg_health_task: asyncio.Task | None = None

 


@app.on_event("startup")
async def on_startup():
    global http_client, redis, _bg_health_task
    # Single shared client with connection pooling for high concurrency
    # Limits set to handle 100+ concurrent requests to llama.cpp
    http_client = httpx.AsyncClient(
        timeout=60.0,
        limits=httpx.Limits(max_connections=200, max_keepalive_connections=100)
    )
    # Redis connection (optional)
    settings = get_settings()
    try:
        redis = redis_async.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=True)
    except Exception:
        redis = None
    # Database engine/session factory
    global engine, SessionLocal
    engine = create_async_engine(settings.DATABASE_URL, future=True, pool_pre_ping=True)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    # Schema: Alembic migrations (baseline is stamped automatically for pre-Alembic databases)
    try:
        await asyncio.to_thread(run_migrations, settings.DATABASE_URL)
    except Exception:
        logger.exception("database migration failed; the API will not work correctly")
        raise
    # Session signing secret (from SESSION_SECRET or persisted in config_kv)
    await load_or_create_session_secret(SessionLocal)
    # Background health poller (optional)
    try:
        if settings.HEALTH_POLL_SEC > 0:
            _bg_health_task = asyncio.create_task(poll_upstreams_periodically(http_client))
    except Exception:
        _bg_health_task = None
    # OpenTelemetry (optional)
    init_otel_if_enabled()

    # Load persisted model registry from ConfigKV if present (best-effort)
    try:
        from sqlalchemy import select as _select  # type: ignore
        from .models import ConfigKV  # type: ignore
        if SessionLocal is not None:
            async with SessionLocal() as session:  # type: ignore
                res = await session.execute(_select(ConfigKV).where(ConfigKV.key == "model_registry"))
                row = res.scalar_one_or_none()
                if row and getattr(row, "value", None):
                    try:
                        data = json.loads(row.value)
                        if isinstance(data, dict):
                            _set_model_registry(data)
                    except Exception:
                        pass
    except Exception:
        pass

    # Model lifecycle supervisor: reconciles DB ↔ containers ↔ registry and tracks startups
    supervisor.start_background()

    # Ensure host-mapped directories exist (best-effort): models base and HF cache
    try:
        s = get_settings()
        if s.CORTEX_MODELS_DIR:
            os.makedirs(s.CORTEX_MODELS_DIR, exist_ok=True)
        if s.HF_CACHE_DIR:
            os.makedirs(s.HF_CACHE_DIR, exist_ok=True)
    except Exception:
        pass

    # First admin: created from ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD while no admin exists
    # (`make up` fills these into .env; `make setup-admin` resets the account later).
    try:
        if SessionLocal is not None:
            from .tools.set_admin import ensure_admin
            from sqlalchemy import select as _sel, func as _func
            from .models import User
            async with SessionLocal() as session:
                if settings.ADMIN_BOOTSTRAP_USERNAME and settings.ADMIN_BOOTSTRAP_PASSWORD:
                    out = await ensure_admin(session, settings.ADMIN_BOOTSTRAP_USERNAME, settings.ADMIN_BOOTSTRAP_PASSWORD,
                                             settings.ADMIN_BOOTSTRAP_ORG or "Default", only_if_no_admin=True)
                    if out["action"] == "created":
                        logger.info("[startup] admin user '%s' created from ADMIN_BOOTSTRAP_* settings", out["username"])
                else:
                    admins = (await session.execute(_sel(_func.count()).select_from(User).where(User.role == "Admin"))).scalar_one()
                    if int(admins or 0) == 0:
                        logger.warning("[startup] no admin account exists and ADMIN_BOOTSTRAP_USERNAME/PASSWORD are not set: "
                                       "run `make setup-admin` (or POST /auth/bootstrap-owner) to create one")
    except Exception as e:
        logger.warning("[startup] admin bootstrap failed: %s", e)


@app.on_event("shutdown")
async def on_shutdown():
    global http_client, redis, engine, _bg_health_task
    
    # Managed model containers keep running across gateway restarts unless configured otherwise
    try:
        await supervisor.shutdown(stop_models=bool(get_settings().STOP_MODELS_ON_SHUTDOWN))
    except Exception as e:
        print(f"[shutdown] supervisor shutdown error: {e}", flush=True)

    if _bg_health_task:
        _bg_health_task.cancel()
        try:
            await _bg_health_task
        except Exception:
            pass
        _bg_health_task = None
    if http_client:
        await http_client.aclose()
        http_client = None
    if redis:
        try:
            await redis.close()
        except Exception:
            pass
        redis = None
    if engine:
        await engine.dispose()
        engine = None
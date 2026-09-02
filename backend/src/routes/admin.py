"""Admin API aggregator.

The routes live in focused sibling modules; this module only assembles them into the single
``router`` that ``main.py`` mounts under ``/admin`` and re-exports the helpers other code
imports from ``routes.admin``.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter
from passlib.context import CryptContext

from ._admin_common import _get_session, _get_http_client  # noqa: F401  (re-exported)
from .admin_system import (  # noqa: F401  (re-exported)
    router as _system_router,
    prom_query, collect_gpu_metrics, _get_gpu_architecture, _get_offline_recommendations,
)
from .admin_usage import router as _usage_router
from .admin_upstreams import router as _upstreams_router, upstreams_health  # noqa: F401  (re-exported)
from .admin_model_metrics import (  # noqa: F401  (re-exported)
    router as _model_metrics_router,
    parse_engine_metrics, _scrape_model_metrics,
)

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

router = APIRouter()
router.include_router(_system_router)
router.include_router(_usage_router)
router.include_router(_upstreams_router)
router.include_router(_model_metrics_router)

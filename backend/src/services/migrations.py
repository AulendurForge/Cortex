"""Run Alembic migrations at startup (called in a worker thread).

Databases created before Alembic was introduced (via ``create_all``) have the
``models`` table but no ``alembic_version`` table; they are stamped at the
baseline revision first so the later migrations apply cleanly.
"""
from __future__ import annotations

import asyncio
import logging
import os

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

logger = logging.getLogger(__name__)

BASELINE_REVISION = "0001_baseline"


def _alembic_config(database_url: str) -> Config:
    here = os.path.dirname(os.path.abspath(__file__))
    cfg = Config()
    cfg.set_main_option("script_location", os.path.abspath(os.path.join(here, "..", "..", "alembic")))
    cfg.set_main_option("sqlalchemy.url", database_url)
    cfg.attributes["configure_logger"] = False
    return cfg


async def _table_state(database_url: str) -> tuple[bool, bool]:
    engine = create_async_engine(database_url)
    try:
        async with engine.connect() as conn:
            rows = await conn.execute(text(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema()"
            ))
            tables = {r[0] for r in rows}
    finally:
        await engine.dispose()
    return "alembic_version" in tables, "models" in tables


def run_migrations(database_url: str) -> None:
    """Upgrade the schema to head. Safe to call on every startup."""
    has_version, has_models = asyncio.run(_table_state(database_url))
    cfg = _alembic_config(database_url)
    if has_models and not has_version:
        logger.warning("Pre-Alembic database detected; stamping baseline revision %s", BASELINE_REVISION)
        command.stamp(cfg, BASELINE_REVISION)
    command.upgrade(cfg, "head")
    logger.info("Database schema is at head")

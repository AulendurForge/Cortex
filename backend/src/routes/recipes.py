"""Recipes: named snapshots of a model configuration (all engine fields as JSON)."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any, List

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import delete, select

from ..models import Model, Recipe
from ..schemas.recipes import CreateRecipeRequest, RecipeDetail, RecipeFromModelRequest, RecipeItem, UpdateRecipeRequest
from ..services.model_config import (
    NON_COLUMN_REQUEST_FIELDS, ModelConfigError, clear_other_engine_fields, config_snapshot, normalize_gpu_fields,
    validate_custom_startup,
)
from ..services.request_defaults import SAMPLING_FIELDS, build_request_defaults_json, split_request_defaults
from ..engines.spec import FIELD_BY_NAME

router = APIRouter()


def _session_factory():
    from ..main import SessionLocal  # type: ignore
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    return SessionLocal


def _item(r: Recipe) -> RecipeItem:
    return RecipeItem(id=r.id, name=r.name, description=r.description, model_id=r.model_id, model_name=r.model_name,
                      served_model_name=r.served_model_name, task=r.task, engine_type=r.engine_type, mode=r.mode,
                      created_at=r.created_at, updated_at=r.updated_at)


def _detail(r: Recipe) -> RecipeDetail:
    try:
        cfg = json.loads(r.config_json or "{}")
    except ValueError:
        cfg = {}
    cfg.pop("hf_token", None)
    sampling, extras = split_request_defaults(cfg.get("request_defaults_json"))
    for k in SAMPLING_FIELDS:
        cfg[k] = sampling.get(k)
    cfg["custom_request_json"] = json.dumps(extras) if extras else None
    return RecipeDetail(**_item(r).model_dump(), repo_id=r.repo_id, local_path=r.local_path, config=cfg)


def _config_from_request(body: CreateRecipeRequest) -> dict[str, Any]:
    values = body.model_dump(exclude=set(NON_COLUMN_REQUEST_FIELDS) | {"recipe_name", "description", "name", "served_model_name",
                                                                        "repo_id", "local_path", "task", "engine_type", "hf_token"})
    values = clear_other_engine_fields(values, body.engine_type)
    try:
        validate_custom_startup(values)
        normalize_gpu_fields(values, body.engine_type, None)
    except ModelConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    sampling = {f: values.pop(f, None) for f in SAMPLING_FIELDS}
    values["request_defaults_json"] = build_request_defaults_json(sampling, body.custom_request_json, existing_json=values.get("request_defaults_json"))
    return {k: v for k, v in values.items() if k in FIELD_BY_NAME and v is not None}


@router.get("/recipes", response_model=List[RecipeItem])
async def list_recipes(engine_type: str | None = Query(None), q: str | None = Query(None)):
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        stmt = select(Recipe).order_by(Recipe.updated_at.desc())
        if engine_type:
            stmt = stmt.where(Recipe.engine_type == engine_type)
        rows = (await session.execute(stmt)).scalars().all()
        if q:
            ql = q.lower()
            rows = [r for r in rows if ql in r.name.lower() or ql in (r.description or "").lower() or ql in r.model_name.lower()]
        return [_item(r) for r in rows]


@router.post("/recipes", response_model=RecipeDetail)
async def create_recipe(body: CreateRecipeRequest):
    if not body.recipe_name.strip():
        raise HTTPException(status_code=400, detail="recipe_name_required")
    if body.engine_type not in ("vllm", "llamacpp"):
        raise HTTPException(status_code=400, detail="invalid_engine_type")
    cfg = _config_from_request(body)
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        if (await session.execute(select(Recipe.id).where(Recipe.name == body.recipe_name))).first():
            raise HTTPException(status_code=409, detail="recipe_name_exists")
        r = Recipe(name=body.recipe_name, description=body.description, model_name=body.name or body.recipe_name,
                   served_model_name=body.served_model_name or body.recipe_name, task=body.task, engine_type=body.engine_type,
                   mode=body.mode, repo_id=body.repo_id, local_path=body.local_path, config_json=json.dumps(cfg))
        session.add(r)
        await session.commit()
        await session.refresh(r)
        return _detail(r)


@router.get("/recipes/{recipe_id}", response_model=RecipeDetail)
async def get_recipe(recipe_id: int):
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        r = (await session.execute(select(Recipe).where(Recipe.id == recipe_id))).scalar_one_or_none()
        if not r:
            raise HTTPException(status_code=404, detail="not_found")
        return _detail(r)


@router.patch("/recipes/{recipe_id}", response_model=RecipeDetail)
async def update_recipe(recipe_id: int, body: UpdateRecipeRequest):
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        r = (await session.execute(select(Recipe).where(Recipe.id == recipe_id))).scalar_one_or_none()
        if not r:
            raise HTTPException(status_code=404, detail="not_found")
        if body.recipe_name is not None:
            dup = (await session.execute(select(Recipe.id).where(Recipe.name == body.recipe_name, Recipe.id != recipe_id))).first()
            if dup:
                raise HTTPException(status_code=409, detail="recipe_name_exists")
            r.name = body.recipe_name
        if body.description is not None:
            r.description = body.description
        if body.config is not None:
            cfg = {k: v for k, v in body.config.items() if k in FIELD_BY_NAME}
            cfg = clear_other_engine_fields(cfg, r.engine_type)
            try:
                validate_custom_startup(cfg)
            except ModelConfigError as e:
                raise HTTPException(status_code=400, detail=str(e))
            r.config_json = json.dumps(cfg)
        r.updated_at = datetime.utcnow()
        await session.commit()
        await session.refresh(r)
        return _detail(r)


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: int):
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        res = await session.execute(delete(Recipe).where(Recipe.id == recipe_id))
        await session.commit()
        if not res.rowcount:
            raise HTTPException(status_code=404, detail="not_found")
        return {"status": "deleted"}


@router.post("/recipes/from-model/{model_id}", response_model=RecipeDetail)
async def create_recipe_from_model(model_id: int, body: RecipeFromModelRequest):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Recipe name is required")
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        m = (await session.execute(select(Model).where(Model.id == model_id))).scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="Model not found")
        if (await session.execute(select(Recipe.id).where(Recipe.name == body.name))).first():
            raise HTTPException(status_code=409, detail="Recipe name already exists")
        cfg = {k: v for k, v in config_snapshot(m).items() if v is not None}
        r = Recipe(name=body.name, description=body.description, model_id=m.id, model_name=m.name,
                   served_model_name=m.served_model_name, task=m.task, engine_type=m.engine_type,
                   mode="online" if m.repo_id else "offline", repo_id=m.repo_id, local_path=m.local_path,
                   config_json=json.dumps(cfg))
        session.add(r)
        await session.commit()
        await session.refresh(r)
        return _detail(r)

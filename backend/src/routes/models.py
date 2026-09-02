"""Model management endpoints (CRUD, lifecycle, dry-run, folder inspection)."""
from __future__ import annotations

import asyncio
import logging
import os
import time
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select

from .. import docker_manager as dm
from ..auth import require_admin
from ..config import get_settings
from ..engines import ConfigError, get_adapter, spec_as_json
from ..engines.base import safe_host_path
from ..models import Model
from ..schemas.models import (
    BaseDirCfg, CreateModelRequest, DryRunRequest, HfConfigResp, InspectFolderResp, ModelItem, UpdateModelRequest,
)
from ..services.folder_inspector import inspect_model_folder
from ..services.hf_inspector import fetch_hf_config
from ..services.model_config import (
    NON_COLUMN_REQUEST_FIELDS, ModelConfigError, clear_other_engine_fields, column_values, model_to_item,
    normalize_gpu_fields, serialize_selected_gpus, transient_model, validate_custom_startup,
)
from ..services.model_supervisor import SupervisorError, supervisor
from ..services.model_testing import ModelTestResult, ReadinessResp, test_chat_model, test_embedding_model
from ..services.request_defaults import SAMPLING_FIELDS, build_request_defaults_json, split_request_defaults
from ..services.startup_diagnostics import diagnose_startup_failure, extract_startup_summary

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(require_admin)])


def _session_factory():
    from ..main import SessionLocal  # type: ignore
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    return SessionLocal


def _raise(e: SupervisorError) -> None:
    raise HTTPException(status_code=e.status_code, detail=e.detail)


async def _load(session, model_id: int) -> Model:
    m = (await session.execute(select(Model).where(Model.id == model_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="not_found")
    return m


# ---------------------------------------------------------------------------
# Engine spec (drives the frontend's advanced sections and validation)
# ---------------------------------------------------------------------------

@router.get("/engines/spec")
async def engines_spec():
    s = get_settings()
    out = spec_as_json()
    out["images"] = {"vllm": s.VLLM_IMAGE, "llamacpp": s.LLAMACPP_IMAGE}
    out["policies"] = {"gguf_engine": "llamacpp"}
    return out


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.get("/models", response_model=List[ModelItem])
async def list_models():
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        rows = (await session.execute(select(Model).order_by(Model.id.asc()))).scalars().all()
        return [model_to_item(r) for r in rows]


def _is_gguf_path(path: str | None) -> bool:
    return bool(path) and str(path).lower().endswith(".gguf")


def _prepare_create_values(body: CreateModelRequest) -> dict[str, Any]:
    if body.mode not in ("online", "offline"):
        raise HTTPException(status_code=400, detail="invalid_mode")
    if body.mode == "online" and not body.repo_id:
        raise HTTPException(status_code=400, detail="repo_id_required")
    if body.mode == "offline" and not body.local_path:
        raise HTTPException(status_code=400, detail="local_path_required")
    if body.engine_type not in ("vllm", "llamacpp"):
        raise HTTPException(status_code=400, detail="invalid_engine_type")
    if body.engine_type == "llamacpp":
        if body.mode != "offline" or not body.local_path:
            raise HTTPException(status_code=400, detail="llamacpp requires offline mode with a local GGUF path")
    if body.engine_type == "vllm" and _is_gguf_path(body.local_path):
        raise HTTPException(
            status_code=400,
            detail="gguf_requires_llamacpp: GGUF files are served by llama.cpp. vLLM's GGUF loader is an "
                   "out-of-tree plugin that is not included in the official image.",
        )
    if body.local_path:
        try:
            safe_host_path(get_settings().CORTEX_MODELS_DIR, body.local_path)
        except ConfigError as e:
            raise HTTPException(status_code=400, detail=str(e))

    values = body.model_dump(exclude=set(NON_COLUMN_REQUEST_FIELDS))
    values = clear_other_engine_fields(values, body.engine_type)
    try:
        validate_custom_startup(values)
        normalize_gpu_fields(values, body.engine_type, None)
    except ModelConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if body.engine_type == "vllm" and values.get("tp_size") is None:
        values["tp_size"] = 1

    sampling = {f: values.pop(f, None) for f in SAMPLING_FIELDS}
    values["request_defaults_json"] = build_request_defaults_json(
        sampling, body.custom_request_json, existing_json=values.get("request_defaults_json")
    )
    values["selected_gpus"] = serialize_selected_gpus(values.get("selected_gpus"))
    if not (values.get("hf_token") or "").strip():
        values["hf_token"] = None
    return column_values(values)


@router.post("/models")
async def create_model(body: CreateModelRequest):
    values = _prepare_create_values(body)
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        dup = (await session.execute(select(Model.id).where(Model.served_model_name == body.served_model_name))).first()
        if dup:
            raise HTTPException(status_code=409, detail=f"served_model_name '{body.served_model_name}' already exists")
        m = Model(**values, state="stopped")
        session.add(m)
        await session.commit()
        return {"id": m.id}


@router.patch("/models/{model_id}")
async def update_model(model_id: int, body: UpdateModelRequest):
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        m = await _load(session, model_id)
        update_data = body.model_dump(exclude_unset=True)
        engine_type = m.engine_type or "vllm"

        if "hf_token" in update_data and not str(update_data.get("hf_token") or "").strip():
            update_data.pop("hf_token")
        if "served_model_name" in update_data and update_data["served_model_name"] != m.served_model_name:
            dup = (await session.execute(select(Model.id).where(Model.served_model_name == update_data["served_model_name"], Model.id != model_id))).first()
            if dup:
                raise HTTPException(status_code=409, detail="served_model_name already exists")
            if m.state in ("starting", "loading", "running"):
                raise HTTPException(status_code=409, detail="stop the model before renaming its served name")

        update_data = clear_other_engine_fields(update_data, engine_type, drop=True)

        custom_json = update_data.pop("custom_request_json", None)
        custom_provided = custom_json is not None and str(custom_json).strip() != ""
        sampling_updates = {f: update_data.pop(f) for f in SAMPLING_FIELDS if f in update_data}
        if sampling_updates or custom_provided or "request_defaults_json" in update_data:
            existing = update_data.get("request_defaults_json", m.request_defaults_json)
            update_data["request_defaults_json"] = build_request_defaults_json(
                sampling_updates, custom_json if custom_provided else None, existing_json=existing, clear_none=True,
            )
        try:
            validate_custom_startup({**{"engine_startup_args_json": m.engine_startup_args_json, "engine_startup_env_json": m.engine_startup_env_json}, **update_data})
            normalize_gpu_fields(update_data, engine_type, m)
        except ModelConfigError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if "selected_gpus" in update_data:
            update_data["selected_gpus"] = serialize_selected_gpus(update_data["selected_gpus"])

        update_data = column_values(update_data)
        if update_data:
            update_data["updated_at"] = datetime.utcnow()
            for field, value in update_data.items():
                setattr(m, field, value)
            await session.commit()
        return {"status": "ok"}


@router.post("/models/{model_id}/archive")
async def archive_model(model_id: int):
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        m = await _load(session, model_id)
        m.archived = True
        await session.commit()
        return {"status": "archived"}


@router.delete("/models/{model_id}")
async def delete_model(model_id: int):
    """Delete the model record (and its recipes). Model files are never touched."""
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        await _load(session, model_id)
    try:
        await supervisor.delete_cleanup(model_id)
    except SupervisorError as e:
        _raise(e)
    async with SessionLocal() as session:
        from ..models import Recipe
        res = await session.execute(delete(Recipe).where(Recipe.model_id == model_id))
        recipes_deleted = res.rowcount or 0
        await session.execute(delete(Model).where(Model.id == model_id))
        await session.commit()
    note = "Model files remain on disk - delete manually if needed"
    if recipes_deleted:
        note = f"{recipes_deleted} associated recipe(s) also deleted. " + note
    return {"status": "deleted", "files_preserved": True, "recipes_deleted": recipes_deleted, "note": note}


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

@router.post("/models/{model_id}/start")
async def start_model(model_id: int):
    try:
        return await supervisor.launch(model_id)
    except SupervisorError as e:
        _raise(e)


@router.post("/models/{model_id}/stop")
async def stop_model(model_id: int):
    try:
        return await supervisor.stop(model_id)
    except SupervisorError as e:
        _raise(e)


@router.post("/models/{model_id}/apply")
async def apply_model_changes(model_id: int):
    """Restart a running model with its saved configuration; a stopped model just reports saved."""
    try:
        return await supervisor.apply(model_id)
    except SupervisorError as e:
        _raise(e)


@router.get("/models/{model_id}/readiness", response_model=ReadinessResp)
async def model_readiness(model_id: int):
    try:
        r = await supervisor.readiness(model_id)
    except SupervisorError as e:
        _raise(e)
    return ReadinessResp(**r)


@router.get("/models/{model_id}/logs")
async def model_logs(model_id: int, diagnose: bool = False, tail: int = Query(1000, ge=10, le=20000)):
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        m = await _load(session, model_id)
    logs = await asyncio.to_thread(dm.tail_logs_for_model, m, tail)
    if not diagnose:
        return logs
    diagnosis = None
    if m.state == "failed" or "ERROR" in logs.upper():
        diagnosis = diagnose_startup_failure(logs)
    summary = extract_startup_summary(logs) if "Model loading took" in logs else None
    return {
        "logs": logs,
        "diagnosis": diagnosis.dict() if diagnosis else None,
        "summary": summary,
        "state": m.state,
        "state_reason": m.state_reason,
    }


# ---------------------------------------------------------------------------
# Dry run (saved model or unsaved form values)
# ---------------------------------------------------------------------------

async def _dry_run(m: Model) -> dict[str, Any]:
    from ..services.config_validator import validate_model_config
    settings = get_settings()
    adapter = get_adapter(m.engine_type)
    issues = [i.as_dict() for i in adapter.validate(m, settings)]
    command: list[str] = []
    env: dict[str, str] = {}
    try:
        plan = adapter.plan(m, settings, None)
        command = plan.redacted_args()
        env = plan.redacted_env()
    except ConfigError as e:
        issues.append({"severity": "error", "field": None, "message": str(e), "fix": None})
    extra = await validate_model_config(m)
    warnings = [{"severity": w.severity, "category": w.category, "title": w.title, "message": w.message, "fix": w.fix} for w in extra.warnings]
    warnings += [{"severity": i["severity"], "category": "config", "title": i.get("field") or "Configuration", "message": i["message"], "fix": i.get("fix")} for i in issues]
    image = adapter.image(m, settings)
    cached = await asyncio.to_thread(dm.image_is_cached, image)
    if not cached:
        warnings.append({"severity": "warning", "category": "image", "title": "Engine image not cached",
                         "message": f"{image} will be pulled on first start (or fail in offline mode)", "fix": "Pre-load the image"})
    has_errors = any(w["severity"] == "error" for w in warnings)
    return {
        "command": command,
        "command_str": " ".join(command),
        "env": env,
        "image": image,
        "image_cached": cached,
        "valid": not has_errors,
        "warnings": warnings,
        "vram_estimate": extra.vram_estimate,
    }


@router.post("/models/dry-run")
async def model_dry_run_unsaved(body: DryRunRequest):
    """Validate form values before saving. ``model_id`` merges the values over an existing model."""
    SessionLocal = _session_factory()
    base = None
    if body.model_id:
        async with SessionLocal() as session:
            base = await _load(session, body.model_id)
    raw = body.model_dump(exclude_unset=True, exclude={"model_id", "mode", "hf_offline"})
    engine_type = raw.get("engine_type") or (base.engine_type if base else "vllm")
    raw = clear_other_engine_fields(raw, engine_type)
    sampling = {f: raw.pop(f, None) for f in SAMPLING_FIELDS}
    custom_json = raw.pop("custom_request_json", None)
    raw["request_defaults_json"] = build_request_defaults_json(sampling, custom_json, existing_json=raw.get("request_defaults_json") or (base.request_defaults_json if base else None))
    try:
        validate_custom_startup(raw)
        normalize_gpu_fields(raw, engine_type, base)
    except ModelConfigError as e:
        return {"command": [], "command_str": "", "valid": False, "warnings": [{"severity": "error", "category": "config", "title": "Configuration", "message": str(e), "fix": None}], "vram_estimate": None}
    m = transient_model(raw, base)
    m.engine_type = engine_type
    if not m.name:
        m.name = base.name if base else "unsaved"
    if not m.served_model_name:
        m.served_model_name = base.served_model_name if base else "unsaved"
    return await _dry_run(m)


@router.post("/models/{model_id}/dry-run")
async def model_dry_run(model_id: int):
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        m = await _load(session, model_id)
    return await _dry_run(m)


# ---------------------------------------------------------------------------
# Folder browsing (always rooted at CORTEX_MODELS_DIR)
# ---------------------------------------------------------------------------

@router.get("/models/base-dir", response_model=BaseDirCfg)
async def get_base_dir():
    s = get_settings()
    return BaseDirCfg(base_dir=s.CORTEX_MODELS_DIR_HOST or s.CORTEX_MODELS_DIR)


@router.put("/models/base-dir")
async def put_base_dir(body: BaseDirCfg):
    raise HTTPException(
        status_code=400,
        detail="The models directory is fixed by CORTEX_MODELS_DIR (mounted into the gateway and engine containers). "
               "Change it in the environment / compose file and restart.",
    )


def _list_dirs(base: str) -> list[str]:
    try:
        return sorted(n for n in os.listdir(base) if os.path.isdir(os.path.join(base, n)) and not n.startswith("."))
    except OSError:
        return []


@router.get("/models/local-folders", response_model=List[str])
async def list_local_folders(base: str = Query("")):
    s = get_settings()
    return await asyncio.to_thread(_list_dirs, s.CORTEX_MODELS_DIR)


@router.get("/models/inspect-folder", response_model=InspectFolderResp)
async def inspect_folder(base: str = Query(""), folder: str = Query("")):
    s = get_settings()
    if not folder:
        raise HTTPException(status_code=400, detail="folder_required")
    try:
        target = safe_host_path(s.CORTEX_MODELS_DIR, folder)
    except ConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not os.path.isdir(target):
        raise HTTPException(status_code=404, detail="folder_not_found")
    return await asyncio.to_thread(inspect_model_folder, target)


@router.get("/models/hf-config", response_model=HfConfigResp)
async def hf_config(repo_id: str = Query("")):
    if not repo_id:
        raise HTTPException(status_code=400, detail="repo_id_required")
    return await fetch_hf_config(repo_id)


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------

@router.post("/models/{model_id}/test", response_model=ModelTestResult)
async def test_model(model_id: int):
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        m = await _load(session, model_id)
    if m.state != "running":
        raise HTTPException(status_code=400, detail=f"Model is not running (current state: {m.state})")
    base_url = await supervisor.model_url(m)
    test_type = "embeddings" if (m.task or "").lower().startswith("embed") else "chat"
    start = time.time()
    result_data: dict[str, Any] = {}
    try:
        key = get_settings().INTERNAL_VLLM_API_KEY
        if test_type == "embeddings":
            result_data = await test_embedding_model(base_url, m.served_model_name, key)
        else:
            result_data = await test_chat_model(base_url, m.served_model_name, key)
        return ModelTestResult(success=True, test_type=test_type, request=result_data["request"], response=result_data["response"],
                               error=None, latency_ms=int((time.time() - start) * 1000), timestamp=time.time())
    except Exception as e:
        return ModelTestResult(success=False, test_type=test_type, request=result_data.get("request", {}) if result_data else {},
                               response=None, error=str(e)[:500], latency_ms=int((time.time() - start) * 1000), timestamp=time.time())

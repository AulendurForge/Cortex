"""Transfer bundles: export engine images / models / the program to a mounted drive and import them
on an air-gapped host. See services/bundles.py for the on-disk format."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..services import bundles as svc
from ..services import deployment_manager as dm

router = APIRouter(prefix="/bundles", tags=["bundles"])


class ExportPlanRequest(BaseModel):
    destination: str = Field(..., description="Absolute container path inside a transfer location")
    name: str = ""
    image_refs: list[str] = []
    include_infra_images: bool = False
    include_program_images: bool = False
    model_ids: list[int] = []
    include_model_files: bool = True
    include_db_dump: bool = False
    pull_missing: bool = True
    notes: str = ""


class ImportStartRequest(BaseModel):
    path: str
    load_images: bool = True
    image_refs: list[str] | None = None
    import_models: bool = True
    served_model_names: list[str] | None = None
    copy_files: bool = True
    conflict: str = "rename"
    verify_checksums: bool = False


def _bad(e: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(e))


@router.get("/locations")
async def locations():
    """Transfer roots (exports dir, mounted drives) with free space and bundles found in them."""
    return svc.list_locations()


@router.get("/images")
async def images():
    """Engine/infra/program images an export may include, with local cache state."""
    try:
        return await svc.list_images()
    except svc.BundleError as e:
        raise _bad(e)


@router.post("/plan")
async def plan(req: ExportPlanRequest):
    try:
        return await svc.plan_export(svc.ExportRequest(**req.model_dump()))
    except svc.BundleError as e:
        raise _bad(e)


@router.post("/export")
async def export(req: ExportPlanRequest):
    try:
        return await svc.start_export(svc.ExportRequest(**req.model_dump()))
    except svc.BundleError as e:
        raise _bad(e)


@router.get("/scan")
async def scan(path: str, verify: bool = False):
    try:
        return await svc.scan_bundle(path, verify_checksums=verify)
    except svc.BundleError as e:
        raise _bad(e)


@router.post("/import")
async def start_import(req: ImportStartRequest):
    try:
        return await svc.start_import(svc.ImportRequest(**req.model_dump()))
    except svc.BundleError as e:
        raise _bad(e)


@router.get("/status")
async def status():
    """Current/latest transfer job (shared with the database restore job store)."""
    return {"job": svc.job_status()}


@router.post("/cancel")
async def cancel():
    job = dm._get_current_job()
    if not job or job.status not in ("running", "pending"):
        raise HTTPException(status_code=400, detail="no_running_job")
    try:
        return await dm.cancel_job(job.id)
    except RuntimeError as e:
        raise _bad(e)

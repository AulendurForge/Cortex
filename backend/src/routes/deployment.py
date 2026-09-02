from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_admin
from ..services.deployment_manager import (
    get_job_status,
    get_job_history,
    get_job_by_id,
    cancel_job,
    check_database_dump_exists,
    start_database_restore,
)


router = APIRouter()


class DatabaseRestoreRequest(BaseModel):
    output_dir: str
    backup_first: bool = True  # Create safety backup before restore
    drop_existing: bool = False  # Drop existing tables before restore


@router.get("/deployment/status")
async def deployment_status(_: dict = Depends(require_admin)):
    """Get the current/latest job status."""
    return await get_job_status()


@router.get("/deployment/jobs")
async def deployment_jobs(limit: int = 20, _: dict = Depends(require_admin)):
    """Get recent job history.
    
    Returns a list of jobs sorted by most recent first.
    Use limit parameter to control how many jobs to return (default: 20, max: 50).
    """
    limit = max(1, min(50, limit))
    return {"jobs": await get_job_history(limit)}


@router.get("/deployment/jobs/{job_id}")
async def deployment_job_by_id(job_id: str, _: dict = Depends(require_admin)):
    """Get a specific job by ID."""
    result = await get_job_by_id(job_id)
    if not result:
        raise HTTPException(status_code=404, detail="job_not_found")
    return result


@router.delete("/deployment/jobs/{job_id}")
async def deployment_cancel_job(job_id: str, _: dict = Depends(require_admin)):
    """Cancel a running or pending job.
    
    Returns the job status after cancellation request.
    Note: Cancellation is cooperative - long-running operations may take time to stop.
    """
    try:
        return await cancel_job(job_id)
    except RuntimeError as e:
        msg = str(e)
        if msg == "job_not_found":
            raise HTTPException(status_code=404, detail=msg)
        if msg == "job_not_cancellable":
            raise HTTPException(status_code=400, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


# ============================================================================
# Database Restore Endpoints (GAP-D1)
# ============================================================================

@router.get("/deployment/database-dump")
async def deployment_database_dump_info(output_dir: str, _: dict = Depends(require_admin)):
    """Check if a database dump exists in the export directory."""
    if not output_dir:
        raise HTTPException(status_code=400, detail="output_dir_required")
    if not output_dir.startswith("/"):
        raise HTTPException(status_code=400, detail="output_dir_must_be_absolute")
    return check_database_dump_exists(output_dir)


@router.post("/deployment/restore-database")
async def deployment_restore_database(req: DatabaseRestoreRequest, _: dict = Depends(require_admin)):
    """Restore database from an exported pg_dump file.
    
    This operation:
    1. Optionally creates a backup of the current database (safety net)
    2. Optionally drops existing tables (for clean restore)
    3. Executes the pg_dump restore via psql
    4. Verifies the restore completed successfully
    
    WARNING: This is a destructive operation. Use with caution.
    """
    if not req.output_dir:
        raise HTTPException(status_code=400, detail="output_dir_required")
    if not req.output_dir.startswith("/"):
        raise HTTPException(status_code=400, detail="output_dir_must_be_absolute")
    
    # Verify dump exists before starting job
    dump_info = check_database_dump_exists(req.output_dir)
    if not dump_info.get("exists"):
        raise HTTPException(status_code=404, detail="database_dump_not_found")
    
    try:
        return await start_database_restore(
            output_dir=req.output_dir,
            backup_first=req.backup_first,
            drop_existing=req.drop_existing,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))



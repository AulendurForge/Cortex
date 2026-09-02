"""Deployment and migration helpers (online -> offline packaging).

This module provides a safe, admin-triggerable way to generate an offline
deployment package from a running Cortex instance.

Goals:
- Export required Docker images (gateway/frontend + engines + infra)
- Export database snapshot (pg_dump from postgres container)
- Export runtime manifests/config (models, registry, settings hints)
- Optionally archive model weights and HF cache directories

Security:
- Does NOT execute arbitrary commands; only fixed operations.
- Requires admin auth at the route layer.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from dataclasses import dataclass, asdict
from typing import Any, Dict, List

import docker



@dataclass
class DeploymentJob:
    id: str
    status: str  # pending | running | completed | failed | cancelled
    started_at: float
    finished_at: float | None = None
    step: str = ""
    progress: float = 0.0  # 0..1 best-effort
    logs: List[str] | None = None
    output_dir: str = ""
    artifacts: Dict[str, Any] | None = None
    error: str | None = None
    job_type: str = "export"  # export | model_export | db_restore
    cancelled: bool = False  # Flag to signal cancellation
    # Size tracking (GAP-D9)
    estimated_size_bytes: int = 0  # Total estimated bytes to process
    bytes_written: int = 0  # Bytes written so far
    eta_seconds: float | None = None  # Estimated time remaining


# Job history storage - keeps last N jobs
_JOBS: Dict[str, DeploymentJob] = {}
_JOB_HISTORY_MAX = 50  # Keep last 50 jobs
_CURRENT_JOB_ID: str | None = None
_LOCK = asyncio.Lock()


def _get_current_job() -> DeploymentJob | None:
    """Get the current/latest job (backward compatibility helper)."""
    return _JOBS.get(_CURRENT_JOB_ID) if _CURRENT_JOB_ID else None


def _prune_job_history() -> None:
    """Remove old jobs to stay within history limit."""
    if len(_JOBS) <= _JOB_HISTORY_MAX:
        return
    # Sort by started_at and keep most recent
    sorted_ids = sorted(_JOBS.keys(), key=lambda k: _JOBS[k].started_at, reverse=True)
    for job_id in sorted_ids[_JOB_HISTORY_MAX:]:
        if job_id != _CURRENT_JOB_ID:  # Don't delete current job
            del _JOBS[job_id]


def _add_job(job: DeploymentJob) -> None:
    """Add a new job to history."""
    global _CURRENT_JOB_ID
    _JOBS[job.id] = job
    _CURRENT_JOB_ID = job.id
    _prune_job_history()


def _now() -> float:
    return time.time()


def _ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)


def _safe_abs_dir(p: str) -> str:
    if not p:
        raise ValueError("output_dir_required")
    if not os.path.isabs(p):
        raise ValueError("output_dir_must_be_absolute")
    return os.path.abspath(p)


def _job_to_dict(job: DeploymentJob) -> Dict[str, Any]:
    d = asdict(job)
    return d


async def get_job_status() -> Dict[str, Any]:
    """Get the current/latest job status (backward compatible)."""
    async with _LOCK:
        job = _get_current_job()
        return _job_to_dict(job) if job else {"status": "idle"}


async def get_job_history(limit: int = 20) -> List[Dict[str, Any]]:
    """Get recent job history, sorted by most recent first."""
    async with _LOCK:
        sorted_jobs = sorted(_JOBS.values(), key=lambda j: j.started_at, reverse=True)
        return [_job_to_dict(j) for j in sorted_jobs[:limit]]


async def get_job_by_id(job_id: str) -> Dict[str, Any] | None:
    """Get a specific job by ID."""
    async with _LOCK:
        job = _JOBS.get(job_id)
        return _job_to_dict(job) if job else None


async def cancel_job(job_id: str) -> Dict[str, Any]:
    """Request cancellation of a running job.
    
    Returns the job status after cancellation request.
    Note: Cancellation is cooperative - the job must check the cancelled flag.
    """
    async with _LOCK:
        job = _JOBS.get(job_id)
        if not job:
            raise RuntimeError("job_not_found")
        if job.status not in ("running", "pending"):
            raise RuntimeError("job_not_cancellable")
        
        job.cancelled = True
        job.status = "cancelled"
        job.finished_at = _now()
        job.step = "cancelled"
        if job.logs is None:
            job.logs = []
        job.logs.append("Job cancelled by user request")
        
        return _job_to_dict(job)


async def _export_postgres_dump(*, db_path: str, log) -> None:
    """Exec pg_dump inside the postgres container (compose), in a worker thread."""
    await asyncio.to_thread(_export_postgres_dump_sync, db_path=db_path, log=log)


def _export_postgres_dump_sync(*, db_path: str, log) -> None:
    cli = docker.from_env()
    # Find postgres container (best-effort)
    candidates = []
    try:
        candidates = cli.containers.list(all=True, filters={"label": ["com.docker.compose.project=cortex"]})
    except Exception:
        candidates = cli.containers.list(all=True)
    pg = None
    for c in candidates:
        try:
            labels = c.labels or {}
            if labels.get("com.docker.compose.service") == "postgres":
                pg = c
                break
        except Exception:
            pass
    if pg is None:
        # fallback by name
        for c in candidates:
            if "postgres" in (c.name or "") and "cortex" in (c.name or ""):
                pg = c
                break
    if pg is None:
        raise RuntimeError("postgres_container_not_found")
    log(f"[db] using container: {pg.name}")
    cmd = ["pg_dump", "-U", "cortex", "-d", "cortex"]
    res = pg.exec_run(cmd, stdout=True, stderr=True, stream=True)
    # res is generator of bytes; write stdout/stderr mixed
    _ensure_dir(os.path.dirname(db_path))
    with open(db_path, "wb") as f:
        for chunk in res.output:  # type: ignore
            if chunk:
                f.write(chunk)
    log(f"[db] wrote dump: {db_path}")


def _find_postgres_container():
    """Find the Cortex PostgreSQL container."""
    cli = docker.from_env()
    candidates = []
    try:
        candidates = cli.containers.list(all=True, filters={"label": ["com.docker.compose.project=cortex"]})
    except Exception:
        candidates = cli.containers.list(all=True)
    
    # First try by compose service label
    for c in candidates:
        try:
            labels = c.labels or {}
            if labels.get("com.docker.compose.service") == "postgres":
                return c
        except Exception:
            pass
    
    # Fallback by name
    for c in candidates:
        if "postgres" in (c.name or "") and "cortex" in (c.name or ""):
            return c
    
    return None


def check_database_dump_exists(output_dir: str) -> dict:
    """Check if a database dump exists in the export directory.
    
    Returns dict with: exists, path, size_bytes, created_at (if available)
    """
    out = _safe_abs_dir(output_dir)
    db_path = os.path.join(out, "db", "cortex.sql")
    
    if not os.path.isfile(db_path):
        return {"exists": False, "path": db_path, "error": "dump_not_found"}
    
    stat = os.stat(db_path)
    return {
        "exists": True,
        "path": db_path,
        "size_bytes": stat.st_size,
        "modified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(stat.st_mtime)),
    }


async def start_database_restore(
    *,
    output_dir: str,
    backup_first: bool = True,
    drop_existing: bool = False,
) -> Dict[str, Any]:
    """Start a background database restore job.
    
    Args:
        output_dir: Directory containing db/cortex.sql
        backup_first: Create a backup before restoring (safety net)
        drop_existing: If True, drop existing tables before restore
        
    Returns:
        Job status dict
    """
    out = _safe_abs_dir(output_dir)
    job_id = f"db-restore-{int(_now())}"
    
    async with _LOCK:
        global _CURRENT_JOB_ID
        current = _get_current_job()
        if current and current.status in ("running", "pending"):
            return _job_to_dict(current)
        job = DeploymentJob(
            id=job_id,
            status="pending",
            started_at=_now(),
            logs=[],
            output_dir=out,
            artifacts={},
            job_type="db_restore",
        )
        _add_job(job)
        asyncio.create_task(
            _run_database_restore_job(
                job_id=job_id,
                backup_first=backup_first,
                drop_existing=drop_existing,
            )
        )
        return _job_to_dict(job)


async def _run_database_restore_job(
    *,
    job_id: str,
    backup_first: bool,
    drop_existing: bool,
) -> None:
    """Execute the database restore operation."""
    job = _JOBS.get(job_id)
    if not job:
        return
    
    async with _LOCK:
        job.status = "running"
        job.step = "initializing"
        job.progress = 0.02
    
    try:
        output_dir = job.output_dir
        artifacts: Dict[str, Any] = {}
        
        def log(msg: str) -> None:
            try:
                job.logs = (job.logs or []) + [msg]
                if len(job.logs) > 300:
                    job.logs = job.logs[-300:]
            except Exception:
                pass
            try:
                _write_restore_status_file()
            except Exception:
                pass
        
        def set_step(step: str, progress: float) -> None:
            job.step = step
            job.progress = max(0.0, min(1.0, float(progress)))
            _write_restore_status_file()
        
        def _write_restore_status_file() -> None:
            path = os.path.join(job.output_dir, "restore_status.json")
            try:
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(_job_to_dict(job), f, indent=2)
            except Exception:
                pass
        
        # Validate dump file exists
        set_step("validating_dump", 0.05)
        db_path = os.path.join(output_dir, "db", "cortex.sql")
        if not os.path.isfile(db_path):
            raise RuntimeError(f"Database dump not found: {db_path}")
        log(f"Found database dump: {db_path}")
        
        # Find postgres container
        set_step("finding_postgres", 0.10)
        pg = _find_postgres_container()
        if pg is None:
            raise RuntimeError("postgres_container_not_found")
        log(f"Using postgres container: {pg.name}")
        
        # Optional: backup current database first
        if backup_first:
            set_step("backing_up_current", 0.15)
            backup_dir = os.path.join(output_dir, "db", "pre_restore_backup")
            _ensure_dir(backup_dir)
            backup_path = os.path.join(backup_dir, f"cortex_backup_{int(_now())}.sql")
            log(f"Creating safety backup: {backup_path}")
            
            cmd = ["pg_dump", "-U", "cortex", "-d", "cortex"]
            res = pg.exec_run(cmd, stdout=True, stderr=True, stream=True)
            with open(backup_path, "wb") as f:
                for chunk in res.output:  # type: ignore
                    if chunk:
                        f.write(chunk)
            log(f"Backup created: {backup_path}")
            artifacts["pre_restore_backup"] = os.path.relpath(backup_path, output_dir)
            set_step("backing_up_current", 0.30)
        
        # Read the dump file
        set_step("reading_dump", 0.35)
        with open(db_path, "r", encoding="utf-8") as f:
            dump_content = f.read()
        log(f"Read dump file: {len(dump_content)} bytes")
        
        # Strip \restrict and \unrestrict commands for compatibility
        # These are PostgreSQL 16 security features that may cause issues
        import re
        original_len = len(dump_content)
        dump_content = re.sub(r'^\\restrict\s+\S+\s*$', '', dump_content, flags=re.MULTILINE)
        dump_content = re.sub(r'^\\unrestrict\s+\S+\s*$', '', dump_content, flags=re.MULTILINE)
        if len(dump_content) != original_len:
            log("Stripped \\restrict/\\unrestrict commands for compatibility")
        
        # If drop_existing, we need to drop all tables first
        if drop_existing:
            set_step("dropping_existing", 0.40)
            log("Dropping existing tables...")
            # Get list of tables and drop them
            drop_cmd = """
            DO $$ 
            DECLARE r RECORD;
            BEGIN
                FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
                    EXECUTE 'DROP TABLE IF EXISTS public.' || quote_ident(r.tablename) || ' CASCADE';
                END LOOP;
            END $$;
            """
            res = pg.exec_run(
                ["psql", "-U", "cortex", "-d", "cortex", "-c", drop_cmd],
                stdout=True, stderr=True
            )
            output = res.output.decode("utf-8", errors="replace") if res.output else ""
            if res.exit_code != 0:
                log(f"Warning: drop tables returned exit code {res.exit_code}: {output}")
            else:
                log("Existing tables dropped")
            set_step("dropping_existing", 0.50)
        
        # Execute the restore
        set_step("restoring_database", 0.55)
        log("Restoring database from dump...")
        
        # Write cleaned dump to a temp file in the container using Docker SDK
        # We'll use put_archive to copy the file into the container
        temp_dump_path = "/tmp/cortex_restore.sql"
        
        try:
            # Create a tar archive in memory containing the SQL file
            import io
            import tarfile as tar_module
            
            # Encode dump content to bytes
            dump_bytes = dump_content.encode('utf-8')
            
            # Create tar archive in memory
            tar_stream = io.BytesIO()
            with tar_module.open(fileobj=tar_stream, mode='w') as tar:
                # Create a TarInfo for the file
                info = tar_module.TarInfo(name='cortex_restore.sql')
                info.size = len(dump_bytes)
                tar.addfile(info, io.BytesIO(dump_bytes))
            tar_stream.seek(0)
            
            # Copy to container using put_archive
            pg.put_archive('/tmp', tar_stream.getvalue())
            log(f"Copied dump to container: {temp_dump_path}")
            
            # Execute psql to restore
            set_step("restoring_database", 0.70)
            res = pg.exec_run(
                ["psql", "-U", "cortex", "-d", "cortex", "-f", temp_dump_path],
                stdout=True, stderr=True
            )
            output = res.output.decode("utf-8", errors="replace") if res.output else ""
            
            # Check for errors (psql returns 0 even with some errors, so check output)
            if res.exit_code != 0:
                log(f"Restore returned exit code {res.exit_code}")
                log(f"Output: {output[:1000]}")
                raise RuntimeError(f"psql restore failed with exit code {res.exit_code}")
            
            # Log any errors or notices
            error_lines = [l for l in output.split('\n') if 'ERROR' in l.upper()]
            if error_lines:
                for el in error_lines[:10]:
                    log(f"[psql] {el}")
                if len(error_lines) > 10:
                    log(f"... and {len(error_lines) - 10} more errors")
            else:
                log("Database restore completed successfully")
            
            # Cleanup temp file in container
            pg.exec_run(["rm", "-f", temp_dump_path])
            
        except Exception as e:
            log(f"Error during restore: {str(e)}")
            raise
        
        set_step("restoring_database", 0.90)
        
        # Verify restore by checking table count
        set_step("verifying_restore", 0.92)
        res = pg.exec_run(
            ["psql", "-U", "cortex", "-d", "cortex", "-t", "-c", 
             "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public'"],
            stdout=True, stderr=True
        )
        table_count = res.output.decode("utf-8", errors="replace").strip() if res.output else "?"
        log(f"Verification: {table_count} tables in public schema")
        artifacts["tables_restored"] = table_count
        
        # Done
        async with _LOCK:
            job.status = "completed"
            job.finished_at = _now()
            job.step = "completed"
            job.progress = 1.0
            job.artifacts = artifacts
        
        try:
            _write_restore_status_file()
        except Exception:
            pass
        
    except Exception as e:
        async with _LOCK:
            job.status = "failed"
            job.finished_at = _now()
            job.error = str(e)[:2000]
            job.step = "failed"
        try:
            path = os.path.join(job.output_dir, "restore_status.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(_job_to_dict(job), f, indent=2)
        except Exception:
            pass



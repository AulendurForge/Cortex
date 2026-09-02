"""Transfer bundles: export/import of engine images, models and the program for air-gapped hosts.

A bundle is a self-describing directory (usually on a USB drive or NAS mounted into the gateway
under one of ``CORTEX_TRANSFER_DIRS``):

    <bundle>/
      bundle.json            schema, cortex version, source host, what is inside
      images.json            [{ref, id, size_bytes, file, sha256, role}]
      images/<file>.tar      `docker save` output, one per image
      models/<served>/manifest.json   model config snapshot + file list with sha256
      models/<served>/files/<local_path tree>   raw copies (rsync-friendly, resumable)
      db/cortex.sql          optional pg_dump
      versions.env           optional copy of the pinned versions
      checksums.sha256       sha256 of every file above (except the tars' content)

The same layout is produced by scripts/prepare-offline-deployment.sh for the initial program
package, so one importer handles both.  All blocking work (docker save/load, file copies,
hashing) runs in worker threads and reports progress through the deployment job store.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import platform
import shutil
import socket
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

import docker
from sqlalchemy import select

from ..config import get_settings
from ..engines.spec import ALL_FIELDS, FIELD_BY_NAME
from ..models import Model
from . import deployment_manager as dm_jobs
from .deployment_manager import DeploymentJob, _add_job, _job_to_dict, _now
from .model_config import config_snapshot, serialize_selected_gpus

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 1
BUNDLE_FILE = "bundle.json"
IMAGES_FILE = "images.json"
CHUNK = 4 * 1024 * 1024


class BundleError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Paths / locations
# ---------------------------------------------------------------------------

def transfer_roots() -> list[str]:
    s = get_settings()
    roots = [r.strip() for r in (s.CORTEX_TRANSFER_DIRS or "").split(",") if r.strip()]
    if s.CORTEX_EXPORT_DIR and s.CORTEX_EXPORT_DIR not in roots:
        roots.insert(0, s.CORTEX_EXPORT_DIR)
    return roots


def host_path_hint(container_path: str) -> str:
    """Best-effort translation of a container path to what the admin sees on the host."""
    s = get_settings()
    mapping = [
        ("/host/media", "/media"), ("/host/mnt", "/mnt"), ("/host/run/media", "/run/media"),
        (s.CORTEX_EXPORT_DIR, s.CORTEX_EXPORT_DIR_HOST or s.CORTEX_EXPORT_DIR),
    ]
    for c, h in mapping:
        if c and (container_path == c or container_path.startswith(c.rstrip("/") + "/")):
            return h + container_path[len(c):]
    return container_path


def _is_bundle_dir(p: str) -> bool:
    return os.path.isfile(os.path.join(p, BUNDLE_FILE))


def safe_transfer_path(path: str) -> str:
    """Resolve ``path`` and require it to live under one of the transfer roots."""
    if not path or not os.path.isabs(path):
        raise BundleError("path must be absolute and inside a transfer location")
    real = os.path.realpath(path)
    for root in transfer_roots():
        rr = os.path.realpath(root)
        if real == rr or real.startswith(rr.rstrip("/") + "/"):
            return real
    raise BundleError(
        f"{path} is not inside a transfer location ({', '.join(transfer_roots())}). "
        "Mount the drive under /media or /mnt on the host, or export to the exports directory."
    )


def _disk_free(path: str) -> int:
    try:
        st = os.statvfs(path)
        return st.f_bavail * st.f_frsize
    except OSError:
        return 0


def _writable(path: str) -> bool:
    return os.path.isdir(path) and os.access(path, os.W_OK)


def list_locations() -> dict[str, Any]:
    """Transfer roots and their immediate subdirectories (mount points), with bundles found."""
    out = []
    for root in transfer_roots():
        if not os.path.isdir(root):
            out.append({"path": root, "host_path": host_path_hint(root), "exists": False, "writable": False,
                        "free_bytes": 0, "bundles": [], "children": []})
            continue
        entry = {"path": root, "host_path": host_path_hint(root), "exists": True, "writable": _writable(root),
                 "free_bytes": _disk_free(root), "bundles": [], "children": []}
        try:
            names = sorted(n for n in os.listdir(root) if not n.startswith("."))
        except OSError:
            names = []
        for n in names:
            p = os.path.join(root, n)
            if not os.path.isdir(p):
                continue
            if _is_bundle_dir(p):
                entry["bundles"].append(_bundle_summary(p))
            else:
                child = {"path": p, "host_path": host_path_hint(p), "writable": _writable(p), "free_bytes": _disk_free(p), "bundles": []}
                try:
                    for m in sorted(os.listdir(p)):
                        mp = os.path.join(p, m)
                        if os.path.isdir(mp) and _is_bundle_dir(mp):
                            child["bundles"].append(_bundle_summary(mp))
                except OSError:
                    pass
                entry["children"].append(child)
        out.append(entry)
    return {"locations": out}


def _bundle_summary(path: str) -> dict[str, Any]:
    try:
        with open(os.path.join(path, BUNDLE_FILE), encoding="utf-8") as f:
            b = json.load(f)
    except Exception as e:
        return {"path": path, "host_path": host_path_hint(path), "error": f"unreadable bundle.json: {e}"}
    c = b.get("contents", {})
    return {
        "path": path, "host_path": host_path_hint(path), "name": os.path.basename(path),
        "created_at": b.get("created_at"), "source_host": b.get("source_host"), "cortex_version": b.get("cortex_version"),
        "images": len(c.get("images", [])), "models": len(c.get("models", [])), "program": bool(c.get("program")),
        "db_dump": bool(c.get("db_dump")), "size_bytes": b.get("size_bytes"),
    }


# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------

def sanitize_image_ref(ref: str) -> str:
    return ref.replace("/", "_").replace(":", "__").replace("@", "_at_")


# docker save / load / pull of multi-GB engine images can go minutes without a byte on the wire
# (the daemon assembles the export first); the SDK's default 60 s read timeout would abort them.
_DOCKER_TIMEOUT_SEC = 6 * 3600


def _cli() -> docker.DockerClient:
    return docker.from_env(timeout=_DOCKER_TIMEOUT_SEC)


def image_info(ref: str) -> dict[str, Any] | None:
    try:
        img = _cli().images.get(ref)
    except docker.errors.ImageNotFound:
        return None
    return {"ref": ref, "id": img.id, "size_bytes": int(img.attrs.get("Size", 0)), "tags": img.tags,
            "digests": img.attrs.get("RepoDigests", [])}


def infra_image_refs() -> list[dict[str, str]]:
    s = get_settings()
    out = []
    for item in (s.CORTEX_INFRA_IMAGES or "").split(","):
        item = item.strip()
        if item:
            out.append({"ref": item, "role": "infra"})
    return out


def program_image_refs() -> list[dict[str, str]]:
    s = get_settings()
    v = s.CORTEX_VERSION or "dev"
    return [
        {"ref": f"cortex-gateway:{v}", "role": "program"},
        {"ref": f"cortex-frontend:{v}", "role": "program"},
        {"ref": f"cortex-gateway-deps:{v}", "role": "deps"},
        {"ref": f"cortex-frontend-deps:{v}", "role": "deps"},
    ]


async def list_images() -> dict[str, Any]:
    """Engine images an admin may want to ship: pinned defaults, per-model overrides, local engine images."""
    s = get_settings()
    SessionLocal = _session_factory()
    refs: dict[str, dict[str, Any]] = {}

    def add(ref: str, role: str, source: str):
        if not ref:
            return
        e = refs.setdefault(ref, {"ref": ref, "role": role, "sources": []})
        e["sources"].append(source)

    add(s.VLLM_IMAGE, "engine", "pinned default (vLLM)")
    add(s.LLAMACPP_IMAGE, "engine", "pinned default (llama.cpp)")
    async with SessionLocal() as session:
        rows = (await session.execute(select(Model.id, Model.name, Model.engine_image))).all()
    for mid, name, img in rows:
        if img:
            add(img, "engine", f"model {mid} ({name})")
    for it in infra_image_refs():
        add(it["ref"], "infra", "versions.env")
    for it in program_image_refs():
        add(it["ref"], it["role"], "built locally")

    def _local():
        local: dict[str, dict[str, Any]] = {}
        for img in _cli().images.list():
            for t in img.tags or []:
                local[t] = {"id": img.id, "size_bytes": int(img.attrs.get("Size", 0))}
        return local

    local = await asyncio.to_thread(_local)
    for t, meta in local.items():
        if any(k in t for k in ("vllm", "llama.cpp", "llamacpp")) and t not in refs:
            add(t, "engine", "local docker image")
    for ref, e in refs.items():
        loc = local.get(ref)
        e["cached"] = loc is not None
        e["size_bytes"] = loc["size_bytes"] if loc else None
    return {"images": sorted(refs.values(), key=lambda e: (e["role"] != "engine", e["ref"]))}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _session_factory():
    from ..main import SessionLocal  # type: ignore
    if SessionLocal is None:
        raise BundleError("database_unavailable")
    return SessionLocal


def _sha256_file(path: str, on_bytes: Callable[[int], None] | None = None) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(CHUNK)
            if not chunk:
                break
            h.update(chunk)
            if on_bytes:
                on_bytes(len(chunk))
    return h.hexdigest()


def _dir_size(path: str) -> int:
    """Bytes under ``path`` (a directory or a single file)."""
    if os.path.isfile(path):
        try:
            return os.path.getsize(path)
        except OSError:
            return 0
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _model_files_root(m: Model) -> str | None:
    """Host-mounted directory (or file) holding the model's weights, if local."""
    if not m.local_path:
        return None
    s = get_settings()
    p = os.path.join(s.CORTEX_MODELS_DIR, m.local_path.replace("\\", "/"))
    return p if os.path.exists(p) else None


def _model_transfer_dir(m: Model) -> str:
    """Path (relative to the models dir) that an export copies: the model's own folder, or the
    bare file when it sits directly in the models dir. Sibling files (multipart GGUF, tokenizer,
    config.json) live in that folder, so copying it is what makes the model usable elsewhere."""
    if not m.local_path:
        return ""
    rel = m.local_path.replace("\\", "/").strip("/")
    full = os.path.join(get_settings().CORTEX_MODELS_DIR, rel)
    if os.path.isfile(full) and "/" in rel:
        return rel.rsplit("/", 1)[0]
    return rel


# ---------------------------------------------------------------------------
# Job helpers
# ---------------------------------------------------------------------------

class _JobCtl:
    def __init__(self, job: DeploymentJob):
        self.job = job

    def log(self, msg: str) -> None:
        self.job.logs = (self.job.logs or [])[-500:] + [f"[{time.strftime('%H:%M:%S')}] {msg}"]
        logger.info("[bundle %s] %s", self.job.id, msg)

    def step(self, name: str, progress: float) -> None:
        self.job.step = name
        self.job.progress = max(0.0, min(1.0, progress))

    def check_cancel(self) -> None:
        if self.job.cancelled:
            raise asyncio.CancelledError("cancelled by user")

    def add_bytes(self, n: int) -> None:
        self.job.bytes_written += n
        if self.job.estimated_size_bytes:
            elapsed = _now() - self.job.started_at
            frac = min(0.999, self.job.bytes_written / self.job.estimated_size_bytes)
            self.job.progress = 0.05 + 0.9 * frac
            if frac > 0.02:
                self.job.eta_seconds = max(0.0, elapsed / frac - elapsed)


async def _start_job(job_type: str, output_dir: str, runner) -> dict[str, Any]:
    async with dm_jobs._LOCK:
        cur = dm_jobs._get_current_job()
        if cur and cur.status in ("pending", "running"):
            raise BundleError(f"another job ({cur.job_type} {cur.id}) is still running")
        job = DeploymentJob(id=f"{job_type}-{int(_now())}", status="running", started_at=_now(), logs=[], output_dir=output_dir,
                            artifacts={}, job_type=job_type)
        _add_job(job)
    asyncio.create_task(_guard(job, runner))
    return _job_to_dict(job)


async def _guard(job: DeploymentJob, runner) -> None:
    ctl = _JobCtl(job)
    try:
        await runner(ctl)
        if job.cancelled:
            job.status = "cancelled"
        else:
            job.status = "completed"
            job.progress = 1.0
    except asyncio.CancelledError:
        job.status = "cancelled"
        ctl.log("cancelled")
    except BundleError as e:
        job.status = "failed"
        job.error = str(e)
        ctl.log(f"failed: {e}")
    except Exception as e:  # pragma: no cover - defensive
        logger.exception("bundle job %s crashed", job.id)
        job.status = "failed"
        job.error = f"{e.__class__.__name__}: {e}"
        ctl.log(f"failed: {job.error}")
    finally:
        job.finished_at = _now()


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

@dataclass
class ExportRequest:
    destination: str
    name: str = ""
    image_refs: list[str] = field(default_factory=list)
    include_infra_images: bool = False
    include_program_images: bool = False
    model_ids: list[int] = field(default_factory=list)
    include_model_files: bool = True
    include_db_dump: bool = False
    pull_missing: bool = True
    notes: str = ""


async def _models_by_ids(ids: Iterable[int]) -> list[Model]:
    ids = list(ids)
    if not ids:
        return []
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        rows = (await session.execute(select(Model).where(Model.id.in_(ids)))).scalars().all()
    missing = set(ids) - {m.id for m in rows}
    if missing:
        raise BundleError(f"unknown model id(s): {sorted(missing)}")
    return sorted(rows, key=lambda m: m.id)


def _effective_engine_image(m: Model) -> str:
    s = get_settings()
    return m.engine_image or (s.LLAMACPP_IMAGE if m.engine_type == "llamacpp" else s.VLLM_IMAGE)


async def plan_export(req: ExportRequest) -> dict[str, Any]:
    """Resolve what an export would contain and how big it is (no side effects)."""
    dest = safe_transfer_path(req.destination)
    models = await _models_by_ids(req.model_ids)
    images: dict[str, str] = {}
    for ref in req.image_refs:
        if ref.strip():
            images[ref.strip()] = "engine"
    for m in models:
        images.setdefault(_effective_engine_image(m), "engine")
    if req.include_infra_images:
        for it in infra_image_refs():
            images.setdefault(it["ref"], it["role"])
    if req.include_program_images:
        for it in program_image_refs():
            images.setdefault(it["ref"], it["role"])

    def _sizes():
        out = []
        for ref, role in images.items():
            info = image_info(ref)
            out.append({"ref": ref, "role": role, "cached": info is not None, "size_bytes": info["size_bytes"] if info else None})
        return out

    image_plan = await asyncio.to_thread(_sizes)
    model_plan = []
    for m in models:
        root = _model_files_root(m)
        # the whole top-level folder is copied (multipart GGUF, tokenizer files, ...), so size that
        top = os.path.join(get_settings().CORTEX_MODELS_DIR, _model_transfer_dir(m)) if root else None
        size = await asyncio.to_thread(_dir_size, top) if (top and req.include_model_files) else 0
        model_plan.append({"id": m.id, "name": m.name, "served_model_name": m.served_model_name, "engine_type": m.engine_type,
                           "engine_image": _effective_engine_image(m), "local_path": m.local_path,
                           "files_present": root is not None, "size_bytes": size if root else None})
    total = sum(i["size_bytes"] or 0 for i in image_plan) + sum(mp["size_bytes"] or 0 for mp in model_plan)
    missing = [i["ref"] for i in image_plan if not i["cached"] and not i["ref"].startswith("cortex-")]
    unbuilt = [i["ref"] for i in image_plan if not i["cached"] and i["ref"].startswith("cortex-")]
    free = _disk_free(dest) if os.path.isdir(dest) else 0
    return {
        "destination": dest, "destination_host": host_path_hint(dest), "bundle_name": req.name or _default_bundle_name(),
        "images": image_plan, "models": model_plan, "db_dump": req.include_db_dump,
        "estimated_bytes": total, "free_bytes": free, "sufficient": free > total * 1.1,
        "missing_images": missing, "pull_missing": req.pull_missing,
        "warnings": ([f"{len(missing)} image(s) not cached locally; they will be pulled first (needs internet)" if req.pull_missing else
                      f"{len(missing)} image(s) not cached locally and pulling is disabled"] if missing else [])
                    + [f"Cortex image {r} is not built on this host (make build ENV=prod / make build-deps)" for r in unbuilt]
                    + [f"model {mp['served_model_name']} has no local files (online/HF model); only its configuration is exported" for mp in model_plan if not mp["files_present"]],
    }


def _default_bundle_name() -> str:
    return f"cortex-bundle-{time.strftime('%Y%m%d-%H%M%S')}"


async def start_export(req: ExportRequest) -> dict[str, Any]:
    plan = await plan_export(req)
    dest = plan["destination"]
    if not _writable(dest):
        raise BundleError(f"{host_path_hint(dest)} is not writable by the gateway (uid {os.getuid()}); "
                          "mount the drive read-write or chown it")
    if not plan["sufficient"]:
        raise BundleError(f"not enough free space at {host_path_hint(dest)}: need ~{plan['estimated_bytes']} bytes, have {plan['free_bytes']}")
    if plan["missing_images"] and not req.pull_missing:
        raise BundleError(f"images not cached locally: {plan['missing_images']}")
    unbuilt = [w for w in plan["warnings"] if "is not built on this host" in w]
    if unbuilt:
        raise BundleError(unbuilt[0])
    bundle_dir = os.path.join(dest, plan["bundle_name"])
    if os.path.exists(bundle_dir):
        raise BundleError(f"{host_path_hint(bundle_dir)} already exists; choose another bundle name")
    models = await _models_by_ids(req.model_ids)

    async def runner(ctl: _JobCtl):
        try:
            await _export_body(ctl)
        except BaseException:
            # A bundle without bundle.json is unusable; do not leave gigabytes of partial output behind.
            if os.path.isdir(bundle_dir) and not os.path.isfile(os.path.join(bundle_dir, BUNDLE_FILE)):
                ctl.log(f"removing partial bundle {host_path_hint(bundle_dir)}")
                await asyncio.to_thread(shutil.rmtree, bundle_dir, True)
            raise

    async def _export_body(ctl: _JobCtl):
        job = ctl.job
        job.estimated_size_bytes = int(plan["estimated_bytes"]) or 1
        os.makedirs(os.path.join(bundle_dir, "images"), exist_ok=True)
        os.makedirs(os.path.join(bundle_dir, "models"), exist_ok=True)
        checksums: dict[str, str] = {}
        images_out: list[dict[str, Any]] = []
        ctl.step("images", 0.05)
        for entry in plan["images"]:
            ctl.check_cancel()
            ref, role = entry["ref"], entry["role"]
            fname = sanitize_image_ref(ref) + ".tar"
            fpath = os.path.join(bundle_dir, "images", fname)
            ctl.log(f"image {ref}")
            info = await asyncio.to_thread(_save_image, ref, fpath, ctl, req.pull_missing)
            info.update({"role": role, "file": f"images/{fname}"})
            images_out.append(info)
            checksums[info["file"]] = info["sha256"]
        ctl.step("models", 0.6)
        models_out: list[dict[str, Any]] = []
        for m in models:
            ctl.check_cancel()
            ctl.log(f"model {m.served_model_name}")
            mdir = os.path.join(bundle_dir, "models", m.served_model_name)
            os.makedirs(mdir, exist_ok=True)
            files: list[dict[str, Any]] = []
            root = _model_files_root(m)
            if root and req.include_model_files:
                rel_dir = _model_transfer_dir(m)
                src_top = os.path.join(get_settings().CORTEX_MODELS_DIR, rel_dir)
                files = await asyncio.to_thread(_copy_tree, src_top, os.path.join(mdir, "files", rel_dir), ctl, rel_dir)
                for fi in files:
                    checksums[f"models/{m.served_model_name}/files/{fi['path']}"] = fi["sha256"]
            manifest = {
                "schema_version": SCHEMA_VERSION, "type": "cortex_model_export", "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "source_model_id": m.id, "name": m.name, "served_model_name": m.served_model_name, "task": m.task,
                "engine_type": m.engine_type, "engine_image": _effective_engine_image(m), "mode": "online" if m.repo_id else "offline",
                "repo_id": m.repo_id, "local_path": m.local_path, "config": {k: v for k, v in config_snapshot(m).items() if v is not None},
                "files": files, "files_included": bool(files),
            }
            manifest["config"].pop("hf_token", None)
            with open(os.path.join(mdir, "manifest.json"), "w", encoding="utf-8") as f:
                json.dump(manifest, f, indent=2)
            models_out.append({"served_model_name": m.served_model_name, "name": m.name, "engine_type": m.engine_type,
                               "engine_image": manifest["engine_image"], "files_included": bool(files),
                               "size_bytes": sum(fi["bytes"] for fi in files)})
        db_dump = False
        if req.include_db_dump:
            ctl.check_cancel()
            ctl.step("database", 0.9)
            ctl.log("pg_dump")
            os.makedirs(os.path.join(bundle_dir, "db"), exist_ok=True)
            db_path = os.path.join(bundle_dir, "db", "cortex.sql")
            await dm_jobs._export_postgres_dump(db_path=db_path, log=ctl.log)
            checksums["db/cortex.sql"] = await asyncio.to_thread(_sha256_file, db_path)
            db_dump = True
        with open(os.path.join(bundle_dir, IMAGES_FILE), "w", encoding="utf-8") as f:
            json.dump(images_out, f, indent=2)
        s = get_settings()
        bundle = {
            "schema_version": SCHEMA_VERSION, "kind": "cortex-bundle", "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "cortex_version": s.CORTEX_VERSION or "dev", "source_host": socket.gethostname(), "notes": req.notes,
            "engine_defaults": {"vllm": s.VLLM_IMAGE, "llamacpp": s.LLAMACPP_IMAGE},
            "contents": {"images": images_out, "models": models_out, "program": any(i["role"] in ("program", "deps") for i in images_out), "db_dump": db_dump},
            "size_bytes": _dir_size(bundle_dir),
        }
        with open(os.path.join(bundle_dir, BUNDLE_FILE), "w", encoding="utf-8") as f:
            json.dump(bundle, f, indent=2)
        checksums[IMAGES_FILE] = _sha256_file(os.path.join(bundle_dir, IMAGES_FILE))
        with open(os.path.join(bundle_dir, "checksums.sha256"), "w", encoding="utf-8") as f:
            for rel, digest in sorted(checksums.items()):
                f.write(f"{digest}  {rel}\n")
        _write_readme(bundle_dir, bundle)
        job.artifacts = {"bundle_dir": bundle_dir, "bundle_host_dir": host_path_hint(bundle_dir), "images": len(images_out),
                         "models": len(models_out), "size_bytes": bundle["size_bytes"]}
        ctl.step("done", 1.0)
        ctl.log(f"bundle written to {host_path_hint(bundle_dir)} ({bundle['size_bytes'] / 1e9:.2f} GB)")

    return await _start_job("bundle_export", bundle_dir, runner)


def _save_image(ref: str, fpath: str, ctl: _JobCtl, pull_missing: bool) -> dict[str, Any]:
    cli = _cli()
    try:
        img = cli.images.get(ref)
    except docker.errors.ImageNotFound:
        if ref.startswith("cortex-"):
            raise BundleError(f"{ref} is not built on this host (run `make build ENV=prod` and `make build-deps`, "
                              "or untick the Cortex program images)")
        if not pull_missing:
            raise BundleError(f"image not cached locally: {ref}")
        ctl.log(f"pulling {ref} …")
        try:
            cli.images.pull(ref)
        except docker.errors.APIError as e:
            raise BundleError(f"cannot pull {ref}: {e.explanation or e}")
        img = cli.images.get(ref)
    h = hashlib.sha256()
    written = 0
    tmp = fpath + ".part"
    ctl.log(f"docker save {ref} ({int(img.attrs.get('Size', 0)) / 1e9:.2f} GB) … the daemon prepares the export first; "
            "large images take a minute or more before data flows")
    with open(tmp, "wb") as f:
        for chunk in img.save(named=True):
            if ctl.job.cancelled:
                raise asyncio.CancelledError()
            f.write(chunk)
            h.update(chunk)
            written += len(chunk)
            ctl.add_bytes(len(chunk))
    os.replace(tmp, fpath)
    return {"ref": ref, "id": img.id, "size_bytes": int(img.attrs.get("Size", 0)), "tar_bytes": written, "sha256": h.hexdigest(),
            "digests": img.attrs.get("RepoDigests", [])}


def _copy_tree(src: str, dst: str, ctl: _JobCtl, prefix: str) -> list[dict[str, Any]]:
    """Copy src (file or dir) to dst, hashing as we go. Entry paths are ``prefix`` (the path of src
    relative to the models dir) plus the path inside src, i.e. exactly where the file goes back
    under the models dir on import."""
    entries: list[dict[str, Any]] = []
    if os.path.isfile(src):
        pairs = [(src, dst, prefix)]
    else:
        pairs = []
        for root, _dirs, files in os.walk(src):
            for f in files:
                sp = os.path.join(root, f)
                rel = os.path.relpath(sp, src)
                pairs.append((sp, os.path.join(dst, rel), f"{prefix}/{rel}"))
    for sp, dp, rel in pairs:
        if ctl.job.cancelled:
            raise asyncio.CancelledError()
        os.makedirs(os.path.dirname(dp), exist_ok=True)
        h = hashlib.sha256()
        size = 0
        with open(sp, "rb") as fi, open(dp + ".part", "wb") as fo:
            while True:
                chunk = fi.read(CHUNK)
                if not chunk:
                    break
                fo.write(chunk)
                h.update(chunk)
                size += len(chunk)
                ctl.add_bytes(len(chunk))
        os.replace(dp + ".part", dp)
        entries.append({"path": rel, "bytes": size, "sha256": h.hexdigest()})
    return entries


def _write_readme(bundle_dir: str, bundle: dict[str, Any]) -> None:
    lines = [
        "Cortex transfer bundle", "=" * 22, "",
        f"Created: {bundle['created_at']} on {bundle['source_host']} (Cortex {bundle['cortex_version']})", "",
        "Import on the air-gapped host: admin UI → Transfer → Import → pick this folder, or",
        f"  make load-offline BUNDLE={host_path_hint(bundle_dir)}", "",
        "Contents:",
    ]
    for i in bundle["contents"]["images"]:
        lines.append(f"  image  {i['ref']}  ({i['role']}, {i['tar_bytes'] / 1e9:.2f} GB)  {i['file']}")
    for m in bundle["contents"]["models"]:
        lines.append(f"  model  {m['served_model_name']}  ({m['engine_type']} on {m['engine_image']}, files {'included' if m['files_included'] else 'not included'})")
    if bundle["contents"]["db_dump"]:
        lines.append("  db     db/cortex.sql")
    lines += ["", "Verify: sha256sum -c checksums.sha256"]
    with open(os.path.join(bundle_dir, "README.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


# ---------------------------------------------------------------------------
# Scan / verify
# ---------------------------------------------------------------------------

def _read_json(path: str) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


async def scan_bundle(path: str, verify_checksums: bool = False) -> dict[str, Any]:
    bdir = safe_transfer_path(path)
    if not _is_bundle_dir(bdir):
        raise BundleError(f"{host_path_hint(bdir)} does not contain {BUNDLE_FILE}")
    try:
        bundle = _read_json(os.path.join(bdir, BUNDLE_FILE))
    except Exception as e:
        raise BundleError(f"cannot read {BUNDLE_FILE}: {e}")
    if bundle.get("kind") != "cortex-bundle":
        raise BundleError("not a Cortex bundle (kind mismatch)")
    images = []
    images_json = os.path.join(bdir, IMAGES_FILE)
    listed = _read_json(images_json) if os.path.isfile(images_json) else bundle.get("contents", {}).get("images", [])

    def _check_images():
        out = []
        for i in listed:
            f = os.path.join(bdir, i.get("file", ""))
            info = image_info(i["ref"])
            out.append({**i, "file_present": os.path.isfile(f), "file_bytes": os.path.getsize(f) if os.path.isfile(f) else 0,
                        "already_loaded": info is not None and (not i.get("id") or info["id"] == i.get("id")),
                        "local_id": info["id"] if info else None})
        return out

    images = await asyncio.to_thread(_check_images)
    s = get_settings()
    SessionLocal = _session_factory()
    async with SessionLocal() as session:
        existing = {r[0]: r[1] for r in (await session.execute(select(Model.served_model_name, Model.id))).all()}
    models = []
    mroot = os.path.join(bdir, "models")
    if os.path.isdir(mroot):
        for name in sorted(os.listdir(mroot)):
            mp = os.path.join(mroot, name, "manifest.json")
            if not os.path.isfile(mp):
                continue
            try:
                man = _read_json(mp)
            except Exception as e:
                models.append({"served_model_name": name, "error": f"bad manifest: {e}"})
                continue
            files = man.get("files") or []
            files_dir = os.path.join(mroot, name, "files")
            present_in_bundle = all(os.path.isfile(os.path.join(files_dir, fi["path"])) for fi in files) if files else False
            target = os.path.join(s.CORTEX_MODELS_DIR, (man.get("local_path") or "").replace("\\", "/")) if man.get("local_path") else None
            img_ref = man.get("engine_image")
            models.append({
                "served_model_name": man.get("served_model_name", name), "name": man.get("name"), "engine_type": man.get("engine_type"),
                "engine_image": img_ref, "local_path": man.get("local_path"), "mode": man.get("mode"),
                "files_in_bundle": present_in_bundle, "file_count": len(files), "size_bytes": sum(fi.get("bytes", 0) for fi in files),
                "files_present_on_host": bool(target and os.path.exists(target)),
                "already_registered": man.get("served_model_name", name) in existing,
                "existing_model_id": existing.get(man.get("served_model_name", name)),
                "engine_image_loaded": any(i["ref"] == img_ref and i["already_loaded"] for i in images) or (image_info(img_ref) is not None if img_ref else False),
                "engine_image_in_bundle": any(i["ref"] == img_ref and i["file_present"] for i in images),
            })
    db_path = os.path.join(bdir, "db", "cortex.sql")
    checks: dict[str, Any] = {}
    if verify_checksums:
        checks = await asyncio.to_thread(_verify_checksums, bdir)
    need = sum(m["size_bytes"] for m in models if m["files_in_bundle"] and not m["files_present_on_host"]) + \
        sum(i["file_bytes"] for i in images if not i["already_loaded"])
    return {
        "path": bdir, "host_path": host_path_hint(bdir), "bundle": {k: v for k, v in bundle.items() if k != "contents"},
        "images": images, "models": models, "db_dump": os.path.isfile(db_path),
        "models_dir_writable": _writable(s.CORTEX_MODELS_DIR), "models_dir_free_bytes": _disk_free(s.CORTEX_MODELS_DIR),
        "models_dir_hint": None if _writable(s.CORTEX_MODELS_DIR) else
            f"models directory {s.CORTEX_MODELS_DIR_HOST or s.CORTEX_MODELS_DIR} is not writable by the gateway; "
            f"run `sudo chown {os.getuid()} {s.CORTEX_MODELS_DIR_HOST or s.CORTEX_MODELS_DIR}` on the host (top level only)",
        "docker_free_bytes": _disk_free("/var/lib/docker") if os.path.isdir("/var/lib/docker") else None,
        "estimated_bytes_needed": need, "checksums": checks,
    }


def _verify_checksums(bdir: str) -> dict[str, Any]:
    path = os.path.join(bdir, "checksums.sha256")
    if not os.path.isfile(path):
        return {"verified": False, "reason": "no checksums.sha256"}
    bad, ok, missing = [], 0, []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            digest, rel = line.split("  ", 1)
            fp = os.path.join(bdir, rel)
            if not os.path.isfile(fp):
                missing.append(rel)
                continue
            if _sha256_file(fp) == digest:
                ok += 1
            else:
                bad.append(rel)
    return {"verified": not bad and not missing, "ok": ok, "bad": bad, "missing": missing}


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

@dataclass
class ImportRequest:
    path: str
    load_images: bool = True
    image_refs: list[str] | None = None        # None = all in bundle
    import_models: bool = True
    served_model_names: list[str] | None = None  # None = all
    copy_files: bool = True
    conflict: str = "rename"                    # rename | skip | replace | error
    verify_checksums: bool = False


async def start_import(req: ImportRequest) -> dict[str, Any]:
    scan = await scan_bundle(req.path, verify_checksums=False)
    bdir = scan["path"]
    if req.conflict not in ("rename", "skip", "replace", "error"):
        raise BundleError("conflict must be rename, skip, replace or error")
    s = get_settings()
    wanted_images = [i for i in scan["images"] if (req.image_refs is None or i["ref"] in req.image_refs)] if req.load_images else []
    wanted_models = [m for m in scan["models"] if "error" not in m and (req.served_model_names is None or m["served_model_name"] in req.served_model_names)] if req.import_models else []
    if req.copy_files and wanted_models and any(m["files_in_bundle"] and not m["files_present_on_host"] for m in wanted_models) and not scan["models_dir_writable"]:
        raise BundleError(f"models directory {s.CORTEX_MODELS_DIR_HOST or s.CORTEX_MODELS_DIR} is not writable by the gateway; "
                          f"run `sudo chown {os.getuid()} {s.CORTEX_MODELS_DIR_HOST or s.CORTEX_MODELS_DIR}` on the host (top level only)")
    if req.conflict == "error":
        dup = [m["served_model_name"] for m in wanted_models if m["already_registered"]]
        if dup:
            raise BundleError(f"models already registered: {dup} (choose rename, skip or replace)")

    async def runner(ctl: _JobCtl):
        job = ctl.job
        job.estimated_size_bytes = int(scan["estimated_bytes_needed"]) or 1
        results: dict[str, Any] = {"images": [], "models": [], "db_dump_available": bool(scan["db_dump"])}
        if req.verify_checksums:
            ctl.step("verify", 0.02)
            ctl.log("verifying checksums …")
            chk = await asyncio.to_thread(_verify_checksums, bdir)
            if not chk.get("verified"):
                raise BundleError(f"checksum verification failed: {chk}")
            ctl.log(f"checksums ok ({chk['ok']} files)")
        ctl.step("images", 0.05)
        for i in wanted_images:
            ctl.check_cancel()
            if i["already_loaded"]:
                ctl.log(f"image {i['ref']} already present, skipping")
                results["images"].append({"ref": i["ref"], "status": "present"})
                continue
            if not i["file_present"]:
                ctl.log(f"image {i['ref']}: file missing in bundle")
                results["images"].append({"ref": i["ref"], "status": "missing_file"})
                continue
            ctl.log(f"docker load {i['ref']} ({i['file_bytes'] / 1e9:.2f} GB) …")
            loaded = await asyncio.to_thread(_load_image, os.path.join(bdir, i["file"]), i["ref"], ctl)
            results["images"].append({"ref": i["ref"], "status": "loaded", "tags": loaded})
        ctl.step("models", 0.5)
        for m in wanted_models:
            ctl.check_cancel()
            name = m["served_model_name"]
            man = _read_json(os.path.join(bdir, "models", name, "manifest.json"))
            if req.copy_files and m["files_in_bundle"]:
                if m["files_present_on_host"]:
                    ctl.log(f"model {name}: files already present on host, not copying")
                else:
                    ctl.log(f"model {name}: copying {m['file_count']} file(s) ({m['size_bytes'] / 1e9:.2f} GB) …")
                    await asyncio.to_thread(_place_files, bdir, name, man, ctl)
            elif not m["files_present_on_host"] and man.get("mode") == "offline":
                ctl.log(f"model {name}: WARNING model files are neither on this host nor in the bundle")
            row = await _register_model(man, req.conflict, ctl)
            results["models"].append(row)
        if scan["db_dump"]:
            ctl.log("bundle contains a database dump; restore it from Transfer → Import → Advanced (restore database) if wanted")
        job.artifacts = results
        ctl.step("done", 1.0)
        ctl.log("import finished")

    return await _start_job("bundle_import", bdir, runner)


def _load_image(tar_path: str, ref: str, ctl: _JobCtl) -> list[str]:
    cli = _cli()
    with open(tar_path, "rb") as f:
        images = cli.images.load(f)
    tags: list[str] = []
    for img in images:
        tags.extend(img.tags or [])
        if ref not in (img.tags or []):
            try:
                repo, _, tag = ref.rpartition(":")
                if "/" in tag:  # no tag present
                    repo, tag = ref, "latest"
                img.tag(repo, tag)
                tags.append(ref)
            except Exception as e:  # pragma: no cover
                ctl.log(f"could not tag {ref}: {e}")
    ctl.add_bytes(os.path.getsize(tar_path))
    ctl.log(f"loaded {', '.join(tags) or ref}")
    return tags


def _place_files(bdir: str, name: str, man: dict[str, Any], ctl: _JobCtl) -> None:
    s = get_settings()
    src_root = os.path.join(bdir, "models", name, "files")
    for fi in man.get("files") or []:
        if ctl.job.cancelled:
            raise asyncio.CancelledError()
        rel = fi["path"].replace("\\", "/")
        if rel.startswith("/") or ".." in rel.split("/"):
            raise BundleError(f"unsafe path in manifest: {rel}")
        sp = os.path.join(src_root, rel)
        dp = os.path.join(s.CORTEX_MODELS_DIR, rel)
        if os.path.isfile(dp) and os.path.getsize(dp) == fi.get("bytes") and _sha256_file(dp) == fi.get("sha256"):
            ctl.add_bytes(fi.get("bytes", 0))
            continue
        os.makedirs(os.path.dirname(dp), exist_ok=True)
        h = hashlib.sha256()
        with open(sp, "rb") as fin, open(dp + ".part", "wb") as fout:
            while True:
                chunk = fin.read(CHUNK)
                if not chunk:
                    break
                fout.write(chunk)
                h.update(chunk)
                ctl.add_bytes(len(chunk))
        if fi.get("sha256") and h.hexdigest() != fi["sha256"]:
            os.remove(dp + ".part")
            raise BundleError(f"checksum mismatch while copying {rel}")
        os.replace(dp + ".part", dp)


async def _register_model(man: dict[str, Any], conflict: str, ctl: _JobCtl) -> dict[str, Any]:
    SessionLocal = _session_factory()
    served = man.get("served_model_name") or man.get("name")
    cfg = {k: v for k, v in (man.get("config") or {}).items() if k in FIELD_BY_NAME}
    if "selected_gpus" in cfg:
        cfg["selected_gpus"] = serialize_selected_gpus(cfg["selected_gpus"])
    cfg["engine_image"] = man.get("engine_image") or cfg.get("engine_image")
    async with SessionLocal() as session:
        existing = (await session.execute(select(Model).where(Model.served_model_name == served))).scalar_one_or_none()
        if existing:
            if conflict == "skip":
                ctl.log(f"model {served}: already registered (id {existing.id}), skipped")
                return {"served_model_name": served, "status": "skipped", "model_id": existing.id}
            if conflict == "replace":
                if existing.state in ("starting", "loading", "running"):
                    ctl.log(f"model {served}: running; configuration NOT replaced")
                    return {"served_model_name": served, "status": "skipped_running", "model_id": existing.id}
                for k, v in cfg.items():
                    setattr(existing, k, v)
                existing.name = man.get("name") or existing.name
                existing.local_path = man.get("local_path") or existing.local_path
                existing.repo_id = man.get("repo_id")
                await session.commit()
                ctl.log(f"model {served}: configuration replaced (id {existing.id})")
                return {"served_model_name": served, "status": "replaced", "model_id": existing.id}
            if conflict == "error":
                raise BundleError(f"model {served} already registered")
            base = served
            n = 2
            while (await session.execute(select(Model.id).where(Model.served_model_name == served))).first():
                served = f"{base}-{n}"
                n += 1
        row = Model(name=man.get("name") or served, served_model_name=served, task=man.get("task") or "generate",
                    engine_type=man.get("engine_type") or "vllm", repo_id=man.get("repo_id"), local_path=man.get("local_path"),
                    state="stopped", **cfg)
        session.add(row)
        await session.commit()
        ctl.log(f"model {served}: registered as id {row.id} (engine image {row.engine_image})")
        return {"served_model_name": served, "status": "created", "model_id": row.id}


def job_status() -> dict[str, Any] | None:
    cur = dm_jobs._get_current_job()
    return _job_to_dict(cur) if cur else None

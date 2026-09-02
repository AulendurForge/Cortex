"""Transfer bundle round trip against the running gateway: export -> scan -> import.

Uses a tiny image imported from an in-memory tarball (no pull) and a fake one-file model in the
models directory, so it runs in seconds. Marked integration (needs the live gateway, admin/admin).
"""
from __future__ import annotations

import io
import os
import shutil
import tarfile
import time
import uuid

import docker
import httpx
import pytest

BASE = os.environ.get("CORTEX_GATEWAY_URL", "http://127.0.0.1:8084").rstrip("/")
MODELS_DIR = os.environ.get("CORTEX_MODELS_DIR", "/var/cortex/models")
EXPORT_DIR = os.environ.get("CORTEX_EXPORT_DIR", "/var/cortex/exports")
IMAGE = "cortex-bundle-test:1"


def _gateway_up() -> bool:
    try:
        return httpx.get(f"{BASE}/health", timeout=3.0).status_code == 200
    except Exception:
        return False


@pytest.fixture(scope="module")
def client():
    if not _gateway_up():
        pytest.skip(f"gateway not reachable at {BASE}")
    c = httpx.Client(base_url=BASE, timeout=60.0)
    r = c.post("/auth/login", json={"username": os.environ.get("CORTEX_TEST_ADMIN_USER", "admin"),
                                     "password": os.environ.get("CORTEX_TEST_ADMIN_PASS", "admin")})
    assert r.status_code == 200, r.text
    yield c
    c.close()


@pytest.fixture(scope="module")
def tiny_image():
    cli = docker.from_env()
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        data = b"cortex bundle test\n"
        ti = tarfile.TarInfo("hello.txt")
        ti.size = len(data)
        tar.addfile(ti, io.BytesIO(data))
    buf.seek(0)
    repo, tag = IMAGE.split(":")
    cli.api.import_image_from_data(buf.getvalue(), repository=repo, tag=tag)
    yield cli.images.get(IMAGE).id
    try:
        cli.images.remove(IMAGE, force=True)
    except docker.errors.ImageNotFound:
        pass


@pytest.fixture(scope="module")
def fake_model(client):
    folder = f"bundle-test-{uuid.uuid4().hex[:8]}"
    os.makedirs(os.path.join(MODELS_DIR, folder), exist_ok=True)
    with open(os.path.join(MODELS_DIR, folder, "weights.bin"), "wb") as f:
        f.write(os.urandom(64 * 1024))
    served = f"bundle-test-{uuid.uuid4().hex[:6]}"
    r = client.post("/admin/models", json={
        "name": "Bundle test", "served_model_name": served, "task": "generate", "engine_type": "llamacpp",
        "mode": "offline", "local_path": f"{folder}/weights.bin", "engine_image": IMAGE, "ngl": 12, "context_size": 1024,
    })
    assert r.status_code == 200, r.text
    m = r.json()
    yield {"id": m["id"], "served": served, "folder": folder}
    for row in client.get("/admin/models").json():
        if row["served_model_name"].startswith(served):
            client.delete(f"/admin/models/{row['id']}")
    shutil.rmtree(os.path.join(MODELS_DIR, folder), ignore_errors=True)


def _wait_job(client, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        job = client.get("/admin/bundles/status").json()["job"]
        if job and job["status"] in ("completed", "failed", "cancelled"):
            return job
        time.sleep(0.5)
    raise AssertionError("job did not finish")


def test_bundle_round_trip(client, tiny_image, fake_model):
    name = f"test-bundle-{uuid.uuid4().hex[:6]}"
    bundle_dir = os.path.join(EXPORT_DIR, name)
    try:
        # --- locations / images ---
        locs = client.get("/admin/bundles/locations").json()["locations"]
        assert any(l["path"] == EXPORT_DIR and l["writable"] for l in locs), locs
        imgs = client.get("/admin/bundles/images").json()["images"]
        assert any(i["ref"] == IMAGE and i["cached"] for i in imgs), "model engine image should be listed"

        # --- plan + export ---
        req = {"destination": EXPORT_DIR, "name": name, "model_ids": [fake_model["id"]], "include_model_files": True,
               "pull_missing": False, "image_refs": []}
        plan = client.post("/admin/bundles/plan", json=req).json()
        assert [i["ref"] for i in plan["images"]] == [IMAGE], plan
        assert plan["models"][0]["files_present"] and plan["models"][0]["size_bytes"] == 64 * 1024
        assert plan["sufficient"]
        r = client.post("/admin/bundles/export", json=req)
        assert r.status_code == 200, r.text
        job = _wait_job(client)
        assert job["status"] == "completed", job
        assert job["artifacts"]["bundle_dir"] == bundle_dir
        for rel in ("bundle.json", "images.json", "checksums.sha256", "README.txt",
                    f"models/{fake_model['served']}/manifest.json",
                    f"models/{fake_model['served']}/files/{fake_model['folder']}/weights.bin"):
            assert os.path.isfile(os.path.join(bundle_dir, rel)), rel
        assert os.path.isfile(os.path.join(bundle_dir, "images", "cortex-bundle-test__1.tar"))
        # a second export to the same name is refused
        assert client.post("/admin/bundles/export", json=req).status_code == 400
        # paths outside the transfer roots are refused
        assert client.get("/admin/bundles/scan", params={"path": "/etc"}).status_code == 400

        # --- simulate the offline host: image gone, model files gone, model unregistered ---
        cli = docker.from_env()
        cli.images.remove(IMAGE, force=True)
        shutil.rmtree(os.path.join(MODELS_DIR, fake_model["folder"]))
        assert client.delete(f"/admin/models/{fake_model['id']}").status_code == 200

        scan = client.get("/admin/bundles/scan", params={"path": bundle_dir, "verify": "true"}).json()
        assert scan["checksums"]["verified"], scan["checksums"]
        img = scan["images"][0]
        assert img["ref"] == IMAGE and img["file_present"] and not img["already_loaded"]
        mdl = scan["models"][0]
        assert mdl["files_in_bundle"] and not mdl["files_present_on_host"] and not mdl["already_registered"]
        assert mdl["engine_image_in_bundle"] and not mdl["engine_image_loaded"]

        r = client.post("/admin/bundles/import", json={"path": bundle_dir, "conflict": "error", "verify_checksums": True})
        assert r.status_code == 200, r.text
        job = _wait_job(client)
        assert job["status"] == "completed", job
        res = job["artifacts"]
        assert res["images"][0]["status"] == "loaded" and IMAGE in res["images"][0]["tags"]
        assert cli.images.get(IMAGE).id == tiny_image
        assert res["models"][0]["status"] == "created"
        new_id = res["models"][0]["model_id"]
        assert os.path.isfile(os.path.join(MODELS_DIR, fake_model["folder"], "weights.bin"))
        row = next(m for m in client.get("/admin/models").json() if m["id"] == new_id)
        assert row["served_model_name"] == fake_model["served"]
        assert row["engine_image"] == IMAGE and row["ngl"] == 12 and row["context_size"] == 1024
        assert row["local_path"] == f"{fake_model['folder']}/weights.bin"

        # --- second import: everything already present; conflict=rename creates <served>-2, skip skips ---
        r = client.post("/admin/bundles/import", json={"path": bundle_dir, "conflict": "skip"})
        assert r.status_code == 200, r.text
        job = _wait_job(client)
        assert job["status"] == "completed", job
        assert job["artifacts"]["images"][0]["status"] == "present"
        assert job["artifacts"]["models"][0]["status"] == "skipped"
        r = client.post("/admin/bundles/import", json={"path": bundle_dir, "conflict": "error", "load_images": False})
        assert r.status_code == 400 and "already registered" in r.text
        r = client.post("/admin/bundles/import", json={"path": bundle_dir, "conflict": "rename", "load_images": False})
        job = _wait_job(client)
        assert job["artifacts"]["models"][0]["status"] == "created"
        renamed = next(m for m in client.get("/admin/models").json() if m["id"] == job["artifacts"]["models"][0]["model_id"])
        assert renamed["served_model_name"] == f"{fake_model['served']}-2"
    finally:
        shutil.rmtree(bundle_dir, ignore_errors=True)

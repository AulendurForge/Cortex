# Offline (air-gapped) deployment

Cortex runs without internet access once three things are on the offline host:

| What | Where it lives | How it gets there |
|---|---|---|
| The **program**: `cortex-gateway`, `cortex-frontend`, postgres, redis, prometheus (+ exporters) | Docker image cache | program bundle (`make prepare-offline`) |
| The **engine images** a model needs: the exact vLLM / llama.cpp tag each model is configured with | Docker image cache | Transfer → Export on a connected Cortex |
| The **model files** and the model's configuration | `CORTEX_MODELS_DIR` (default `/var/cortex/models`) + database | Transfer → Export / Import |

All three travel as **bundles**: plain folders you copy to a USB drive or NAS. The connected
Cortex writes them, the offline Cortex reads them. Nothing in a bundle references a floating tag,
and a model always carries the exact engine image it was validated with.

## Bundle layout

```
<bundle>/
  bundle.json                 what is inside, Cortex version, source host, creation time
  images.json                 [{ref, id, size_bytes, file, sha256, role}]
  images/<ref>.tar            `docker save` of each image  (vllm_vllm-openai__v0.28.0.tar, ...)
  models/<served_name>/manifest.json   model configuration snapshot (no hf_token) + file list with sha256
  models/<served_name>/files/<folder>/ raw copies of the model folder (rsync-friendly)
  db/cortex.sql               optional pg_dump (users, API key hashes, configuration)
  wheels/                     optional Python wheelhouse (program bundle only)
  versions.env                pinned versions the bundle was built from (program bundle only)
  checksums.sha256            sha256 of every file above:  sha256sum -c checksums.sha256
  README.txt                  human-readable contents and import instructions
```

The UI export, the UI import, `scripts/prepare-offline-deployment.sh` and
`scripts/load-offline-deployment.sh` all speak this one format.

## Where the gateway looks for drives

The gateway container (which runs as the non-root user `cortex`, uid 1000) sees these host paths:

| Host path | Inside the gateway | Purpose |
|---|---|---|
| `CORTEX_EXPORT_DIR` (default `/var/cortex/exports`) | `/var/cortex/exports` | default destination; the entrypoint makes it writable |
| `/media`, `/mnt`, `/run/media` | `/host/media`, `/host/mnt`, `/host/run/media` | mounted USB drives / NAS shares |

Plug in a drive, mount it under one of those paths, and it appears on the Transfer page after
**Refresh**. The API only accepts paths inside these locations (`CORTEX_TRANSFER_DIRS`).

**Write access.** Exports need the destination to be writable by uid 1000. Drives formatted
exFAT/NTFS/FAT are writable by everyone. For an ext4 drive create a folder and hand it over once:

```bash
sudo mkdir -p /media/usb/cortex && sudo chown 1000 /media/usb/cortex
```

Imports copy model files into the models directory; the entrypoint makes its top level writable
for uid 1000 automatically (existing model folders keep their ownership; they only need to be
readable).

## 1. Program bundle (connected host, once per Cortex version)

```bash
git clone https://github.com/AulendurForge/Cortex.git && cd Cortex
make prepare-offline               # -> ./cortex-offline-bundle  (~30 GB)
```

This pulls every pinned image from `versions.env`, builds `cortex-gateway:<ver>` /
`cortex-frontend:<ver>` and their dependency images `cortex-gateway-deps:<ver>` /
`cortex-frontend-deps:<ver>`, saves them all, downloads the Python wheelhouse, and writes the
bundle. Options: `OUTPUT_DIR=/media/usb/cortex/program`, `EXTRA_IMAGES="vllm/vllm-openai:v0.28.1"`,
`SKIP_WHEELS=1`, `YES=1`.

Copy the **repository** (same version) and the bundle to the offline host.

## 2. Models and engine images (connected Cortex)

Validate the model on the connected instance first (Models → add → Start → chat). Then:

1. **Transfer → Export**, pick the drive as destination.
2. Tick the models to ship. Each model automatically adds the engine image it is configured
   with (e.g. `vllm/vllm-openai:v0.28.0`), and **Include model files** copies the model folder.
   Add any other engine tag under *Other image*, and tick *Include Cortex program images* if you
   want the program in the same bundle.
3. Review the size estimate against the free space and start the export. Missing images are
   pulled first (turn *Pull missing images* off on hosts without internet).
4. Unmount the drive when the job reports completion.

Or from the shell for images only: `EXTRA_IMAGES="<tag>" make prepare-offline`.

## 3. Import on the offline host

First time (no Cortex running yet):

```bash
cd Cortex
make load-offline BUNDLE=/media/usb/cortex/cortex-offline-bundle   # verifies checksums, docker load, copies model files
echo "OFFLINE_MODE=true" >> .env
make verify-offline                                                 # every pinned image present?
make prod-check && make up ENV=prod                                 # or `make up` for the dev stack
```

Afterwards, with Cortex running, use the UI: **Transfer → Import** → pick the bundle → *Scan* →
review (which images are already loaded, which model files are already on the host, name
conflicts) → *Import*. The job loads the images, copies the model files into the models
directory and registers the models with their exact configuration and engine image. Open
**Models** and press **Start**. A bundle with `db/cortex.sql` also offers *Restore database*
(destructive, takes a safety backup first).

`OFFLINE_MODE=true` makes the gateway refuse to pull images: a model whose engine image is not
in the cache fails fast with a message naming the tag to import, instead of hanging on a pull.

## 4. Rebuilding after code changes (offline)

The program bundle ships the dependency images, so source changes can be rebuilt without network:

```bash
git apply cortex-fix.patch          # or copy the changed files
make build-offline                  # docker build --network none on top of cortex-*-deps:<ver>
make up                             # recreate the containers with the new images
```

`make build-offline` fails early if the deps images for the current `CORTEX_VERSION` are missing.
When *dependencies* change (requirements.txt / package-lock.json) a new program bundle is needed
from a connected host; the wheelhouse in `backend/wheels` covers Python-only changes:
`docker build --build-arg PIP_FIND_LINKS=/wheels -t cortex-gateway:<ver> backend`.

## Verification checklist

| Check | Command |
|---|---|
| bundle integrity | `cd <bundle> && sha256sum -c checksums.sha256` |
| images present | `make verify-offline`; `docker images \| grep -E 'vllm\|llama.cpp\|cortex'` |
| model files | `ls /var/cortex/models/<folder>`; the Transfer scan shows *files on host* |
| model starts | Models → Start → readiness `ready`; `make logs-models` |
| offline mode | `make logs-gateway \| grep -i offline`; gateway `GET /admin/system/summary` |
| round trip (dev) | `make test-integration` runs an export → import cycle with a tiny image |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Drive not listed on the Transfer page | not mounted under `/media`, `/mnt` or `/run/media`, or mounted after the gateway started with a path that did not exist yet: `make up` again |
| "is not writable by the gateway (uid 1000)" | `sudo chown 1000 <folder>` on the host (ext4); exFAT/NTFS drives do not need this |
| "not inside a transfer location" | only paths under the locations above are accepted; set `CORTEX_TRANSFER_DIRS` to add more |
| Import says the models directory is not writable | `sudo chown 1000 /var/cortex/models` (top level only) |
| Model fails with `image not available offline` | the engine tag is not in the cache: export it from the connected host (Transfer → Export → *Other image*) |
| `docker load` is slow | expected: 20 GB vLLM images take minutes on USB 3; the job shows bytes and ETA |
| Bundle checksum mismatch | the copy was interrupted; re-copy the files named in the scan result |
| `make build-offline` fails: deps image missing | import the program bundle first, or check `CORTEX_VERSION` in `versions.env` |

#!/usr/bin/env bash
# Build the Cortex *program bundle* on an internet-connected machine.
#
# Output is a transfer bundle in the same layout the Deployment page writes (bundle.json,
# images.json, images/*.tar, checksums.sha256), so the air-gapped host can import it either
# with `make load-offline BUNDLE=<dir>` or from the UI (Transfer -> Import).
#
# Contents:
#   - every pinned image from versions.env (engines, postgres, redis, prometheus, exporters)
#   - cortex-gateway:<ver> and cortex-frontend:<ver>        (built here with `make build ENV=prod`)
#   - cortex-gateway-deps:<ver> and cortex-frontend-deps:<ver> (built here with `make build-deps`) so
#     the program can be REBUILT offline from modified source: `make build-offline`
#   - backend/wheels (pip wheelhouse) unless SKIP_WHEELS=1, for `docker build --build-arg PIP_FIND_LINKS`
#   - versions.env and a README
#
# Usage:  make prepare-offline   (or: bash scripts/prepare-offline-deployment.sh)
#   OUTPUT_DIR=...          bundle directory (default ./cortex-offline-bundle)
#   EXTRA_IMAGES="a:1 b:2"  additional images (e.g. the engine image a model needs)
#   SKIP_BUILD=1            fail instead of building missing Cortex images
#   SKIP_WHEELS=1           do not download the Python wheelhouse
#   YES=1                   no confirmation prompt
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; RED='\033[0;31m'; NC='\033[0m'

[ -f versions.env ] || { echo -e "${RED}versions.env not found in $ROOT${NC}"; exit 1; }
set -a; . ./versions.env; set +a
command -v python3 >/dev/null || { echo -e "${RED}python3 is required${NC}"; exit 1; }

OUTPUT_DIR=${OUTPUT_DIR:-"./cortex-offline-bundle"}
PULL_TIMEOUT_SEC=${PULL_TIMEOUT_SEC:-1800}
SAVE_TIMEOUT_SEC=${SAVE_TIMEOUT_SEC:-1800}
DOCKER_RETRY_COUNT=${DOCKER_RETRY_COUNT:-2}

run_with_timeout() { local t="$1"; shift; if [ "$t" = "0" ] || ! command -v timeout >/dev/null 2>&1; then "$@"; else timeout --preserve-status "$t" "$@"; fi; }
retry() { local n="$1"; shift; local i=1; while true; do "$@" && return 0; [ "$i" -ge "$n" ] && return 1; i=$((i+1)); echo -e "${YELLOW}  retry ${i}/${n}...${NC}"; sleep 2; done; }
# Same file naming as backend/src/services/bundles.py::sanitize_image_ref
file_for() { echo "$1" | sed -e 's#/#_#g' -e 's#:#__#g' -e 's#@#_at_#g'; }

# ref|role|criticality|purpose
IMAGES=(
    "${VLLM_IMAGE}|engine|critical|vLLM inference engine"
    "${LLAMACPP_IMAGE}|engine|critical|llama.cpp inference engine (GGUF)"
    "cortex-gateway:${CORTEX_VERSION}|program|critical|Cortex gateway (built locally)"
    "cortex-frontend:${CORTEX_VERSION}|program|critical|Cortex admin UI (built locally)"
    "cortex-gateway-deps:${CORTEX_VERSION}|deps|required|Gateway dependencies (offline rebuilds)"
    "cortex-frontend-deps:${CORTEX_VERSION}|deps|required|UI dependencies (offline rebuilds)"
    "${POSTGRES_IMAGE}|infra|critical|Database"
    "${REDIS_IMAGE}|infra|critical|Rate limiting / cache"
    "${PROMETHEUS_IMAGE}|infra|required|Metrics"
    "${PYTHON_IMAGE}|infra|optional|Gateway base image"
    "${NODE_IMAGE}|infra|optional|Frontend base image"
    "${NODE_EXPORTER_IMAGE}|infra|optional|Host metrics"
    "${DCGM_EXPORTER_IMAGE}|infra|optional|GPU metrics"
    "${CADVISOR_IMAGE}|infra|optional|Container metrics"
)
for extra in ${EXTRA_IMAGES:-}; do IMAGES+=("${extra}|engine|optional|Extra image (EXTRA_IMAGES)"); done

echo "=========================================="
echo "Cortex program bundle"
echo "=========================================="
for entry in "${IMAGES[@]}"; do IFS='|' read -r img role crit _ <<< "$entry"; printf "  %-62s %-8s %s\n" "$img" "$role" "$crit"; done
echo "  Output: $OUTPUT_DIR"
if [ "${YES:-0}" != "1" ]; then
    echo -e "${YELLOW}This downloads and saves roughly 30 GB.${NC}"
    read -r -p "Continue? (yes/no): " CONFIRM; [ "$CONFIRM" = "yes" ] || { echo "Cancelled"; exit 0; }
fi

if [ -e "$OUTPUT_DIR/bundle.json" ]; then
    echo -e "${RED}$OUTPUT_DIR already contains a bundle; remove it or set OUTPUT_DIR${NC}"; exit 1
fi

# Cortex images are never pulled: build them here if missing
need_build=0; need_deps=0
for img in "cortex-gateway:${CORTEX_VERSION}" "cortex-frontend:${CORTEX_VERSION}"; do docker image inspect "$img" >/dev/null 2>&1 || need_build=1; done
for img in "cortex-gateway-deps:${CORTEX_VERSION}" "cortex-frontend-deps:${CORTEX_VERSION}"; do docker image inspect "$img" >/dev/null 2>&1 || need_deps=1; done
if [ "$need_build$need_deps" != "00" ] && [ "${SKIP_BUILD:-0}" = "1" ]; then
    echo -e "${RED}Cortex images are missing and SKIP_BUILD=1 (run make build ENV=prod && make build-deps)${NC}"; exit 1
fi
[ "$need_build" = "1" ] && { echo -e "${BLUE}Building Cortex images (make build ENV=prod)...${NC}"; make --no-print-directory build ENV=prod; }
[ "$need_deps" = "1" ] && { echo -e "${BLUE}Building dependency images (make build-deps)...${NC}"; make --no-print-directory build-deps; }

mkdir -p "$OUTPUT_DIR/images"
: > "$OUTPUT_DIR/checksums.sha256"
ENTRIES_FILE="$(mktemp)"; trap 'rm -f "$ENTRIES_FILE"' EXIT
FAILED_OPTIONAL=()

for entry in "${IMAGES[@]}"; do
    IFS='|' read -r img role crit purpose <<< "$entry"
    out="$(file_for "$img").tar"
    echo -e "${BLUE}${img}${NC}"
    if [[ "$img" == cortex-* ]]; then
        echo "  local build (not pulled)"
    else
        echo -n "  pulling... "
        if retry "$DOCKER_RETRY_COUNT" run_with_timeout "$PULL_TIMEOUT_SEC" docker pull -q "$img" >/dev/null 2>&1; then echo -e "${GREEN}✓${NC}"
        elif [ "$crit" = "optional" ]; then echo -e "${YELLOW}⚠ pull failed (optional, skipped)${NC}"; FAILED_OPTIONAL+=("$img"); continue
        else echo -e "${RED}✗ pull failed${NC}"; exit 1; fi
    fi
    echo -n "  saving images/$out... "
    if retry "$DOCKER_RETRY_COUNT" run_with_timeout "$SAVE_TIMEOUT_SEC" docker save -o "$OUTPUT_DIR/images/$out" "$img"; then
        echo -e "${GREEN}✓${NC} ($(du -h "$OUTPUT_DIR/images/$out" | cut -f1))"
    else echo -e "${RED}✗ save failed${NC}"; exit 1; fi
    sha=$(sha256sum "$OUTPUT_DIR/images/$out" | awk '{print $1}')
    echo "$sha  images/$out" >> "$OUTPUT_DIR/checksums.sha256"
    id=$(docker image inspect "$img" --format '{{.Id}}')
    size=$(docker image inspect "$img" --format '{{.Size}}')
    tar_bytes=$(stat -c %s "$OUTPUT_DIR/images/$out")
    digest=$(docker image inspect "$img" --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{end}}' 2>/dev/null || true)
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$img" "$id" "$size" "images/$out" "$sha" "$role" "$tar_bytes" "$digest" >> "$ENTRIES_FILE"
done

# Python wheelhouse (lets `docker build --build-arg PIP_FIND_LINKS=/wheels backend` work offline too)
if [ "${SKIP_WHEELS:-0}" != "1" ]; then
    echo -e "${BLUE}Downloading Python wheels (backend/wheels + bundle/wheels)...${NC}"
    mkdir -p backend/wheels
    if docker run --rm -v "$ROOT/backend:/src" "$PYTHON_IMAGE" sh -c "pip download -q -r /src/requirements.txt -d /src/wheels"; then
        mkdir -p "$OUTPUT_DIR/wheels"; cp backend/wheels/* "$OUTPUT_DIR/wheels/"; cp backend/requirements.txt "$OUTPUT_DIR/wheels/"
        echo -e "  ${GREEN}✓${NC} $(ls -1 "$OUTPUT_DIR/wheels" | wc -l) files"
    else
        echo -e "  ${YELLOW}⚠ wheel download failed (offline rebuilds still work via the deps images)${NC}"
    fi
fi

cp versions.env "$OUTPUT_DIR/versions.env"
python3 - "$OUTPUT_DIR" "$ENTRIES_FILE" "$CORTEX_VERSION" "$VLLM_IMAGE" "$LLAMACPP_IMAGE" "${FAILED_OPTIONAL[*]:-}" <<'PY'
import json, os, socket, sys, time
out, entries_file, ver, vllm, llamacpp, failed = sys.argv[1:7]
images = []
for line in open(entries_file, encoding="utf-8"):
    ref, iid, size, f, sha, role, tar_bytes, digest = line.rstrip("\n").split("\t")
    images.append({"ref": ref, "id": iid, "size_bytes": int(size), "file": f, "sha256": sha, "role": role,
                   "tar_bytes": int(tar_bytes), "digests": [digest] if digest else []})
with open(os.path.join(out, "images.json"), "w", encoding="utf-8") as fh:
    json.dump(images, fh, indent=2)
total = sum(os.path.getsize(os.path.join(r, n)) for r, _, fs in os.walk(out) for n in fs)
bundle = {
    "schema_version": 1, "kind": "cortex-bundle", "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "cortex_version": ver, "source_host": socket.gethostname(),
    "notes": "program bundle (scripts/prepare-offline-deployment.sh)" + (f"; optional images not included: {failed}" if failed else ""),
    "engine_defaults": {"vllm": vllm, "llamacpp": llamacpp},
    "contents": {"images": images, "models": [], "program": True, "db_dump": False, "wheels": os.path.isdir(os.path.join(out, "wheels"))},
    "size_bytes": total,
}
with open(os.path.join(out, "bundle.json"), "w", encoding="utf-8") as fh:
    json.dump(bundle, fh, indent=2)
PY
( cd "$OUTPUT_DIR" && sha256sum images.json >> checksums.sha256 )

cat > "$OUTPUT_DIR/README.txt" <<EOR
Cortex program bundle (Cortex ${CORTEX_VERSION})
=================================================
images/*.tar        every pinned image (versions.env) + cortex-gateway/frontend + their -deps images
images.json         list of the tars with sha256 / image ids
wheels/             Python wheelhouse for pip-based rebuilds (optional)
versions.env        the pinned versions this bundle was built from
checksums.sha256    sha256sum -c checksums.sha256

On the air-gapped host (repository checked out at the SAME version, docker + compose installed):
  make load-offline BUNDLE=$(cd "$OUTPUT_DIR" && pwd)     # or: Transfer -> Import in the admin UI
  echo "OFFLINE_MODE=true" >> .env
  make prod-check && make up ENV=prod                     # or make up for the dev stack

Rebuilding after code changes offline:  make build-offline   (uses the -deps images, no network)
Models: export them from a connected Cortex (Transfer -> Export) into their own bundle.
Full guide: docs/operations/offline-deployment.md
EOR

echo ""
echo -e "${GREEN}✓ Bundle complete:${NC} $OUTPUT_DIR ($(du -sh "$OUTPUT_DIR" | cut -f1), $(ls -1 "$OUTPUT_DIR"/images/*.tar | wc -l) images)"
[ "${#FAILED_OPTIONAL[@]}" -gt 0 ] && echo -e "${YELLOW}Optional images not included:${NC} ${FAILED_OPTIONAL[*]}"
echo "Copy the directory to the offline host, then: make load-offline BUNDLE=<path>"

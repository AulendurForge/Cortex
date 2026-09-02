#!/usr/bin/env bash
# Import a Cortex transfer bundle on the air-gapped host (CLI equivalent of Transfer -> Import).
#
# Loads every image listed in images.json (verifying checksums first), re-tags them if the tar
# carried a different name, then prints what is missing. Model folders in the bundle
# (models/<served>/files) are copied into CORTEX_MODELS_DIR; registering them in the database
# is done by the UI import (or by re-running the import from the Deployment page), because
# the gateway must be running for that.
#
# Usage:  make load-offline BUNDLE=/media/usb/cortex-bundle-...   (default ./cortex-offline-bundle)
#   VERIFY_CHECKSUMS=false   skip sha256 verification
#   COPY_MODELS=false        do not copy model files
#   YES=1                    no confirmation prompt
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

BUNDLE=${BUNDLE:-${IMAGE_DIR:-./cortex-offline-bundle}}
LOAD_TIMEOUT_SEC=${LOAD_TIMEOUT_SEC:-1800}
run_with_timeout() { local t="$1"; shift; if [ "$t" = "0" ] || ! command -v timeout >/dev/null 2>&1; then "$@"; else timeout --preserve-status "$t" "$@"; fi; }

echo "=========================================="
echo "Cortex bundle import"
echo "=========================================="
if [ ! -f "$BUNDLE/bundle.json" ]; then
    if [ -f "$BUNDLE/manifest.json" ]; then
        echo -e "${YELLOW}$BUNDLE is a legacy (pre-0.2) package; loading every .tar in it${NC}"
        for t in "$BUNDLE"/*.tar; do echo -n "  $(basename "$t")... "; run_with_timeout "$LOAD_TIMEOUT_SEC" docker load -i "$t" >/dev/null && echo -e "${GREEN}✓${NC}"; done
        exit 0
    fi
    echo -e "${RED}No bundle.json in $BUNDLE${NC}"; echo "Usage: make load-offline BUNDLE=/media/usb/<bundle-dir>"; exit 1
fi
command -v python3 >/dev/null || { echo -e "${RED}python3 is required${NC}"; exit 1; }

python3 - "$BUNDLE" <<'PY'
import json, sys, os
b = json.load(open(os.path.join(sys.argv[1], "bundle.json")))
c = b.get("contents", {})
print(f"  created {b.get('created_at')} on {b.get('source_host')} (Cortex {b.get('cortex_version')})")
print(f"  images: {len(c.get('images', []))}   models: {len(c.get('models', []))}   program: {c.get('program')}   db dump: {c.get('db_dump')}")
if b.get("notes"): print(f"  notes: {b['notes']}")
PY

if [ "${VERIFY_CHECKSUMS:-true}" = "true" ] && [ -f "$BUNDLE/checksums.sha256" ]; then
    echo -e "${BLUE}Verifying checksums...${NC}"
    if ( cd "$BUNDLE" && sha256sum --quiet -c checksums.sha256 ); then echo -e "  ${GREEN}✓ all files verified${NC}"
    else
        echo -e "${RED}Checksum verification failed: the bundle is incomplete or corrupted${NC}"
        [ "${YES:-0}" = "1" ] && exit 1
        read -r -p "Continue anyway? (yes/no): " C; [ "$C" = "yes" ] || exit 1
    fi
fi

if [ "${YES:-0}" != "1" ]; then read -r -p "Load images into Docker? (yes/no): " C; [ "$C" = "yes" ] || { echo "Cancelled"; exit 0; }; fi

echo -e "${BLUE}Loading images...${NC}"
FAILED=0
while IFS=$'\t' read -r ref file iid; do
    [ -z "$ref" ] && continue
    tar="$BUNDLE/$file"
    printf "  %-60s " "$ref"
    if [ ! -f "$tar" ]; then echo -e "${YELLOW}⚠ file missing ($file)${NC}"; FAILED=$((FAILED+1)); continue; fi
    if [ -n "$iid" ] && [ "$(docker image inspect "$ref" --format '{{.Id}}' 2>/dev/null || true)" = "$iid" ]; then echo -e "${GREEN}already present${NC}"; continue; fi
    if out=$(run_with_timeout "$LOAD_TIMEOUT_SEC" docker load -i "$tar" 2>&1); then
        # docker load prints "Loaded image: <tag>" or "Loaded image ID: sha256:..."; make sure the expected tag exists
        if ! docker image inspect "$ref" >/dev/null 2>&1; then
            loaded_id=$(echo "$out" | grep -oE 'sha256:[0-9a-f]+' | head -1 || true)
            [ -n "${loaded_id:-$iid}" ] && docker tag "${loaded_id:-$iid}" "$ref" 2>/dev/null || true
        fi
        echo -e "${GREEN}✓${NC}"
    else echo -e "${RED}✗ $out${NC}"; FAILED=$((FAILED+1)); fi
done < <(python3 -c "import json,sys; [print(i['ref'], i['file'], i.get('id',''), sep='\t') for i in json.load(open(sys.argv[1]))]" "$BUNDLE/images.json")

# Model files: copy into the models dir (the UI import does the same, plus the database registration)
if [ "${COPY_MODELS:-true}" = "true" ] && [ -d "$BUNDLE/models" ]; then
    MODELS_DIR=$(grep -E '^CORTEX_MODELS_DIR=' "$ROOT/.env" 2>/dev/null | tail -1 | cut -d= -f2-); MODELS_DIR=${MODELS_DIR:-/var/cortex/models}
    for m in "$BUNDLE"/models/*/; do
        [ -d "$m/files" ] || { echo -e "  model $(basename "$m"): configuration only (no files in bundle)"; continue; }
        echo -e "${BLUE}Copying model files of $(basename "$m") into $MODELS_DIR${NC}"
        if command -v rsync >/dev/null 2>&1; then rsync -a --info=progress2 "$m/files/" "$MODELS_DIR/"; else cp -an "$m/files/." "$MODELS_DIR/"; fi
    done
    echo -e "${YELLOW}Register the model(s): admin UI -> Transfer -> Import -> this bundle (files already present are not copied again)${NC}"
fi

[ -f "$BUNDLE/wheels/requirements.txt" ] && [ ! -d "$ROOT/backend/wheels" ] && { mkdir -p "$ROOT/backend/wheels"; cp "$BUNDLE"/wheels/* "$ROOT/backend/wheels/"; echo "  wheelhouse copied to backend/wheels"; }

echo ""
if [ "$FAILED" -gt 0 ]; then echo -e "${RED}$FAILED image(s) failed to load${NC}"; exit 1; fi
echo -e "${GREEN}✓ Bundle imported${NC}"
echo "Next: echo 'OFFLINE_MODE=true' >> .env && make verify-offline && make up   (make build-offline rebuilds from source without network)"

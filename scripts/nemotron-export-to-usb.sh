#!/usr/bin/env bash
# =====================================================================
# Nemotron 3 Super — EXPORT to removable media
#
# Run this on the UNCLASSIFIED server (afwi@mage).
# Writes everything the air-gapped server needs onto a USB drive:
#   - Docker images (derived FIPS image + upstream base, ~30 GiB:
#     docker save writes UNCOMPRESSED layers, not the registry size)
#   - Model weights (~75 GiB, .git excluded)
#
# Budget a drive of 128 GB or larger.
#   - The import script, Cortex config script, and Dockerfile
#   - A SHA256 manifest for integrity verification
#
# Usage:   ./nemotron-export-to-usb.sh /media/afwi/TRANSFER
#
# Deliberately does NOT use `set -e`: a single non-fatal hiccup should
# not throw away an hour of copying. Errors are counted and reported.
# =====================================================================

VERSION="1.0"

# ---- configuration (override with env vars if your paths differ) ----
MODELS_DIR="${MODELS_DIR:-/var/cortex/models}"
MODEL_NAME="${MODEL_NAME:-NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4}"
DERIVED_IMAGE="${DERIVED_IMAGE:-cortex/vllm-fips:v0.27.1}"
BASE_IMAGE="${BASE_IMAGE:-vllm/vllm-openai:v0.27.1}"
PKG_NAME="cortex-nemotron-transfer"

# ---- plumbing -------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
START_TS="$(date +%Y%m%d-%H%M%S)"
ERRORS=0
WARNINGS=0

R=$'\e[0;31m'; G=$'\e[0;32m'; Y=$'\e[1;33m'; B=$'\e[0;34m'; N=$'\e[0m'

log()  { printf '%s [%s] %s\n' "$(date +%H:%M:%S)" "INFO" "$*"; }
ok()   { printf '%s [%s]  %s%s%s\n' "$(date +%H:%M:%S)" " OK " "$G" "$*" "$N"; }
warn() { printf '%s [%s] %s%s%s\n' "$(date +%H:%M:%S)" "WARN" "$Y" "$*" "$N"; WARNINGS=$((WARNINGS+1)); }
err()  { printf '%s [%s] %s%s%s\n' "$(date +%H:%M:%S)" "FAIL" "$R" "$*" "$N"; ERRORS=$((ERRORS+1)); }
step() { printf '\n%s===== %s =====%s\n' "$B" "$*" "$N"; }
die()  { err "$*"; echo ""; echo "Aborting. Nothing was written to the drive."; exit 1; }

# ---- sudo: prompt once up front, then keep the ticket warm ----------
SUDO=""
SUDO_PID=""
need_sudo() {
  if [ "$(id -u)" -eq 0 ]; then SUDO=""; return 0; fi
  SUDO="sudo"
  echo ""
  echo "This script may need sudo (reading root-owned model files)."
  echo "You will be prompted once now; the ticket is kept alive after."
  if ! sudo -v; then
    warn "sudo unavailable - continuing without it (may fail on reads)"
    SUDO=""
    return 1
  fi
  ( while true; do sudo -n true 2>/dev/null; sleep 50
      kill -0 "$$" 2>/dev/null || exit 0; done ) &
  SUDO_PID=$!
  return 0
}
cleanup() { [ -n "$SUDO_PID" ] && kill "$SUDO_PID" 2>/dev/null; }
trap cleanup EXIT INT TERM

# =====================================================================
step "Nemotron export to removable media  (v$VERSION)"

USB="${1:-}"
if [ -z "$USB" ]; then
  echo "Usage: $0 /path/to/usb/mountpoint"
  echo ""
  echo "Currently mounted removable candidates:"
  lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINT 2>/dev/null | grep -E '/media|/mnt' \
    || echo "  (none detected - mount the drive first)"
  exit 1
fi

[ -d "$USB" ] || die "Not a directory: $USB"
[ -w "$USB" ] || die "Not writable: $USB  (check mount options / ownership)"

DEST="$USB/$PKG_NAME"
LOG="$DEST/export-$START_TS.log"

# =====================================================================
step "1/8  Preflight checks"

# --- filesystem type: FAT32 cannot hold files over 4 GiB ---
FSTYPE="$(findmnt -n -o FSTYPE --target "$USB" 2>/dev/null)"
log "Target filesystem: ${FSTYPE:-unknown}"
case "$FSTYPE" in
  vfat|msdos|fat|fat32)
    die "FAT32 detected. Max file size is 4 GiB; the model shards are ~5 GiB
     each and the image archive is ~30 GiB. Reformat as exFAT or ext4."
    ;;
  exfat|ntfs)
    warn "$FSTYPE does not preserve UNIX permissions - the import script
       fixes ownership on the far side, so this is fine."
    PRESERVE_PERMS=0
    ;;
  ext2|ext3|ext4|xfs|btrfs)
    ok "$FSTYPE preserves permissions"
    PRESERVE_PERMS=1
    ;;
  "")
    warn "Could not determine filesystem type - proceeding cautiously"
    PRESERVE_PERMS=0
    ;;
  *)
    warn "Unrecognised filesystem '$FSTYPE' - proceeding"
    PRESERVE_PERMS=0
    ;;
esac

# --- docker reachable? ---
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1 || sudo docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
    log "Using 'sudo docker' (user not in docker group)"
  else
    die "Cannot talk to the Docker daemon. Is it running?"
  fi
fi
ok "Docker reachable"

# --- images present? ---
for IMG in "$DERIVED_IMAGE" "$BASE_IMAGE"; do
  if $DOCKER image inspect "$IMG" >/dev/null 2>&1; then
    ok "Image present: $IMG"
  else
    if [ "$IMG" = "$DERIVED_IMAGE" ]; then
      die "Derived image '$IMG' not found. Build it first (see section 4b of
     NEMOTRON_3_SUPER_DEPLOYMENT.md), or set DERIVED_IMAGE=..."
    fi
    warn "Base image '$IMG' not found - it will be omitted. 'make
       verify-offline' on the far side may report it missing."
    BASE_IMAGE=""
  fi
done

# --- model present? ---
MODEL_PATH="$MODELS_DIR/$MODEL_NAME"
[ -d "$MODEL_PATH" ] || die "Model directory not found: $MODEL_PATH"

SHARDS="$(find "$MODEL_PATH" -maxdepth 1 -name '*.safetensors' 2>/dev/null | wc -l)"
if [ "$SHARDS" -lt 1 ]; then
  die "No .safetensors shards in $MODEL_PATH"
fi
ok "Model found: $SHARDS safetensors shards"

STUBS="$(find "$MODEL_PATH" -maxdepth 1 -name '*.safetensors' -size -1M 2>/dev/null | wc -l)"
if [ "$STUBS" -gt 0 ]; then
  err "$STUBS shard(s) are under 1 MB - unresolved Git-LFS pointers."
  err "Run 'git lfs pull' in $MODEL_PATH before exporting."
  die "Refusing to export an incomplete model."
fi
ok "No Git-LFS pointer stubs"

need_sudo

# --- space ---
MODEL_KB="$($SUDO du -sk --exclude=.git "$MODEL_PATH" 2>/dev/null | cut -f1)"
MODEL_KB="${MODEL_KB:-0}"
# Estimate the archive from the derived image's real uncompressed size.
# The base image shares nearly all its layers, so it adds almost nothing;
# 15% covers tar overhead and the extra pip-uninstall layer.
IMG_BYTES="$($DOCKER image inspect "$DERIVED_IMAGE" \
             --format '{{.Size}}' 2>/dev/null)"
if [ -n "$IMG_BYTES" ] && [ "$IMG_BYTES" -gt 0 ] 2>/dev/null; then
  IMG_KB=$(( IMG_BYTES / 1024 * 115 / 100 ))
else
  IMG_KB=12000000   # fall back to a ~11.5 GiB allowance
  warn "Could not read image size - using a fixed allowance"
fi
NEED_KB=$(( MODEL_KB + IMG_KB + 1000000 ))
AVAIL_KB="$(df -Pk "$USB" | awk 'NR==2 {print $4}')"

log "Model size          : $(( MODEL_KB / 1024 / 1024 )) GiB (.git excluded)"
log "Image archive (est) : $(( IMG_KB / 1024 / 1024 )) GiB"
log "Required            : $(( NEED_KB / 1024 / 1024 )) GiB"
log "Available on drive  : $(( AVAIL_KB / 1024 / 1024 )) GiB"

if [ "$AVAIL_KB" -lt "$NEED_KB" ]; then
  die "Not enough space on $USB. Need ~$(( NEED_KB / 1024 / 1024 )) GiB,
     have $(( AVAIL_KB / 1024 / 1024 )) GiB."
fi
ok "Sufficient space"

if [ -d "$MODEL_PATH/.git" ]; then
  GIT_KB="$($SUDO du -sk "$MODEL_PATH/.git" 2>/dev/null | cut -f1)"
  log "Note: .git is $(( ${GIT_KB:-0} / 1024 / 1024 )) GiB and is NOT copied."
fi

# =====================================================================
step "2/8  Creating package directory"
mkdir -p "$DEST"/{images,model,scripts} || die "Could not create $DEST"
exec > >(tee -a "$LOG") 2>&1
ok "Package root: $DEST"
log "Logging to: $LOG"

# =====================================================================
step "3/8  Saving Docker images (this takes several minutes)"
IMG_TAR="$DEST/images/vllm-nemotron-images.tar"
SAVE_LIST="$DERIVED_IMAGE"
[ -n "$BASE_IMAGE" ] && SAVE_LIST="$SAVE_LIST $BASE_IMAGE"
log "Saving: $SAVE_LIST"
log "(both tags in one archive so shared layers are stored once)"

# shellcheck disable=SC2086
if $DOCKER save -o "$IMG_TAR" $SAVE_LIST; then
  ok "Image archive written: $(du -h "$IMG_TAR" | cut -f1)"
else
  die "docker save failed"
fi

# =====================================================================
step "4/8  Copying model weights (~$(( MODEL_KB / 1024 / 1024 )) GiB — the long part)"
MODEL_DEST="$DEST/model/$MODEL_NAME"
mkdir -p "$MODEL_DEST"

if command -v rsync >/dev/null 2>&1; then
  RS=(-r --times --partial --human-readable --info=progress2 --exclude='.git')
  [ "$PRESERVE_PERMS" = "1" ] && RS+=(--perms)
  log "rsync ${RS[*]}"
  if $SUDO rsync "${RS[@]}" "$MODEL_PATH/" "$MODEL_DEST/"; then
    ok "Model copied"
  else
    err "rsync reported errors - re-run this script to resume (rsync skips
       files already copied)"
  fi
else
  warn "rsync not installed - falling back to cp (no resume support)"
  if $SUDO cp -r "$MODEL_PATH/." "$MODEL_DEST/"; then
    $SUDO rm -rf "$MODEL_DEST/.git"
    ok "Model copied"
  else
    err "cp failed"
  fi
fi

# =====================================================================
step "5/8  Copying scripts and documentation"
copy_in() {
  local src="$1" dst="$2"
  if [ -f "$src" ]; then
    cp "$src" "$dst" && ok "  $(basename "$src")"
  else
    warn "  missing (skipped): $src"
  fi
}
copy_in "$SCRIPT_DIR/nemotron-import-from-usb.sh" "$DEST/scripts/"
copy_in "$SCRIPT_DIR/nemotron-configure-cortex.py" "$DEST/scripts/"
copy_in "$REPO_DIR/NEMOTRON_3_SUPER_DEPLOYMENT.md" "$DEST/"
chmod +x "$DEST/scripts/"*.sh 2>/dev/null

# Dockerfile so the derived image can be rebuilt from scratch if needed
mkdir -p "$DEST/scripts/vllm-fips"
cat > "$DEST/scripts/vllm-fips/Dockerfile" <<DOCKERFILE
FROM $BASE_IMAGE
# Remove the vendored OpenSSL 1.1.1k shipped inside the opencv wheel.
# It has no HMAC sidecar and aborts on FIPS-enabled hosts.
# Safe for text-only models, which never invoke cv2.
RUN pip uninstall -y opencv-python-headless opencv-python || true
DOCKERFILE
ok "  Dockerfile (for rebuilding the derived image)"

# =====================================================================
step "6/8  Writing manifest"
cat > "$DEST/MANIFEST.txt" <<MANIFEST
Cortex / Nemotron 3 Super transfer package
Created      : $(date -Is)
Source host  : $(hostname)
Exported by  : $(whoami)
Script ver   : $VERSION

Derived image: $DERIVED_IMAGE
Base image   : ${BASE_IMAGE:-<not included>}
Model folder : $MODEL_NAME
Shards       : $SHARDS
Model size   : $(( MODEL_KB / 1024 / 1024 )) GiB (.git excluded)

Target layout on the classified server:
  images  -> docker load
  model   -> $MODELS_DIR/$MODEL_NAME
  scripts -> run nemotron-import-from-usb.sh
MANIFEST
ok "MANIFEST.txt"

# =====================================================================
step "7/8  Generating checksums (reads everything back — slow but worth it)"
log "This verifies the drive actually holds what we think it does."
( cd "$DEST" && find images model scripts -type f -print0 2>/dev/null \
    | xargs -0 sha256sum > SHA256SUMS 2>/dev/null )
if [ -s "$DEST/SHA256SUMS" ]; then
  ok "$(wc -l < "$DEST/SHA256SUMS") files checksummed"
else
  warn "Checksum generation produced nothing - verify manually on import"
fi

# =====================================================================
step "8/8  Flushing writes to the drive"
log "sync in progress - do NOT unplug until this finishes"
sync
ok "Writes flushed"

# =====================================================================
step "Summary"
echo ""
echo "  Package : $DEST"
echo "  Size    : $(du -sh "$DEST" 2>/dev/null | cut -f1)"
echo "  Log     : $LOG"
echo "  Errors  : $ERRORS"
echo "  Warnings: $WARNINGS"
echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "${G}Export complete.${N}"
  echo ""
  echo "Next steps:"
  echo "  1. Unmount the drive:  sudo umount \"$USB\""
  echo "  2. Move it to the classified server and mount it"
  echo "  3. Run, as a normal user with docker access:"
  echo "       cd <usb>/$PKG_NAME/scripts"
  echo "       ./nemotron-import-from-usb.sh <usb>/$PKG_NAME"
  exit 0
else
  echo "${R}Export finished with $ERRORS error(s).${N}"
  echo "Review $LOG before trusting this package."
  exit 1
fi

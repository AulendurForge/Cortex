#!/usr/bin/env bash
# =====================================================================
# Nemotron 3 Super — IMPORT from removable media
#
# Run this on the AIR-GAPPED / classified server.
# Reverses nemotron-export-to-usb.sh and then re-runs every check that
# was performed by hand on the unclassified server:
#
#   1  verify package integrity (SHA256)
#   2  environment: docker, GPUs, driver, FIPS state, disk
#   3  load Docker images
#   4  copy model weights into place, fix ownership
#   5  verify model integrity (shards, LFS stubs, config.json)
#   6  verify the engine inside the container:
#        - SSL context (the FIPS/aiohttp blocker)
#        - opencv absent (the FIPS selftest blocker)
#        - NemotronH architecture + modelopt_mixed quantization
#        - qwen3_xml tool parser + nemotron_v3 reasoning parser
#   7  optionally register the model in Cortex via its admin API
#
# Usage:  ./nemotron-import-from-usb.sh /media/user/TRANSFER/cortex-nemotron-transfer
#         ./nemotron-import-from-usb.sh <pkg> --skip-cortex
#         ./nemotron-import-from-usb.sh <pkg> --skip-verify   (skip checksums)
#
# No `set -e`: checks are counted and reported so you get the full
# picture in one run instead of one failure at a time.
# =====================================================================

VERSION="1.0"

MODELS_DIR_EXPLICIT="${MODELS_DIR:-}"
MODELS_DIR="${MODELS_DIR:-/var/cortex/models}"
CORTEX_REPO="${CORTEX_REPO:-}"
MODEL_NAME="${MODEL_NAME:-NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4}"
DERIVED_IMAGE="${DERIVED_IMAGE:-cortex/vllm-fips:v0.27.1}"
CORTEX_URL="${CORTEX_URL:-http://localhost:8084}"
MIN_DRIVER="575.51.03"

START_TS="$(date +%Y%m%d-%H%M%S)"
ERRORS=0; WARNINGS=0; PASSES=0
SKIP_CORTEX=0; SKIP_VERIFY=0

R=$'\e[0;31m'; G=$'\e[0;32m'; Y=$'\e[1;33m'; B=$'\e[0;34m'; N=$'\e[0m'

log()  { printf '%s [    ] %s\n' "$(date +%H:%M:%S)" "$*"; }
ok()   { printf '%s [ OK ] %s%s%s\n' "$(date +%H:%M:%S)" "$G" "$*" "$N"; PASSES=$((PASSES+1)); }
warn() { printf '%s [WARN] %s%s%s\n' "$(date +%H:%M:%S)" "$Y" "$*" "$N"; WARNINGS=$((WARNINGS+1)); }
err()  { printf '%s [FAIL] %s%s%s\n' "$(date +%H:%M:%S)" "$R" "$*" "$N"; ERRORS=$((ERRORS+1)); }
step() { printf '\n%s===== %s =====%s\n' "$B" "$*" "$N"; }
die()  { err "$*"; echo ""; echo "Aborting."; exit 1; }

SUDO=""; SUDO_PID=""
start_sudo() {
  if [ "$(id -u)" -eq 0 ]; then SUDO=""; ok "Running as root"; return 0; fi

  # Two reasons we might need sudo: writing into MODELS_DIR, and READING
  # the package. An export done under a hardened root umask leaves model
  # files mode 0600 root-owned, unreadable to a normal account.
  local need_write=1 need_read=0 probe sample
  probe="$MODELS_DIR"
  [ -d "$probe" ] || probe="$(dirname "$MODELS_DIR")"
  [ -d "$probe" ] && [ -w "$probe" ] && need_write=0

  sample="$(find "$PKG/model" -type f -name '*.safetensors' 2>/dev/null \
            | head -1)"
  [ -n "$sample" ] && [ ! -r "$sample" ] && need_read=1

  if [ "$need_write" -eq 0 ] && [ "$need_read" -eq 0 ]; then
    SUDO=""
    ok "No sudo needed - $probe is writable and the package is readable"
    return 0
  fi
  SUDO="sudo"
  echo ""
  [ "$need_read" -eq 1 ] && \
    echo "The package files are root-owned; sudo is needed to read them."
  [ "$need_write" -eq 1 ] && \
    echo "sudo is needed to write into $MODELS_DIR."
  echo "You will be prompted once now; the ticket is kept alive after."
  if ! sudo -v; then
    die "sudo authentication failed. Re-run with sudo access, or set
     MODELS_DIR to somewhere writable by $(whoami)."
  fi
  ( while true; do sudo -n true 2>/dev/null; sleep 50
      kill -0 "$$" 2>/dev/null || exit 0; done ) &
  SUDO_PID=$!
  ok "sudo ticket acquired"
}
cleanup() { [ -n "$SUDO_PID" ] && kill "$SUDO_PID" 2>/dev/null; }
trap cleanup EXIT INT TERM

# ---- locate this host's Cortex install ------------------------------
# Paths differ between servers (the classified box has the repo at
# /repos/repos/Cortex, the unclassified one at ~/repos/Cortex), so detect
# rather than assume. Explicit env vars always win.
detect_repo() {
  local c
  for c in "$CORTEX_REPO" /repos/repos/Cortex "$HOME/repos/Cortex" \
           /opt/Cortex /srv/Cortex /repos/Cortex; do
    [ -n "$c" ] || continue
    if [ -f "$c/Makefile" ] && [ -d "$c/backend" ]; then
      CORTEX_REPO="$c"; return 0
    fi
  done
  CORTEX_REPO=""
  return 1
}

# Ask the running gateway where it actually mounts /var/cortex/models.
# This is authoritative even if someone exported an override.
detect_models_dir() {
  [ -n "$MODELS_DIR_EXPLICIT" ] && return 1
  local src
  src="$($DOCKER inspect cortex-gateway-1 \
        --format '{{range .Mounts}}{{.Source}}|{{.Destination}}
{{end}}' 2>/dev/null \
        | awk -F'|' '$2=="/var/cortex/models" {print $1; exit}')"
  if [ -n "$src" ] && [ -d "$src" ]; then
    MODELS_DIR="$src"
    return 0
  fi
  return 1
}

# ---- args -----------------------------------------------------------
PKG="${1:-}"
shift 2>/dev/null
for a in "$@"; do
  case "$a" in
    --skip-cortex) SKIP_CORTEX=1 ;;
    --skip-verify) SKIP_VERIFY=1 ;;
    *) echo "Unknown option: $a"; exit 1 ;;
  esac
done

step "Nemotron import from removable media  (v$VERSION)"

if [ -z "$PKG" ]; then
  echo "Usage: $0 /path/to/cortex-nemotron-transfer [--skip-cortex] [--skip-verify]"
  echo ""
  echo "Mounted removable candidates:"
  lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINT 2>/dev/null | grep -E '/media|/mnt' \
    || echo "  (none detected)"
  exit 1
fi

[ -d "$PKG" ] || die "Package directory not found: $PKG"
[ -f "$PKG/MANIFEST.txt" ] || warn "No MANIFEST.txt - is this the right directory?"

LOGDIR="${HOME}/nemotron-import-logs"
mkdir -p "$LOGDIR" 2>/dev/null || LOGDIR="/tmp"
LOG="$LOGDIR/nemotron-import-$START_TS.log"
exec > >(tee -a "$LOG") 2>&1
log "Logging to: $LOG"
echo ""
[ -f "$PKG/MANIFEST.txt" ] && cat "$PKG/MANIFEST.txt"

start_sudo

# =====================================================================
step "1/7  Verifying package integrity"
if [ "$SKIP_VERIFY" = "1" ]; then
  warn "Checksum verification skipped by request"
elif [ -f "$PKG/SHA256SUMS" ]; then
  N_SUMS="$(wc -l < "$PKG/SHA256SUMS" 2>/dev/null || echo 0)"
  N_FILES="$(cd "$PKG" && find images model scripts -type f 2>/dev/null | wc -l)"
  log "Manifest lists $N_SUMS files; package contains $N_FILES"
  if [ "$N_SUMS" -lt "$N_FILES" ]; then
    err "MANIFEST IS INCOMPLETE: only $N_SUMS of $N_FILES files are listed."
    err "The export could not read some files (a hardened root umask makes"
    err "copies 0600 root-owned). Those files are NOT being verified."
    err "Regenerate on the source machine, or accept the risk with"
    err "--skip-verify after checking sizes by hand."
    warn "Continuing, but integrity is only partially proven."
  fi
  log "Verifying - this reads ~85 GiB, be patient"
  if ( cd "$PKG" && $SUDO sha256sum -c --quiet SHA256SUMS ); then
    ok "All listed checksums match"
  else
    err "Checksum mismatch - the transfer is damaged."
    err "Re-copy the package rather than proceeding."
    die "Refusing to import corrupt data."
  fi
else
  warn "No SHA256SUMS file - cannot verify integrity"
fi

# =====================================================================
step "2/7  Environment checks"

DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if sudo docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
    warn "User not in the docker group - using 'sudo docker'"
    warn "Cortex itself needs docker.sock access; check that separately"
  else
    die "Cannot reach the Docker daemon."
  fi
fi
ok "Docker reachable"

if detect_repo; then
  ok "Cortex repo: $CORTEX_REPO"
else
  warn "Cortex repo not found in the usual places. Set CORTEX_REPO=... if you"
  warn "want the summary to name the right directory. Not fatal."
fi

if detect_models_dir; then
  ok "Models directory (from the running gateway): $MODELS_DIR"
elif [ -n "$MODELS_DIR_EXPLICIT" ]; then
  ok "Models directory (set explicitly): $MODELS_DIR"
else
  warn "Gateway not running or no models mount found."
  warn "Falling back to the default: $MODELS_DIR"
  warn "If that is wrong, re-run with MODELS_DIR=/your/path"
fi

if command -v nvidia-smi >/dev/null 2>&1; then
  GPU_COUNT="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | wc -l)"
  DRIVER="$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1)"
  log "GPUs detected: $GPU_COUNT"
  nvidia-smi --query-gpu=index,name,memory.total --format=csv,noheader 2>/dev/null \
    | sed 's/^/           /'
  if [ "$GPU_COUNT" -lt 4 ]; then
    warn "Fewer than 4 GPUs. The documented config uses TP=4; adjust tp_size."
  else
    ok "$GPU_COUNT GPUs present"
  fi
  log "Driver: $DRIVER  (want >= $MIN_DRIVER for the CUDA 12.9 images)"
  LOWEST="$(printf '%s\n%s\n' "$DRIVER" "$MIN_DRIVER" | sort -V | head -1)"
  if [ "$LOWEST" = "$MIN_DRIVER" ]; then
    ok "Driver new enough"
  else
    warn "Driver older than $MIN_DRIVER - a v0.27 CUDA 12.9 image may refuse"
    warn "to start. If so, rebuild the derived image FROM the 0.24 CUDA 12.8"
    warn "tag using $PKG/scripts/vllm-fips/Dockerfile."
  fi
else
  warn "nvidia-smi not found - cannot verify GPUs"
fi

if [ -r /proc/sys/crypto/fips_enabled ]; then
  FIPS="$(cat /proc/sys/crypto/fips_enabled 2>/dev/null)"
  log "Host FIPS mode: $FIPS"
  if [ "$FIPS" = "1" ]; then
    ok "FIPS enabled - the derived image and OPENSSL_FORCE_FIPS_MODE=0 are required"
  fi
else
  log "Host FIPS mode: not reported (kernel not FIPS-capable)"
fi

AVAIL_KB="$(df -Pk "$(dirname "$MODELS_DIR")" 2>/dev/null | awk 'NR==2 {print $4}')"
PKG_MODEL_KB="$(du -sk "$PKG/model" 2>/dev/null | cut -f1)"
log "Model to import : $(( ${PKG_MODEL_KB:-0} / 1024 / 1024 )) GiB"
log "Free on target  : $(( ${AVAIL_KB:-0} / 1024 / 1024 )) GiB"
if [ "${AVAIL_KB:-0}" -lt "$(( ${PKG_MODEL_KB:-0} + 5000000 ))" ]; then
  die "Not enough free space at $MODELS_DIR"
fi
ok "Sufficient disk space"

DOCKER_AVAIL_KB="$(df -Pk /var/lib/docker 2>/dev/null | awk 'NR==2 {print $4}')"
if [ "${DOCKER_AVAIL_KB:-0}" -lt 35000000 ]; then
  warn "Under 35 GiB free on /var/lib/docker - image load may fail"
else
  ok "Docker storage has room"
fi

# =====================================================================
step "3/7  Loading Docker images"
IMG_TAR="$(find "$PKG/images" -name '*.tar' 2>/dev/null | head -1)"
if [ -z "$IMG_TAR" ]; then
  err "No image archive found in $PKG/images"
else
  log "Loading $(basename "$IMG_TAR") ($(du -h "$IMG_TAR" | cut -f1)) - several minutes"
  if $DOCKER load -i "$IMG_TAR"; then
    ok "Images loaded"
  else
    err "docker load failed"
  fi
fi

if $DOCKER image inspect "$DERIVED_IMAGE" >/dev/null 2>&1; then
  ok "Derived image available: $DERIVED_IMAGE"
else
  err "Derived image '$DERIVED_IMAGE' is NOT present after load."
  err "Rebuild it: docker build -t $DERIVED_IMAGE $PKG/scripts/vllm-fips/"
fi

# =====================================================================
step "4/7  Installing model weights"
SRC="$PKG/model/$MODEL_NAME"
DST="$MODELS_DIR/$MODEL_NAME"

if [ ! -d "$SRC" ]; then
  err "Model not found in package: $SRC"
else
  $SUDO mkdir -p "$MODELS_DIR" || err "Could not create $MODELS_DIR"
  log "Copying $SRC -> $DST"
  log "(~75 GiB; this is the long step. rsync resumes if interrupted.)"
  if command -v rsync >/dev/null 2>&1; then
    if $SUDO rsync -r --times --partial --human-readable \
         --info=progress2 "$SRC/" "$DST/"; then
      ok "Model copied"
    else
      err "rsync errors - re-run this script to resume"
    fi
  else
    warn "rsync missing - using tar (preserves modes, shows progress)"
    $SUDO mkdir -p "$DST"
    N_SRC="$(find "$SRC" -maxdepth 1 -type f | wc -l)"
    log "Copying $N_SRC files - roughly 15 minutes for 75 GiB"
    if ( cd "$SRC" && $SUDO tar cf - . ) \
       | ( cd "$DST" && $SUDO tar xvf - ) \
       | awk '{n++; printf "\r  %d files copied", n} END{print ""}'; then
      ok "Model copied"
    else
      err "tar copy failed"
    fi
  fi

  log "Normalising ownership and permissions"
  $SUDO chown -R root:root "$DST" 2>/dev/null
  $SUDO chmod -R a+rX "$DST" 2>/dev/null
  ok "Model is world-readable (containers run as root and mount it read-only)"
fi

# =====================================================================
step "5/7  Verifying model integrity on disk"
if [ -d "$DST" ]; then
  N_SHARD="$(find "$DST" -maxdepth 1 -name '*.safetensors' | wc -l)"
  if [ "$N_SHARD" -ge 1 ]; then ok "$N_SHARD safetensors shards"
  else err "No shards found in $DST"; fi

  N_STUB="$(find "$DST" -maxdepth 1 -name '*.safetensors' -size -1M | wc -l)"
  if [ "$N_STUB" -eq 0 ]; then ok "No truncated/stub shards"
  else err "$N_STUB shard(s) under 1 MB - transfer incomplete"; fi

  for f in config.json model.safetensors.index.json tokenizer.json; do
    [ -f "$DST/$f" ] && ok "  present: $f" || err "  MISSING: $f"
  done

  if command -v python3 >/dev/null 2>&1; then
    ARCH_OUT="$(python3 - "$DST" <<'PYEOF'
import json, sys, os
p = os.path.join(sys.argv[1], "config.json")
try:
    c = json.load(open(p))
except Exception as e:
    print("ERROR %s" % e); raise SystemExit(0)
q = (c.get("quantization_config") or {}).get("quant_method")
print("%s|%s|%s" % (c.get("architectures"), q, c.get("num_hidden_layers")))
PYEOF
)"
    log "config.json -> $ARCH_OUT"
    case "$ARCH_OUT" in
      *NemotronHForCausalLM*) ok "Architecture: NemotronHForCausalLM" ;;
      *) err "Unexpected architecture in config.json" ;;
    esac
    case "$ARCH_OUT" in
      *modelopt_mixed*) ok "Quantization: modelopt_mixed" ;;
      *) warn "quant_method is not modelopt_mixed - check the checkpoint" ;;
    esac
  fi
fi

# =====================================================================
step "6/7  Verifying the engine inside the container"
GPUFLAG="--gpus all"
# --entrypoint is required: this image's ENTRYPOINT is ["vllm","serve"],
# so a bare command would be passed to vLLM as arguments instead of run.
if ! $DOCKER run --rm $GPUFLAG --entrypoint true "$DERIVED_IMAGE" >/dev/null 2>&1; then
  warn "Cannot run a GPU container - is the NVIDIA container toolkit"
  warn "installed? Falling back to CPU-only checks (parsers still verify)."
  GPUFLAG=""
fi

run_in() { $DOCKER run --rm $GPUFLAG -e OPENSSL_FORCE_FIPS_MODE=0 \
             --entrypoint "$1" "$DERIVED_IMAGE" "${@:2}" 2>&1; }

log "a) SSL context (the FIPS / aiohttp blocker)"
if run_in python3 -c "import ssl; ssl.create_default_context(); print('SSLOK')" \
     | grep -q SSLOK; then
  ok "   SSL context builds - OPENSSL_FORCE_FIPS_MODE=0 is effective"
else
  err "   SSL context FAILED. The model will not start."
  err "   Confirm OPENSSL_FORCE_FIPS_MODE=0 reaches the container."
fi

log "b) opencv absent (the FIPS selftest blocker)"
CV_OUT="$(run_in python3 -c "import cv2; print('CV2LOADED')" )"
if echo "$CV_OUT" | grep -q "No module named 'cv2'"; then
  ok "   opencv removed - this IS the derived image"
elif echo "$CV_OUT" | grep -qi "FIPS SELFTEST"; then
  err "   opencv present and failing its FIPS selftest."
  err "   This is the UPSTREAM image, not the derived one. Rebuild:"
  err "     docker build -t $DERIVED_IMAGE $PKG/scripts/vllm-fips/"
elif echo "$CV_OUT" | grep -q "CV2LOADED"; then
  err "   opencv is PRESENT - this is NOT the derived image."
  err "   It may run here, but it will abort on a FIPS-enabled host."
  err "     docker build -t $DERIVED_IMAGE $PKG/scripts/vllm-fips/"
else
  warn "   Unexpected result: $(echo "$CV_OUT" | head -1)"
fi

if [ -n "$GPUFLAG" ]; then
  log "c) architecture + quantization support"
  ARCHQ="$(run_in python3 -c "
from vllm.model_executor.models.registry import ModelRegistry as R
from vllm.model_executor.layers.quantization import QUANTIZATION_METHODS
print('ARCH', 'NemotronHForCausalLM' in R.get_supported_archs())
print('QUANT', 'modelopt_mixed' in QUANTIZATION_METHODS)")"
  echo "$ARCHQ" | grep -q "ARCH True"  && ok "   NemotronHForCausalLM supported" \
    || err "   NemotronHForCausalLM NOT in this engine"
  echo "$ARCHQ" | grep -q "QUANT True" && ok "   modelopt_mixed supported" \
    || err "   modelopt_mixed NOT in this engine"

  log "d) tool + reasoning parsers"
  if $DOCKER run --rm $GPUFLAG -e OPENSSL_FORCE_FIPS_MODE=0 \
       --entrypoint vllm "$DERIVED_IMAGE" serve --help=Frontend 2>/dev/null \
       | grep -q qwen3_xml; then
    ok "   qwen3_xml tool parser present"
  else
    err "   qwen3_xml tool parser MISSING"
  fi
  RP="$(run_in python3 -c \
    "import vllm.reasoning as R; print(sorted(R.ReasoningParserManager.lazy_parsers))")"
  echo "$RP" | grep -q nemotron_v3 && ok "   nemotron_v3 reasoning parser present" \
    || err "   nemotron_v3 reasoning parser MISSING"
else
  warn "   Skipping engine checks c) and d) - no GPU container available"
fi

# =====================================================================
step "7/7  Registering the model in Cortex"
if [ "$SKIP_CORTEX" = "1" ]; then
  log "Skipped by request (--skip-cortex)"
elif ! curl -sf --max-time 5 "$CORTEX_URL/health" >/dev/null 2>&1; then
  warn "Cortex gateway not answering at $CORTEX_URL"
  if [ -n "$CORTEX_REPO" ]; then
    warn "Start it with:  cd $CORTEX_REPO && make up"
  else
    warn "Start Cortex ('make up' in its repo), then run:"
  fi
  warn "  python3 $PKG/scripts/nemotron-configure-cortex.py"
elif [ ! -f "$PKG/scripts/nemotron-configure-cortex.py" ]; then
  warn "nemotron-configure-cortex.py missing from the package"
else
  log "Cortex is up - creating the model entry"
  if CORTEX_URL="$CORTEX_URL" DERIVED_IMAGE="$DERIVED_IMAGE" \
     MODEL_NAME="$MODEL_NAME" \
     python3 "$PKG/scripts/nemotron-configure-cortex.py"; then
    ok "Model registered in Cortex"
  else
    err "Cortex registration failed - see output above"
  fi
fi

# =====================================================================
step "Summary"
echo ""
echo "  Passed   : $PASSES"
echo "  Warnings : $WARNINGS"
echo "  Errors   : $ERRORS"
echo "  Log      : $LOG"
echo ""
if [ "$ERRORS" -eq 0 ]; then
  echo "${G}Import complete and verified.${N}"
  echo ""
  echo "Next: open the Cortex Admin UI, find 'Nemotron 3 Super 120B NVFP4',"
  echo "and press Start. First load takes 5-10 minutes (CUDA graph capture"
  echo "plus MTP init); the startup timeout is already set to 2400s."
  echo ""
  echo "Watch it with:"
  echo "  docker logs -f \$(docker ps --filter name=vllm-model- \\"
  echo "    --format '{{.Names}}' | head -1)"
  exit 0
else
  echo "${R}Import finished with $ERRORS error(s).${N}"
  echo "Send $LOG for troubleshooting - it records every check."
  exit 1
fi

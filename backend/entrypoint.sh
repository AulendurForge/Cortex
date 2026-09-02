#!/usr/bin/env bash
# Cortex gateway entrypoint.
#
# 1. Adds the detected host IP to CORS_ALLOW_ORIGINS when the list is localhost-only
#    (HOST_IP is normally provided by the Makefile; detection is the standalone-compose fallback).
# 2. Drops privileges to the `cortex` user, joining the group that owns /var/run/docker.sock.
#    Falls back to root (with a warning) when that cannot be done safely.
# 3. Starts uvicorn. Alembic migrations run inside the app at startup.
set -uo pipefail

log() { echo "[entrypoint] $*"; }

# --- 1. CORS / host IP -------------------------------------------------------
detect_container_host_ip() {
    # Under host networking `ip route get` returns the host's outbound interface address.
    local ip
    ip=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' | head -1 || true)
    if [[ -z "$ip" || "$ip" == 127.* ]]; then
        ip=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -vE '^(127\.|172\.(1[6-9]|2[0-9]|3[01])\.)' | head -1 || true)
    fi
    echo "${ip:-localhost}"
}

if [[ -n "${HOST_IP:-}" && "$HOST_IP" != "localhost" && "$HOST_IP" != "127.0.0.1" ]]; then
    DETECTED_IP="$HOST_IP"
else
    DETECTED_IP=$(detect_container_host_ip)
    log "HOST_IP not provided; detected ${DETECTED_IP}"
fi

FRONTEND_PORT="${FRONTEND_PORT:-3001}"
CURRENT_CORS="${CORS_ALLOW_ORIGINS:-}"
if [[ "$DETECTED_IP" != "localhost" && "$CURRENT_CORS" != *"$DETECTED_IP"* && "$CURRENT_CORS" != *"*"* ]]; then
    if [[ -z "$CURRENT_CORS" ]]; then
        export CORS_ALLOW_ORIGINS="http://${DETECTED_IP}:${FRONTEND_PORT},http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}"
    else
        export CORS_ALLOW_ORIGINS="http://${DETECTED_IP}:${FRONTEND_PORT},${CURRENT_CORS}"
    fi
    log "CORS_ALLOW_ORIGINS=${CORS_ALLOW_ORIGINS}"
fi

# --- 2. privilege drop -------------------------------------------------------
UVICORN=(uvicorn src.main:app --host 0.0.0.0 --port 8084)

drop_privileges() {
    # Returns 0 (and execs) when the gateway can run as `cortex`; returns 1 to stay root.
    command -v setpriv >/dev/null 2>&1 || { log "setpriv not available"; return 1; }
    id cortex >/dev/null 2>&1 || { log "user 'cortex' missing from the image"; return 1; }
    local uid gid groups_arg="--clear-groups"
    uid=$(id -u cortex); gid=$(id -g cortex)

    if [[ -S /var/run/docker.sock ]]; then
        local sock_gid
        sock_gid=$(stat -c %g /var/run/docker.sock 2>/dev/null || echo "")
        if [[ -n "$sock_gid" && "$sock_gid" != "0" ]]; then
            groups_arg="--groups=${sock_gid}"
        else
            log "docker.sock is owned by gid 0: cannot grant it to a non-root user, staying root"
            log "(fix on the host: chgrp docker /var/run/docker.sock)"
            return 1
        fi
    fi

    # Exports must be writable (deployment exports, db dumps). We are still root here, so fix the
    # ownership of the export directory ourselves instead of asking the admin to chown on the host.
    # The models dir is left alone: it only needs to be readable (multipart GGUF sets load from the first part).
    if [[ -d /var/cortex/exports ]] && ! setpriv --reuid="$uid" --regid="$gid" --clear-groups -- test -w /var/cortex/exports; then
        if chown "$uid:$gid" /var/cortex/exports 2>/dev/null && setpriv --reuid="$uid" --regid="$gid" --clear-groups -- test -w /var/cortex/exports; then
            log "made /var/cortex/exports writable for uid ${uid}"
        else
            log "WARNING: /var/cortex/exports is not writable by uid ${uid}; deployment exports will fail."
            log "         Fix on the host: sudo chown -R ${uid} /var/cortex/exports"
        fi
    fi
    # The models dir must accept new folders (bundle imports copy model files into it). Only the top-level
    # directory is chowned; existing model folders keep their ownership (they only need to be readable).
    if [[ -d /var/cortex/models ]] && ! setpriv --reuid="$uid" --regid="$gid" --clear-groups -- test -w /var/cortex/models; then
        if chown "$uid:$gid" /var/cortex/models 2>/dev/null && setpriv --reuid="$uid" --regid="$gid" --clear-groups -- test -w /var/cortex/models; then
            log "made /var/cortex/models (top level) writable for uid ${uid} so bundle imports can add models"
        else
            log "note: /var/cortex/models is read-only for uid ${uid}; bundle imports cannot copy model files (chown the directory on the host to fix)"
        fi
    fi
    for d in /host/media /host/mnt /host/run/media; do
        [[ -d "$d" ]] || continue
        setpriv --reuid="$uid" --regid="$gid" --clear-groups -- test -r "$d" || log "note: $d is not readable by uid ${uid}"
    done

    log "Starting uvicorn as cortex (uid ${uid}, gid ${gid}, supplementary ${groups_arg#--})"
    # setpriv keeps the environment: point HOME away from /root (asyncpg/httpx look for ~/.postgresql, ~/.cache)
    export HOME=/home/cortex USER=cortex LOGNAME=cortex
    exec setpriv --reuid="$uid" --regid="$gid" "$groups_arg" -- "${UVICORN[@]}"
}

if [[ "$(id -u)" -eq 0 && "${CORTEX_RUN_AS_ROOT:-false}" != "true" ]]; then
    drop_privileges || log "WARNING: running as root (set CORTEX_RUN_AS_ROOT=true to silence this)"
fi

# --- 3. run ------------------------------------------------------------------
log "Starting uvicorn as $(id -un)"
exec "${UVICORN[@]}"

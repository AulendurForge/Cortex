#!/usr/bin/env bash
# Production pre-flight check for docker.compose.prod.yaml.
#
# Validates the environment compose will actually see (.env in the repo root + the current
# shell), the rendered compose config, image pins and the secrets. Exits non-zero on any
# failure so it can gate a deployment:  make prod-check && make up ENV=prod
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
COMPOSE_FILE="${COMPOSE_FILE:-docker.compose.prod.yaml}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
FAIL=0; WARN=0
ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $*"; WARN=$((WARN+1)); }
fail() { echo -e "  ${RED}✗${NC} $*"; FAIL=$((FAIL+1)); }

# Load versions.env then .env (compose precedence: shell > .env > compose defaults)
set -a
[ -f versions.env ] && . ./versions.env
if [ -f .env ]; then
    # shellcheck disable=SC1091
    . ./.env
fi
set +a

echo -e "${BOLD}Production readiness check (${COMPOSE_FILE})${NC}"
echo ""
echo -e "${BOLD}1. Required secrets${NC}"

check_secret() {
    local name="$1" min="$2"; shift 2
    local val="${!name:-}"
    if [ -z "$val" ]; then
        fail "$name is not set (add it to .env: $name=\$(openssl rand -hex 32))"; return
    fi
    for bad in "$@"; do
        if [ "$val" = "$bad" ]; then fail "$name is the default/example value '$bad'"; return; fi
    done
    if [ "${#val}" -lt "$min" ]; then fail "$name is shorter than $min characters"; return; fi
    ok "$name set (${#val} chars)"
}
check_secret INTERNAL_VLLM_API_KEY 16 dev-internal-token changeme
check_secret SESSION_SECRET 32 changeme
check_secret ADMIN_BOOTSTRAP_PASSWORD 12 admin password changeme
if [ -n "${POSTGRES_PASSWORD:-}" ] && [ "${POSTGRES_PASSWORD}" != "cortex" ]; then
    ok "POSTGRES_PASSWORD customised"
else
    warn "POSTGRES_PASSWORD is the default 'cortex' (Postgres is loopback-only, but change it anyway)"
fi

echo ""
echo -e "${BOLD}2. Origins and cookies${NC}"
if [ -z "${CORS_ALLOW_ORIGINS:-}" ]; then
    fail "CORS_ALLOW_ORIGINS is not set (the exact UI origin, e.g. https://cortex.example.com)"
elif [[ "$CORS_ALLOW_ORIGINS" == *"*"* ]]; then
    fail "CORS_ALLOW_ORIGINS contains '*' (never with cookie auth)"
else
    ok "CORS_ALLOW_ORIGINS=$CORS_ALLOW_ORIGINS"
    if [[ "$CORS_ALLOW_ORIGINS" == *"http://"* ]]; then
        warn "CORS_ALLOW_ORIGINS has a plain-http origin; the admin session cookie will travel unencrypted"
        if [ "${SESSION_COOKIE_SECURE:-true}" = "true" ]; then
            warn "SESSION_COOKIE_SECURE=true (default) but the UI origin is http: logins will not stick. Use TLS or set SESSION_COOKIE_SECURE=false"
        fi
    fi
fi
if [ "${GATEWAY_DEV_ALLOW_ALL_KEYS:-false}" = "true" ]; then
    fail "GATEWAY_DEV_ALLOW_ALL_KEYS=true in the environment"
else
    ok "GATEWAY_DEV_ALLOW_ALL_KEYS is off"
fi

echo ""
echo -e "${BOLD}3. Rendered compose config${NC}"
RENDERED=$(docker compose -f "$COMPOSE_FILE" config 2>&1)
if [ $? -ne 0 ]; then
    fail "docker compose config failed:"; echo "$RENDERED" | sed 's/^/      /' | head -5
    RENDERED=""
else
    ok "compose file renders"
    if echo "$RENDERED" | grep -E '^\s+image:' | grep -qE ':latest\b|:latest$'; then
        fail "an image uses the :latest tag:"; echo "$RENDERED" | grep -E '^\s+image:' | grep -E ':latest' | sed 's/^/      /'
    else
        ok "no :latest image tags"
    fi
    while read -r img; do
        case "$img" in
            *:*) ;;
            *) fail "image without a tag: $img" ;;
        esac
    done < <(echo "$RENDERED" | grep -E '^\s+image:' | awk '{print $2}')
    if echo "$RENDERED" | grep -qE 'GATEWAY_DEV_ALLOW_ALL_KEYS: "?true"?'; then
        fail "rendered config still has GATEWAY_DEV_ALLOW_ALL_KEYS=true"
    else
        ok "GATEWAY_DEV_ALLOW_ALL_KEYS=false in rendered config"
    fi
    if echo "$RENDERED" | grep -qE '^\s+pgadmin:'; then
        warn "pgadmin service is present in the production stack"
    else
        ok "no pgadmin in production"
    fi
    if echo "$RENDERED" | grep -qE 'restart: unless-stopped'; then ok "restart policies set"; else fail "no restart: unless-stopped"; fi
fi

echo ""
echo -e "${BOLD}4. Image pins${NC}"
for var in VLLM_IMAGE LLAMACPP_IMAGE PROMETHEUS_IMAGE NODE_EXPORTER_IMAGE DCGM_EXPORTER_IMAGE CADVISOR_IMAGE POSTGRES_IMAGE REDIS_IMAGE; do
    val="${!var:-}"
    if [ -z "$val" ]; then fail "$var missing from versions.env"; continue; fi
    case "$val" in
        *:latest|*[!:]*) [[ "$val" == *:* && "$val" != *:latest ]] && ok "$var=$val" || fail "$var=$val is not pinned" ;;
    esac
done
cfg_vllm=$(grep -E '^\s+VLLM_IMAGE: str = ' backend/src/config.py | sed -E 's/.*= "([^"]+)".*/\1/')
cfg_llama=$(grep -E '^\s+LLAMACPP_IMAGE: str = ' backend/src/config.py | sed -E 's/.*= "([^"]+)".*/\1/')
[ "$cfg_vllm" = "${VLLM_IMAGE:-}" ] && ok "backend/src/config.py VLLM_IMAGE matches versions.env" || fail "config.py VLLM_IMAGE ($cfg_vllm) != versions.env (${VLLM_IMAGE:-})"
[ "$cfg_llama" = "${LLAMACPP_IMAGE:-}" ] && ok "backend/src/config.py LLAMACPP_IMAGE matches versions.env" || fail "config.py LLAMACPP_IMAGE ($cfg_llama) != versions.env (${LLAMACPP_IMAGE:-})"
for img in "cortex-gateway:${CORTEX_VERSION:-}" "cortex-frontend:${CORTEX_VERSION:-}"; do
    if docker image inspect "$img" >/dev/null 2>&1; then ok "$img built"; else warn "$img not built yet (make build ENV=prod)"; fi
done
if [ "${OFFLINE_MODE:-false}" = "true" ]; then
    for img in "${VLLM_IMAGE:-}" "${LLAMACPP_IMAGE:-}"; do
        docker image inspect "$img" >/dev/null 2>&1 && ok "$img cached (offline)" || fail "OFFLINE_MODE=true but $img is not loaded (make load-offline)"
    done
fi

echo ""
echo -e "${BOLD}5. Host${NC}"
for d in "${CORTEX_MODELS_DIR:-/var/cortex/models}" "${HF_CACHE_DIR:-/var/cortex/hf-cache}" "${CORTEX_EXPORT_DIR:-/var/cortex/exports}"; do
    if [ -d "$d" ]; then ok "$d exists"; else fail "$d does not exist (mkdir -p and chown 1000)"; fi
done
if [ -S /var/run/docker.sock ]; then
    gid=$(stat -c %g /var/run/docker.sock)
    [ "$gid" != "0" ] && ok "docker.sock group gid $gid (gateway joins it at start)" || warn "docker.sock owned by gid 0; set CORTEX_RUN_AS_ROOT=true or chgrp docker /var/run/docker.sock"
fi
if command -v ss >/dev/null 2>&1; then
    for p in 8084 "${PROM_PORT:-19090}"; do
        if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]${p}$"; then
            if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^cortex-'; then ok "port $p in use (Cortex running)"; else warn "port $p already in use by another process (set PROM_PORT in .env)"; fi
        fi
    done
fi
command -v nvidia-smi >/dev/null 2>&1 && ok "nvidia-smi present (driver $(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1))" || warn "nvidia-smi not found: GPU models will not start"

echo ""
echo -e "${BOLD}6. Reminders (not checked)${NC}"
echo "  - TLS reverse proxy in front of :3001 and :8084 (docs/operations/production-deployment.md)"
echo "  - Firewall: only the proxy ports exposed; 8084/3001/19090 stay LAN-internal or loopback"
echo "  - Backups scheduled (make db-backup) and restore tested"
echo ""
if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}${BOLD}✗ $FAIL failure(s), $WARN warning(s). Not ready for production.${NC}"
    exit 1
fi
echo -e "${GREEN}${BOLD}✓ Ready (${WARN} warning(s)).${NC}"

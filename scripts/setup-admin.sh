#!/usr/bin/env bash
# Set or reset the admin login. Works before the first start (writes .env so the gateway
# bootstraps the account) and on a running system (updates the account in the database).
#
#   make setup-admin                      interactive: username, password twice
#   SETUP_ADMIN_USERNAME=ops SETUP_ADMIN_PASSWORD=... make setup-admin   non-interactive
#   LOGOUT_ALL=1 make setup-admin         also invalidate every signed-in session (restarts the gateway)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
. scripts/env-file.sh
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; RED='\033[0;31m'; NC='\033[0m'
GATEWAY_CONTAINER=${GATEWAY_CONTAINER:-cortex-gateway-1}

[ -f "$ENV_FILE" ] || { cp .env.example "$ENV_FILE"; chmod 600 "$ENV_FILE"; }
current=$(env_get ADMIN_BOOTSTRAP_USERNAME)
user=${SETUP_ADMIN_USERNAME:-}; pass=${SETUP_ADMIN_PASSWORD:-}
if [ -z "$user" ] || [ -z "$pass" ]; then
    require_tty "SETUP_ADMIN_USERNAME and SETUP_ADMIN_PASSWORD must be set when no terminal is attached"
    echo -e "${BOLD}Cortex admin account${NC}"
    [ -z "$user" ] && { read -rp "Admin username [${current:-admin}]: " user; user=${user:-${current:-admin}}; }
    [ -z "$pass" ] && prompt_password pass
fi
[ "${#pass}" -ge 8 ] || { echo -e "${RED}password must be at least 8 characters${NC}"; exit 1; }

env_set ADMIN_BOOTSTRAP_USERNAME "$user"
env_set ADMIN_BOOTSTRAP_PASSWORD "$pass"
[ -n "$(env_get ADMIN_BOOTSTRAP_ORG)" ] || env_set ADMIN_BOOTSTRAP_ORG "Default"
chmod 600 "$ENV_FILE"
echo -e "${GREEN}✓ saved to $ENV_FILE${NC} (used to bootstrap the first admin on a fresh database)"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$GATEWAY_CONTAINER"; then
    logout_all=${LOGOUT_ALL:-}
    if [ -z "$logout_all" ] && [ -t 0 ]; then
        read -rp "Sign out every active admin session as well? (restarts the gateway) [y/N]: " a
        [[ "$a" =~ ^[Yy]$ ]] && logout_all=1
    fi
    args=()
    [ "${logout_all:-0}" = "1" ] && args+=(--rotate-session-secret)
    # the password travels over stdin, never as a process argument
    if printf '%s' "$pass" | docker exec -i -e CORTEX_ADMIN_USERNAME="$user" "$GATEWAY_CONTAINER" python -m src.tools.set_admin "${args[@]}"; then
        echo -e "${GREEN}✓ admin '$user' updated in the running gateway${NC}"
        if [ "${logout_all:-0}" = "1" ]; then
            # sessions are signed with SESSION_SECRET: a new value invalidates every cookie
            env_set SESSION_SECRET "$(random_hex)"
            make --no-print-directory up >/dev/null && echo -e "${GREEN}✓ SESSION_SECRET rotated and gateway recreated; all sessions signed out${NC}"
        fi
    else
        echo -e "${RED}updating the running gateway failed (see above); $ENV_FILE was still updated${NC}"; exit 1
    fi
else
    echo -e "${YELLOW}gateway is not running: the account is created at the next 'make up'${NC}"
fi

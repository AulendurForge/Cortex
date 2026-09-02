#!/usr/bin/env bash
# Make sure the root .env has everything the stack needs before `make up`:
#   - creates .env from .env.example when missing
#   - asks for the admin username/password ONLY while they are blank (password typed twice)
#   - generates INTERNAL_VLLM_API_KEY and SESSION_SECRET when blank
# Non-interactive runs (CI, scripts) must provide the values in .env or the environment:
#   ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD  (or SETUP_ADMIN_USERNAME / SETUP_ADMIN_PASSWORD)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
. scripts/env-file.sh
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'

if [ ! -f "$ENV_FILE" ]; then
    cp .env.example "$ENV_FILE"; chmod 600 "$ENV_FILE"
    echo -e "${GREEN}created $ENV_FILE from .env.example${NC}"
fi
chmod 600 "$ENV_FILE" 2>/dev/null || true

changed=0
# --- secrets shared between gateway and model containers ---------------------------------
if [ -z "$(env_get INTERNAL_VLLM_API_KEY)" ]; then
    env_set INTERNAL_VLLM_API_KEY "${INTERNAL_VLLM_API_KEY:-$(random_hex)}"; changed=1
    echo -e "${GREEN}generated INTERNAL_VLLM_API_KEY${NC}"
    # model containers are started with this key baked in: ones already running keep the old value
    if [ "$(docker ps -q --filter label=cortex.managed=1 2>/dev/null | wc -l)" -gt 0 ]; then
        echo -e "${YELLOW}running model containers still use the previous key: restart them after 'make up' (Models → Apply / Start)${NC}"
    fi
fi
if [ -z "$(env_get SESSION_SECRET)" ]; then
    env_set SESSION_SECRET "${SESSION_SECRET:-$(random_hex)}"; changed=1
    echo -e "${GREEN}generated SESSION_SECRET${NC}"
fi

# --- first admin --------------------------------------------------------------------------
file_user=$(env_get ADMIN_BOOTSTRAP_USERNAME); file_pass=$(env_get ADMIN_BOOTSTRAP_PASSWORD)
if [ -z "$file_user" ] || [ -z "$file_pass" ]; then
    # values may come from the environment (automation) or from the terminal
    user=${file_user:-${SETUP_ADMIN_USERNAME:-${ADMIN_BOOTSTRAP_USERNAME:-}}}
    pass=${file_pass:-${SETUP_ADMIN_PASSWORD:-${ADMIN_BOOTSTRAP_PASSWORD:-}}}
    if [ -z "$user" ] || [ -z "$pass" ]; then
        require_tty "ADMIN_BOOTSTRAP_USERNAME / ADMIN_BOOTSTRAP_PASSWORD are not set in $ENV_FILE and no terminal is attached. Set them (or SETUP_ADMIN_USERNAME / SETUP_ADMIN_PASSWORD) and retry, or run: make setup-admin"
        echo -e "${BOLD}Admin account${NC}  (creates the first admin; change later with: make setup-admin)"
        [ -z "$user" ] && { read -rp "Admin username [admin]: " user; user=${user:-admin}; }
        [ -z "$pass" ] && prompt_password pass
    fi
    [ "${#pass}" -ge 8 ] || { echo "admin password must be at least 8 characters" >&2; exit 1; }
    env_set ADMIN_BOOTSTRAP_USERNAME "$user"
    env_set ADMIN_BOOTSTRAP_PASSWORD "$pass"
    [ -n "$(env_get ADMIN_BOOTSTRAP_ORG)" ] || env_set ADMIN_BOOTSTRAP_ORG "Default"
    changed=1
    echo -e "${GREEN}admin credentials for '$user' saved to $ENV_FILE (mode 600)${NC}"
fi
[ "$changed" = "1" ] && echo -e "${YELLOW}$ENV_FILE holds secrets: keep it out of git (it is ignored) and back it up with the database.${NC}"
exit 0

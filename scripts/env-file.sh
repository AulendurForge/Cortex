#!/usr/bin/env bash
# Helpers for the root .env (sourced by ensure-env.sh and setup-admin.sh).
ENV_FILE=${ENV_FILE:-.env}

# env_get KEY -> value of the last uncommented KEY=... line ("" if unset)
env_get() { { grep -E "^${1}=" "$ENV_FILE" 2>/dev/null || true; } | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/'; return 0; }

# env_set KEY VALUE -> replaces the (possibly commented) KEY= line or appends it; never echoes the value
env_set() {
    local key="$1" value="$2" tmp
    tmp=$(mktemp)
    if grep -qE "^#?${key}=" "$ENV_FILE" 2>/dev/null; then
        # replace only the first match, drop other duplicates
        awk -v k="$key" -v v="$value" 'BEGIN{done=0} $0 ~ "^#?"k"=" { if (!done) { print k"="v; done=1 } ; next } { print }' "$ENV_FILE" > "$tmp"
    else
        cat "$ENV_FILE" > "$tmp" 2>/dev/null; printf '%s=%s\n' "$key" "$value" >> "$tmp"
    fi
    cat "$tmp" > "$ENV_FILE"; rm -f "$tmp"
}

random_hex() { openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

# prompt_password VAR  -> asks twice (hidden), requires >= 8 chars, stores in the named variable
prompt_password() {
    local __var="$1" p1 p2
    while true; do
        read -rsp "Admin password (min 8 characters): " p1; echo ""
        if [ "${#p1}" -lt 8 ]; then echo "  too short"; continue; fi
        read -rsp "Repeat password: " p2; echo ""
        if [ "$p1" != "$p2" ]; then echo "  passwords do not match, try again"; continue; fi
        printf -v "$__var" '%s' "$p1"; return 0
    done
}

require_tty() { [ -t 0 ] || { echo "$1" >&2; exit 1; }; }

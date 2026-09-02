#!/usr/bin/env bash
# Pre-flight for `make up`: every host port the compose file publishes must be free or already
# held by one of our own containers. Compose otherwise aborts half-way through `up` with
# "port is already allocated" (Cockpit uses 9090, host node_exporter uses 9100, ...).
# Usage: scripts/check-ports.sh <docker compose ... command prefix>
set -uo pipefail
COMPOSE="$*"
command -v ss >/dev/null 2>&1 || exit 0          # no ss: skip the check
YELLOW='\033[1;33m'; NC='\033[0m'

declare -A HINT=( [9090]=PROM_PORT [9100]=NODE_EXPORTER_PORT [8085]=CADVISOR_PORT [9400]=DCGM_PORT
                  [3001]=FRONTEND_PORT [15432]=CORTEX_POSTGRES_PORT [16379]=CORTEX_REDIS_PORT [5050]=PGADMIN_PORT )

# published host ports of the rendered config (compose v2 prints `published: "9090"`)
ports=$(eval "$COMPOSE config" 2>/dev/null | grep -E '^\s+published:' | grep -oE '[0-9]+' | sort -un)
[ -n "$ports" ] || exit 0
listening=$(ss -ltn 2>/dev/null | awk 'NR>1 {print $4}' | sed -E 's/.*[:.]([0-9]+)$/\1/' | sort -un)
ours=$(docker ps --format '{{.Label "com.docker.compose.project"}} {{.Ports}}' 2>/dev/null | awk '$1=="cortex"' | grep -oE ':[0-9]+->' | tr -d ':>-' | sort -un)

busy=()
for p in $ports; do
    grep -qx "$p" <<< "$listening" || continue
    grep -qx "$p" <<< "$ours" && continue
    busy+=("$p")
done
[ "${#busy[@]}" -eq 0 ] && exit 0
for p in "${busy[@]}"; do
    var=${HINT[$p]:-"the port variable"}
    echo -e "${YELLOW}Port $p is in use by another program.${NC}  Set ${var}=<free port> in .env (e.g. ${var}=$((p+4)))"
done
echo "Then run make up again. (Check with: ss -ltnp | grep :$p)"
exit 1

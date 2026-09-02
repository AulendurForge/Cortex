#!/usr/bin/env bash
# Verify that every image pinned in versions.env (plus the built Cortex images) is present
# locally, so the stack can start without pulling. Exit 1 if a critical image is missing.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

[ -f versions.env ] || { echo -e "${RED}versions.env not found${NC}"; exit 1; }
set -a; . ./versions.env; set +a
# root .env may override engine images (e.g. a -cu129 tag or a local registry)
if [ -f .env ]; then set -a; . ./.env; set +a; fi

echo -e "${BOLD}Cortex offline readiness (versions.env)${NC}"
echo ""

REQUIRED_IMAGES=(
    "${VLLM_IMAGE}|Critical - vLLM engine"
    "${LLAMACPP_IMAGE}|Critical - llama.cpp engine"
    "cortex-gateway:${CORTEX_VERSION}|Critical - Cortex gateway (built or loaded)"
    "cortex-frontend:${CORTEX_VERSION}|Critical - Cortex frontend (built or loaded)"
    "${POSTGRES_IMAGE}|Critical - Database"
    "${REDIS_IMAGE}|Critical - Cache / rate limiting"
    "${PROMETHEUS_IMAGE}|Required - Metrics"
    "${NODE_EXPORTER_IMAGE}|Optional - Host metrics"
    "${DCGM_EXPORTER_IMAGE}|Optional - GPU metrics"
    "${CADVISOR_IMAGE}|Optional - Container metrics"
    "cortex-gateway-deps:${CORTEX_VERSION}|Optional - Gateway dependencies (make build-offline)"
    "cortex-frontend-deps:${CORTEX_VERSION}|Optional - Frontend dependencies (make build-offline)"
    "${PYTHON_IMAGE}|Optional - Gateway base image (rebuild only)"
    "${NODE_IMAGE}|Optional - Frontend base image (rebuild only)"
)

INSPECT_TIMEOUT_SEC=${INSPECT_TIMEOUT_SEC:-15}
inspect() {
    if command -v timeout >/dev/null 2>&1; then timeout --preserve-status "$INSPECT_TIMEOUT_SEC" docker image inspect "$@"; else docker image inspect "$@"; fi
}

CACHED=0; MISSING_CRITICAL=0; MISSING_OPTIONAL=0
for entry in "${REQUIRED_IMAGES[@]}"; do
    IFS='|' read -r image description <<< "$entry"
    printf "  %-62s " "$image"
    if inspect "$image" >/dev/null 2>&1; then
        SIZE=$(inspect "$image" --format='{{.Size}}' | awk '{printf "%.1f GB", $1/1024/1024/1024}')
        echo -e "${GREEN}✓${NC} ($SIZE)"; CACHED=$((CACHED+1))
    elif [[ "$description" == Critical* ]] || [[ "$description" == Required* ]]; then
        echo -e "${RED}✗ MISSING (${description})${NC}"; MISSING_CRITICAL=$((MISSING_CRITICAL+1))
    else
        echo -e "${YELLOW}⚠ missing (${description})${NC}"; MISSING_OPTIONAL=$((MISSING_OPTIONAL+1))
    fi
done

# Per-model engine_image overrides stored in the database escape versions.env; list them.
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^cortex-postgres-1$'; then
    OVERRIDES=$(docker exec cortex-postgres-1 psql -U cortex -d cortex -tA \
        -c "SELECT DISTINCT engine_image FROM models WHERE engine_image IS NOT NULL AND engine_image <> '' AND archived = false" 2>/dev/null || true)
    if [ -n "$OVERRIDES" ]; then
        echo ""
        echo -e "${BLUE}Per-model engine_image overrides:${NC}"
        while read -r img; do
            [ -z "$img" ] && continue
            printf "  %-62s " "$img"
            if inspect "$img" >/dev/null 2>&1; then echo -e "${GREEN}✓${NC}"; else echo -e "${RED}✗ MISSING${NC}"; MISSING_CRITICAL=$((MISSING_CRITICAL+1)); fi
        done <<< "$OVERRIDES"
    fi
fi

echo ""
echo -e "Cached: ${GREEN}${CACHED}${NC}   Missing critical: ${RED}${MISSING_CRITICAL}${NC}   Missing optional: ${YELLOW}${MISSING_OPTIONAL}${NC}"
if [ "$MISSING_CRITICAL" -gt 0 ]; then
    echo -e "${RED}${BOLD}✗ NOT READY FOR OFFLINE OPERATION${NC}"
    echo "  On a connected host: make prepare-offline   ->  transfer  ->  make load-offline"
    exit 1
fi
echo -e "${GREEN}${BOLD}✓ Ready for offline operation${NC}"
if grep -qsE '^OFFLINE_MODE=(true|True|1)' .env 2>/dev/null; then
    echo "  OFFLINE_MODE enabled in .env"
else
    echo "  Tip: echo 'OFFLINE_MODE=true' >> .env   (prevents any image pull attempt)"
fi

#!/usr/bin/env bash
# Cortex External Access Diagnostic Script
# Tests connectivity from various perspectives (host, Docker containers, network)
#
# Cortex gateway runs with host network mode, making it accessible from:
# - Any Docker container via host.docker.internal:8084
# - Any LAN device via <HOST_IP>:8084
# - Localhost via 127.0.0.1:8084
#
# Usage: ./scripts/test-external-access.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Default values
CORTEX_PORT="${GATEWAY_PORT:-8084}"
CORTEX_API_KEY="${CORTEX_API_KEY:-}"

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}Cortex External Access Diagnostic${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""
echo -e "${BLUE}Architecture:${NC} Gateway runs with host network mode"
echo -e "${BLUE}API Base URL:${NC} http://<HOST_IP>:${CORTEX_PORT}/v1"
echo ""

# Detect host IP
HOST_IP=$(bash "$(dirname "$0")/detect-ip.sh" 2>/dev/null || echo "localhost")
echo -e "${BLUE}Detected Host IP:${NC} ${BOLD}$HOST_IP${NC}"
echo ""

# ============================================================================
# TEST 1: Check what interface Cortex is binding to
# ============================================================================
echo -e "${BOLD}1. Checking Cortex Gateway Binding${NC}"
echo ""

# Check port binding on host
BINDING=$(ss -tlnp 2>/dev/null | grep ":$CORTEX_PORT " || netstat -tlnp 2>/dev/null | grep ":$CORTEX_PORT " || echo "")

if [[ -z "$BINDING" ]]; then
    echo -e "${RED}✗${NC} Port $CORTEX_PORT not found in listening sockets"
    echo -e "  ${YELLOW}→${NC} Cortex gateway may not be running"
    echo -e "  ${YELLOW}→${NC} Start with: make up"
else
    echo -e "  ${BLUE}Raw binding info:${NC}"
    echo "  $BINDING"
    
    if [[ "$BINDING" == *"0.0.0.0:$CORTEX_PORT"* ]] || [[ "$BINDING" == *":::$CORTEX_PORT"* ]]; then
        echo -e "${GREEN}✓${NC} Cortex is bound to ALL interfaces (0.0.0.0:$CORTEX_PORT)"
        echo -e "  ${GREEN}→${NC} Gateway is using host network mode - accessible from anywhere"
    elif [[ "$BINDING" == *"127.0.0.1:$CORTEX_PORT"* ]]; then
        echo -e "${RED}✗${NC} Cortex is bound to localhost ONLY (127.0.0.1:$CORTEX_PORT)"
        echo -e "  ${RED}→${NC} External connections will fail!"
        echo -e "  ${YELLOW}→${NC} Fix: Ensure docker-compose uses network_mode: host"
    else
        echo -e "${YELLOW}⚠${NC} Unusual binding detected"
    fi
fi
echo ""

# ============================================================================
# TEST 2: Test localhost connection
# ============================================================================
echo -e "${BOLD}2. Testing Localhost Connection${NC}"
echo ""

LOCALHOST_RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://127.0.0.1:$CORTEX_PORT/health" \
    --connect-timeout 5 2>/dev/null || echo "000")

if [[ "$LOCALHOST_RESULT" == "200" ]]; then
    echo -e "${GREEN}✓${NC} localhost:$CORTEX_PORT → HTTP 200 OK"
else
    echo -e "${RED}✗${NC} localhost:$CORTEX_PORT → HTTP $LOCALHOST_RESULT"
fi

# ============================================================================
# TEST 3: Test LAN IP connection (from host)
# ============================================================================
echo -e "${BOLD}3. Testing LAN IP Connection (from host)${NC}"
echo ""

LAN_RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://$HOST_IP:$CORTEX_PORT/health" \
    --connect-timeout 5 2>/dev/null || echo "000")

if [[ "$LAN_RESULT" == "200" ]]; then
    echo -e "${GREEN}✓${NC} $HOST_IP:$CORTEX_PORT → HTTP 200 OK"
else
    echo -e "${RED}✗${NC} $HOST_IP:$CORTEX_PORT → HTTP $LAN_RESULT"
fi

# ============================================================================
# TEST 4: Test /v1/models endpoint (OpenAI compatibility)
# ============================================================================
echo -e "${BOLD}4. Testing OpenAI-Compatible /v1/models Endpoint${NC}"
echo ""

HEADERS=""
if [[ -n "$CORTEX_API_KEY" ]]; then
    HEADERS="-H \"Authorization: Bearer $CORTEX_API_KEY\""
fi

MODELS_RESULT=$(curl -s -w "\n%{http_code}" \
    "http://$HOST_IP:$CORTEX_PORT/v1/models" \
    ${HEADERS:+-H "Authorization: Bearer $CORTEX_API_KEY"} \
    --connect-timeout 5 2>/dev/null || echo -e "\n000")

MODELS_HTTP=$(echo "$MODELS_RESULT" | tail -1)
MODELS_BODY=$(echo "$MODELS_RESULT" | head -n -1)

if [[ "$MODELS_HTTP" == "200" ]]; then
    echo -e "${GREEN}✓${NC} GET /v1/models → HTTP 200 OK"
    echo -e "  ${BLUE}Response:${NC}"
    echo "$MODELS_BODY" | head -5
    if [[ $(echo "$MODELS_BODY" | wc -l) -gt 5 ]]; then
        echo "  ... (truncated)"
    fi
else
    echo -e "${RED}✗${NC} GET /v1/models → HTTP $MODELS_HTTP"
    if [[ -n "$MODELS_BODY" ]]; then
        echo -e "  ${RED}Error:${NC} $MODELS_BODY"
    fi
fi
echo ""

# ============================================================================
# TEST 5: Test from Docker container using host.docker.internal
# ============================================================================
echo -e "${BOLD}5. Testing from Docker Container (host.docker.internal)${NC}"
echo ""

DOCKER_HDI_RESULT=$(docker run --rm \
    --add-host=host.docker.internal:host-gateway \
    curlimages/curl:latest \
    curl -s -o /dev/null -w "%{http_code}" \
    "http://host.docker.internal:$CORTEX_PORT/health" \
    --connect-timeout 10 2>/dev/null || echo "000")

if [[ "$DOCKER_HDI_RESULT" == "200" ]]; then
    echo -e "${GREEN}✓${NC} Docker → host.docker.internal:$CORTEX_PORT → HTTP 200 OK"
    echo -e "  ${GREEN}→${NC} MAGE should use host.docker.internal:$CORTEX_PORT as Cortex URL"
else
    echo -e "${RED}✗${NC} Docker → host.docker.internal:$CORTEX_PORT → HTTP $DOCKER_HDI_RESULT"
    echo -e "  ${YELLOW}→${NC} host.docker.internal may not resolve correctly"
fi
echo ""

# ============================================================================
# TEST 6: Test from Docker container using LAN IP
# ============================================================================
echo -e "${BOLD}6. Testing from Docker Container (LAN IP)${NC}"
echo ""

DOCKER_LAN_RESULT=$(docker run --rm \
    curlimages/curl:latest \
    curl -s -o /dev/null -w "%{http_code}" \
    "http://$HOST_IP:$CORTEX_PORT/health" \
    --connect-timeout 10 2>/dev/null || echo "000")

if [[ "$DOCKER_LAN_RESULT" == "200" ]]; then
    echo -e "${GREEN}✓${NC} Docker → $HOST_IP:$CORTEX_PORT → HTTP 200 OK"
    echo -e "  ${GREEN}→${NC} MAGE can use $HOST_IP:$CORTEX_PORT as Cortex URL"
else
    echo -e "${RED}✗${NC} Docker → $HOST_IP:$CORTEX_PORT → HTTP $DOCKER_LAN_RESULT"
    echo -e "  ${YELLOW}→${NC} This may be a firewall or Docker network issue"
fi
echo ""

# ============================================================================
# TEST 7: Test from Docker container using Docker bridge gateway
# ============================================================================
echo -e "${BOLD}7. Testing from Docker Container (Bridge Gateway)${NC}"
echo ""

# Get Docker bridge gateway IP
DOCKER_GATEWAY=$(docker network inspect bridge --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || echo "172.17.0.1")
echo -e "  ${BLUE}Docker bridge gateway:${NC} $DOCKER_GATEWAY"

DOCKER_GW_RESULT=$(docker run --rm \
    curlimages/curl:latest \
    curl -s -o /dev/null -w "%{http_code}" \
    "http://$DOCKER_GATEWAY:$CORTEX_PORT/health" \
    --connect-timeout 10 2>/dev/null || echo "000")

if [[ "$DOCKER_GW_RESULT" == "200" ]]; then
    echo -e "${GREEN}✓${NC} Docker → $DOCKER_GATEWAY:$CORTEX_PORT → HTTP 200 OK"
else
    echo -e "${RED}✗${NC} Docker → $DOCKER_GATEWAY:$CORTEX_PORT → HTTP $DOCKER_GW_RESULT"
fi
echo ""

# ============================================================================
# TEST 8: Check Docker network configuration
# ============================================================================
echo -e "${BOLD}8. Docker Network Configuration${NC}"
echo ""

# Check if Cortex has its own network
CORTEX_NETWORK=$(docker network ls --filter "name=cortex" --format "{{.Name}}" 2>/dev/null | head -1)
if [[ -n "$CORTEX_NETWORK" ]]; then
    echo -e "  ${BLUE}Cortex network:${NC} $CORTEX_NETWORK"
    
    # Get network details
    NETWORK_SUBNET=$(docker network inspect "$CORTEX_NETWORK" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || echo "unknown")
    echo -e "  ${BLUE}Network subnet:${NC} $NETWORK_SUBNET"
    
    # Get gateway container IP
    GATEWAY_IP=$(docker inspect cortex-gateway-1 --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || echo "")
    if [[ -n "$GATEWAY_IP" ]]; then
        echo -e "  ${BLUE}Gateway container IP:${NC} $GATEWAY_IP"
    fi
fi
echo ""

# ============================================================================
# TEST 9: Check iptables/firewall rules
# ============================================================================
echo -e "${BOLD}9. Firewall/iptables Check${NC}"
echo ""

# Check if iptables is available
if command -v iptables &> /dev/null; then
    # Check DOCKER-USER chain for any blocking rules
    DOCKER_USER_RULES=$(sudo iptables -L DOCKER-USER -n 2>/dev/null | grep -v "Chain\|target" || echo "")
    if [[ -n "$DOCKER_USER_RULES" ]]; then
        echo -e "  ${BLUE}DOCKER-USER chain rules:${NC}"
        echo "$DOCKER_USER_RULES" | head -5
    else
        echo -e "  ${GREEN}✓${NC} No blocking rules in DOCKER-USER chain"
    fi
    
    # Check for port-specific rules
    PORT_RULES=$(sudo iptables -L -n 2>/dev/null | grep "$CORTEX_PORT" || echo "")
    if [[ -n "$PORT_RULES" ]]; then
        echo -e "  ${BLUE}Rules mentioning port $CORTEX_PORT:${NC}"
        echo "$PORT_RULES"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} iptables not available for checking"
fi
echo ""

# ============================================================================
# SUMMARY AND RECOMMENDATIONS
# ============================================================================
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}Summary & Recommendations${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""

# Count successes
PASS_COUNT=0
[[ "$LOCALHOST_RESULT" == "200" ]] && ((PASS_COUNT++))
[[ "$LAN_RESULT" == "200" ]] && ((PASS_COUNT++))
[[ "$DOCKER_HDI_RESULT" == "200" ]] && ((PASS_COUNT++))
[[ "$DOCKER_LAN_RESULT" == "200" ]] && ((PASS_COUNT++))

echo -e "Tests passed: ${GREEN}$PASS_COUNT/4${NC}"
echo ""

# Provide recommendations based on results
if [[ "$DOCKER_HDI_RESULT" == "200" ]]; then
    echo -e "${GREEN}✓ RECOMMENDED CONFIGURATION FOR MAGE:${NC}"
    echo ""
    echo -e "  ${BOLD}Cortex URL:${NC} http://host.docker.internal:$CORTEX_PORT/v1"
    echo ""
    echo -e "  ${BLUE}Important:${NC} MAGE's Docker containers must be started with:"
    echo -e "    --add-host=host.docker.internal:host-gateway"
    echo ""
    echo -e "  Or in docker-compose.yaml:"
    echo -e "    extra_hosts:"
    echo -e "      - \"host.docker.internal:host-gateway\""
    echo ""
elif [[ "$DOCKER_LAN_RESULT" == "200" ]]; then
    echo -e "${GREEN}✓ RECOMMENDED CONFIGURATION FOR MAGE:${NC}"
    echo ""
    echo -e "  ${BOLD}Cortex URL:${NC} http://$HOST_IP:$CORTEX_PORT/v1"
    echo ""
elif [[ "$LAN_RESULT" == "200" ]]; then
    echo -e "${YELLOW}⚠ ISSUE: Docker containers cannot reach Cortex${NC}"
    echo ""
    echo -e "  The host can reach Cortex, but Docker containers cannot."
    echo -e "  This is typically caused by:"
    echo -e "    1. Firewall blocking Docker bridge → host traffic"
    echo -e "    2. Docker network isolation"
    echo ""
    echo -e "  ${BOLD}Possible fixes:${NC}"
    echo -e "    • Add firewall rule: sudo ufw allow from 172.17.0.0/16 to any port $CORTEX_PORT"
    echo -e "    • Or run MAGE with --network=host"
    echo -e "    • Or connect MAGE to Cortex's Docker network"
else
    echo -e "${RED}✗ ISSUE: Cortex is not accessible${NC}"
    echo ""
    echo -e "  Cortex may not be running or is not properly configured."
    echo -e "  Run: make up"
fi

echo ""
echo -e "${BOLD}For MAGE Integration:${NC}"
echo ""
echo -e "  1. API Key: Create one at http://$HOST_IP:3001/keys"
echo -e "  2. Endpoints available:"
echo -e "     • GET  /v1/models         - List available models"
echo -e "     • POST /v1/chat/completions - Chat completions"
echo -e "     • POST /v1/embeddings     - Generate embeddings"
echo ""
echo -e "  3. Example curl from MAGE container:"
echo ""
echo -e "     curl http://host.docker.internal:$CORTEX_PORT/v1/models \\"
echo -e "       -H 'Authorization: Bearer YOUR_API_KEY'"
echo ""


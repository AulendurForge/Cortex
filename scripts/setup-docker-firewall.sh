#!/usr/bin/env bash
# ============================================================================
# Setup Docker-to-Host Firewall Rules
# ============================================================================
#
# This script configures the system firewall (UFW) to allow Docker containers
# to communicate with services running on the host machine.
#
# This is required when:
# - Cortex gateway runs with host network mode (0.0.0.0:8084)
# - External applications in Docker containers need to reach Cortex
# - UFW is enabled and blocking Docker bridge traffic
#
# What it does:
# - Adds UFW rules to allow traffic from Docker networks (172.16.0.0/12)
# - This covers all standard Docker bridge networks
#
# Security note:
# - Only allows traffic FROM Docker containers TO the host
# - Does not expose any ports to external networks
# - This is safe for development and production environments
#
# Usage:
#   sudo ./scripts/setup-docker-firewall.sh
#
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}Docker-to-Host Firewall Setup${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}✗ This script must be run as root (sudo)${NC}"
    echo ""
    echo "Usage: sudo $0"
    exit 1
fi

# Check if UFW is installed and active
if ! command -v ufw &> /dev/null; then
    echo -e "${YELLOW}⚠ UFW is not installed${NC}"
    echo "  If you're using a different firewall, you may need to configure it manually."
    exit 0
fi

UFW_STATUS=$(ufw status | head -1)
if [[ "$UFW_STATUS" != *"active"* ]]; then
    echo -e "${YELLOW}⚠ UFW is not active${NC}"
    echo "  No firewall configuration needed."
    exit 0
fi

echo -e "${BLUE}UFW is active. Configuring Docker access rules...${NC}"
echo ""

# Docker uses 172.16.0.0/12 for bridge networks by default
# This covers:
#   - 172.16.0.0 - 172.31.255.255 (default Docker range)
#   - Includes docker0 (172.17.x.x) and custom bridge networks (172.18.x.x, etc.)
DOCKER_SUBNET="172.16.0.0/12"

# Check if rule already exists
EXISTING_RULE=$(ufw status | grep -E "ALLOW.*from $DOCKER_SUBNET" || true)

if [[ -n "$EXISTING_RULE" ]]; then
    echo -e "${GREEN}✓ Docker subnet rule already exists:${NC}"
    echo "  $EXISTING_RULE"
else
    echo -e "${BLUE}Adding rule to allow traffic from Docker containers...${NC}"
    
    # Allow all traffic from Docker subnets to any port on the host
    ufw allow from $DOCKER_SUBNET to any comment "Allow Docker containers to access host services"
    
    echo -e "${GREEN}✓ Rule added successfully${NC}"
fi

# Also add rule for localhost (127.0.0.0/8) to be safe
LOCALHOST_RULE=$(ufw status | grep -E "ALLOW.*from 127.0.0.0/8" || true)
if [[ -z "$LOCALHOST_RULE" ]]; then
    ufw allow from 127.0.0.0/8 to any comment "Allow localhost access"
    echo -e "${GREEN}✓ Localhost rule added${NC}"
fi

echo ""
echo -e "${BOLD}Current UFW status:${NC}"
ufw status numbered | head -15
echo ""

# Test connectivity
echo -e "${BLUE}Testing connectivity...${NC}"
echo ""

# Get the gateway port
GATEWAY_PORT="${GATEWAY_PORT:-8084}"

# Quick test from a container
echo -e "Testing from Docker container to host port $GATEWAY_PORT..."
TEST_RESULT=$(docker run --rm curlimages/curl:latest curl -s -m 3 "http://172.17.0.1:${GATEWAY_PORT}/health" 2>&1 || echo "FAILED")

if [[ "$TEST_RESULT" == *"status"* ]]; then
    echo -e "${GREEN}✓ Container-to-host connectivity working!${NC}"
    echo "  Response: $TEST_RESULT"
else
    echo -e "${YELLOW}⚠ Connectivity test inconclusive${NC}"
    echo "  This might be because Cortex isn't running yet."
    echo "  Start Cortex with: make up"
fi

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${GREEN}Docker firewall setup complete!${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""
echo "Docker containers can now reach the host on:"
echo "  - http://host.docker.internal:8084  (with --add-host flag)"
echo "  - http://172.17.0.1:8084            (Docker bridge gateway)"
echo "  - http://<HOST_LAN_IP>:8084         (e.g., 192.168.1.11)"
echo ""
echo "External applications need:"
echo "  1. A valid Cortex API key"
echo "  2. To use one of the above endpoints"
echo ""


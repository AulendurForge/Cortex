#!/usr/bin/env bash
# Cortex Configuration Validation Script
# This script validates that Cortex is properly configured and accessible

# Don't exit on errors - we want to show all test results
set +e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}Cortex Configuration Validation${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""

# Test counter
PASSED=0
FAILED=0
WARNINGS=0

# Function to print test result
test_result() {
    local test_name="$1"
    local result="$2"  # "pass", "fail", or "warn"
    local message="$3"
    
    if [ "$result" = "pass" ]; then
        echo -e "${GREEN}✓${NC} ${test_name}"
        if [ -n "$message" ]; then
            echo -e "  ${BLUE}→${NC} $message"
        fi
        ((PASSED++))
    elif [ "$result" = "fail" ]; then
        echo -e "${RED}✗${NC} ${test_name}"
        if [ -n "$message" ]; then
            echo -e "  ${RED}→${NC} $message"
        fi
        ((FAILED++))
    else
        echo -e "${YELLOW}⚠${NC} ${test_name}"
        if [ -n "$message" ]; then
            echo -e "  ${YELLOW}→${NC} $message"
        fi
        ((WARNINGS++))
    fi
}

# 1. Check IP Detection
echo -e "${BOLD}1. IP Address Detection${NC}"
echo ""

HOST_IP=$(bash scripts/detect-ip.sh 2>/dev/null || echo "")

if [ -z "$HOST_IP" ] || [ "$HOST_IP" = "localhost" ]; then
    test_result "IP Detection" "fail" "Could not detect host IP. Script returned: $HOST_IP"
else
    # Check if it's a valid private network IP
    if [[ "$HOST_IP" =~ ^192\.168\. ]] || [[ "$HOST_IP" =~ ^10\. ]]; then
        test_result "IP Detection" "pass" "Detected: $HOST_IP (Private network)"
    elif [[ "$HOST_IP" =~ ^172\.(1[6-9]|2[0-9]|3[01])\. ]]; then
        test_result "IP Detection" "warn" "Detected: $HOST_IP (May be Docker bridge)"
    else
        test_result "IP Detection" "warn" "Detected: $HOST_IP (Public IP or unusual network)"
    fi
fi

echo ""

# 2. Check Docker Containers
echo -e "${BOLD}2. Docker Containers${NC}"
echo ""

GATEWAY_RUNNING=$(docker ps --filter "name=cortex-gateway" --format "{{.Status}}" 2>/dev/null || echo "")
FRONTEND_RUNNING=$(docker ps --filter "name=cortex-frontend" --format "{{.Status}}" 2>/dev/null || echo "")
POSTGRES_RUNNING=$(docker ps --filter "name=cortex-postgres" --format "{{.Status}}" 2>/dev/null || echo "")

if [ -n "$GATEWAY_RUNNING" ]; then
    test_result "Gateway Container" "pass" "$GATEWAY_RUNNING"
else
    test_result "Gateway Container" "fail" "Not running. Run: make up"
fi

if [ -n "$FRONTEND_RUNNING" ]; then
    test_result "Frontend Container" "pass" "$FRONTEND_RUNNING"
else
    test_result "Frontend Container" "fail" "Not running. Run: make up"
fi

if [ -n "$POSTGRES_RUNNING" ]; then
    test_result "PostgreSQL Container" "pass" "$POSTGRES_RUNNING"
else
    test_result "PostgreSQL Container" "fail" "Not running. Run: make up"
fi

echo ""

# 3. Check CORS Configuration
echo -e "${BOLD}3. CORS Configuration${NC}"
echo ""

if [ -n "$GATEWAY_RUNNING" ]; then
    CORS_CONFIG=$(docker exec cortex-gateway-1 printenv CORS_ALLOW_ORIGINS 2>/dev/null || echo "")
    
    if [ -z "$CORS_CONFIG" ]; then
        test_result "CORS Environment Variable" "fail" "Not set in gateway container"
    else
        # Check if detected IP is in CORS
        if [[ "$CORS_CONFIG" == *"$HOST_IP"* ]] || [ "$HOST_IP" = "localhost" ]; then
            test_result "CORS Configuration" "pass" "Includes detected IP: $HOST_IP"
            echo -e "  ${BLUE}→${NC} Full CORS: $CORS_CONFIG"
        else
            test_result "CORS Configuration" "fail" "Detected IP ($HOST_IP) not in CORS list"
            echo -e "  ${RED}→${NC} Configured CORS: $CORS_CONFIG"
            echo -e "  ${YELLOW}→${NC} Fix: make restart (to re-detect IP and update CORS)"
        fi
    fi
else
    test_result "CORS Configuration" "fail" "Gateway not running"
fi

echo ""

# 4. Check Service Health
echo -e "${BOLD}4. Service Health Endpoints${NC}"
echo ""

if [ -n "$HOST_IP" ] && [ "$HOST_IP" != "localhost" ]; then
    GATEWAY_HEALTH=$(curl -s -w "%{http_code}" http://$HOST_IP:8084/health 2>/dev/null | tail -c 3)
    
    if [ "$GATEWAY_HEALTH" = "200" ]; then
        test_result "Gateway Health Endpoint" "pass" "http://$HOST_IP:8084/health returns 200"
    else
        test_result "Gateway Health Endpoint" "fail" "Returns HTTP $GATEWAY_HEALTH"
    fi
fi

# Check frontend
if command -v curl &> /dev/null && [ -n "$HOST_IP" ] && [ "$HOST_IP" != "localhost" ]; then
    FRONTEND_STATUS=$(curl -s -w "%{http_code}" -o /dev/null http://$HOST_IP:3001/login 2>/dev/null)
    
    if [ "$FRONTEND_STATUS" = "200" ]; then
        test_result "Frontend Accessibility" "pass" "http://$HOST_IP:3001/login returns 200"
    else
        test_result "Frontend Accessibility" "fail" "Returns HTTP $FRONTEND_STATUS"
    fi
fi

echo ""

# 5. Check Listeners (gateway uses host networking, so inspect the host, not Docker port maps)
echo -e "${BOLD}5. Network Listeners${NC}"
echo ""

if command -v ss &> /dev/null; then
    if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE '(0\.0\.0\.0|\*|::):8084$'; then
        test_result "Gateway Listener" "pass" "Listening on all interfaces :8084 (host network)"
    elif ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE ':8084$'; then
        test_result "Gateway Listener" "warn" "Port 8084 is bound to a specific address only"
    else
        test_result "Gateway Listener" "fail" "Nothing listening on :8084. Run: make up"
    fi
    if ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE ':3001$'; then
        test_result "Frontend Listener" "pass" "Listening on :3001"
    else
        test_result "Frontend Listener" "fail" "Nothing listening on :3001. Run: make up"
    fi
    PROM_PORT_CFG=$(grep -E '^PROM_PORT=' .env 2>/dev/null | cut -d= -f2); PROM_PORT_CFG=${PROM_PORT_CFG:-9090}
    if ss -ltnp 2>/dev/null | grep -E ":${PROM_PORT_CFG}\b" | grep -qv docker; then
        test_result "Prometheus Port ${PROM_PORT_CFG}" "warn" "Another process (e.g. Cockpit) owns :${PROM_PORT_CFG}. Set PROM_PORT=9094 in .env"
    fi
else
    test_result "Network Listeners" "warn" "ss not available; skipped"
fi

echo ""

# 6. Check Firewall (if applicable)
echo -e "${BOLD}6. Firewall Status (if applicable)${NC}"
echo ""

if command -v ufw &> /dev/null; then
    UFW_STATUS=$(sudo ufw status 2>/dev/null | grep "Status:" | awk '{print $2}')
    
    if [ "$UFW_STATUS" = "active" ]; then
        UFW_3001=$(sudo ufw status 2>/dev/null | grep "3001" || echo "")
        UFW_8084=$(sudo ufw status 2>/dev/null | grep "8084" || echo "")
        
        if [ -n "$UFW_3001" ]; then
            test_result "Firewall Port 3001" "pass" "Allowed"
        else
            test_result "Firewall Port 3001" "warn" "Not explicitly allowed. Run: sudo ufw allow 3001/tcp"
        fi
        
        if [ -n "$UFW_8084" ]; then
            test_result "Firewall Port 8084" "pass" "Allowed"
        else
            test_result "Firewall Port 8084" "warn" "Not explicitly allowed. Run: sudo ufw allow 8084/tcp"
        fi
    else
        test_result "Firewall (ufw)" "pass" "Disabled or inactive"
    fi
elif command -v firewall-cmd &> /dev/null; then
    test_result "Firewall (firewalld)" "warn" "Detected. Verify ports 3001 and 8084 are allowed"
else
    test_result "Firewall" "pass" "No firewall detected or not using ufw/firewalld"
fi

echo ""

# Summary
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}Summary${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""
echo -e "Tests Passed:  ${GREEN}$PASSED${NC}"
echo -e "Warnings:      ${YELLOW}$WARNINGS${NC}"
echo -e "Tests Failed:  ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✓ All checks passed! Cortex is properly configured.${NC}"
    echo ""
    echo -e "${BOLD}Access Cortex at:${NC}"
    echo -e "  ${BLUE}Admin UI:${NC} http://$HOST_IP:3001"
    echo -e "  ${BLUE}Gateway:${NC}  http://$HOST_IP:8084"
    echo ""
elif [ $FAILED -eq 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠ Configuration is mostly correct with some warnings.${NC}"
    echo ""
    echo -e "Review warnings above and fix if needed."
    echo ""
else
    echo -e "${RED}${BOLD}✗ Configuration has issues that need to be fixed.${NC}"
    echo ""
    echo -e "Review failed checks above and run:"
    echo -e "  ${BLUE}make down${NC}"
    echo -e "  ${BLUE}make quick-start${NC}"
    echo ""
fi

exit 0


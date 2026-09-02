#!/usr/bin/env bash
# Test script for Makefile functionality
# This script validates that all Makefile targets work correctly

set -e  # Exit on any error

echo "============================================"
echo "Testing Cortex Makefile"
echo "============================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test
test_command() {
    local test_name="$1"
    local command="$2"
    local expect_fail="${3:-false}"
    
    echo -n "Testing: $test_name... "
    
    if [ "$expect_fail" = "true" ]; then
        if $command > /dev/null 2>&1; then
            echo -e "${RED}FAILED${NC} (expected to fail but succeeded)"
            ((TESTS_FAILED++))
            return 1
        else
            echo -e "${GREEN}PASSED${NC} (failed as expected)"
            ((TESTS_PASSED++))
            return 0
        fi
    else
        if $command > /dev/null 2>&1; then
            echo -e "${GREEN}PASSED${NC}"
            ((TESTS_PASSED++))
            return 0
        else
            echo -e "${RED}FAILED${NC}"
            ((TESTS_FAILED++))
            return 1
        fi
    fi
}

# Function to check if command produces output
test_output() {
    local test_name="$1"
    local command="$2"
    
    echo -n "Testing: $test_name... "
    
    local output
    output=$($command 2>&1)
    
    if [ -n "$output" ]; then
        echo -e "${GREEN}PASSED${NC} (produced output)"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}FAILED${NC} (no output)"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Check prerequisites
echo "Checking prerequisites..."
echo ""

if ! command -v make &> /dev/null; then
    echo -e "${RED}ERROR: make is not installed${NC}"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}ERROR: docker is not installed${NC}"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo -e "${RED}ERROR: docker compose is not available${NC}"
    exit 1
fi

echo -e "${GREEN}✓ All prerequisites installed${NC}"
echo ""

# Test help and info commands (should always work)
echo "Testing informational commands..."
echo ""

test_output "make help" "make help"
test_output "make info" "make info"
test_output "make version" "make version"

echo ""

# Test syntax validation
echo "Testing Makefile syntax..."
echo ""

test_command "Makefile syntax validation" "make -n up"

echo ""

# Test that variables work
echo "Testing environment variables..."
echo ""

test_command "ENV variable (dev)" "make -n up ENV=dev"
test_command "ENV variable (prod)" "make -n up ENV=prod"
test_command "PROFILES variable" "make -n up PROFILES=linux,gpu"

echo ""

# Test dry-run of key commands (don't actually execute)
echo "Testing command dry-runs..."
echo ""

test_command "make build (dry-run)" "make -n build"
test_command "make up (dry-run)" "make -n up"
test_command "make down (dry-run)" "make -n down"
test_command "make restart (dry-run)" "make -n restart"
test_command "make logs (dry-run)" "make -n logs"
test_command "make ps (dry-run)" "make -n ps"
test_command "make clean (dry-run)" "make -n clean"

echo ""

# Test database commands
echo "Testing database commands (dry-run)..."
echo ""

test_command "make db-backup (dry-run)" "make -n db-backup"
test_command "make db-shell (dry-run)" "make -n db-shell"

echo ""

# Test monitoring commands
echo "Testing monitoring commands (dry-run)..."
echo ""

test_command "make logs-gateway (dry-run)" "make -n logs-gateway"
test_command "make logs-postgres (dry-run)" "make -n logs-postgres"
test_command "make health (dry-run)" "make -n health"

echo ""

# Test cleanup commands
echo "Testing cleanup commands (dry-run)..."
echo ""

test_command "make clean (dry-run)" "make -n clean"
test_command "make clean-all (dry-run)" "make -n clean-all"
test_command "make prune (dry-run)" "make -n prune"

echo ""

# Test bootstrap commands
echo "Testing bootstrap commands (dry-run)..."
echo ""

test_command "make setup-admin (dry-run)" "make -n setup-admin"
test_command "make login (dry-run)" "make -n login"
test_command "make create-key (dry-run)" "make -n create-key"

echo ""

# Test development helpers
echo "Testing development helpers (dry-run)..."
echo ""

test_command "make shell-gateway (dry-run)" "make -n shell-gateway"
test_command "make shell-postgres (dry-run)" "make -n shell-postgres"

echo ""

# Test production checks
echo "Testing production commands (dry-run)..."
echo ""

test_command "make prod-check (dry-run)" "make -n prod-check"

echo ""

# Test test commands
echo "Testing test commands (dry-run)..."
echo ""

test_command "make test (dry-run)" "make -n test"
test_command "make test-api (dry-run)" "make -n test-api"

echo ""

# Summary
echo "============================================"
echo "Test Summary"
echo "============================================"
echo ""
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    echo ""
    echo "The Makefile is ready to use."
    echo "Try: make quick-start"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo ""
    echo "Please review the Makefile for errors."
    exit 1
fi


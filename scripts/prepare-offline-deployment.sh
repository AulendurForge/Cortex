#!/usr/bin/env bash
# Prepare Cortex for offline/air-gapped deployment
# Run this on an internet-connected machine

set -e

echo "=========================================="
echo "Cortex Offline Deployment Preparation"
echo "=========================================="
echo ""

# Timeout controls (seconds). Set to 0 to disable timeouts.
# These protect you from long hangs when network/Docker is unhealthy.
PULL_TIMEOUT_SEC=${PULL_TIMEOUT_SEC:-1800}   # 30 minutes
SAVE_TIMEOUT_SEC=${SAVE_TIMEOUT_SEC:-1800}   # 30 minutes
DOCKER_RETRY_COUNT=${DOCKER_RETRY_COUNT:-2}  # retries for pull/save

# Portable-ish timeout wrapper (uses GNU coreutils `timeout` when available)
run_with_timeout() {
    local timeout_sec="$1"
    shift
    if [ "${timeout_sec}" = "0" ] || [ "${timeout_sec}" = "0s" ]; then
        "$@"
        return $?
    fi
    if command -v timeout >/dev/null 2>&1; then
        timeout --preserve-status "${timeout_sec}" "$@"
        return $?
    fi
    # No timeout command available; run normally
    "$@"
}

retry() {
    local attempts="$1"
    shift
    local i=1
    while true; do
        if "$@"; then
            return 0
        fi
        if [ "$i" -ge "$attempts" ]; then
            return 1
        fi
        i=$((i+1))
        echo -e "${YELLOW}  retry ${i}/${attempts}...${NC}"
        sleep 2
    done
}

# Configuration - read from central versions file
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/versions.env" ]; then
    source "${SCRIPT_DIR}/versions.env"
fi

# Allow environment variable overrides (backwards compatibility)
VLLM_VERSION=${VLLM_VERSION:-${CORTEX_VLLM_VERSION:-"latest"}}
LLAMACPP_TAG=${LLAMACPP_TAG:-${CORTEX_LLAMACPP_TAG:-"server-cuda"}}
OUTPUT_DIR=${OUTPUT_DIR:-"./cortex-offline-images"}

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Configuration:${NC}"
echo "  vLLM version: ${VLLM_VERSION}"
echo "  llama.cpp tag: ${LLAMACPP_TAG}"
echo "  Output directory: ${OUTPUT_DIR}"
echo ""

mkdir -p "$OUTPUT_DIR"

# Estimate total download size
echo -e "${YELLOW}Note: This will download ~15-20 GB of Docker images${NC}"
echo -e "${YELLOW}Ensure you have sufficient disk space and bandwidth${NC}"
echo ""
read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Cancelled"
    exit 0
fi

echo ""

# Function to pull and save image
pull_and_save() {
    local image=$1
    local output_name=$2
    
    echo -e "${BLUE}Processing: ${image}${NC}"
    
    # Pull image
    echo -n "  Pulling... "
    if retry "${DOCKER_RETRY_COUNT}" run_with_timeout "${PULL_TIMEOUT_SEC}" docker pull "$image" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        if command -v timeout >/dev/null 2>&1; then
            echo -e "❌ Failed to pull (or timed out after ${PULL_TIMEOUT_SEC}s)"
        else
            echo -e "❌ Failed to pull"
        fi
        return 1
    fi
    
    # Save to tar
    echo -n "  Saving... "
    if retry "${DOCKER_RETRY_COUNT}" run_with_timeout "${SAVE_TIMEOUT_SEC}" docker save -o "$OUTPUT_DIR/$output_name" "$image" 2>/dev/null; then
        SIZE=$(du -h "$OUTPUT_DIR/$output_name" | cut -f1)
        echo -e "${GREEN}✓${NC} ($SIZE)"
    else
        if command -v timeout >/dev/null 2>&1; then
            echo -e "❌ Failed to save (or timed out after ${SAVE_TIMEOUT_SEC}s)"
        else
            echo -e "❌ Failed to save"
        fi
        return 1
    fi
}

# Core engine images
echo "Step 1/3: Downloading inference engine images..."
echo ""
pull_and_save "vllm/vllm-openai:${VLLM_VERSION}" "vllm-openai-${VLLM_VERSION}.tar"
pull_and_save "ghcr.io/ggml-org/llama.cpp:${LLAMACPP_TAG}" "llamacpp-${LLAMACPP_TAG}.tar"

echo ""
echo "Step 2/3: Downloading infrastructure images..."
echo ""
pull_and_save "python:3.11-slim" "python-3.11-slim.tar"
pull_and_save "node:18-alpine" "node-18-alpine.tar"
pull_and_save "postgres:16" "postgres-16.tar"
pull_and_save "redis:7" "redis-7.tar"

echo ""
echo "Step 3/3: Downloading monitoring images..."
echo ""
pull_and_save "prom/prometheus:v2.47.0" "prometheus-v2.47.0.tar"
pull_and_save "prom/node-exporter:v1.6.1" "node-exporter-v1.6.1.tar"

# GPU monitoring (optional - may fail without NVIDIA)
echo ""
echo "Optional GPU monitoring images..."
if pull_and_save "nvidia/dcgm-exporter:3.1.8-3.1.5-ubuntu22.04" "dcgm-exporter.tar" 2>/dev/null; then
    true
else
    echo -e "  ${YELLOW}⚠${NC} DCGM exporter pull failed (expected if no NVIDIA)"
fi

if pull_and_save "gcr.io/cadvisor/cadvisor:v0.47.0" "cadvisor-v0.47.0.tar" 2>/dev/null; then
    true
else
    echo -e "  ${YELLOW}⚠${NC} cAdvisor pull failed (non-critical)"
fi

# Save local registry image (for optional local registry setup)
pull_and_save "registry:2" "registry-2.tar"

echo ""
echo "Creating manifest..."

# Create manifest file
cat > "$OUTPUT_DIR/manifest.json" << EOF
{
  "created": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "cortex_version": "0.1.1",
  "prepared_by": "$(whoami)@$(hostname)",
  "images": {
    "engines": [
      {
        "name": "vllm/vllm-openai",
        "version": "${VLLM_VERSION}",
        "file": "vllm-openai-${VLLM_VERSION}.tar",
        "purpose": "High-performance vLLM inference engine"
      },
      {
        "name": "ghcr.io/ggml-org/llama.cpp",
        "tag": "${LLAMACPP_TAG}",
        "file": "llamacpp-${LLAMACPP_TAG}.tar",
        "purpose": "llama.cpp inference engine for GGUF models"
      }
    ],
    "infrastructure": [
      {"name": "python:3.11-slim", "file": "python-3.11-slim.tar", "purpose": "Cortex backend runtime"},
      {"name": "node:18-alpine", "file": "node-18-alpine.tar", "purpose": "Cortex frontend runtime"},
      {"name": "postgres:16", "file": "postgres-16.tar", "purpose": "Database"},
      {"name": "redis:7", "file": "redis-7.tar", "purpose": "Rate limiting and caching"},
      {"name": "prom/prometheus:v2.47.0", "file": "prometheus-v2.47.0.tar", "purpose": "Metrics collection"},
      {"name": "prom/node-exporter:v1.6.1", "file": "node-exporter-v1.6.1.tar", "purpose": "Host metrics"},
      {"name": "nvidia/dcgm-exporter", "file": "dcgm-exporter.tar", "purpose": "GPU metrics (optional)"},
      {"name": "gcr.io/cadvisor/cadvisor:v0.47.0", "file": "cadvisor-v0.47.0.tar", "purpose": "Container metrics (optional)"},
      {"name": "registry:2", "file": "registry-2.tar", "purpose": "Local registry (optional)"}
    ]
  },
  "deployment_notes": {
    "transfer_methods": ["USB drive", "Secure file transfer", "Physical media"],
    "load_command": "bash scripts/load-offline-deployment.sh",
    "verify_command": "bash scripts/verify-offline-images.sh"
  }
}
EOF

echo -e "${GREEN}✓ Manifest created${NC}"
echo ""

# Generate checksums for all tar files
echo "Generating SHA256 checksums..."
CHECKSUMS_FILE="$OUTPUT_DIR/checksums.sha256"
> "$CHECKSUMS_FILE"  # Clear existing file

for tar_file in "$OUTPUT_DIR"/*.tar; do
    if [ -f "$tar_file" ]; then
        filename=$(basename "$tar_file")
        echo -n "  Checksumming $filename... "
        checksum=$(sha256sum "$tar_file" | awk '{print $1}')
        echo "$checksum  $filename" >> "$CHECKSUMS_FILE"
        echo -e "${GREEN}✓${NC}"
    fi
done

if [ -f "$CHECKSUMS_FILE" ]; then
    echo -e "${GREEN}✓ Checksums written to checksums.sha256${NC}"
    echo ""
fi

# Create README
cat > "$OUTPUT_DIR/README.txt" << 'EOF'
Cortex Offline Deployment Package
==================================

This directory contains all Docker images required to deploy Cortex
in an offline/air-gapped environment.

CONTENTS:
  - *.tar files: Docker images saved in tar format
  - manifest.json: Package metadata and image inventory
  - This README

DEPLOYMENT INSTRUCTIONS:

1. Transfer this entire directory to your offline machine
   (via USB drive, secure file transfer, etc.)

2. On the offline machine, run:
   bash scripts/load-offline-deployment.sh

3. Verify images loaded successfully:
   bash scripts/verify-offline-images.sh

4. Configure offline mode:
   echo "OFFLINE_MODE=True" >> backend/.env

5. Start Cortex:
   make quick-start

For complete documentation, see:
  docs/operations/offline-deployment.md

TROUBLESHOOTING:

If you encounter "image not found" errors:
  - Run: docker images
  - Verify the required images are listed
  - If missing, re-run load script
  - Check manifest.json for expected images

For support, see project documentation.
EOF

# Calculate total size
TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)

echo "=========================================="
echo "Offline Package Complete!"
echo "=========================================="
echo ""
echo -e "${GREEN}✓ All images downloaded and saved${NC}"
echo ""
echo "Package location: $OUTPUT_DIR"
echo "Package size: $TOTAL_SIZE"
echo "Files: $(ls -1 $OUTPUT_DIR/*.tar 2>/dev/null | wc -l) tar files"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Transfer $OUTPUT_DIR to your offline machine"
echo "   Methods: USB drive, SCP, rsync, physical media"
echo ""
echo "2. On offline machine, navigate to Cortex directory and run:"
echo "   bash scripts/load-offline-deployment.sh"
echo ""
echo "3. Configure offline mode:"
echo "   echo 'OFFLINE_MODE=True' >> backend/.env"
echo ""
echo "4. Start Cortex:"
echo "   make quick-start"
echo ""
echo -e "${YELLOW}Important:${NC} Keep this package for future updates and recovery"
echo ""


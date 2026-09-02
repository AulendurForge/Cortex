# Testing Offline Models

This document describes how to test offline model path validation and container startup.

## Overview

The offline model startup flow has been enhanced with:
1. **Path validation** before container creation
2. **Better error messages** with actionable guidance
3. **Pre-flight checks** to catch issues early
4. **Comprehensive test scripts** for validation

## Changes Made

### 1. Path Validation (`backend/src/docker_manager.py`)

Added `_resolve_vllm_model_path()` function that:
- Validates paths exist before building commands
- Checks for directory vs file cases
- Provides detailed error messages with full paths
- Logs path resolution for debugging

### 2. Error Handling (`backend/src/routes/models.py`)

Enhanced `start_model` endpoint:
- Pre-flight path validation before container creation
- Separate handling for `ValueError` (path issues) vs other exceptions
- Full exception traceback in logs
- Actionable error messages returned to UI

### 3. Test Scripts

Two test scripts available:
- `scripts/test_offline_models.py` (Python) - Recommended
- `scripts/test-offline-models.sh` (Bash) - Alternative

## Running Tests

### Prerequisites

1. Cortex gateway must be running
2. Admin credentials configured (default: admin/admin)
3. Models must exist in database with `local_path` set

### Using Python Test Script

```bash
# Test specific model IDs
python3 scripts/test_offline_models.py 1 2 3

# List all offline models
python3 scripts/test_offline_models.py

# Set custom gateway URL
CORTEX_GATEWAY_URL=http://192.168.1.50:8084 python3 scripts/test_offline_models.py 1
```

### Using Bash Test Script

```bash
# Test specific model IDs
./scripts/test-offline-models.sh 1 2 3

# List all offline models
./scripts/test-offline-models.sh
```

## Test Coverage

The test script validates:

1. **Path Validation**
   - Model path exists on host
   - Path is accessible
   - Directory structure is valid

2. **Container Startup**
   - Container starts successfully
   - Container remains running (doesn't immediately exit)
   - No errors in startup logs

3. **Model Readiness**
   - Model loads successfully
   - Model responds to readiness checks
   - Model can serve requests

4. **Error Diagnosis**
   - Path validation errors are caught early
   - Container startup failures are diagnosed
   - Actionable error messages provided

## Expected Behavior

### Success Case

```
--- Testing Model ID: 1 ---
  Name: Qwen3-0.6B
  Local Path: Qwen3-0.6B
  Engine: vllm
  Current State: stopped

Test 1: Attempting to start model (path validation)...
  ✓ Model started successfully
  ✓ Model is running (verified)

Test 2: Checking container logs...
  ✓ No errors in logs

Test 3: Checking model readiness...
  ✓ Model is ready to serve requests

Stopping model...
  ✓ Model stopped
```

### Path Validation Failure

```
Test 1: Attempting to start model (path validation)...
  ✗ Path validation failed:
    Model path not found: Qwen3-0.6B
    Checked: /var/cortex/models/Qwen3-0.6B
    Models directory: /var/cortex/models
    Please verify:
      1. Path exists in /var/cortex/models
      2. CORTEX_MODELS_DIR is correctly configured
      3. Model files are in the expected location
```

### Container Startup Failure

```
Test 1: Attempting to start model (path validation)...
  ✗ Start failed (HTTP 500):
    start_failed: <error message>

Diagnosis:
  Title: <diagnosis title>
  Message: <diagnosis message>
  Suggested fixes:
    - <fix 1>
    - <fix 2>
```

## Troubleshooting

### Path Not Found Errors

1. **Verify path exists:**
   ```bash
   docker exec cortex-gateway-1 ls -la /var/cortex/models/
   ```

2. **Check CORTEX_MODELS_DIR configuration:**
   ```bash
   docker exec cortex-gateway-1 python3 -c "from src.config import get_settings; print(get_settings().CORTEX_MODELS_DIR)"
   ```

3. **Verify model files:**
   ```bash
   docker exec cortex-gateway-1 ls -la /var/cortex/models/Qwen3-0.6B/
   ```

### Container Startup Failures

1. **Check container logs:**
   ```bash
   docker logs vllm-model-1 --tail 100
   ```

2. **Check container status:**
   ```bash
   docker ps -a | grep vllm-model-1
   ```

3. **Use diagnosis endpoint:**
   ```bash
   curl http://localhost:8084/admin/models/1/logs?diagnose=true
   ```

## Integration with CI/CD

The test script returns exit codes:
- `0` - All tests passed
- `1` - One or more tests failed

This allows integration with CI/CD pipelines:

The repository CI (`.github/workflows/ci.yml`) runs only unit tests (`pytest -m "not live and not
integration"`); these model tests need a GPU host with model files and are run manually, e.g.
from a self-hosted runner:

```yaml
- name: Test offline models (self-hosted GPU runner)
  run: python3 scripts/test_offline_models.py 1 2 3
```

`make test-live GGUF=<file>` runs the equivalent llama.cpp end-to-end test inside the gateway container.

## Next Steps

After running tests, if issues are found:

1. **Path issues**: Verify model files are in correct location
2. **Container issues**: Check Docker logs and resource availability
3. **Configuration issues**: Verify CORTEX_MODELS_DIR and related settings

For detailed troubleshooting, see:
- `docs/operations/model-container-lifecycle.md`
- `docs/models/vllm.md`
- `docs/operations/offline-deployment.md`


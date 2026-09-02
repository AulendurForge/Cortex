# Model Container Lifecycle Management

**Date**: October 5, 2025  
**Status**: Production Implementation

---

## Overview

Cortex manages Docker containers for each model (vLLM and llama.cpp). This guide explains the container lifecycle, automatic cleanup, and troubleshooting orphaned containers.

---

## Container Naming Convention

### vLLM Containers
```
vllm-model-{id}
```
- Example: `vllm-model-2` for model with database ID 2
- Image: `vllm/vllm-openai:v0.28.0` (`VLLM_IMAGE`, or the model's `engine_image`)
- Network: `cortex_default`

### llama.cpp Containers
```
llamacpp-model-{id}
```
- Example: `llamacpp-model-4` for model with database ID 4
- Image: `ghcr.io/ggml-org/llama.cpp:server-cuda-b10731` (`LLAMACPP_IMAGE`, or the model's `engine_image`)
- Network: `cortex_default`

---

## Automatic Container Lifecycle

### On Model Start (Admin UI → Start Button)

**Sequence**:
1. Admin clicks "Start" on model
2. **Pre-start validation** (dry-run) checks VRAM, configuration
3. If warnings exist, user confirms to proceed
4. Backend creates/recreates container
5. State set to `starting` → `loading`
6. Container starts and loads model
7. Health check begins polling (frontend polls readiness)
8. Model registered in gateway registry
9. State updated to `running` in database
10. Frontend shows success toast: "Model is now running!"

**State Transitions**:
```
stopped → starting → loading → running
                          ↓
                       failed (on error)
```

**Container Configuration**:
- Restart policy: `no` (the supervisor, not Docker, decides when to restart; see runbooks → reboot recovery)
- Network: `cortex_default` (service-to-service communication)
- Volumes: Models directory mounted read-only
- GPU: Allocated via NVIDIA runtime (if ngl > 0)

### On Model Stop (Admin UI → Stop Button)

**Sequence**:
1. Admin clicks "Stop" on model
2. Backend stops container (graceful shutdown)
3. Container removed
4. Model unregistered from gateway registry
5. State updated to "stopped" in database
6. Registry persisted to database

**Timeout**:
- vLLM: 5 seconds
- llama.cpp: 10 seconds (larger models need more time)

### On Gateway Shutdown (make down / docker compose down)

Model containers are **not** stopped when the gateway stops (`STOP_MODELS_ON_SHUTDOWN=false`,
the default). They keep serving; when the gateway comes back its supervisor re-adopts every
container labelled `cortex.managed=1`, re-registers it for routing and resumes health
probing. Set `STOP_MODELS_ON_SHUTDOWN=true` to get the old "stop everything" behaviour, or run
`make clean-models` explicitly.

**Reconciliation** (`MODEL_RECONCILE_SEC`, default 15 s): rows in `running`/`loading` whose
container disappeared become `stopped` (`state_reason=container_not_found`); containers whose
engine stops answering `/health` move the row to `failed` (`engine_unhealthy: ...`).

---

## Orphaned Container Detection

### What is an Orphaned Container?

**Definition**: A model container that is running but:
- Not in the database (deleted model)
- Database shows "stopped" but container still running
- Left over from a deleted model

### Automatic Detection

**On `make down`**:
```bash
$ make down

Stopping Cortex services...
✓ Services stopped
2 model container(s) still running (the gateway re-adopts them on restart).
Run 'make clean-models' to remove them.
```

**Detection Logic**:
- Counts running containers labelled `cortex.managed=1`
- Reports them; they are deliberately left running

---

## Manual Cleanup

### Option 1: Makefile Command (Recommended)

```bash
# Clean up all model containers
make clean-models
```

**What it does**:
- Runs `scripts/cleanup-orphaned-containers.sh`
- Lists all model containers
- Asks for confirmation
- Stops and removes all containers
- Shows summary

### Option 2: Cleanup Script Directly

```bash
# Interactive cleanup
bash scripts/cleanup-orphaned-containers.sh

# Output:
# Found model containers:
#   - vllm-model-3
#   - llamacpp-model-4
# Total: 2 container(s)
# 
# Stop and remove all these containers? (yes/no): yes
# 
# Processing vllm-model-3... ✓ Removed
# Processing llamacpp-model-4... ✓ Removed
# 
# Cleanup Complete
# Stopped and removed: 2
```

### Option 3: Docker Commands

```bash
# List model containers
docker ps -a --filter "name=vllm-model-" --filter "name=llamacpp-model-"

# Stop all vLLM containers
docker ps -q --filter "name=vllm-model-" | xargs -r docker stop
docker ps -a -q --filter "name=vllm-model-" | xargs -r docker rm

# Stop all llama.cpp containers
docker ps -q --filter "name=llamacpp-model-" | xargs -r docker stop
docker ps -a -q --filter "name=llamacpp-model-" | xargs -r docker rm
```

---

## Common Scenarios

### Scenario 1: Gateway Restart (Normal Operation)

**Before Shutdown Hook** (Old Behavior):
```
1. make down
2. Gateway stops
3. Model containers keep running ❌
4. make up
5. Gateway starts
6. Old containers still running (orphaned)
7. New models can't use same ports
```

**Current behaviour**:
```
1. make down
2. Gateway shuts down; model containers keep serving
3. make up
4. Supervisor re-adopts the running containers (same ports, no reload) ✓
```

### Scenario 2: Gateway Crash (Unexpected)

**What Happens**:
- Gateway crashes without shutdown hook running
- Model containers keep running
- On restart, containers are orphaned

**Recovery**:
```bash
# Check for orphans
make down  # Will detect orphans

# Clean up
make clean-models

# Restart fresh
make up
```

### Scenario 3: Model Deleted But Container Running

**Cause**: Model deleted from database but container not stopped

**Detection**:
```bash
# List containers
docker ps --filter "name=vllm-model-" --filter "name=llamacpp-model-"

# Check database
curl -b cookies.txt http://localhost:8084/admin/models | jq '.[] | .id'

# If container ID doesn't match any database ID → orphaned
```

**Fix**:
```bash
make clean-models
```

---

## Troubleshooting

### "Network cortex_default is in use" Error

**Symptom**: `make down` fails with "Resource is still in use"

**Cause**: Model containers are still attached to the network

**Solution**:
```bash
# Stop model containers first
make clean-models

# Then stop services
make down
```

### Model Containers Restart After System Reboot

**Cause**: Docker daemon restart policy

**Check**:
```bash
docker inspect vllm-model-3 | jq '.[0].HostConfig.RestartPolicy'
```

**Should show**:
```json
{
  "Name": "no",
  "MaximumRetryCount": 0
}
```

**If shows "unless-stopped" or "always"**:
- This is a bug in container creation
- Containers will auto-restart
- Report as issue

### Health Page Shows Model But Container Doesn't Exist

**Symptom**: Model appears in health page but `docker ps` doesn't show container

**Cause**: Stale registry entry (container was removed but registry not updated)

**Solution**:
```bash
# Option 1: Restart the model (will re-create container)
# In UI: Stop → Start

# Option 2: Clear stale registry
# Restart gateway (will reload registry from database)
make restart
```

---

## Best Practices

### For Administrators

**1. Always Use `make down` (Not `docker compose down` directly)**:
```bash
# Good:
make down  # Runs shutdown hook + detects orphans

# Avoid:
docker compose down  # Bypasses Makefile checks
```

**2. Clean Up Orphans Regularly**:
```bash
# Weekly maintenance:
make down
make clean-models  # If orphans detected
make up
```

**3. Monitor Model Containers**:
```bash
# Check running containers:
docker ps --filter "name=model-"

# Should match models shown in UI
```

### For Developers

**1. Always Stop Containers on Model Deletion**:
```python
@router.delete("/models/{model_id}")
async def delete_model(model_id: int):
    # ALWAYS call stop_container_for_model
    try:
        stop_container_for_model(m)
    except Exception:
        pass
    # Then delete from database
```

**2. Update State on Container Failure**:
```python
except Exception as e:
    # Clean up failed container
    try:
        stop_container_for_model(m)
    except:
        pass
    # Update state
    await session.execute(
        update(Model)
        .where(Model.id == model_id)
        .values(state="failed", container_name=None, port=None)
    )
```

**3. Test Shutdown Hook**:
```bash
# Start a model
# Stop gateway
# Verify container stopped
docker ps --filter "name=model-"  # Should be empty
```

---

## Makefile Commands

### Container Management

```bash
# Stop and remove all model containers
make clean-models

# Stop services (will auto-stop models via shutdown hook)
make down

# Stop services and remove all containers
make clean-all

# Check for orphans after shutdown
make down  # Will show count if any found
```

### Monitoring

```bash
# List all containers
make ps

# Check model container status
docker ps --filter "name=model-"

# View model logs
docker logs llamacpp-model-4
```

---

## Implementation Details

### Shutdown Hook

**Location**: `backend/src/main.py:243-293`

**Logic**:
```python
@app.on_event("shutdown")
async def on_shutdown():
    # 1. Query database for running models
    result = await session.execute(
        select(Model).where(Model.state == "running")
    )
    running_models = result.scalars().all()
    
    # 2. Stop each container
    for m in running_models:
        stop_container_for_model(m)
    
    # 3. Update database (all to stopped)
    await session.execute(
        update(Model)
        .where(Model.state == "running")
        .values(state="stopped", container_name=None, port=None)
    )
    
    # 4. Continue with normal shutdown
    # (close http_client, redis, database engine)
```

**Triggers**:
- `make down`
- `docker compose down`
- `Ctrl+C` on foreground process
- SIGTERM signal
- Container stop

**Limitations**:
- Only runs on graceful shutdown
- If gateway crashes (SIGKILL), hook doesn't run
- Use `make clean-models` to clean up after crashes

### Cleanup Script

**Location**: `scripts/cleanup-orphaned-containers.sh`

**Features**:
- Scans for all `vllm-model-*` and `llamacpp-model-*` containers
- Shows list before action
- Asks for confirmation
- Stops and removes each container
- Reports success/failure count
- Safe to run anytime

---

## Migration Notes

### Upgrading from Previous Versions

**If you have orphaned containers from before this feature**:

```bash
# 1. Check for orphans
docker ps --filter "name=model-"

# 2. Clean them up
make clean-models

# 3. Restart Cortex
make up

# 4. Verify no orphans
make down  # Should show "✓ No orphaned containers"
```

### Testing the Shutdown Hook

```bash
# 1. Start a model via UI
# 2. Verify container running:
docker ps --filter "name=model-"

# 3. Stop gateway:
make down

# 4. Check containers (should be stopped):
docker ps --filter "name=model-"  # Should be empty

# 5. Check database:
curl -b cookies.txt http://localhost:8084/admin/models | jq '.[] | {id, state}'
# All should show state="stopped"
```

---

## Summary

**Cortex now automatically manages model container lifecycle:**

✅ **On Model Start**: Container created and registered  
✅ **On Model Stop**: Container stopped and removed  
✅ **On Gateway Shutdown**: All model containers stopped  
✅ **Orphan Detection**: Automatic on `make down`  
✅ **Easy Cleanup**: `make clean-models` command  

**Result**: No more orphaned containers! Clean, predictable lifecycle management. 🎉

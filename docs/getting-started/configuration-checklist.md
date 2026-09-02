# Cortex Configuration Checklist

## ✅ Pre-Start Checklist for Administrators

**Before running `make quick-start`, verify these prerequisites:**

### System Requirements
- [ ] Docker installed (v20.10+) - `docker --version`
- [ ] Docker Compose installed (v2.0+) - `docker compose version`
- [ ] Make utility installed - `make --version`
- [ ] Bash shell available - `bash --version`
- [ ] At least 8GB RAM available - `free -h`
- [ ] At least 20GB disk space - `df -h`
- [ ] User has Docker permissions - `docker ps` (should work without sudo)

### Network Requirements
- [ ] Host machine has a network interface (not just loopback)
- [ ] Network interface has an IP address (check: `ip addr show`)
- [ ] Ports 3001 and 8084 are not already in use - `netstat -tuln | grep -E '3001|8084'`

### Optional (for GPU features)
- [ ] NVIDIA GPU installed - `nvidia-smi`
- [ ] NVIDIA drivers installed (v470+ for basic CUDA, 575.51.03+ for CUDA 12.9+)
- [ ] NVIDIA Container Toolkit installed
- [ ] **If containers fail to start**: See [Updating NVIDIA Drivers](../operations/UPDATE_NVIDIA_DRIVERS.md) for driver update instructions

---

## 🚀 Installation Checklist

### Step 1: Clone Repository
```bash
git clone <your-repo-url>
cd Cortex
```
- [ ] Repository cloned successfully
- [ ] In the Cortex directory

### Step 2: Verify IP Detection
```bash
bash scripts/detect-ip.sh
```
- [ ] Returns a valid IP address (not "localhost")
- [ ] IP is your LAN IP (192.168.x.x or 10.x.x.x)
- [ ] IP is NOT a Docker bridge (172.17-31.x.x)

**If detection fails:**
```bash
# Override manually
export HOST_IP=192.168.1.181  # Use your actual IP
```

### Step 3: Start Cortex
```bash
make quick-start
```
- [ ] No errors during build
- [ ] All containers start successfully
- [ ] Output shows detected IP (verify it's correct)
- [ ] Admin user created (`make quick-start` asked for the credentials; `make setup-admin` changes them)
- [ ] URLs are displayed

### Step 4: Validate Configuration
```bash
make validate
```
- [ ] All tests pass (0 failed)
- [ ] IP detected correctly
- [ ] CORS includes your IP
- [ ] Services are healthy
- [ ] Network bindings correct

---

## ✅ Post-Start Verification Checklist

### Gateway (Backend)
```bash
curl http://YOUR_IP:8084/health
```
- [ ] Returns: `{"status":"ok"}`
- [ ] HTTP 200 status code
- [ ] No connection errors

### Frontend (Admin UI)
- [ ] Can access: `http://YOUR_IP:3001` in browser
- [ ] Login page loads correctly
- [ ] No CORS errors in browser console (F12)
- [ ] Can login with the admin credentials from `.env`

### Database
```bash
make db-shell
# Type: \dt
# Type: \q
```
- [ ] PostgreSQL shell opens
- [ ] Tables exist (users, api_keys, organizations, etc.)
- [ ] Can exit successfully

### CORS Configuration
```bash
docker exec cortex-gateway-1 printenv CORS_ALLOW_ORIGINS
```
- [ ] Output includes your detected IP
- [ ] Format is: `http://YOUR_IP:3001,http://localhost:3001,http://127.0.0.1:3001`
- [ ] No syntax errors

---

## 🌐 Network Access Checklist

### From Host Machine
- [ ] Can access frontend: `http://YOUR_IP:3001`
- [ ] Can access gateway: `http://YOUR_IP:8084`
- [ ] Can login to Admin UI
- [ ] No CORS errors in browser console

### From Another Device (Optional Test)
- [ ] Device is on same network
- [ ] Can ping host: `ping YOUR_IP`
- [ ] Can access frontend: `http://YOUR_IP:3001`
- [ ] Can login successfully
- [ ] No CORS errors

### Firewall Configuration
```bash
# If using ufw (Ubuntu/Debian)
sudo ufw status
```
- [ ] Firewall allows port 3001
- [ ] Firewall allows port 8084
- [ ] Or firewall is disabled

**If firewall is active, allow ports:**
```bash
sudo ufw allow 3001/tcp
sudo ufw allow 8084/tcp
```

---

## 🔒 Security Checklist (Production)

### Before Production Deployment

```bash
make prod-check
```

**Required** (details in [Production deployment](../operations/production-deployment.md)):
- [ ] `.env` has `INTERNAL_VLLM_API_KEY`, `SESSION_SECRET`, `ADMIN_BOOTSTRAP_PASSWORD`, `CORS_ALLOW_ORIGINS`
- [ ] `make prod-check` exits 0 (dev auth off, no `:latest`, pins match `config.py`)
- [ ] Changed default admin password
- [ ] TLS reverse proxy (Caddy example) serving UI and API from one origin; `SESSION_COOKIE_SECURE=true`
- [ ] Automated backups configured (cron job)
- [ ] Firewall: only the proxy ports exposed
- [ ] Monitoring targets up (`make monitoring-status`)

---

## 📊 Operational Checklist (Daily/Weekly)

### Daily Checks
- [ ] `make status` - All services running?
- [ ] `make health` - All services healthy?
- [ ] Check logs for errors: `make logs-gateway | grep ERROR`

### Weekly Checks
- [ ] `make db-backup` - Backup database
- [ ] Review disk space: `df -h`
- [ ] Review logs for patterns
- [ ] Check for Docker updates

### Monthly Checks
- [ ] `make prune` - Clean unused Docker resources (✅ **Cortex-only**: removes only Cortex-related resources; does NOT affect other Docker resources on your system)
- [ ] Review security: `make prod-check`
- [ ] Update containers if new versions available
- [ ] Verify backups are restorable

---

## 🐛 Troubleshooting Checklist

### If Services Won't Start
- [ ] Run: `make clean`
- [ ] Run: `make install-deps`
- [ ] Run: `make quick-start`
- [ ] Check: `make logs` for errors

### If Can't Access UI
- [ ] Verify IP: `make ip`
- [ ] Check containers: `make status`
- [ ] Test health: `make health`
- [ ] Try validation: `make validate`
- [ ] Use correct IP (not localhost)

### If CORS Errors
- [ ] Check detection: `make ip`
- [ ] Check CORS: `docker exec cortex-gateway-1 printenv CORS_ALLOW_ORIGINS`
- [ ] Restart: `make restart`
- [ ] Validate: `make validate`

### If IP Detection Wrong
- [ ] Test script: `bash scripts/detect-ip.sh`
- [ ] Check interfaces: `ip addr show`
- [ ] Override: `export HOST_IP=YOUR_IP`
- [ ] Restart: `make restart`

---

## 📝 Configuration Files Checklist

### DO NOT Edit These (Auto-Configured):
- [ ] ❌ Don't edit `backend/src/config.py` for CORS
- [ ] ❌ Don't hardcode IPs in any files
- [ ] ❌ Don't create `.env` files for IP configuration

### MAY Edit These (If Needed):
- [ ] ✅ `docker.compose.dev.yaml` - For ports, paths, profiles
- [ ] ✅ `docker.compose.prod.yaml` - For production settings
- [ ] ✅ `scripts/detect-ip.sh` - Only if detection fails

### Example Override in docker.compose.dev.yaml:
```yaml
# ONLY if you need to change default paths or ports
environment:
  CORTEX_MODELS_DIR_HOST: /custom/path/to/models  # Custom model storage
  HF_CACHE_DIR_HOST: /custom/path/to/cache       # Custom HF cache

ports:
  - "8085:8084"  # If port 8084 conflicts
```

---

## ✨ Quick Validation (Run After Setup)

**One command to validate everything:**
```bash
make validate
```

**Expected output:**
```
Tests Passed:  10
Warnings:      0
Tests Failed:  0

✓ All checks passed! Cortex is properly configured.

Access Cortex at:
  Admin UI: http://192.168.1.181:3001
  Gateway:  http://192.168.1.181:8084
```

---

## 🎯 Success Criteria

### ✅ Cortex is Properly Configured When:

1. **IP Detection Works**
   - [ ] `make ip` shows your LAN IP (not localhost)
   - [ ] IP is reachable from other devices

2. **Services Running**
   - [ ] `make status` shows all containers "Up"
   - [ ] `make health` returns 200 OK

3. **CORS Configured**
   - [ ] CORS includes detected IP
   - [ ] No CORS errors in browser

4. **Network Access Works**
   - [ ] Can access from host machine
   - [ ] Can access from other devices on network
   - [ ] API calls succeed

5. **Frontend Auto-Detects Gateway**
   - [ ] Opens browser console (F12) → Network tab
   - [ ] See API calls going to correct IP
   - [ ] No failed requests

---

## 📞 Getting Help

**If any checklist item fails:**

1. Run diagnostics:
   ```bash
   make validate > diagnostics.txt
   make logs > logs.txt 2>&1
   make ip
   ```

2. Review logs for errors:
   ```bash
   make logs-gateway | grep -i error
   ```

3. Try clean restart:
   ```bash
   make clean-all
   make quick-start
   ```

4. Check documentation:
   - `docs/getting-started/admin-setup.md` - Setup walkthrough
   - `docs/architecture/configuration-flow.md` - How config works
   - `docs/architecture/ip-detection.md` - IP detection details

5. Quick fixes:
   - Wrong IP detected? → `export HOST_IP=192.168.1.181 && make restart`
   - CORS errors? → `make restart`
   - Services down? → `make up`
   - Database issues? → `make db-reset` (⚠️ deletes data!)

---

## 🎓 Understanding the Checks

### What Each Validation Checks:

1. **IP Detection** → Ensures system can find your LAN IP
2. **Container Status** → Verifies all services are running
3. **CORS Configuration** → Confirms network access is allowed
4. **Health Endpoints** → Tests services respond correctly
5. **Network Binding** → Verifies services accept network connections
6. **Firewall** → Checks if ports are blocked

### Why These Matter:

- **IP Detection** → Without correct IP, network access fails
- **CORS** → Without CORS, browser blocks API calls
- **Health** → Unhealthy services can't process requests
- **Network Binding** → Without 0.0.0.0 binding, only localhost works
- **Firewall** → Blocked ports prevent network access

---

## 🎉 Completion Checklist

### ✅ Ready for Use When:

- [ ] `make validate` passes all checks
- [ ] Can login to Admin UI at `http://YOUR_IP:3001`
- [ ] Can create API keys
- [ ] API calls succeed
- [ ] No errors in logs

### ✅ Ready for Production When:

- [ ] All above checks pass
- [ ] `make prod-check` exits 0
- [ ] Default admin password changed
- [ ] Dev mode disabled
- [ ] TLS configured
- [ ] Automated backups set up
- [ ] Monitoring configured
- [ ] Firewall rules applied

---

**Quick Start**: `make quick-start` then `make validate` 🚀


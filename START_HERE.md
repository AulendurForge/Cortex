# 🚀 START HERE - Cortex Quick Start

## For New Administrators

**Welcome to Cortex!** This guide gets you running in 5 minutes.

---

## ⚡ The Easy Way (Recommended)

```bash
# Step 0: Install prerequisites (if not already installed)
# Ubuntu/Debian:
sudo apt-get update && sudo apt-get install -y make docker.io docker-compose-plugin

# CentOS/RHEL:
sudo yum install -y make docker docker-compose-plugin

# Verify:
make --version  # Should show GNU Make
docker --version  # Should show Docker version

# Step 1: Run this one command
make quick-start

# Step 2: Access the Admin UI at the IP shown
# Example: http://192.168.1.181:3001/login
# Username: admin
# Password: admin

# That's it! ✓
```

> **💡 TIP**: Use `make` commands for the best experience! They auto-enable monitoring on Linux and provide helpful output. (`docker compose` now works standalone too, with automatic IP detection fallback)

---

## 🎯 Important: Use Your Host IP, NOT localhost!

**After `make quick-start`, you'll see output like:**

```
✓ Cortex is ready!
Login at: http://192.168.1.181:3001/login (admin/admin)
```

**⚠️ CRITICAL**: Use the IP shown above (e.g., `192.168.1.181`), **NOT** `localhost`!

- ✅ **Works**: `http://192.168.1.181:3001`
- ❌ **Doesn't work from other devices**: `http://localhost:3001`

---

## 🔍 How to Find Your IP Anytime

```bash
make ip     # Shows IP and URLs prominently
make info   # Shows full configuration
```

---

## ✅ Verify Everything is Working

```bash
make validate
```

**Expected output:**
```
Tests Passed:  10
Warnings:      0
Tests Failed:  0

✓ All checks passed! Cortex is properly configured.
```

---

## 📚 What to Read Next

**Pick your path:**

### 🔰 I'm New to Cortex
👉 Read: `docs/getting-started/admin-setup.md`
- Complete walkthrough
- All concepts explained
- Step-by-step instructions

### ⚡ I Just Want Commands
👉 Read: `docs/operations/makefile-guide.md`
- All 40+ commands
- Examples for everything
- Quick reference card

### 🤔 How Does It Work?
👉 Read: `docs/architecture/configuration-flow.md`
- How automatic config works
- Technical details
- Debugging guide

### 🐛 Something's Wrong
👉 Read: `docs/getting-started/configuration-checklist.md`
- Troubleshooting steps
- Validation checklist
- Common issues & fixes

### 📖 Full Documentation
👉 Visit: https://aulendurforge.github.io/Cortex/
- Or browse the `docs/` directory locally
- Architecture guides
- API reference
- Security docs

---

## 🆘 Quick Help

```bash
make help              # See all commands
make ip                # Show your access URLs
make status            # Check if running
make health            # Check if healthy
make monitoring-status # Check monitoring stack (host + GPU metrics)
make logs              # View logs
make validate          # Verify configuration
```

**On Linux with NVIDIA GPU:**
- ✅ Host metrics auto-enabled (CPU, memory, disk, network)
- ✅ GPU metrics auto-enabled (utilization, memory, temperature)
- ✅ View in System Monitor page

---

## 🎉 Success Checklist

**You're ready when:**
- [ ] Ran `make quick-start` (or `docker compose up`)
- [ ] Saw "✓ Cortex is ready!" message (if using make)
- [ ] Admin user automatically created (check logs: `docker logs cortex-gateway-1 | grep startup`)
- [ ] Noted the IP address shown
- [ ] Can access Admin UI in browser
- [ ] Can login with admin/admin
- [ ] Ran `make validate` - all tests passed

---

## 🚨 Common Mistakes to Avoid

1. ❌ **Using `localhost` instead of host IP**
   - Only works from host machine
   - Won't work from other devices
   - **Solution**: Always use the IP from `make ip`

2. ❌ **Typing IP wrong**  
   - Example: `191.168.1.181` instead of `192.168.1.181`
   - **Solution**: Copy-paste from `make ip` output

3. ❌ **Trying to manually configure IP/CORS**
   - It's automatic!
   - **Solution**: Just run `make quick-start`

4. ❌ **Skipping validation**
   - May miss configuration issues
   - **Solution**: Always run `make validate` after startup

5. ❌ **Forgetting about firewall (Linux)**
   - UFW blocks connections by default
   - **Solution**: See "Firewall Setup" section below

---

## 💡 Pro Tips

```bash
# See your URLs anytime
make ip

# Check if everything is healthy
make health

# View logs if something seems wrong
make logs

# Reset if you need a fresh start
make clean-all
make quick-start
```

---

## 📱 Accessing from Other Devices

**Tell your users/applications to use:**
```
Admin UI: http://192.168.1.181:3001
API Gateway: http://192.168.1.181:8084
```

**The frontend will automatically:**
- Detect which IP the user accessed it from
- Call the gateway at the correct IP
- Everything just works!

---

## 🔥 Firewall Setup (Linux Only)

**Can't access Cortex from other devices?** You may need to configure UFW firewall:

```bash
# Check if UFW is blocking (look for "DPT=3001" or "DPT=8084")
sudo tail -20 /var/log/ufw.log | grep BLOCK

# Allow Cortex ports
sudo ufw allow 3001/tcp comment 'Cortex Admin UI'
sudo ufw allow 8084/tcp comment 'Cortex API Gateway'
sudo ufw reload

# Or allow your entire local network
sudo ufw allow from 192.168.0.0/16 comment 'Local network'
sudo ufw reload

# Verify
sudo ufw status
```

**For Docker containers accessing Cortex:**
```bash
make setup-firewall  # Allows Docker container traffic
```

📖 **Full guide**: `docs/operations/network-access.md`

---

## 🎓 Next Steps After Setup

1. **Change default password**
   - Login → Users → Edit admin → New password

2. **Create API keys**
   - Login → API Keys → Create Key
   - Or run: `make login && make create-key`

3. **Deploy your first model**
   - Login → Models → Create Model
   - Configure & Start
   - 📖 **Need models?** See `docs/models/huggingface-model-download.md` for complete HF download guide

4. **Test with Chat Playground**
   - Login → Chat → Playground
   - Select a running model and start chatting
   - See real-time metrics (tokens/sec, TTFT)
   - 📖 **Full guide**: `docs/features/chat-playground.md`

4. **Set up backups**
   ```bash
   # Manual backup
   make db-backup
   
   # Automated (daily at 2 AM)
   crontab -e
   # Add: 0 2 * * * cd /path/to/Cortex && make db-backup
   ```

---

## 🏁 You're All Set!

**Cortex is now running at:**

```bash
# Run this to see your URLs:
make ip
```

**Access the Admin UI and start using Cortex!** 🎉

---

**Need Help?** 
- Quick commands: `make help`
- Complete guide: `docs/getting-started/admin-setup.md`
- HuggingFace models: `docs/models/huggingface-model-download.md`
- Validate config: `make validate`
- Browse docs: `docs/` directory


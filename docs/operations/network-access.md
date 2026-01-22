# Network Access Configuration

This guide covers how to configure Cortex for network access, including firewall configuration, Docker container access, and troubleshooting connectivity issues.

## Architecture Overview

Cortex gateway runs with **host network mode**, binding directly to `0.0.0.0:8084` on the host machine. This enables access from:

- **Localhost**: `http://localhost:8084`
- **LAN devices**: `http://<HOST_IP>:8084`
- **Docker containers**: `http://host.docker.internal:8084`

```
┌───────────────────────────────────────────────────────────────────┐
│                   Host Machine (e.g., 192.168.1.11)               │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │            Cortex Gateway (host network mode)                │ │
│  │                   Listening on 0.0.0.0:8084                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              ↑                                    │
│         ┌────────────────────┼────────────────────┐              │
│         │                    │                    │              │
│    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐         │
│    │ Docker  │         │  LAN    │         │ Local   │         │
│    │Container│         │ Device  │         │ Browser │         │
│    └─────────┘         └─────────┘         └─────────┘         │
└───────────────────────────────────────────────────────────────────┘
```

## Quick Reference

| Service | Port | Purpose |
|---------|------|---------|
| Admin UI | 3001 | Web interface for managing Cortex |
| API Gateway | 8084 | OpenAI-compatible API endpoint |
| Prometheus | 9090 | Metrics and monitoring |
| PgAdmin | 5050 | Database administration |

## Firewall Configuration (Linux/UFW)

### Check if UFW is Active

```bash
sudo ufw status
```

If UFW is active, you need to allow Cortex ports for network access.

### Allow Cortex Ports

**Option 1: Allow specific ports (Recommended for production)**

```bash
# Allow Cortex Admin UI
sudo ufw allow 3001/tcp comment 'Cortex Admin UI'

# Allow Cortex API Gateway
sudo ufw allow 8084/tcp comment 'Cortex API Gateway'

# Allow SSH (if not already allowed)
sudo ufw allow 22/tcp comment 'SSH'

# Reload firewall
sudo ufw reload

# Verify rules
sudo ufw status numbered
```

**Option 2: Allow entire local network (Easier for development)**

```bash
# Allow all traffic from local network
sudo ufw allow from 192.168.0.0/16 comment 'Local network access'

# Or for a specific subnet
sudo ufw allow from 192.168.1.0/24 comment 'Local subnet'

# Reload firewall
sudo ufw reload
```

### Allow Docker Container Traffic

If external applications running in Docker containers need to reach Cortex:

```bash
# Run the setup script
make setup-firewall

# Or manually:
sudo ufw allow from 172.16.0.0/12 comment 'Docker containers'
sudo ufw reload
```

## Docker Container Access

### Configuring External Applications

Applications running in Docker containers can reach Cortex using `host.docker.internal`:

```yaml
# docker-compose.yaml
services:
  your-app:
    image: your-app-image
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      # OpenAI SDK compatible
      OPENAI_API_BASE: "http://host.docker.internal:8084/v1"
      OPENAI_API_KEY: "your-cortex-api-key"
```

### Alternative: Use Host LAN IP

```yaml
services:
  your-app:
    environment:
      OPENAI_API_BASE: "http://192.168.1.11:8084/v1"
      OPENAI_API_KEY: "your-cortex-api-key"
```

### Testing Container Connectivity

```bash
# Test from a temporary container
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  curlimages/curl:latest \
  curl -s http://host.docker.internal:8084/health
```

## Troubleshooting

### Check if Firewall is Blocking

```bash
# View recent blocked connections
sudo tail -30 /var/log/ufw.log | grep BLOCK

# Look for DPT=3001 or DPT=8084 entries
# Example blocked entry:
# [UFW BLOCK] SRC=192.168.1.8 DST=192.168.1.11 ... DPT=8084
```

### Verify Ports are Listening

```bash
# Check which ports are listening
ss -tlnp | grep -E ":(22|3001|8084) "

# Expected output:
# LISTEN 0.0.0.0:22    - SSH
# LISTEN 0.0.0.0:3001  - Admin UI
# LISTEN 0.0.0.0:8084  - Gateway
```

### Test Local Connectivity

```bash
# Test from the server itself
curl http://localhost:8084/health
curl http://localhost:3001

# Test using LAN IP
curl http://$(hostname -I | awk '{print $1}'):8084/health
```

### Test Remote Connectivity

From another machine on the network:

```bash
# Replace with your server IP
curl http://192.168.1.11:8084/health
curl http://192.168.1.11:3001
```

### Common Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Connection timeout from LAN | UFW blocking port | `sudo ufw allow 3001/tcp && sudo ufw allow 8084/tcp` |
| Connection refused | Service not running | `make status` and `make up` |
| CORS error in browser | IP not in CORS whitelist | `make restart` to re-detect IP |
| Docker container can't connect | Missing extra_hosts or firewall | Add `extra_hosts` and run `make setup-firewall` |

### Run Full Diagnostics

```bash
# Comprehensive test
make test-external-access

# Configuration validation
make validate

# Check detected IP
make info
```

## Security Considerations

### Production Recommendations

1. **Use specific port rules** instead of allowing entire networks
2. **Consider reverse proxy** (nginx, Traefik) with TLS
3. **Enable API key authentication** (`GATEWAY_DEV_ALLOW_ALL_KEYS=false`)
4. **Restrict IP ranges** for API keys in Cortex admin UI
5. **Regular security audits** of firewall rules

### Example Production UFW Configuration

```bash
# Only allow from specific networks
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow from 192.168.1.0/24 to any port 3001 comment 'Admin UI - local only'
sudo ufw allow from 192.168.1.0/24 to any port 8084 comment 'API Gateway - local only'
sudo ufw enable
```

## Related Documentation

- [External Applications Integration](../integration/external-applications.md)
- [Quickstart (Docker)](../getting-started/quickstart-docker.md)
- [Security Posture](../security/security.md)


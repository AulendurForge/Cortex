# Integrating External Applications with Cortex

This guide explains how to connect external applications (like MAGE, LangChain, or any OpenAI-compatible client) to Cortex for LLM inference.

## Quick Reference

| Item | Value |
|------|-------|
| **API Base URL** | `http://<HOST_IP>:8084/v1` |
| **Authentication** | Bearer token (API key) |
| **Protocol** | HTTP (HTTPS via reverse proxy) |
| **Port** | 8084 (configurable via `GATEWAY_PORT`) |

## Architecture Overview

Cortex gateway runs with **host network mode**, meaning it binds directly to the host machine's network interfaces. This allows **any** Docker container or external application to reach Cortex without special network configuration.

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
│    │  MAGE   │         │LangChain│         │  Any    │         │
│    │Container│         │  App    │         │  Client │         │
│    └─────────┘         └─────────┘         └─────────┘         │
│    (Docker)            (Docker)            (LAN/localhost)      │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

**Access points:**
- Docker containers: `http://host.docker.internal:8084` or `http://<HOST_IP>:8084`
- Same machine: `http://localhost:8084` or `http://127.0.0.1:8084`
- LAN devices: `http://<HOST_IP>:8084`

## First-Time Setup (Linux Only)

### 1. Allow Network Access (Required for LAN access)

If UFW firewall is enabled, allow Cortex ports:

```bash
# Allow Cortex ports from your network
sudo ufw allow 3001/tcp comment 'Cortex Admin UI'
sudo ufw allow 8084/tcp comment 'Cortex API Gateway'
sudo ufw reload
```

**Or** allow your entire local network:

```bash
sudo ufw allow from 192.168.0.0/16 comment 'Local network'
sudo ufw reload
```

### 2. Allow Docker Container Access (Required for Docker apps)

If external applications running in Docker containers need to reach Cortex:

```bash
cd /path/to/Cortex
make setup-firewall
```

This adds a UFW rule to allow traffic from Docker networks (172.16.0.0/12).

### Verify Setup

```bash
# Check UFW rules
sudo ufw status

# Test connectivity from another machine
curl http://<HOST_IP>:8084/health
```

**Without this setup**, connections from LAN devices or Docker containers will timeout.

## API Endpoints

Cortex implements the OpenAI-compatible API specification:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/models` | GET | List available models |
| `/v1/chat/completions` | POST | Chat completions (streaming supported) |
| `/v1/completions` | POST | Text completions |
| `/v1/embeddings` | POST | Generate embeddings |
| `/health` | GET | Health check (no auth required) |

## Authentication

All API requests (except `/health`) require an API key passed via the `Authorization` header:

```bash
Authorization: Bearer <YOUR_API_KEY>
```

### Creating an API Key

1. Login to Cortex Admin UI at `http://<HOST_IP>:3001`
2. Navigate to **API Keys** page
3. Click **Create Key**
4. Copy the generated token (shown only once)

## Connecting from Docker Containers

### Method 1: Using `host.docker.internal` (Recommended)

Add `extra_hosts` to enable the `host.docker.internal` hostname:

**Docker Compose:**

```yaml
services:
  your-app:
    image: your-app-image
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      OPENAI_API_BASE: "http://host.docker.internal:8084/v1"
      OPENAI_API_KEY: "your-cortex-api-key"
```

**Docker run:**

```bash
docker run --add-host=host.docker.internal:host-gateway \
  -e OPENAI_API_BASE="http://host.docker.internal:8084/v1" \
  -e OPENAI_API_KEY="your-cortex-api-key" \
  your-app-image
```

### Method 2: Using Host LAN IP

If `host.docker.internal` doesn't work, use the host's LAN IP directly:

```bash
# Find your host IP
ip route get 1.1.1.1 | grep -oP 'src \K\S+'
# Example: 192.168.1.11

# Use in your app
OPENAI_API_BASE="http://192.168.1.11:8084/v1"
```

## API Examples

### List Available Models

```bash
curl -X GET "http://localhost:8084/v1/models" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Chat Completions

```bash
curl -X POST "http://localhost:8084/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nemotron30b",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "max_tokens": 100,
    "temperature": 0.7
  }'
```

### Streaming Chat Completions

```bash
curl -X POST "http://localhost:8084/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nemotron30b",
    "messages": [{"role": "user", "content": "Tell me a story"}],
    "max_tokens": 500,
    "stream": true
  }'
```

### Embeddings

```bash
curl -X POST "http://localhost:8084/v1/embeddings" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "e5-mistral-7b-instruct",
    "input": "The quick brown fox jumps over the lazy dog"
  }'
```

## Python Integration (OpenAI SDK Compatible)

```python
from openai import OpenAI

# Point to Cortex instead of OpenAI
client = OpenAI(
    base_url="http://localhost:8084/v1",
    api_key="your-cortex-api-key"
)

# List models
models = client.models.list()
print("Available models:", [m.id for m in models.data])

# Chat completion
response = client.chat.completions.create(
    model="nemotron30b",
    messages=[{"role": "user", "content": "Hello!"}],
    max_tokens=100
)
print(response.choices[0].message.content)

# Streaming
stream = client.chat.completions.create(
    model="nemotron30b",
    messages=[{"role": "user", "content": "Tell me a story"}],
    stream=True
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

## LangChain Integration

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    base_url="http://localhost:8084/v1",
    api_key="your-cortex-api-key",
    model="nemotron30b",
    temperature=0.7
)

response = llm.invoke("What is the capital of France?")
print(response.content)
```

## Troubleshooting

### Connection Timeout from Docker Container

**Symptom:** Requests from your Docker container to Cortex timeout.

**Diagnosis:**

```bash
# From Cortex directory
make test-external-access
```

**Solutions:**

1. **Run firewall setup (Linux with UFW):**
   ```bash
   make setup-firewall
   ```

2. **Ensure `extra_hosts` is configured:**
   ```yaml
   extra_hosts:
     - "host.docker.internal:host-gateway"
   ```

3. **Test from your container:**
   ```bash
   docker exec -it your-container curl http://host.docker.internal:8084/health
   ```

### 401 Unauthorized

**Cause:** Missing or invalid API key.

**Solution:**
1. Create a new API key in Cortex Admin UI
2. Ensure the header format is exactly: `Authorization: Bearer <key>`
3. Check key hasn't expired

### 503 Service Unavailable / No Upstreams

**Cause:** No models are running in Cortex.

**Solution:**
1. Login to Cortex Admin UI
2. Go to **Models** page
3. Start a model by clicking the play button

### CORS Errors (Browser Only)

**Note:** CORS only affects browser-based requests. Server-to-server requests (like backend services → Cortex) are NOT affected by CORS.

## Verification Checklist

- [ ] Firewall setup completed (`make setup-firewall`)
- [ ] Cortex gateway is running (`docker ps | grep cortex-gateway`)
- [ ] At least one model is running in Cortex
- [ ] API key has been created
- [ ] Health endpoint responds: `curl http://localhost:8084/health`
- [ ] Models endpoint responds: `curl http://localhost:8084/v1/models -H "Authorization: Bearer KEY"`

## Environment Variables Reference

For applications using standard OpenAI SDK environment variables:

```bash
export OPENAI_API_BASE="http://host.docker.internal:8084/v1"
export OPENAI_API_KEY="your-cortex-api-key"
```

## Related Documentation

- [Cortex Quickstart](../getting-started/quickstart-docker.md)
- [API Reference](../api/openai-compatible.md)
- [Admin Setup Guide](../getting-started/admin-setup.md)

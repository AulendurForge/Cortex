# Quickstart (Local Development)

For contributors who prefer running services directly.

## Prerequisites
- Python 3.11+
- Node.js 22+
- Postgres 16 and Redis 7 (or containers)

## Start Postgres and Redis (containers)
```bash
# Postgres
docker run -d --name cortex-pg -e POSTGRES_USER=cortex -e POSTGRES_PASSWORD=cortex -e POSTGRES_DB=cortex -p 5432:5432 postgres:16
# Redis
docker run -d --name cortex-redis -p 6379:6379 redis:7
```

## Backend (FastAPI)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
# Optional: create .env (override DATABASE_URL, CORS origins, etc.)
uvicorn src.main:app --reload --host 0.0.0.0 --port 8084
```
Gateway should be at `http://localhost:8084`.

## Frontend (Next.js)
```bash
cd frontend
npm install
# Point UI to the gateway
export NEXT_PUBLIC_GATEWAY_URL=http://localhost:8084
npm run dev
```
Open `http://localhost:3001`.

## Prometheus (optional)
If you want metrics locally, the simplest path is to run Prometheus via compose:
```bash
docker compose -f docker.compose.dev.yaml up -d prometheus
```
To include host and GPU metrics on Linux with NVIDIA drivers installed, enable profiles and start exporters (compose handles them):
```bash
export COMPOSE_PROFILES=linux,gpu
docker compose -f docker.compose.dev.yaml up -d node-exporter dcgm-exporter
```
Verify targets at `http://localhost:9090/targets`.

## Troubleshooting
- Port conflicts: change ports in compose or app config.
- CORS: set `CORS_ALLOW_ORIGINS` (comma-separated) in the backend `.env`. For dev UI, allow `http://localhost:3001`.
- GPU: to run vLLM with CUDA and enable GPU monitoring, install NVIDIA Container Toolkit and run exporters with the `gpu` profile.

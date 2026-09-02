#!/usr/bin/env bash
# Post-deploy smoke test through the gateway with a REAL API key.
#
#   CORTEX_API_KEY=<key> MODEL=<served model name> bash scripts/smoke.sh
#   BASE=http://host:8084   (default http://127.0.0.1:8084)
#   EMBED_MODEL=<served embedding model>  (optional; embeddings step skipped when unset)
#
# Create a key in the UI (API Keys) or with `make login && make create-key`.
set -euo pipefail

BASE=${BASE:-http://127.0.0.1:8084}
KEY=${CORTEX_API_KEY:-}
MODEL=${MODEL:-}
EMBED_MODEL=${EMBED_MODEL:-}

if [ -z "$KEY" ]; then
    echo "CORTEX_API_KEY is required (a real key; the gateway rejects unknown tokens in production)." >&2
    exit 2
fi

step() { echo "" >&2; echo "== $*" >&2; }

step "GET /health"
curl -fsS "$BASE/health"; echo

step "GET /v1/models"
MODELS=$(curl -fsS -H "Authorization: Bearer $KEY" "$BASE/v1/models")
echo "$MODELS" | head -c 600; echo
if [ -z "$MODEL" ]; then
    MODEL=$(echo "$MODELS" | python3 -c 'import sys,json; d=json.load(sys.stdin); print((d.get("data") or [{}])[0].get("id",""))' 2>/dev/null || true)
    [ -n "$MODEL" ] && echo "(using first model: $MODEL)" >&2
fi

if [ -n "$MODEL" ]; then
    step "POST /v1/chat/completions ($MODEL)"
    curl -fsS -X POST "$BASE/v1/chat/completions" \
      -H "Content-Type: application/json" -H "Authorization: Bearer $KEY" \
      -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with the single word: pong\"}],\"max_tokens\":8,\"stream\":false}"
    echo
else
    echo "No running model; skipping chat completion." >&2
fi

if [ -n "$EMBED_MODEL" ]; then
    step "POST /v1/embeddings ($EMBED_MODEL)"
    curl -fsS -X POST "$BASE/v1/embeddings" \
      -H "Content-Type: application/json" -H "Authorization: Bearer $KEY" \
      -d "{\"model\":\"$EMBED_MODEL\",\"input\":\"hello\"}" | head -c 300
    echo
fi

step "GET /metrics (sample)"
curl -fsS "$BASE/metrics" | grep -E '^gateway_requests_total' | head -n 5 || true

echo "" >&2
echo "Smoke test passed." >&2

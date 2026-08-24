#!/usr/bin/env python3
"""Register Nemotron 3 Super in Cortex via the admin API.

Creates the model entry with the validated fast configuration measured on
the unclassified server (85.6 tok/s single stream). Removes any existing
entry with the same served_model_name first, so it is safe to re-run.

Environment overrides:
    CORTEX_URL      default http://localhost:8084
    CORTEX_USER     default admin
    CORTEX_PASS     default admin
    DERIVED_IMAGE   default cortex/vllm-fips:v0.27.1
    MODEL_NAME      default NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4
    SERVED_NAME     default nemotron
    TP_SIZE         default 4
"""
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("CORTEX_URL", "http://localhost:8084")
USER = os.environ.get("CORTEX_USER", "admin")
PASS = os.environ.get("CORTEX_PASS", "admin")
IMAGE = os.environ.get("DERIVED_IMAGE", "cortex/vllm-fips:v0.27.1")
FOLDER = os.environ.get(
    "MODEL_NAME", "NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4"
)
SERVED = os.environ.get("SERVED_NAME", "nemotron")
TP = int(os.environ.get("TP_SIZE", "4"))

# ---- container startup flags (Plane B) ------------------------------
# --speculative-config enables the model's own Multi-Token Prediction
# head. Together with CUDA graphs (enforce_eager False) this took the
# measured rate from 13.1 to 85.6 tok/s.
spec = {"method": "mtp", "num_speculative_tokens": 2}

custom_args = [
    {"flag": "--enable-auto-tool-choice", "type": "flag", "value": True},
    {"flag": "--tool-call-parser", "type": "string",
     "value": "qwen3_xml"},
    {"flag": "--reasoning-parser", "type": "string",
     "value": "nemotron_v3"},
    {"flag": "--mamba-ssm-cache-dtype", "type": "string",
     "value": "float16"},
    {"flag": "--async-scheduling", "type": "flag", "value": True},
    {"flag": "--speculative-config", "type": "string",
     "value": json.dumps(spec)},
    {"flag": "--prefix-caching-hash-algo", "type": "string",
     "value": "sha256"},
]

# OPENSSL_FORCE_FIPS_MODE=0 is mandatory on a FIPS-enabled host: the
# container has no OpenSSL FIPS provider, so without this it cannot
# build an SSL context and vLLM dies on import.
custom_env = [
    {"key": "OPENSSL_FORCE_FIPS_MODE", "value": "0"},
    {"key": "VLLM_LOGGING_LEVEL", "value": "INFO"},
]

# ---- request-time sampling defaults (Plane C) -----------------------
# NVIDIA specifies temperature 1.0 / top_p 0.95. All penalties are
# neutral on purpose: they corrupt the structural tokens that make up
# <think> blocks and <tool_call> XML.
sampling = {
    "temperature": 1.0,
    "top_p": 0.95,
    "top_k": -1,
    "repetition_penalty": 1.0,
    "frequency_penalty": 0.0,
    "presence_penalty": 0.0,
}

model = {
    "mode": "offline",
    "local_path": FOLDER,
    "name": "Nemotron 3 Super 120B NVFP4",
    "served_model_name": SERVED,
    "task": "generate",
    "engine_type": "vllm",
    "engine_image": IMAGE,
    "engine_version": "v0.27.1",
    "dtype": "auto",
    "tp_size": TP,
    "gpu_memory_utilization": 0.9,
    "max_model_len": 32768,
    "max_num_seqs": 32,
    "block_size": 16,
    "trust_remote_code": True,
    "enforce_eager": False,
    "enable_chunked_prefill": True,
    "startup_timeout_sec": 2400,
    "engine_startup_args_json": json.dumps(custom_args),
    "engine_startup_env_json": json.dumps(custom_env),
    "custom_request_json": json.dumps(sampling),
}
model.update(sampling)

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(jar)
)


def call(method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        raw = opener.open(req, timeout=30).read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        print("  HTTP %s on %s %s" % (e.code, method, path))
        print("  %s" % detail)
        raise SystemExit(1)
    except urllib.error.URLError as e:
        print("  Cannot reach Cortex at %s (%s)" % (BASE, e.reason))
        print("  Is the gateway running?  'make up' in the Cortex repo.")
        raise SystemExit(1)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return raw


def main():
    print("Cortex        : %s" % BASE)
    print("Engine image  : %s" % IMAGE)
    print("Model folder  : %s" % FOLDER)
    print("Served name   : %s" % SERVED)
    print("Tensor par.   : %d" % TP)
    print("")

    print("1. logging in as %s" % USER)
    call("POST", "/auth/login", {"username": USER, "password": PASS})
    print("   ok")

    print("2. removing any existing '%s' entry" % SERVED)
    found = 0
    for old in call("GET", "/admin/models") or []:
        if old.get("served_model_name") != SERVED:
            continue
        if old.get("archived"):
            continue
        found += 1
        mid = old["id"]
        state = old.get("state")
        print("   id=%s state=%s -> removing" % (mid, state))
        if state not in ("stopped", None):
            try:
                call("POST", "/admin/models/%d/stop" % mid)
            except SystemExit:
                print("   (stop failed; deleting anyway)")
        call("DELETE", "/admin/models/%d" % mid)
    if not found:
        print("   none found")

    print("3. creating the model entry")
    created = call("POST", "/admin/models", model)
    mid = created["id"]
    print("   created id = %s" % mid)

    print("")
    print("=" * 58)
    print("Done - refresh the Cortex Models page.")
    print("")
    print("Start it from the UI so you can watch the logs. First load")
    print("takes 5-10 minutes (CUDA graph capture plus MTP init).")
    print("=" * 58)
    return 0


if __name__ == "__main__":
    sys.exit(main())

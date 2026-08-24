#!/usr/bin/env python3
"""Seed Cortex with a correctly configured Nemotron 3 Super model.

Run from the Cortex repo root:

    python3 scripts/seed-nemotron.py

Asks how much GPU memory to use and how large a context window to
allow, then creates the model entry with the validated high-speed
configuration (CUDA graphs + async scheduling + MTP speculative
decoding — measured at 85.6 tok/s single stream on 4x L40S).

Non-interactive:

    python3 scripts/seed-nemotron.py --gpu-util 90 --context 32768 --yes

Environment overrides:
    CORTEX_URL CORTEX_USER CORTEX_PASS DERIVED_IMAGE MODEL_NAME
    SERVED_NAME MODELS_DIR TP_SIZE
"""
import argparse
import http.cookiejar
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

# ---------------------------------------------------------------- config
BASE = os.environ.get("CORTEX_URL", "http://localhost:8084")
USER = os.environ.get("CORTEX_USER", "admin")
PASS = os.environ.get("CORTEX_PASS", "admin")
IMAGE = os.environ.get("DERIVED_IMAGE", "cortex/vllm-fips:v0.27.1")
FOLDER = os.environ.get(
    "MODEL_NAME", "NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4"
)
SERVED = os.environ.get("SERVED_NAME", "nemotron")
MODELS_DIR = os.environ.get("MODELS_DIR", "/var/cortex/models")
TP = int(os.environ.get("TP_SIZE", "4"))

MODEL_MAX_CTX = 262144          # what the checkpoint supports
DEFAULT_CTX = 32768             # what we validated
DEFAULT_UTIL = 90               # percent

# Calibration from the measured run on mage: at util 0.90 on 48 GB L40S
# cards, ~15.25 GiB per GPU was left for KV cache. Used only to show the
# operator a rough concurrency figure while they choose.
VRAM_GIB_PER_GPU = 44.39        # usable, as vLLM reported it
OVERHEAD_GIB = 24.70            # weights + activations + non-torch
TOKENS_PER_GIB_BF16 = 48400     # measured, bf16/auto KV cache

C_G, C_Y, C_R, C_B, C_N = (
    "\033[0;32m", "\033[1;33m", "\033[0;31m", "\033[0;34m", "\033[0m"
)


def hdr(msg):
    print("\n%s===== %s =====%s" % (C_B, msg, C_N))


def ok(msg):
    print("  %s[ok]%s   %s" % (C_G, C_N, msg))


def warn(msg):
    print("  %s[warn]%s %s" % (C_Y, C_N, msg))


def bad(msg):
    print("  %s[fail]%s %s" % (C_R, C_N, msg))


# ---------------------------------------------------------------- http
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(jar)
)


def call(method, path, payload=None, timeout=30):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        BASE + path, data=data, method=method,
        headers={"Content-Type": "application/json"},
    )
    try:
        raw = opener.open(req, timeout=timeout).read()
        raw = raw.decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:400]
        bad("HTTP %s on %s %s" % (e.code, method, path))
        print("        %s" % detail)
        raise SystemExit(1)
    except urllib.error.URLError as e:
        bad("Cannot reach Cortex at %s (%s)" % (BASE, e.reason))
        print("        Start it first:  make up")
        raise SystemExit(1)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return raw


def sh(cmd):
    """Run a command, return stdout or '' — never raises."""
    try:
        out = subprocess.run(cmd, capture_output=True, text=True,
                             timeout=20)
        return out.stdout.strip() if out.returncode == 0 else ""
    except Exception:
        return ""


# ---------------------------------------------------------------- checks
def preflight():
    """Gather environment facts. Returns (gpu_count, vram_gib)."""
    hdr("Checking this host")

    health = None
    try:
        health = urllib.request.urlopen(BASE + "/health", timeout=5).read()
    except Exception:
        pass
    if health:
        ok("Cortex gateway responding at %s" % BASE)
    else:
        bad("Cortex gateway is not answering at %s" % BASE)
        print("        Start it first:  make up")
        raise SystemExit(1)

    gpus, vram = 0, VRAM_GIB_PER_GPU
    if shutil.which("nvidia-smi"):
        names = sh(["nvidia-smi", "--query-gpu=name",
                    "--format=csv,noheader"])
        gpus = len([x for x in names.splitlines() if x.strip()])
        mem = sh(["nvidia-smi", "--query-gpu=memory.total",
                  "--format=csv,noheader,nounits"])
        first = mem.splitlines()[0].strip() if mem.strip() else ""
        if first.isdigit():
            vram = int(first) / 1024.0
        if gpus:
            ok("%d GPU(s), %.0f GiB each" % (gpus, vram))
        if gpus and gpus < TP:
            warn("TP_SIZE is %d but only %d GPU(s) present." % (TP, gpus))
            warn("Set TP_SIZE=%d to match, or the model will not start."
                 % gpus)
    else:
        warn("nvidia-smi not found - skipping GPU checks")

    if shutil.which("docker"):
        img = sh(["docker", "image", "inspect", IMAGE, "--format",
                  "{{.Id}}"])
        if img:
            ok("Engine image present: %s" % IMAGE)
        else:
            warn("Engine image '%s' is NOT on this host." % IMAGE)
            warn("Cortex will try to pull it and fail if it is offline.")
            warn("Build it first - see section 4b of the deployment doc.")
    else:
        warn("docker CLI not found - skipping image check")

    path = os.path.join(MODELS_DIR, FOLDER)
    if os.path.isdir(path):
        shards = [f for f in os.listdir(path)
                  if f.endswith(".safetensors")]
        ok("Model folder found (%d shards): %s" % (len(shards), path))
    else:
        warn("Model folder not visible from here: %s" % path)
        warn("That is fine if Cortex mounts it from somewhere else,")
        warn("but a wrong Local Path will fail at start time.")

    return gpus or TP, vram


# ---------------------------------------------------------------- prompts
def ask_int(prompt, default, lo, hi):
    while True:
        try:
            raw = input("%s [%s]: " % (prompt, default)).strip()
        except (EOFError, KeyboardInterrupt):
            print("\nCancelled.")
            raise SystemExit(1)
        if raw == "":
            return default
        raw = raw.rstrip("%").strip()
        try:
            val = int(float(raw))
        except ValueError:
            print("  Please enter a whole number between %d and %d."
                  % (lo, hi))
            continue
        if val < lo or val > hi:
            print("  Out of range - must be between %d and %d."
                  % (lo, hi))
            continue
        return val


def estimate_concurrency(util_pct, ctx, gpus, vram):
    """Rough concurrent-request estimate from the measured run.

    Calibrated against 4 x L40S 48 GiB at TP=4. Returns (None, None)
    on other hardware rather than printing a misleading number.
    """
    if vram < 40 or gpus < 4 or TP != 4:
        return None, None
    per_gpu = (vram * util_pct / 100.0) - OVERHEAD_GIB
    if per_gpu <= 0:
        return 0, per_gpu
    total_gib = per_gpu * gpus
    tokens = total_gib * TOKENS_PER_GIB_BF16
    return int(tokens / ctx), per_gpu


def choose(args, gpus, vram):
    hdr("Configuration")

    if args.gpu_util is not None:
        util = args.gpu_util
        print("  GPU memory utilisation: %d%% (from --gpu-util)" % util)
    else:
        print("  How much of each GPU's memory may vLLM reserve?")
        print("  Higher leaves more room for KV cache; too high risks an")
        print("  out-of-memory failure during startup profiling.")
        print("  90 is the validated value. Range 50-98.")
        util = ask_int("  GPU memory utilisation (%)", DEFAULT_UTIL,
                       50, 98)

    print("")
    if args.context is not None:
        ctx = args.context
        print("  Context window: %d tokens (from --context)" % ctx)
    else:
        print("  How large a context window per request?")
        print("  The checkpoint supports up to %d." % MODEL_MAX_CTX)
        print("  Larger contexts reduce how many requests fit at once.")
        print("  32768 is the validated value.")
        ctx = ask_int("  Context window (tokens)", DEFAULT_CTX,
                      1024, MODEL_MAX_CTX)

    conc, per_gpu = estimate_concurrency(util, ctx, gpus, vram)
    print("")
    if conc is None:
        print("  (Capacity estimate is calibrated for 4 x L40S 48 GiB at")
        print("   TP=4, so it is not shown for this hardware.)")
    else:
        print("  Estimated KV cache : %.1f GiB per GPU" % max(per_gpu, 0))
        if conc > 0:
            print("  Estimated capacity : ~%d concurrent requests at %d "
                  "tokens each" % (conc, ctx))
            print("  (extrapolated from the measured run; a guide, not a"
                  " guarantee)")
        if per_gpu <= 2:
            warn("Very little memory left for KV cache. Lower the")
            warn("context window or raise GPU utilisation, or startup")
            warn("may fail during memory profiling.")
    if ctx > 131072:
        warn("Contexts above 128K are untested on this hardware.")
    return util, ctx


# ---------------------------------------------------------------- payload
def build(util_pct, ctx):
    spec = {"method": "mtp", "num_speculative_tokens": 2}
    args_json = [
        {"flag": "--enable-auto-tool-choice", "type": "flag",
         "value": True},
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
    env_json = [
        {"key": "OPENSSL_FORCE_FIPS_MODE", "value": "0"},
        {"key": "VLLM_LOGGING_LEVEL", "value": "INFO"},
    ]
    sampling = {
        "temperature": 1.0, "top_p": 0.95, "top_k": -1,
        "repetition_penalty": 1.0, "frequency_penalty": 0.0,
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
        "gpu_memory_utilization": round(util_pct / 100.0, 2),
        "max_model_len": ctx,
        "max_num_seqs": 32,
        "block_size": 16,
        "trust_remote_code": True,
        "enforce_eager": False,
        "enable_chunked_prefill": True,
        "startup_timeout_sec": 2400,
        "engine_startup_args_json": json.dumps(args_json),
        "engine_startup_env_json": json.dumps(env_json),
        "custom_request_json": json.dumps(sampling),
    }
    model.update(sampling)
    return model


def summarise(m):
    hdr("Review")
    rows = [
        ("Display name", m["name"]),
        ("Served as", m["served_model_name"]),
        ("Engine image", m["engine_image"]),
        ("Local path", m["local_path"]),
        ("Tensor parallel", m["tp_size"]),
        ("GPU memory util", "%.2f" % m["gpu_memory_utilization"]),
        ("Context window", m["max_model_len"]),
        ("CUDA graphs", "on (enforce_eager off)"),
        ("Speculative decode", "MTP, 2 draft tokens"),
        ("Async scheduling", "on"),
        ("Tool parser", "qwen3_xml"),
        ("Reasoning parser", "nemotron_v3"),
        ("Sampling", "temp 1.0 / top_p 0.95 / penalties off"),
        ("Startup timeout", "%s s" % m["startup_timeout_sec"]),
    ]
    for k, v in rows:
        print("  %-20s %s" % (k + ":", v))


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(
        description="Seed Cortex with a configured Nemotron 3 Super model."
    )
    ap.add_argument("--gpu-util", type=int, metavar="PCT",
                    help="GPU memory utilisation percent (50-98)")
    ap.add_argument("--context", type=int, metavar="TOKENS",
                    help="context window in tokens")
    ap.add_argument("--yes", "-y", action="store_true",
                    help="skip the confirmation prompt")
    a = ap.parse_args()

    for name, val, lo, hi in (("--gpu-util", a.gpu_util, 50, 98),
                              ("--context", a.context, 1024,
                               MODEL_MAX_CTX)):
        if val is not None and not (lo <= val <= hi):
            bad("%s must be between %d and %d (got %s)"
                % (name, lo, hi, val))
            return 1

    print("%sSeed Cortex with Nemotron 3 Super%s" % (C_B, C_N))
    print("Target: %s" % BASE)

    gpus, vram = preflight()
    util, ctx = choose(a, gpus, vram)
    model = build(util, ctx)
    summarise(model)

    if not a.yes:
        print("")
        try:
            reply = input("Create this model in Cortex? [Y/n]: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nCancelled.")
            return 1
        if reply and reply.lower() not in ("y", "yes"):
            print("Cancelled - nothing was changed.")
            return 1

    hdr("Applying")
    call("POST", "/auth/login", {"username": USER, "password": PASS})
    ok("Signed in as %s" % USER)

    removed = 0
    for old in call("GET", "/admin/models") or []:
        if old.get("served_model_name") != SERVED or old.get("archived"):
            continue
        mid, state = old["id"], old.get("state")
        if state not in ("stopped", None):
            try:
                call("POST", "/admin/models/%d/stop" % mid, timeout=60)
            except SystemExit:
                warn("Could not stop id %s - deleting anyway" % mid)
        call("DELETE", "/admin/models/%d" % mid)
        removed += 1
    if removed:
        ok("Replaced %d existing '%s' entry/entries" % (removed, SERVED))

    new_id = call("POST", "/admin/models", model)["id"]
    ok("Created model id %s" % new_id)

    hdr("Done")
    print("  Refresh the Cortex Models page - 'Nemotron 3 Super 120B")
    print("  NVFP4' is there, configured and stopped.")
    print("")
    print("  Press Start in the UI to bring it up. First load takes")
    print("  5-10 minutes: weight load, CUDA graph capture, MTP init.")
    print("")
    print("  Watch it with:")
    print("    docker logs -f $(docker ps \\")
    print("      --filter name=vllm-model- --format '{{.Names}}' | head -1)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

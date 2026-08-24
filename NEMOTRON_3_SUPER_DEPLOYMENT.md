# Deploying NVIDIA Nemotron 3 Super 120B (NVFP4) on Cortex

**Server:** `afwi@mage` — Cortex repo at `~/repos/Cortex`
**Hardware:** 4 × NVIDIA L40S 48 GB (compute capability 8.9, "Ada Lovelace")
**Model:** `nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4` (already downloaded)
**Sequence:** validate on the FIPS-enabled unclass server, then transfer air-gapped

Every command below is copy-paste ready for this server. Run [§0](#0-set-up-your-shell) once
per terminal session first — everything downstream uses those variables.

---

## 0. Set up your shell

```bash
cd ~/repos/Cortex
```

Resolve the paths Cortex is actually using, read from the **running gateway
container** rather than from a config file — this is authoritative even if
someone exported an override:

```bash
docker inspect cortex-gateway-1 \
  --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

Look for the line ending in `-> /var/cortex/models`. Its left-hand side is your
host models directory. Then set your session variables:

```bash
export CORTEX_REPO=~/repos/Cortex
# MODELS_DIR must match the inspect output above
export MODELS_DIR=/var/cortex/models
export MODEL_NAME=NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4
export MODEL_PATH=$MODELS_DIR/$MODEL_NAME
export HOST_IP=$(hostname -I | awk '{print $1}')

# Pick the engine image from the installed driver. The CUDA 12.9 images (0.25+)
# need >= 575.51.03; older drivers must use NVIDIA's pinned CUDA 12.8 tag.
DRV=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)
if [ "$(printf '%s\n575.51.03\n' "$DRV" | sort -V | head -1)" = "575.51.03" ]; then
  export VLLM_TAG=vllm/vllm-openai:v0.27.1
else
  export VLLM_TAG=vllm/vllm-openai:v0.24.0-ubuntu2404
fi
echo "driver $DRV -> $VLLM_TAG"

echo "repo    : $CORTEX_REPO"
echo "weights : $MODEL_PATH"
echo "image   : $VLLM_TAG"
echo "gateway : http://$HOST_IP:8084"
```

> **Once you have built the derived FIPS image in §4b**, re-running this block
> resets `VLLM_TAG` back to the upstream tag. After §4b, finish every new shell
> with `export VLLM_TAG=cortex/vllm-fips:v0.27.1` (or whatever you tagged it).

If the gateway container isn't running, fall back to the config default —
there is no `.env` in this repo, so both compose files resolve
`${CORTEX_MODELS_DIR:-/var/cortex/models}` to `/var/cortex/models`:

```bash
ls -d /var/cortex/models && echo "OK - default path confirmed"
```

### Path map for this server

| What | Where | In the repo? |
|---|---|---|
| Cortex repo | `~/repos/Cortex` | — |
| vLLM image (running) | `/var/lib/docker/` — Docker's own store | **No** |
| vLLM image (for transfer) | `~/repos/Cortex/cortex-offline-images/*.tar` | Yes, transient |
| Model weights (host) | `/var/cortex/models/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4/` | **No** |
| Model weights (in container) | `/models/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4/` — mounted read-only | — |
| HF cache | `/var/cortex/hf-cache/` | **No** |
| Compose file | `~/repos/Cortex/docker.compose.dev.yaml` (`make` defaults to `ENV=dev`) | Yes |
| Offline version pin | `~/repos/Cortex/scripts/versions.env` | Yes |
| Admin UI | `http://$HOST_IP:3001` | — |
| Gateway API | `http://$HOST_IP:8084` | — |

Confirm which compose file `make` will use — the prod file was edited recently,
so check before assuming dev:

```bash
make info | head -5
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | head
```

If you are running prod, append `ENV=prod` to every `make` command below.

---

## 1. TL;DR — what actually changes

| | Before | After |
|---|---|---|
| vLLM image | `v0.8.2` (container logged 0.8.5) | `vllm/vllm-openai:v0.27.1` |
| Where it's set | System default | **Per-model** Engine Image field — no fleet-wide change, no `.env` edit |
| Tool parser | `qwen3-coder` → `KeyError` | `qwen3_xml` (underscores) |
| Reasoning parser | none | `nemotron_v3` |
| Sampling defaults | Cortex stock (temp 0.8, penalties on) | temp 1.0, top_p 0.95, **all penalties off** |
| FIPS host | Latent break, masked by old aiohttp | `OPENSSL_FORCE_FIPS_MODE=0` **and** a derived image without opencv — **§4b, mandatory** |

**No Cortex code changes are required, and you do not need to create or edit
`.env` for this test.** The per-model Engine Image field overrides the system
default on its own.

> **Read this if you read nothing else:** Cortex's stock Request Defaults
> (repetition penalty 1.2, frequency 0.5, presence 0.5) will actively damage
> this model — they penalize the structural tokens that form `<think>` blocks
> and `<tool_call>` XML. See [§9](#9-request-defaults). Getting the container up
> but leaving these on is the most likely way to conclude "the model is broken"
> when it isn't.

---

## 2. Why the current engine cannot work

Not a matter of finding the right flag. vLLM 0.8.2 is missing four things this
model requires, each a hard registry lookup that raises before inference starts.

| The model needs | vLLM 0.8.2 / 0.8.5 has |
|---|---|
| `NemotronHForCausalLM` in the model registry | Only `NemotronForCausalLM` and `DeciLMForCausalLM`. No hybrid-Mamba Nemotron, no `NemotronHMTPModel` for the MTP head. |
| `modelopt_mixed` in `QUANTIZATION_METHODS` | `aqlm, awq, deepspeedfp, tpu_int8, fp8, ptpc_fp8, fbgemm_fp8, modelopt, nvfp4, marlin, bitblas, gguf, gptq_marlin_24, gptq_marlin, gptq_bitblas, awq_marlin, gptq, compressed-tensors, bitsandbytes, qqq, hqq, experts_int8, neuron_quant, ipex, quark, moe_wna16, torchao` — no `modelopt_mixed` |
| `qwen3_xml` / `qwen3_coder` tool parser | The ten in the traceback already seen |
| `nemotron_v3` reasoning parser | Resolves only `deepseek_r1`, `granite` |

There is no `--quantization` override, no `--hf-overrides`, and no
`trust_remote_code` path around a missing architecture — `trust_remote_code`
lets vLLM read a custom *config*, not link a fused-MoE kernel that was never
compiled into the image.

### Which version

| Version | Status |
|---|---|
| 0.18.0 | Verified floor — has `NemotronHForCausalLM`, `NemotronHMTPModel`, `modelopt_mixed`, `qwen3_xml`, `qwen3_coder`, `nemotron_v3` |
| 0.20.0 | NVIDIA model card's stated minimum |
| 0.24.0 | Pinned by NVIDIA's official recipe (`v0.24.0-ubuntu2404`, CUDA 12.8) |
| **0.27.1** | Current stable — **use this** unless the driver forces 0.24 |

0.18 has the class *names*; NVIDIA pinning 0.24 tells you the LatentMoE and MTP
*correctness* work landed later. On non-Blackwell hardware you lean hard on the
NVFP4 backend-selection path, which has had continuous fixes — take newest stable.

---

## 3. Pre-flight checks

```bash
cd ~/repos/Cortex

# 1. GPUs and driver
nvidia-smi --query-gpu=index,name,driver_version,memory.total --format=csv
```

> **Confirmed on `mage`, 21 Aug 2026: driver 590.48.01** — well clear of the
> cutoff, so this server runs **v0.27.1**, the current stable. No driver work
> needed and no reason to fall back to the 0.24 tag.

**Driver ≥ 575.51.03 is required** for the CUDA 12.9 images (0.25+). If older,
use `vllm/vllm-openai:v0.24.0-ubuntu2404` — CUDA 12.8, needs only 525.60.13,
and it is the tag NVIDIA's own recipe pins, so it is a supported position rather
than a workaround. See `docs/operations/UPDATE_NVIDIA_DRIVERS.md`. To switch:

```bash
export VLLM_TAG=vllm/vllm-openai:v0.24.0-ubuntu2404
```

```bash
# 2. Weights present and complete (~75 GiB of shards)
ls -la "$MODEL_PATH" | head -40
du -sh --exclude=.git "$MODEL_PATH"
```

Expect **17 `model-000NN-of-00017.safetensors` shards** at ~5 GB each plus
`model.safetensors.index.json`, `config.json`, `hf_quant_config.json`,
`tokenizer.json`, and `chat_template.jinja`. Total ≈ **75 GiB**.

Confirm every shard is real data and not an unresolved Git-LFS pointer — a
pointer file is a few hundred bytes, so anything under 1 MB is a failed download:

```bash
find "$MODEL_PATH" -maxdepth 1 -name '*.safetensors' -size -1M
```

No output is the pass condition.

```bash
# config.json must report the hybrid architecture and mixed quantization
python3 -c "
import json,os
c=json.load(open(os.path.expandvars('\$MODEL_PATH/config.json')))
print('arch      :', c.get('architectures'))
print('quant     :', (c.get('quantization_config') or {}).get('quant_method'))
print('layers    :', c.get('num_hidden_layers'))"
```

Expect `['NemotronHForCausalLM']` / `modelopt_mixed` / `88`.

> **A 7 MB `config.json` is normal here, not corruption.** The `modelopt_mixed`
> quantization block enumerates per-module settings across 88 layers × 512
> routed experts, which runs to megabytes. `hf_quant_config.json` (~6 MB) carries
> the same information for the ModelOpt loader. Both are expected.

### If the model was cloned with `git clone`

A `.git/` directory in the model folder means Git-LFS kept a **second complete
copy** of every shard in `.git/lfs/objects` — roughly 75 GiB of dead weight that
`du --exclude=.git` hides. Check:

```bash
sudo du -sh "$MODEL_PATH/.git" 2>/dev/null
df -h /var/cortex
```

If it is large and you have no intention of pulling model updates via git, the
working tree is fully self-contained and the metadata can go:

```bash
sudo mv "$MODEL_PATH/.git" /var/tmp/nemotron-git-backup     # reversible
# verify the model still loads (§6), then:  sudo rm -rf /var/tmp/nemotron-git-backup
```

Move it rather than deleting outright, and only reclaim the space after §6
passes. vLLM never reads `.git`, so this is safe — but do it before the air-gap
transfer, since otherwise you ship 150 GiB instead of 75 GiB.

### Permissions

The files above are root-owned but world-readable (`-rwxr-xr-x`), which is what
matters — vLLM containers run as root and mount `/models` read-only, so they will
read the shards without trouble. A root-only `.git/` or `.gitattributes` is
irrelevant to loading.

```bash
# 3. Disk headroom for the image (~10 GB plus layer extraction)
df -h /var/lib/docker

# 4. Docker can see the GPUs
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi

# 5. Your user can reach the Docker socket without sudo
docker ps >/dev/null && echo "OK - docker accessible as $(whoami)"
```

If step 5 fails, prefix every `docker` command below with `sudo` — but note that
`sudo` will not carry your `$MODEL_PATH` / `$VLLM_TAG` variables unless you use
`sudo -E`.

---

## 4. Getting the image onto the server

### Where Docker images actually live

**Images are not stored in the Cortex repo, and you do not build anything.**
They live in the Docker daemon's store at `/var/lib/docker/` and are referenced
by *tag*. When Cortex starts a model it passes a tag string to the Docker API;
the daemon resolves it locally.

The only time an image touches `~/repos/Cortex` is during air-gap transfer, when
`make prepare-offline` writes `.tar` files to `~/repos/Cortex/cortex-offline-images/`
purely as a shipping container. `make load-offline` imports them into
`/var/lib/docker/` and the tarballs become dead weight. That directory already
exists on this server from a previous run:

```bash
ls -lh ~/repos/Cortex/cortex-offline-images/
```

### Pull it

```bash
docker pull "$VLLM_TAG"
docker images vllm/vllm-openai        # confirm ~9-10 GB landed
```

That is the entire install. Nothing to clone, nothing to build, nothing to copy
into the repo.

> **Pull manually — do not let Cortex do it.** Cortex *will* pull automatically,
> but the pull runs **synchronously inside the Start request**
> (`_ensure_image`, `backend/src/docker_manager.py:178`). A 10 GB pull blocks the
> admin API for 5–15 minutes with no UI progress and looks exactly like a failed
> Start while it is still downloading.
>
> Second trap: with `OFFLINE_MODE_AUTO_DETECT` on (the default), Cortex probes
> `registry-1.docker.io:443` with a **3-second timeout** and flips to offline
> mode if that fails — which a restricted or proxied network can trigger even
> when pulls work fine. Pre-pulling sidesteps both: `_ensure_image()` finds the
> tag cached and returns without touching the network.

---

## 4b. FIPS blocker — clear this before anything else

**On this server, the host's FIPS mode breaks modern vLLM images outright.** This
is not a warning about compliance posture; the engine cannot import its own
config module. Symptom:

```
File "/usr/local/lib/python3.12/dist-packages/aiohttp/connector.py", line 901
  sslcontext = ssl.create_default_context()
ssl.SSLError: [CRYPTO] unknown error (_ssl.c:3076)
```

### What is happening

1. `mage`'s kernel has FIPS enabled, so `/proc/sys/crypto/fips_enabled` reads `1`.
2. `/proc` is shared into every container, so the vLLM container sees that flag.
3. Ubuntu's OpenSSL honors it and tries to load the **FIPS provider module** —
   which is **not installed in the vLLM image** (`openssl list -providers` shows
   only `default`).
4. With no FIPS provider available, OpenSSL cannot build an SSL context.
5. `aiohttp` ≥ 3.10.6 creates its default SSL context **at module import time**,
   so the failure fires the instant anything imports it.
6. `vllm.config` imports `aiohttp` transitively, so **every** vLLM entry point
   dies before reading a single argument.

This is a known Ubuntu-24.04-container-on-FIPS-host interaction, not a vLLM
defect — the vLLM issue tracking it was closed "not planned" as environmental.

### Why vLLM 0.8.2/0.8.5 appeared to work

Older aiohttp built its SSL context lazily rather than at import. The
incompatibility has been latent on this host all along; the newer image is
simply the first thing to touch it during startup. **Any** modern vLLM will hit
this — it is not a reason to prefer an older tag.

### Confirm the diagnosis

```bash
# host: expect 1
cat /proc/sys/crypto/fips_enabled

# container: also 1.  --entrypoint cat is REQUIRED -- this image's ENTRYPOINT is
# ["vllm","serve"], so without it your arguments are handed to vLLM instead.
docker run --rm --entrypoint cat "$VLLM_TAG" /proc/sys/crypto/fips_enabled

# expect: default provider only
docker run --rm --entrypoint openssl "$VLLM_TAG" list -providers
```

### The fix

Tell the container's OpenSSL not to enter FIPS mode, since it has no FIPS
provider to enter it with:

```bash
docker run --rm -e OPENSSL_FORCE_FIPS_MODE=0 --entrypoint python3 "$VLLM_TAG" \
  -c "import ssl; ssl.create_default_context(); print('SSL context OK')"
```

`SSL context OK` means you are unblocked. **Add `-e OPENSSL_FORCE_FIPS_MODE=0`
to every `docker run` below, and add it as a model environment variable in
Cortex (§8).** Every command in this document already includes it.

> **Confirmed on `mage`, 21 Aug 2026** — this returned `SSL context OK` against
> `vllm/vllm-openai:v0.24.0-ubuntu2404`. That clears the *first* blocker only.
> A second one is waiting directly below; you need both fixes.

> **Do not try to mask `/proc/sys/crypto/fips_enabled` with a bind mount.** An
> earlier draft of this document suggested it. Modern `runc` refuses outright —
> `cannot be mounted because it is inside /proc` — on Docker 28.x with or without
> `--security-opt systempaths=unconfined`. That advice was wrong and has been
> removed.

### Second blocker: `FATAL FIPS SELFTEST FAILURE`

Clearing the first one exposes a second, which looks like this:

```
crypto/fips/fips.c:154: OpenSSL internal error: FATAL FIPS SELFTEST FAILURE
```

**Different library, different cause.** `crypto/fips/fips.c` is the *OpenSSL 1.x*
FIPS module — not the system OpenSSL 3 that `OPENSSL_FORCE_FIPS_MODE=0` fixed.
The vLLM image ships a **vendored OpenSSL 1.1.1k inside the opencv wheel**, with
no HMAC integrity sidecar:

```
/usr/local/lib/python3.12/dist-packages/opencv_python_headless.libs/
    libcrypto-bdaed0ea.so.1.1.1k      <- no .libcrypto-....hmac beside it
    libssl-60250281.so.1.1.1k
```

Under kernel FIPS mode that library runs a power-on self-test, cannot verify its
own integrity because the `.hmac` file was never packaged, and aborts fatally.
`OPENSSL_FORCE_FIPS_MODE=0` does not reach it — that variable is honored by the
system OpenSSL, not by a wheel's private copy.

And `vllm.config` imports `cv2` transitively, so it fires on every entry point.
Confirm it is opencv on your box:

```bash
docker run --rm -e OPENSSL_FORCE_FIPS_MODE=0 --entrypoint python3 "$VLLM_TAG" \
  -c "import cv2; print('cv2 loaded')"
```

A `FATAL FIPS SELFTEST FAILURE` here is the confirmation.

### The fix: a derived image without the vendored OpenSSL

Nemotron 3 Super is text-only and never needs opencv. Removing it takes the
offending library off disk entirely.

```bash
cd ~/repos/Cortex
echo "base image will be: ${VLLM_TAG:?VLLM_TAG is unset - re-run the exports in section 0}"
mkdir -p infra/vllm-fips

cat > infra/vllm-fips/Dockerfile <<EOF
FROM ${VLLM_TAG}
# Remove the vendored OpenSSL 1.1.1k shipped inside the opencv wheel.
# It has no HMAC sidecar and aborts on FIPS-enabled hosts.
# Safe for text-only models, which never invoke cv2.
RUN pip uninstall -y opencv-python-headless opencv-python || true
EOF

docker build -t cortex/vllm-fips:v0.27.1 infra/vllm-fips/
export VLLM_TAG=cortex/vllm-fips:v0.27.1
```

Verified: with opencv removed, `vllm serve --help=Frontend` runs clean and lists
`qwen3_xml` and `qwen3_coder`, and `import vllm.config` succeeds.

**Keep `-e OPENSSL_FORCE_FIPS_MODE=0` as well.** The two fixes address different
libraries and you need both.

> **The variable is checked for presence, not value.** Tested directly: on a
> host with *no* `/proc/sys/crypto/fips_enabled` at all, `import cv2` in the
> upstream image succeeds normally — but adding `OPENSSL_FORCE_FIPS_MODE=0`
> makes it abort with `FATAL FIPS SELFTEST FAILURE`. Setting it to `1` does the
> same. The vendored OpenSSL 1.1.1k reads only whether the variable exists.
>
> So the variable does not merely fail to fix the opencv problem — **it causes
> it**. On the derived image this is harmless, because there is no vendored
> OpenSSL left to trip; confirmed by the same test against a derived build.
>
> Two consequences worth remembering. Do not treat this variable as a general
> FIPS off-switch: if a future vLLM image ships another wheel with a bundled
> OpenSSL 1.x, it will break the same way and the fix is again to remove the
> wheel, not to adjust the variable. And if you ever see `FATAL FIPS SELFTEST
> FAILURE` from a container you believe is the derived image, the container is
> almost certainly running the upstream one.

If something later turns out to need `cv2`, install a distro build linked against
the system OpenSSL 3 instead of the vendored copy — add
`RUN apt-get update && apt-get install -y python3-opencv` to the Dockerfile.

### The faster alternative, if policy allows it

The unclass server exists to answer one question: *does this model run on 4 ×
L40S?* Fighting a vendored-OpenSSL-versus-FIPS interaction is a detour from that.

If your security lead will authorize booting **this box only** with FIPS off
(`fips=0` on the kernel command line), you answer the model question in an hour
instead of a day, and every command in this document works unmodified. Then solve
FIPS properly for the accredited system as its own workstream, where the derived
image above is the starting point.

Worth asking before you invest further. Both paths are legitimate — this one is
just cheaper on a box whose whole purpose is validation.

### Read this before you use it in production

`OPENSSL_FORCE_FIPS_MODE=0` **disables FIPS enforcement inside the container.**
That is defensible on an unclassified test box whose job is to answer "does this
model run on L40S," and you should use it there without hesitation. It is a
different decision on the accredited system.

For the air-gapped deployment you have two honest options — pick deliberately,
and get it in front of your security lead early rather than at assessment time:

| Option | What it means |
|---|---|
| **Document the exception** | The container runs non-FIPS crypto. Defensible if your boundary stops at the host, and strengthened by the fact that single-node TP=4 keeps all traffic on the PCIe bus with no TLS in the inference path at all. |
| **Rebuild on a FIPS base** | Derive an image carrying the OpenSSL FIPS provider (Ubuntu Pro FIPS or a FIPS-validated base) so the container can honor the host's FIPS mode properly instead of opting out. Real work — scope it now, not later. |

This supersedes what §13 originally said. I had concluded from a non-FIPS test
host that the container's OpenSSL could not enter FIPS mode and therefore could
not be broken by the host. That was wrong: it enters FIPS mode from the kernel
flag and then fails for want of the provider. §13 is corrected accordingly.

---

## 5. Verify the image before spending 15 minutes on a load

```bash
# Tool parsers — must include qwen3_xml and qwen3_coder
docker run --rm --gpus all -e OPENSSL_FORCE_FIPS_MODE=0 --entrypoint vllm \
  "$VLLM_TAG" serve --help=Frontend | grep -A2 tool-call-parser

# Reasoning parsers — must include nemotron_v3
docker run --rm --gpus all -e OPENSSL_FORCE_FIPS_MODE=0 \
  --entrypoint python3 "$VLLM_TAG" -c \
  "import vllm.reasoning as R; print(sorted(R.ReasoningParserManager.lazy_parsers))"

# Architecture + quantization support
docker run --rm --gpus all -e OPENSSL_FORCE_FIPS_MODE=0 \
  --entrypoint python3 "$VLLM_TAG" -c "
from vllm.model_executor.models.registry import ModelRegistry as R
from vllm.model_executor.layers.quantization import QUANTIZATION_METHODS
print('NemotronH  :', 'NemotronHForCausalLM' in R.get_supported_archs())
print('mixed quant:', 'modelopt_mixed' in QUANTIZATION_METHODS)"
```

> **All four confirmed on `mage`, 21 Aug 2026** against
> `cortex/vllm-fips:v0.27.1`: `qwen3_xml` and `qwen3_coder` present,
> `nemotron_v3` present, `NemotronH : True`, `mixed quant: True` — and no FIPS
> errors, which is itself proof the derived image is the one running.

All four must come back positive. Two gotchas that otherwise waste an afternoon:

- **`--gpus all` is required even for `--help`.** Recent vLLM builds its argument
  parser from a config object that infers device type at import. With no visible
  GPU you get `RuntimeError: Failed to infer device type` instead of help text,
  which looks like a broken image and isn't.
- **Do not use `from vllm.entrypoints.openai.tool_parsers import ToolParserManager`.**
  That module moved and the registry is lazily populated, so a naive import
  returns an empty list and reads like the parsers are missing.

---

## 6. Standalone test — do this before touching Cortex

Isolates "can this model run on L40S" from "is Cortex configured right." If it
fails here, Cortex was never the problem.

```bash
docker run --rm --name nemotron-test \
  --gpus all --ipc=host --shm-size=16g \
  -v "$MODELS_DIR":/models:ro \
  -e OPENSSL_FORCE_FIPS_MODE=0 \
  -e HF_HUB_OFFLINE=1 \
  -e VLLM_LOGGING_LEVEL=INFO \
  -p 8000:8000 \
  "$VLLM_TAG" \
  --model /models/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4 \
  --served-model-name nemotron \
  --trust-remote-code \
  --tensor-parallel-size 4 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --mamba-ssm-cache-dtype float16 \
  --enforce-eager \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_xml \
  --reasoning-parser nemotron_v3 \
  --prefix-caching-hash-algo sha256 \
  --host 0.0.0.0 --port 8000
```

Deliberately conservative: 32K context (not the model's 262K), eager mode, MTP
off. Get it *loading* first, then tune.

> **Measured on `mage`, 21 Aug 2026 — it loads and serves.**
> Weights **18.79 GiB per GPU**, 23.07 GiB total consumed, 1.62 GiB peak
> activation, **15.27 GiB KV cache** = 5,912,283 tokens, **180× concurrency** at
> 32K. Weight load 54.7 s, engine init 63.9 s, server up in **~3 minutes** — far
> faster than the 10–20 minutes estimated, because the Marlin path expanded the
> weights far less than feared (the ~1.5× figure in §12 was pessimistic).
>
> Kernel selection on sm89 came out exactly as hoped:
> `CutlassFP8ScaledMMLinearKernel` for the FP8 dense layers (native Ada FP8
> tensor cores), `MarlinNvFp4LinearKernel` for NVFP4 GEMM, and the **`MARLIN`
> NvFp4 MoE backend** — the MoE fallback exists and was selected.

### Two flags removed after the first run

**`--no-enable-chunked-prefill` — drop it.** vLLM 0.27 answers this directly:

```
WARNING This model does not officially support disabling chunked prefill.
        Disabling this manually may cause the engine to crash or produce
        incorrect outputs.
```

Earlier guidance here (and one NVIDIA note about SSM chunk boundaries) said to
disable it. Modern vLLM handles Mamba2 chunked prefill correctly, the model card
itself passes `--enable-chunked-prefill`, and the engine explicitly warns against
overriding. Leave it at the default.

**`--kv-cache-dtype fp8` — drop it too, at least initially.** The checkpoint
carries no calibrated scales, so vLLM falls back to 1.0 and says so:

```
WARNING Checkpoint does not provide a q scaling factor. Setting it to k_scale.
WARNING Using KV cache scaling factor 1.0 for fp8_e4m3.
WARNING Using uncalibrated q_scale 1.0 and/or prob_scale 1.0 with fp8 attention.
        This may cause accuracy issues.
```

FP8 KV cache exists to save memory, and **you do not need the memory**: 15.27 GiB
of KV cache already buys 180× concurrency at 32K. Trading accuracy for headroom
you are not using is a bad deal — especially when output quality on the Marlin
path is the exact thing under test. Add it back later if you raise context far
enough to need it.

Expect the server up in roughly three minutes.

Note this publishes host port **8000**, which does not collide with Cortex's
8084 gateway or 3001 UI — you can run this while Cortex is up.

### Four log lines to watch for

| Line | Meaning |
|---|---|
| `Your GPU does not have native support for FP4 computation… Marlin kernel` | **Expected and good** — the weight-only fallback engaged instead of erroring out |
| `NemotronHForCausalLM` resolved, no "not supported" | Architecture recognized |
| KV cache block count after profiling | A small number means memory is tighter than estimated — drop `--max-model-len` to 16384 |
| `CUDA out of memory` during profiling | Step `--gpu-memory-utilization` down: 0.90 → 0.85 → 0.80 |

From a second terminal:

```bash
watch -n2 nvidia-smi --query-gpu=index,memory.used,utilization.gpu --format=csv
```

### Verify coherence *before* tools

The Marlin NVFP4 path's characteristic failure is fluent gibberish, so read the
actual prose before trusting anything downstream.

```bash
curl -s localhost:8000/v1/chat/completions -H 'Content-Type: application/json' -d '{
  "model":"nemotron",
  "messages":[{"role":"user","content":"Explain in three sentences why a mixture-of-experts model activates only a subset of its parameters."}],
  "temperature":1.0, "top_p":0.95, "max_tokens":400
}' | python3 -m json.tool
```

Only once that reads as sensible English, test tool calling:

```bash
curl -s localhost:8000/v1/chat/completions -H 'Content-Type: application/json' -d '{
  "model":"nemotron",
  "messages":[{"role":"user","content":"What is the weather in Dayton, Ohio?"}],
  "tools":[{"type":"function","function":{
    "name":"get_weather",
    "description":"Get current weather for a city",
    "parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}}],
  "tool_choice":"auto", "temperature":1.0, "top_p":0.95
}' | python3 -m json.tool
```

Success is a populated `tool_calls` array. Raw `<tool_call>` XML sitting in
`content` means the parser name is wrong — try `qwen3_coder`.

> **Both passed on `mage`, 21 Aug 2026.** This is the result the whole exercise
> was built to obtain: **NVFP4 experts executed through Marlin on sm89 produce
> correct output.** No gibberish, no degradation.
>
> *Prose test* — exactly three sentences as instructed, technically accurate
> (router network, top-k selection, sparse computation path, capacity-versus-
> compute trade-off), clean typography. 159 completion tokens.
>
> *Reasoning parser* — `nemotron_v3` populated a separate `reasoning` field
> rather than leaking `<think>` content into `content`. Working.
>
> *Tool test* — `finish_reason: "tool_calls"`, one call to `get_weather` with
> valid JSON arguments `{"city": "Dayton, Ohio"}` and `content: null`. The
> `qwen3_xml` parser is working, which is precisely the thing vLLM 0.8.2 could
> not do.
>
> Note that the tool response also carried a populated `reasoning` field: the
> model thinks before every answer, and that thinking spends output budget.
> This is the concrete justification for the generous `max_tokens` in §9.

### Throughput — the last open question

Everything above is correctness. This is the one remaining input to the go/no-go
in [§12](#12-fallback-plan), because Marlin trades speed for compatibility:

```bash
cat > /tmp/bench.py <<'PY'
import json, time, urllib.request

payload = {
    "model": "nemotron",
    "messages": [{"role": "user",
                  "content": "Explain how PagedAttention manages KV cache memory."}],
    "temperature": 1.0, "top_p": 0.95, "max_tokens": 500,
}
req = urllib.request.Request(
    "http://localhost:8000/v1/chat/completions",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"},
)
t0 = time.time()
body = json.load(urllib.request.urlopen(req))
dt = time.time() - t0

if "usage" not in body:
    print("Server returned an error instead of a completion:")
    print(json.dumps(body, indent=2)[:800])
    raise SystemExit(1)

n = body["usage"]["completion_tokens"]
print(f"{n} completion tokens in {dt:.1f}s  =  {n/dt:.1f} tok/s")
print("finish_reason:", body["choices"][0]["finish_reason"])
PY
python3 /tmp/bench.py
```

> **Why a script rather than a `curl` one-liner.** A long JSON payload on one
> shell line wraps in the terminal, and the wrap inserts a literal newline
> *inside* a JSON string — which is invalid JSON. The server then returns an
> error object with no `usage` key, and you get a confusing `KeyError: 'usage'`
> instead of a clear message. Every line in the heredoc above is short, so there
> is nothing to wrap, and it prints the server's actual error if one comes back.

Rough read for a 12B-active MoE on 4 × L40S with no NVLink:

| tok/s (single stream) | Verdict |
|---|---|
| below ~5 | Marlin is costing too much — evaluate the FP8 checkpoint (§12) |
| ~5–15 | Workable for batch and agent use; slow for interactive chat |
| above ~15 | Good result for this hardware — proceed to Cortex |

> **Measured on `mage`, 21 Aug 2026: 13.1 tok/s single stream** — 500 tokens in
> 38.2 s, `finish_reason: length` (generating throughout, so a clean number).
> Top of the workable band. This was still with `--enforce-eager`,
> `--kv-cache-dtype fp8` and chunked prefill disabled, so treat it as a floor.

### Two measurements that matter more than single-stream

**1. What Cortex will actually give you.** The standalone run above left NCCL
peer-to-peer at its default. **Cortex forces `NCCL_P2P_DISABLE=1`** and protects
it from override (§8), so every all-reduce stages through host memory. Measure
the penalty before you configure Cortex, or you will misread a slower number as
"Cortex is slow":

```bash
# relaunch the §6 container adding:  -e NCCL_P2P_DISABLE=1
# then re-run /tmp/bench.py and compare against 13.1 tok/s
```

If the gap is large, that is an argument for relaxing `PROTECTED_ENV_VARS` in
`backend/src/utils/custom_args_validator.py` for this deployment — a small,
well-scoped Cortex change.

**2. Aggregate throughput under concurrency.** Single-stream is the wrong metric
for a multi-user gateway, and with 180× concurrency headroom this is where the
hardware earns its keep. MoE models batch well:

```bash
cat > /tmp/bench2.py <<'PY'
import json, time, urllib.request, concurrent.futures as cf

URL = "http://localhost:8000/v1/chat/completions"
PROMPT = "Explain how PagedAttention manages KV cache memory."

def one(i):
    payload = {
        "model": "nemotron",
        "messages": [{"role": "user", "content": PROMPT}],
        "temperature": 1.0, "top_p": 0.95, "max_tokens": 300,
    }
    req = urllib.request.Request(
        URL, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    body = json.load(urllib.request.urlopen(req))
    return body["usage"]["completion_tokens"]

for c in (1, 4, 8):
    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=c) as ex:
        toks = sum(ex.map(one, range(c)))
    dt = time.time() - t0
    rate = toks / dt
    print(f"conc {c:2d}: {toks:5d} tok {dt:5.1f}s {rate:6.1f} tok/s")
PY
python3 /tmp/bench2.py
```

Aggregate should climb substantially from 1 to 8. If it scales well, this is a
perfectly good batch and agent-workload server even though single-stream is
middling.

### Streaming — measuring the felt experience

Single-stream tok/s is not what a user perceives. For a reasoning model the
number that matters is **time to first *visible* token**, because the model
thinks first and the user stares at nothing during it.

```bash
cat > /tmp/stream.py <<'PY'
import json, time, urllib.request, sys

payload = {
    "model": "nemotron",
    "messages": [{"role": "user",
                  "content": "Explain how a GPU does matrix multiply."}],
    "temperature": 1.0, "top_p": 0.95,
    "max_tokens": 400, "stream": True,
}
req = urllib.request.Request(
    "http://localhost:8000/v1/chat/completions",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"},
)

t0 = time.time()
ttft = None
n = 0
think = 0
for raw in urllib.request.urlopen(req):
    line = raw.decode("utf-8").strip()
    if not line.startswith("data: "):
        continue
    data = line[6:]
    if data == "[DONE]":
        break
    d = json.loads(data)
    delta = d["choices"][0].get("delta") or {}
    piece = delta.get("content")
    if not piece:
        piece = delta.get("reasoning_content") or delta.get("reasoning")
        if piece:
            think += 1
            piece = None
    if piece:
        if ttft is None:
            ttft = time.time() - t0
        n += 1
        sys.stdout.write(piece)
        sys.stdout.flush()

dt = time.time() - t0
ttft = ttft if ttft is not None else dt
print("\n")
print(f"TTFT (first visible token): {ttft:.2f}s")
print(f"reasoning chunks before that: {think}")
print(f"visible: {n} chunks in {dt:.1f}s = {n/dt:.1f}/s")
PY
python3 /tmp/stream.py
```

Watch `reasoning chunks before that`. The model thinks before every answer, so
the user sees nothing during that stretch. Any client in front of this must
stream and show a thinking indicator rather than a blank box.

#### If you want raw SSE frames from curl

Write the payload to a file first, then point curl at it — two separate blocks,
neither ending on a heredoc terminator:

```bash
cat > /tmp/req.json <<'JSON'
{"model":"nemotron",
 "messages":[{"role":"user","content":"Write a haiku about GPUs."}],
 "max_tokens":200, "stream":true}
JSON
ls -l /tmp/req.json
```

```bash
curl -N -s localhost:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d @/tmp/req.json
```

> **Why a pasted heredoc appears to freeze the terminal.** If a block *ends*
> with its heredoc terminator (`JSON`, `PY`, `EOF`) and your terminal does not
> send a newline after the last pasted line, bash is still waiting for that
> terminator on a line of its own. Nothing failed and no error prints — the
> shell is simply mid-command, which reads as a hang. Ctrl-C is the right
> instinct; the command just never ran.
>
> Three ways to avoid it: **press Enter once after pasting**; keep an ordinary
> command after the terminator (the `ls -l` above exists purely for that); or
> use the Python clients, which is why every benchmark here is a `.py` file
> followed by a `python3` line rather than a long inline `curl`.
>
> The same trap applies to an *indented* terminator — `<<JSON` only closes on
> `JSON` at column zero. Use `<<-JSON` if you need to indent it.

### Is more available?

> **Measured on `mage`, 21 Aug 2026: 13.1 -> 85.6 tok/s, a 6.5x gain.**
> Achieved by dropping `--enforce-eager` and adding `--async-scheduling` plus
> `--speculative-config '{"method":"mtp","num_speculative_tokens":2}'`.
> Eager mode was the dominant cost: an 88-layer MoE+Mamba hybrid issues
> thousands of small kernel launches per token, and at batch size 1 the GPU
> idles between them. CUDA graphs collapse that; MTP roughly doubles what is
> left. 85 tok/s is comfortably interactive.

| Lever | Expected gain |
|---|---|
| Drop `--enforce-eager` (enables CUDA graphs) | **Largest single win here** — confirmed |
| Leave chunked prefill on (§6 correction) | Better prefill behaviour on long prompts |
| FP8 checkpoint instead of NVFP4 | The big unknown — L40S runs FP8 on **native** tensor cores with no Marlin dequant. ~128 GiB still fits in 192 GiB. Worth one measurement before committing |

13 tok/s single-stream is usable for agent and batch work and sluggish for
interactive chat. If interactive latency is a requirement, measure FP8 before
accepting NVFP4.

```bash
docker stop nemotron-test
```

---

## 7. Cortex model configuration

Admin UI at `http://$HOST_IP:3001` → **Models** → create or edit the Nemotron entry.

### The validated fast configuration — reference

This is the exact standalone command that produced **85.6 tok/s** on `mage`.
Everything in the tables below is a field-by-field translation of it. Keep it
handy: if the Cortex-managed container ever behaves differently, run this and
compare.

```bash
docker rm -f nemotron-test 2>/dev/null
docker run --rm --name nemotron-test \
  --gpus all --ipc=host --shm-size=16g \
  -v /var/cortex/models:/models:ro \
  -e OPENSSL_FORCE_FIPS_MODE=0 \
  -e HF_HUB_OFFLINE=1 \
  -p 8000:8000 \
  cortex/vllm-fips:v0.27.1 \
  --model /models/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4 \
  --served-model-name nemotron \
  --trust-remote-code \
  --tensor-parallel-size 4 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --mamba-ssm-cache-dtype float16 \
  --async-scheduling \
  --speculative-config '{"method":"mtp","num_speculative_tokens":2}' \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_xml \
  --reasoning-parser nemotron_v3 \
  --prefix-caching-hash-algo sha256 \
  --host 0.0.0.0 --port 8000
```

Note what is **absent**: no `--enforce-eager` (CUDA graphs on — the single
largest win), no `--kv-cache-dtype fp8`, no `--no-enable-chunked-prefill`.

### Option A — interactive seeding (recommended)

Run from the Cortex repo root. It asks the two questions that actually vary
between deployments — how much GPU memory to reserve and how large a context
window to allow — and fills in everything else from the validated fast
configuration.

```bash
cd ~/repos/Cortex          # or /repos/repos/Cortex on the classified server
python3 scripts/seed-nemotron.py
```

Before prompting it checks the gateway is up, counts GPUs and reports their
VRAM, confirms the engine image is present, and looks for the model folder —
warning rather than failing on anything it cannot see, since Cortex may mount
paths this shell cannot.

Then it asks:

```
  How much of each GPU's memory may vLLM reserve?
  90 is the validated value. Range 50-98.
  GPU memory utilisation (%) [90]:

  How large a context window per request?
  The checkpoint supports up to 262144.
  32768 is the validated value.
  Context window (tokens) [32768]:

  Estimated KV cache : 15.3 GiB per GPU
  Estimated capacity : ~90 concurrent requests at 32768 tokens each
```

Press Enter twice to take the validated defaults. The capacity figure is
extrapolated from the measured run — its predicted 15.25 GiB/GPU against vLLM's
reported 15.27 GiB — and is shown only on hardware matching the calibration
(4 GPUs, ≥40 GiB each, TP=4).

It then prints the full configuration for review and asks for confirmation
before touching anything. Any existing `nemotron` entry is stopped and replaced,
so the script is safe to re-run when you want to change the numbers.

**Non-interactive**, for automation or a scripted rebuild:

```bash
python3 scripts/seed-nemotron.py --gpu-util 90 --context 32768 --yes
```

Out-of-range values are rejected with a clear message rather than being clamped
silently. Environment overrides — `CORTEX_URL`, `DERIVED_IMAGE`, `MODEL_NAME`,
`SERVED_NAME`, `MODELS_DIR`, `TP_SIZE` — cover the case where paths or the image
tag differ from the defaults.

#### Choosing the two numbers

| | Effect of raising it |
|---|---|
| **GPU utilisation** | More KV cache, so more concurrent requests. Too high and vLLM fails during startup memory profiling. 90 measured clean; drop to 85 or 80 if you see OOM. |
| **Context window** | Longer prompts and conversations, but capacity falls proportionally — every doubling roughly halves how many requests fit. |

At the validated 90% / 32768 you get roughly 90 concurrent requests, which is
far more than the compute will sustain — so context is the cheaper of the two
to spend. Raising it to 131072 still leaves ~22 concurrent, well beyond what
four L40S will serve at once.

### Option B — scripted, no prompts

This is what the import script calls on the air-gapped side, and it is the right
choice when you want no prompts at all. It hard-codes the validated 90% / 32768
values; use Option A if you want to choose them.

Faster and less error-prone than typing 25 fields into the UI, and it builds the
two JSON-string fields with `json.dumps` rather than by hand — hand-escaping
those in the form is the most likely reason a setting silently fails to stick.

Paste as one block. The `python3` line after the `PY` terminator is deliberate:
without a command there, a pasted heredoc leaves the shell waiting (see §6).

```bash
cat > /tmp/setup.py <<'PY'
import json, urllib.request as U, urllib.error, http.cookiejar as C

B = "http://localhost:8084"
args = [
  {"flag": "--enable-auto-tool-choice", "type": "flag", "value": True},
  {"flag": "--tool-call-parser", "type": "string", "value": "qwen3_xml"},
  {"flag": "--reasoning-parser", "type": "string", "value": "nemotron_v3"},
  {"flag": "--mamba-ssm-cache-dtype", "type": "string", "value": "float16"},
  {"flag": "--async-scheduling", "type": "flag", "value": True},
  {"flag": "--speculative-config", "type": "string",
   "value": '{"method":"mtp","num_speculative_tokens":2}'},
  {"flag": "--prefix-caching-hash-algo", "type": "string",
   "value": "sha256"},
]
env = [{"key": "OPENSSL_FORCE_FIPS_MODE", "value": "0"}]
samp = {"temperature": 1.0, "top_p": 0.95, "top_k": -1,
        "repetition_penalty": 1.0, "frequency_penalty": 0.0,
        "presence_penalty": 0.0}
m = {"mode": "offline",
     "local_path": "NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4",
     "name": "Nemotron 3 Super 120B NVFP4",
     "served_model_name": "nemotron", "task": "generate",
     "engine_type": "vllm",
     "engine_image": "cortex/vllm-fips:v0.27.1",
     "engine_version": "v0.27.1", "dtype": "auto", "tp_size": 4,
     "gpu_memory_utilization": 0.9, "max_model_len": 32768,
     "max_num_seqs": 32, "block_size": 16, "trust_remote_code": True,
     "enforce_eager": False, "enable_chunked_prefill": True,
     "startup_timeout_sec": 2400,
     "engine_startup_args_json": json.dumps(args),
     "engine_startup_env_json": json.dumps(env),
     "custom_request_json": json.dumps(samp)}
m.update(samp)

jar = C.CookieJar()
op = U.build_opener(U.HTTPCookieProcessor(jar))

def call(meth, path, body=None):
    d = json.dumps(body).encode() if body is not None else None
    r = U.Request(B + path, data=d, method=meth,
                  headers={"Content-Type": "application/json"})
    try:
        raw = op.open(r, timeout=30).read().decode()
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, meth, path, e.read().decode()[:400])
        raise SystemExit(1)
    return json.loads(raw) if raw else None

call("POST", "/auth/login", {"username": "admin", "password": "admin"})
print("logged in")
for old in call("GET", "/admin/models") or []:
    if old.get("served_model_name") == "nemotron":
        i = old["id"]
        print("removing existing id", i, old.get("state"))
        if old.get("state") not in ("stopped", None):
            try:
                call("POST", "/admin/models/%d/stop" % i)
            except SystemExit:
                pass
        call("DELETE", "/admin/models/%d" % i)
mid = call("POST", "/admin/models", m)["id"]
print("created model id", mid, "- refresh the Models page")
PY
python3 /tmp/setup.py
```

Refresh the Models page and the entry is there. **Start it from the UI** so you
can watch the logs — starting via the API blocks the request while Cortex polls
health, which can run for minutes.

#### How this maps to Cortex's API

| Step | Endpoint | Notes |
|---|---|---|
| Login | `POST /auth/login` | Sets a `cortex_session` cookie whose value is just the username; `require_admin` reads it and checks the user's role |
| List | `GET /admin/models` | `models_router` is mounted with prefix `/admin` in `main.py:131` |
| Delete | `DELETE /admin/models/{id}` | Existing entry is stopped first if running |
| Create | `POST /admin/models` | Returns `{"id": N}` |

The two fields that matter most are **`engine_startup_args_json`** and
**`engine_startup_env_json`**. Both are JSON *strings* containing arrays —
`[{flag, type, value}, ...]` and `[{key, value}, ...]` — which is exactly what
`parse_custom_args_to_cli` and `parse_custom_env_to_dict` expect
(`backend/src/utils/custom_args_validator.py`). Building them with `json.dumps`
removes an entire class of quoting mistakes.

To change the config later, edit the values at the top of `/tmp/setup.py` and
re-run it: the script removes the old entry and recreates it.

### Option C — enter the fields by hand

### Engine & image

| Field | Value | Notes |
|---|---|---|
| Engine Type | `vllm` | |
| **Engine Image** | `cortex/vllm-fips:v0.27.1` | Advanced → Engine Image. **The critical field.** Your derived image from §4b — *not* the upstream tag, which cannot start on this FIPS host |
| Engine Version | `v0.27.1` | Documentation only |
| Entrypoint Override | *(blank)* | Cortex uses `python3 -m vllm.entrypoints.openai.api_server`, which still exists in 0.27.x |

### Model source

| Field | Value |
|---|---|
| Mode | **Offline** |
| Local Path | `NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4` |
| Served Model Name | `nemotron` |
| Task | `generate` |

Local Path is **relative to `/var/cortex/models`** — folder name only, no leading
slash. Offline mode mounts that directory read-only at `/models` and sets
`HF_HUB_OFFLINE=1` automatically.

### Runtime settings

| Field | Value | Why |
|---|---|---|
| TP Size | `4` | All four L40S. `moe_intermediate_size` 2688 ÷ 4 = 672, divides cleanly |
| Pipeline Parallel Size | `1` | Single node |
| dtype | `auto` | Let the checkpoint decide; do not force bf16 |
| Max Model Len | `32768` | Measured 180× concurrency headroom here — raise later if you need long context |
| GPU Memory Utilization | `0.90` | Drop to 0.85 / 0.80 on OOM |
| KV Cache dtype | `auto` | **Not `fp8`** — the checkpoint has no calibrated KV scales, and you are not short of KV memory. See §6 |
| Block Size | `16` | Default |
| Max Num Seqs | `32` | Conservative starting point; raise once you have concurrency numbers |
| Max Num Batched Tokens | `2048` | Default |
| **Enforce Eager** | **Off** | **The 6.5× flag.** Leaving this on costs you ~85% of your throughput on this model. Only turn it on to debug a startup failure |
| Trust Remote Code | **On** | Required |
| Quantization | *(blank)* | Read from `config.json`; setting it manually fights the checkpoint |
| Enable Prefix Caching | Off initially | Add later once stable |
| Enable Chunked Prefill | **On** (default) | vLLM warns against disabling it for this model; 0.27 handles Mamba2 chunked prefill correctly |
| **Startup Timeout (sec)** | `2400` | Raised from 1800: CUDA graph capture and MTP init add several minutes on top of the ~3 min weight load |
| Selected GPUs | all four, or blank | Blank = all available |

---

## 8. Custom arguments and environment variables

### Custom Args

Model form → **Custom Args** tab. Cortex appends these **after** its own flags,
so on any conflict your value wins.

| Flag | Type | Value | Purpose |
|---|---|---|---|
| `--enable-auto-tool-choice` | flag | `true` | Turns on tool-call parsing |
| `--tool-call-parser` | string | `qwen3_xml` | **Underscores.** Nemotron 3 emits Qwen3-format `<tool_call>` XML |
| `--reasoning-parser` | string | `nemotron_v3` | Separates `<think>` blocks from content |
| `--mamba-ssm-cache-dtype` | string | `float16` | Numerical stability for the Mamba2 SSM state |
| `--async-scheduling` | flag | `true` | Overlaps CPU scheduling with GPU execution |
| `--speculative-config` | string | `{"method":"mtp","num_speculative_tokens":2}` | **Multi-Token Prediction.** The model ships an MTP head trained to accelerate its own decoding — roughly doubles throughput |
| `--prefix-caching-hash-algo` | string | `sha256` | FIPS-approved; already the 0.27 default, set explicitly for the audit trail |

> **The JSON value passes through safely.** Cortex builds the container command
> as an argument *list* and hands it to the Docker SDK — there is no shell in
> between — so `{"method":"mtp","num_speculative_tokens":2}` reaches vLLM intact
> with no escaping or extra quoting. Paste it into the value box exactly as
> shown, type `string`.
>
> If the model fails to start with MTP enabled, remove this one row first. You
> keep CUDA graphs and async scheduling, which is still a large gain over the
> conservative configuration.

Two flags that earlier drafts listed here have been **removed** — see §6.
`--no-enable-chunked-prefill` is warned against by the engine itself for this
model, and `--kv-cache-dtype fp8` trades accuracy for memory you are not short
of. Leave both at their defaults.

**Do not add `--mm-hasher-algorithm`.** It does not exist in all versions (absent
in 0.18.0), and an unrecognized flag reproduces the same startup crash you are
trying to leave behind. Moot here anyway — this is a text-only model, so the
multimodal hasher never runs.

### Reasoning-parser fallback — you already have the plugin

The model directory ships NVIDIA's own parser plugin:

```
/var/cortex/models/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4/super_v3_reasoning_parser.py
```

Because Cortex mounts the models directory at `/models`, that file is **already
visible inside the container** — nothing to copy or bind-mount. If the built-in
`nemotron_v3` parser is missing from your image (it exists in 0.18+, but check
if you pinned an older tag) or misbehaves, swap those two custom args for:

| Flag | Type | Value |
|---|---|---|
| `--reasoning-parser-plugin` | string | `/models/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4/super_v3_reasoning_parser.py` |
| `--reasoning-parser` | string | `super_v3` |

This is the exact combination NVIDIA's own recipe uses. Prefer built-in
`nemotron_v3` when available — it needs no path and survives a model-directory
move — but the plugin is a real, supported escape hatch.

### Environment Variables

Model form → **Custom Args** → **Env** tab.

| Key | Value | Purpose |
|---|---|---|
| **`OPENSSL_FORCE_FIPS_MODE`** | **`0`** | **Required on this host.** Without it the container cannot create an SSL context and vLLM dies on import — see §4b |
| `VLLM_LOGGING_LEVEL` | `INFO` | Use `DEBUG` while troubleshooting |

Cortex already sets `NCCL_P2P_DISABLE=1`, `NCCL_IB_DISABLE=1`,
`NCCL_SHM_DISABLE=0`, `NCCL_TIMEOUT=1800`, `PYTORCH_CUDA_ALLOC_CONF`,
`HF_HUB_OFFLINE=1`, and `CUDA_VISIBLE_DEVICES`. These are in `PROTECTED_ENV_VARS`
(`backend/src/utils/custom_args_validator.py`) and the API rejects overrides.

> **Performance note, not a blocker.** L40S cards have no NVLink, so TP=4 runs
> over PCIe — and with `NCCL_P2P_DISABLE=1` every all-reduce stages through host
> memory. This will be a meaningful share of your latency. Testing the
> alternative requires a direct `docker run` (as in §6, adding
> `-e NCCL_P2P_DISABLE=0`) since the UI will not let you set it. Worth measuring
> once the model is known-good, not before.

---

## 9. Request defaults

**This matters more than it looks.** Applied per-request by the gateway, merged
only into requests that do not already specify the key
(`merge_request_defaults`, `backend/src/routes/openai.py`). Changes take effect
immediately — no container restart.

### Cortex's stock defaults are wrong for this model

| Parameter | Cortex default | **Set to** | Why |
|---|---|---|---|
| Temperature | 0.8 | **1.0** | NVIDIA specifies `temperature=1.0` across all tasks |
| Top-P | 0.9 | **0.95** | NVIDIA specifies `top_p=0.95` |
| Top-K | 40 | **-1** (disabled) | NVIDIA does not specify top-k; truncating the distribution degrades reasoning |
| Repetition Penalty | 1.2 | **1.0** (off) | Penalizes the repeated structural tokens forming `<think>` and `<tool_call>` blocks |
| Frequency Penalty | 0.5 | **0.0** (off) | Same — corrupts long chain-of-thought |
| Presence Penalty | 0.5 | **0.0** (off) | Same |

Reasoning models re-use scaffolding tokens by design. Penalty settings tuned for
chat models attack exactly that structure, and the failure is subtle: still-fluent
text, but truncated thinking and malformed tool calls. It reads like a broken model.

### How to set them

Top-K is the awkward one — the UI enforces `min=1`, so you cannot type `-1`. Use
**Advanced → Custom Request Extensions**, which is merged *last* and overrides
the individual fields (`request_defaults.update(custom_fields)`,
`backend/src/routes/models.py:262`). Paste this whole block:

```json
{
  "temperature": 1.0,
  "top_p": 0.95,
  "top_k": -1,
  "repetition_penalty": 1.0,
  "frequency_penalty": 0.0,
  "presence_penalty": 0.0
}
```

Setting all six here is the reliable route — it bypasses the UI range limits and
leaves one authoritative place to read the values back.

### Guidance for client applications

- **`max_tokens` must be generous** — 4096–8192. Reasoning consumes output budget
  before a single visible token appears; too low and responses truncate
  mid-thought, which looks like the model refusing to answer.
- **Do not send penalties.** Client values override these defaults, so an app
  hard-coding `frequency_penalty: 0.5` re-introduces the problem above.
- **Streaming recommended** — reasoning models have long time-to-first-visible-token.
- **Tool schemas**: keep parameter descriptions concrete. `qwen3_xml` handles
  nesting, but flatter schemas are more reliable.

---

## 10. Start and validate

```bash
cd ~/repos/Cortex
make status
make logs SERVICE=gateway
```

Start the model from the UI, then:

```bash
# Follow the model container
docker ps --filter 'name=vllm-model-' --format '{{.Names}}'
docker logs -f $(docker ps --filter 'name=vllm-model-' --format '{{.Names}}' | head -1)

# Gateway health
curl -s http://$HOST_IP:8084/health | python3 -m json.tool
```

```bash
# Model registered and routable
export CORTEX_API_KEY=<your-key>          # UI -> API Keys -> Create Key
curl -s -H "Authorization: Bearer $CORTEX_API_KEY" \
  http://$HOST_IP:8084/v1/models | python3 -m json.tool

# End-to-end through the gateway
curl -s http://$HOST_IP:8084/v1/chat/completions \
  -H "Authorization: Bearer $CORTEX_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"model":"nemotron","messages":[{"role":"user","content":"Name three properties of a Mamba state-space layer."}],"max_tokens":600}' \
  | python3 -m json.tool
```

That gateway call deliberately sends **no** sampling parameters — you are
testing that your Request Defaults from §9 are actually being applied.

Then use the **Chat Playground** (`http://$HOST_IP:3001` → Chat) for interactive
checks with live tokens/sec and TTFT.

### Acceptance checklist

- [x] Container reaches healthy — **~3 min**, well inside the window
- [x] Marlin FP4 fallback warning present in logs (expected)
- [x] Prose response is coherent — **confirmed, not gibberish**
- [x] `<think>` content separated into the reasoning field — **confirmed**
- [x] Tool call returns a populated `tool_calls` array — **confirmed**
- [x] Throughput recorded — **13.1 tok/s single stream** (floor; eager mode on)
- [x] Per-GPU memory stable — 23.07 GiB of 44.39 GiB, large headroom

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `invalid tool call parser` | Old image, or hyphens | Confirm Engine Image took effect; use underscores |
| `unrecognized arguments: --mm-hasher-algorithm` | Flag absent in this version | Remove it (§8) |
| `nvidia-container-cli: … cuda>=12.9` | Driver too old | Update driver, or use `v0.24.0-ubuntu2404` |
| Start appears to hang, no container | Cortex pulling 10 GB inline | Pre-pull (§4), retry |
| `OfflineImageUnavailableError` on a networked box | 3-second registry probe failed behind a proxy | Pre-pull (§4) |
| Marked unhealthy ~10 min in, logs still loading | 600 s startup timeout | Set Startup Timeout to `1800` |
| `CUDA out of memory` during profiling | Marlin footprint | `--gpu-memory-utilization` 0.90→0.85→0.80, then Max Model Len 32768→16384 |
| Loads, output is fluent nonsense | Marlin NVFP4 correctness bug | Try `--linear-backend marlin` explicitly; if unfixed, go FP8 (§12) |
| Coherent but very slow | No native FP4 + no NVLink | Turn off Enforce Eager (enables CUDA graphs), re-test chunked prefill; else FP8 |
| Raw `<tool_call>` XML in `content` | Parser mismatch | Swap `qwen3_xml` → `qwen3_coder` |
| Repetitive / truncated reasoning | Penalties active | Recheck §9 — the most common cause |
| `Local Path` not found | Leading slash or full path entered | Folder name only, relative to `/var/cortex/models` |
| `ssl.SSLError: [CRYPTO] unknown error (_ssl.c:3076)` | Host FIPS flag + no FIPS provider in the image | Add `OPENSSL_FORCE_FIPS_MODE=0` — see §4b |
| Container exits instantly, traceback ends in `aiohttp/connector.py` | Same as above | Same as above |
| Thousands of `Unexpected gate/up projection names: up_proj` warnings | Nemotron 3's LatentMoE experts are **non-gated** (no `gate_proj`), so vLLM skips its fused gate/up optimization | Benign and expected. Costs a small amount of throughput; nothing to fix |
| `Custom allreduce is disabled... more than two PCIe-only GPUs` | No NVLink on L40S | Expected — falls back to PYNCCL. See the NCCL note in §8 |
| `SymmMemCommunicator: Device capability 8.9 not supported` | Ada has no symmetric memory support | Expected, harmless |
| `No available shared memory broadcast block found in 60 seconds` | Mamba2 Triton kernel warmup holding the worker | Expected during startup; resolves on its own |
| `crypto/fips/fips.c:154: FATAL FIPS SELFTEST FAILURE` | Vendored OpenSSL 1.1.1k in the opencv wheel, no HMAC sidecar | Build the derived image in §4b |
| Same error **from a Cortex-started container**, even with `engine_image` set | That library does not exist in the derived image, so the container is **not** running it — `engine_image` did not persist and Cortex fell back to `VLLM_IMAGE` (`vllm/vllm-openai:latest`, which still has opencv) | Verify with the command below, then use the §7 setup script |
| `cannot be mounted because it is inside /proc` | Tried to bind-mount over `fips_enabled` | Not possible on Docker 28.x — use the derived image |
| `invalid reasoning parser: nemotron_v3` | Pinned an image older than 0.18 | Use the bundled plugin fallback in §8 |
| `bash: /: Is a directory` while pasting | A long command wrapped across two lines in your terminal | Paste one line at a time, or widen the window |
| Terminal appears frozen after pasting a block, no error | Block ended on a heredoc terminator and your terminal sent no trailing newline | Press Enter once. See the note under §6 Streaming |
| `KeyError: 'usage'` from a benchmark | A wrapped line put a newline inside a JSON string, so the server rejected the request | Use the `.py` clients, not inline `curl` |
| Shard is a few hundred bytes | Git-LFS pointer never resolved | `git lfs pull` in the model dir, or re-download that shard |

Confirm which image a Cortex-managed container actually used — the fastest way
to tell a config problem from an engine problem:

```bash
docker inspect $(docker ps -a --filter name=vllm-model- \
  --format '{{.Names}}' | head -1) --format 'IMAGE: {{.Config.Image}}'
```

Anything other than `cortex/vllm-fips:v0.27.1` means the Engine Image field did
not take effect. Check the image exists at all with
`docker images cortex/vllm-fips`.

Useful log filters:

```bash
V=$(docker ps --filter 'name=vllm-model-' --format '{{.Names}}' | head -1)
docker logs "$V" 2>&1 | grep -iE 'marlin|fp4|nemotron|quantiz|error|traceback'
docker logs "$V" 2>&1 | grep -iE 'kv cache|blocks|memory'
```

---

## 12. Fallback plan

The NVFP4 checkpoint is not natively supported on Ada Lovelace. It should work
via Marlin weight-only dequantization — `modelopt_mixed` is documented as
supporting sm89 and above, and L40S is exactly sm89 — but that path is lightly
travelled and has a bug history on other architectures.

**If NVFP4 produces garbage or unacceptable throughput, move to FP8 — not BF16.**

| Variant | Size | 4 × L40S (192 GB) | Verdict |
|---|---|---|---|
| NVFP4 | ~80 GB (~120 GB inflated under Marlin) | ~30 GB/GPU | Try first — smallest, least-tested path |
| **FP8** | ~128 GB | ~32 GB/GPU | **Fallback.** Native L40S FP8 tensor cores, well-exercised path |
| BF16 | ~240 GB | Does not fit | Not an option |

FP8 checkpoint: `nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-FP8`, downloaded into
`/var/cortex/models/`. Same engine image, same parsers, same request defaults —
only the Local Path changes.

---

## 13. FIPS

> **Corrected.** An earlier draft of this document claimed the host's FIPS state
> could not reach the container's OpenSSL. That was wrong, and §4b documents what
> actually happens: the container reads the kernel's `fips_enabled` flag, tries to
> load a FIPS provider it does not have, and fails. **Clear §4b first — nothing in
> this section matters until the engine can start.**

Once `OPENSSL_FORCE_FIPS_MODE=0` is in place, the container's crypto is
explicitly *non*-FIPS, and the remaining questions are about algorithm selection
and what you write in the accreditation package.

Verify the state you are actually running:

```bash
docker run --rm --gpus all -e OPENSSL_FORCE_FIPS_MODE=0 \
  --entrypoint bash "$VLLM_TAG" -c '
  grep -E "^(NAME|VERSION)=" /etc/os-release
  openssl version && openssl list -providers
  python3 -c "import ssl; ssl.create_default_context(); print(\"ssl ok\")"'
```

Expect the `default` provider only, and `ssl ok`.

| Concern | Status |
|---|---|
| Prefix-cache hashing | `sha256` is already the default on 0.27 (0.8.5 used `builtin`). Set explicitly anyway. |
| `xxhash` package | **Not installed** — the non-FIPS prefix-cache options are unreachable, not merely unselected |
| `blake3` package | Installed, but only invoked for multimodal hashing. Never called for a text model. |
| Internal MD5 | No action — vLLM's call sites pass `usedforsecurity=False` and fall back to SHA-256 |
| TLS | `--ssl-ciphers` exists, but Cortex terminates TLS at the gateway and reaches containers over the internal Docker network |
| Data in transit | Single-node TP=4 keeps all NCCL traffic on the PCIe bus, off the wire |

**The one thing flags cannot give you:** FIPS-validated crypto *inside* the
container boundary. If your accreditation requires that, it needs a rebuild on a
FIPS-validated base (UBI9 with the FIPS provider, or Ubuntu Pro FIPS) plus
removing `blake3`. Scope that deliberately rather than discovering it during an
assessment.

---

## 14. Transferring to the air-gapped system

Only after the unclass server is validated end to end.

### 1. Pin the version in the repo

```bash
cd ~/repos/Cortex
sed -i 's|^CORTEX_VLLM_VERSION=.*|CORTEX_VLLM_VERSION="${CORTEX_VLLM_VERSION:-v0.27.1}"|' scripts/versions.env
grep CORTEX_VLLM_VERSION scripts/versions.env
```

Both `prepare-offline-deployment.sh` and `verify-offline-images.sh` source this
file, so they stay in agreement automatically.

> Pinning removes a real air-gap hazard. `latest` means the tarball you cut today
> and the one you cut next quarter are different engines with the same name, and
> nothing in the manifest records which one an offline box is running.

### 1b. Account for the derived FIPS image

`make prepare-offline` **pulls** images by tag — it cannot pull one you built
locally, so the derived image from §4b will not be in the package unless you add
it. Save both in a single archive so Docker shares the common layers instead of
writing ~10 GB twice:

```bash
cd ~/repos/Cortex
docker save -o cortex-offline-images/vllm-fips-v0.27.1.tar \
  vllm/vllm-openai:v0.27.1 cortex/vllm-fips:v0.27.1
ls -lh cortex-offline-images/vllm-fips-v0.27.1.tar
```

`load-offline-deployment.sh` loops over every `*.tar` in that directory, so it
picks this up with no script changes. Including the upstream tag as well keeps
`make verify-offline` happy — it checks for `vllm/vllm-openai:$CORTEX_VLLM_VERSION`
and knows nothing about your derived tag.

On the air-gapped side, confirm both arrived:

```bash
docker images | grep -E 'vllm-openai|vllm-fips'
```

### 2. Build the package

```bash
cd ~/repos/Cortex
make prepare-offline          # interactive yes/no prompt
```

Output lands in `~/repos/Cortex/cortex-offline-images/`. Budget ~10 GB over the
15–20 GB total quoted in `docs/operations/offline-deployment.md` — recent vLLM
images are far larger than the v0.6.3 example there.

```bash
cd ~/repos
tar -czf cortex-offline-package.tar.gz Cortex/cortex-offline-images/
sha256sum cortex-offline-package.tar.gz > cortex-offline-package.sha256
ls -lh cortex-offline-package.tar.gz
# gzip claws back a lot here: the uncompressed image tars are ~30 GB each
```

### 3. Transfer

- `cortex-offline-package.tar.gz` (~10–15 GB) and its `.sha256`
- The Cortex repo including the edited `scripts/versions.env`
- Model weights from `/var/cortex/models/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4/`
  (~80 GB) — **not** included in the image package

### 4. Load and verify on the air-gapped machine

```bash
cd ~/repos
sha256sum -c cortex-offline-package.sha256
tar -xzf cortex-offline-package.tar.gz
cd ~/repos/Cortex
make load-offline
make verify-offline           # must show vllm/vllm-openai:v0.27.1 cached
```

Place the weights:

```bash
sudo rsync -avP /media/transfer/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4/ \
  /var/cortex/models/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4/
```

### 5. Lock down the gateway

```bash
cd ~/repos/Cortex
cat >> backend/.env <<'EOF'
OFFLINE_MODE=true
REQUIRE_IMAGE_PRECACHE=true
VLLM_IMAGE=vllm/vllm-openai:v0.27.1
EOF
make restart
```

`REQUIRE_IMAGE_PRECACHE` is the important one: it makes `_ensure_image()` raise
`OfflineImageUnavailableError` with a clear remediation message instead of
attempting a pull that can never succeed. Without it, a typo'd image tag on an
air-gapped box presents as a hang rather than an error.

### 6. Recreate the model

Re-enter §7–§9, or use **Admin UI → Deployment** to export the validated model
manifest from the unclass instance and import it here. The Deployment flow
carries `engine_image`, custom args, and request defaults together, which removes
the transcription risk.

---

## 15. Scripted transfer to the air-gapped server

§14 describes the manual transfer. For routine use, two scripts in
`~/repos/Cortex/scripts/` do the whole job with verification at both ends.
Both were tested end-to-end against a real derived image before shipping.

| Script | Runs on | Does |
|---|---|---|
| `nemotron-export-to-usb.sh` | unclass (`mage`) | Writes images, weights, scripts and a SHA256 manifest to the drive |
| `nemotron-import-from-usb.sh` | classified | Verifies, loads, installs, and re-runs every check from §3–§7 |
| `nemotron-configure-cortex.py` | classified | Registers the model in Cortex via the admin API |
| `seed-nemotron.py` | either | Interactive seeding — prompts for GPU % and context, then registers the model (§7 Option A) |

The export script copies the other two onto the drive, so only the first
needs to exist on the unclassified server.

### On the unclassified server

```bash
cd ~/repos/Cortex/scripts
./nemotron-export-to-usb.sh /media/afwi/TRANSFER
```

Run with no arguments and it lists mounted removable candidates. Before
writing anything it checks:

- **Filesystem type.** Aborts on FAT32 — the 4 GiB file cap cannot hold 5 GiB
  shards or a 10 GiB image archive. exFAT, NTFS, and ext4 are all accepted;
  for the two that lose UNIX permissions, the import side fixes ownership.
- **Both images present**, weights present, **no Git-LFS pointer stubs** (it
  refuses to export a model with truncated shards).
- **Free space**, computed from the actual model size with `.git` excluded plus
  the derived image's real uncompressed size.

> **Size the drive at 128 GB or larger.** `docker save` writes *uncompressed*
> layers, not the registry-compressed size — the `docker images` view that shows
> `CONTENT SIZE 9.24GB` also shows `DISK USAGE 30GB`, and 30 GB is what lands on
> the drive. Budget roughly **75 GiB weights + ~30 GiB images ≈ 110 GiB**. The
> script computes this exactly and refuses to start if the drive is too small.

Then it saves both image tags into **one** archive so shared layers are stored
once, rsyncs the weights (excluding `.git`), copies the scripts, the Dockerfile
for rebuilding the derived image, and this document, writes `MANIFEST.txt`, and
generates `SHA256SUMS` by reading everything back.

Interrupted part-way? Re-run it — rsync resumes.

### On the classified server

```bash
cd /media/user/TRANSFER/cortex-nemotron-transfer/scripts
./nemotron-import-from-usb.sh /media/user/TRANSFER/cortex-nemotron-transfer
```

Seven stages, each logged with `OK` / `WARN` / `FAIL` and a running tally:

1. **Integrity** — `sha256sum -c` over the package. Refuses to continue on a
   mismatch rather than importing corrupt weights.
2. **Environment** — Docker reachable, GPU count and VRAM, driver against the
   575.51.03 floor, host FIPS state, free space on both the model volume and
   `/var/lib/docker`.
3. **Images** — `docker load`, then confirms the derived tag actually exists.
4. **Weights** — rsync into `/var/cortex/models/`, then normalises ownership to
   `root:root` and mode `a+rX`.
5. **Model integrity** — shard count, stub detection, required files, and
   `config.json` architecture and `quant_method`.
6. **Engine** — inside the container: SSL context builds, opencv is absent,
   `NemotronHForCausalLM` and `modelopt_mixed` are supported, `qwen3_xml` and
   `nemotron_v3` are registered. This is §5 and §4b, automated.
7. **Cortex** — registers the model if the gateway answers on 8084.

Flags: `--skip-cortex` (register later by hand), `--skip-verify` (skip the
checksum pass — only when you have already verified once).

Everything is teed to `~/nemotron-import-logs/nemotron-import-<timestamp>.log`.
That file records every check and is what to send when something fails.

### Paths differ between the two servers

| | Unclassified (`mage`) | Classified |
|---|---|---|
| Cortex repo | `~/repos/Cortex` | **`/repos/repos/Cortex`** |
| Models dir | `/var/cortex/models` | detected at run time |

Neither script hard-codes a repo path. The export script locates its own repo
from `$BASH_SOURCE`, so it works wherever the checkout lives. The import script
**detects both** and prints what it found:

- **Cortex repo** — checks `$CORTEX_REPO`, then `/repos/repos/Cortex`,
  `~/repos/Cortex`, `/opt/Cortex`, `/srv/Cortex`, `/repos/Cortex`, accepting the
  first with a `Makefile` and a `backend/` directory. Used only for the "start
  Cortex with…" hint, so a miss is a warning rather than a failure.
- **Models directory** — asks the running gateway where it actually mounts
  `/var/cortex/models`:

  ```
  docker inspect cortex-gateway-1 --format '{{range .Mounts}}...'
  ```

  which is authoritative even if someone exported an override. Falls back to
  `/var/cortex/models` with a warning if the gateway is not running.

Either can be pinned explicitly, and an explicit value always wins over
detection:

```bash
CORTEX_REPO=/repos/repos/Cortex MODELS_DIR=/var/cortex/models \
  ./nemotron-import-from-usb.sh /media/user/TRANSFER/cortex-nemotron-transfer
```

### Design notes for whoever maintains these

- **Neither script uses `set -e`.** One non-fatal hiccup should not discard an
  hour of copying. Failures are counted and reported together; only genuinely
  unrecoverable conditions (no space, corrupt package, missing Docker) abort.
- **sudo is requested once, up front, and only when needed.** The import script
  probes whether `$MODELS_DIR` is already writable and skips sudo entirely if
  so. When it is needed, a background loop refreshes the ticket so a long rsync
  never stalls on a re-prompt.
- **`--entrypoint` is always explicit.** This image's `ENTRYPOINT` is
  `["vllm","serve"]`, so `docker run <image> true` passes `true` to vLLM as an
  argument instead of running it. Every probe sets `--entrypoint`.
- **Overrides via environment**, so the same scripts work if paths change:
  `MODELS_DIR`, `MODEL_NAME`, `DERIVED_IMAGE`, `BASE_IMAGE`, `CORTEX_URL`,
  `TP_SIZE`.

### Rebuilding the derived image on the far side

The package carries the Dockerfile. If the load fails, or the driver turns out
to be older than 575.51.03 and you need the CUDA 12.8 base:

```bash
cd /media/user/TRANSFER/cortex-nemotron-transfer/scripts/vllm-fips
docker build -t cortex/vllm-fips:v0.27.1 .
```

Edit the `FROM` line first if you need a different base tag.


---

## Quick reference

```
Server        afwi@mage
Repo          ~/repos/Cortex
Image tag     vllm/vllm-openai:v0.27.1     (v0.24.0-ubuntu2404 if driver < 575.51.03)
Image store   /var/lib/docker              (NOT the repo)
Offline tars  ~/repos/Cortex/cortex-offline-images/
Weights       /var/cortex/models/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4  ->  /models (ro)
Local Path    NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4      (folder name only)
Admin UI      http://<HOST_IP>:3001        Gateway  http://<HOST_IP>:8084

Runtime       TP 4 | max-model-len 32768 | gpu-mem-util 0.90 | kv-cache auto
              enforce-eager OFF | trust-remote-code ON | startup-timeout 2400
              chunked-prefill left ON (default)

Env var       OPENSSL_FORCE_FIPS_MODE=0    (MANDATORY on this FIPS host - see 4b)
Image         cortex/vllm-fips:v0.27.1     (derived, opencv removed - see 4b)
              ^ use THIS in the Cortex Engine Image field, not the upstream tag

Custom args   --enable-auto-tool-choice
              --tool-call-parser qwen3_xml
              --reasoning-parser nemotron_v3
              --mamba-ssm-cache-dtype float16
              --async-scheduling
              --speculative-config {"method":"mtp","num_speculative_tokens":2}
              --prefix-caching-hash-algo sha256

Measured      85.6 tok/s single stream  (13.1 with enforce-eager ON)

Sampling      temperature 1.0 | top_p 0.95 | top_k -1
              repetition 1.0 | frequency 0.0 | presence 0.0   (all penalties OFF)

Fallback      nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-FP8
```

## References

- Model card: <https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4>
- vLLM recipe: <https://recipes.vllm.ai/nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16>
- vLLM ModelOpt / NVFP4: <https://docs.vllm.ai/en/stable/features/quantization/modelopt/>
- vLLM security & FIPS: <https://docs.vllm.ai/en/stable/usage/security/>
- vLLM #38776 (`modelopt_mixed` requires sm89+), #47749 (Marlin fallback), #50925 (Marlin memory), #33461 (Marlin correctness)
- Cortex: `docs/models/vllm.md`, `docs/operations/offline-deployment.md`, `docs/operations/UPDATE_NVIDIA_DRIVERS.md`
- Cortex source: `backend/src/docker_manager.py`, `backend/src/routes/openai.py`, `backend/src/routes/models.py`, `backend/src/utils/custom_args_validator.py`, `scripts/versions.env`

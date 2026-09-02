# vLLM vs llama.cpp: Engine Comparison for Cortex

**Date**: October 4, 2025 (updated September 2, 2026 for vLLM v0.28.0 / llama.cpp b10731)  
**Purpose**: Guide administrators in choosing the right engine for their models

---

## Executive Summary

**Cortex supports dual inference engines:**

1. **vLLM** - Primary engine for standard HuggingFace Transformers models
2. **llama.cpp** - Engine for GGUF files (any model, including gpt-oss GGUF conversions)

**Why both?** The file format picks the engine. vLLM serves safetensors checkpoints, including gpt-oss (with `--reasoning-parser gpt_oss`, `--tool-call-parser openai` and `--quantization mxfp4`), with the best throughput. llama.cpp serves GGUF files, which vLLM never receives in Cortex: every GGUF, single or multi-part, runs on llama.cpp.

---

## Quick Decision Matrix

### Choose vLLM When:

✅ Model on HuggingFace with Transformers checkpoint  
✅ Architecture: Llama, Mistral, Qwen, Phi, Gemma, etc.  
✅ Need maximum throughput (PagedAttention)  
✅ High concurrency (50+ simultaneous requests)  
✅ Pure GPU inference with sufficient VRAM  

**Examples**: Llama 3 8B/70B, Mistral 7B, Qwen 2.5, Phi-3, gpt-oss-20b / gpt-oss-120b (safetensors)

### Choose llama.cpp When:

✅ **GGUF file, single or multi-part** ← **the rule: GGUF ⇒ llama.cpp**  
✅ GGUF-only model (no HF checkpoint)  
✅ Custom/experimental architecture  
✅ CPU+GPU hybrid inference needed  
✅ Aggressive quantization (Q4_K_M, Q5_K_M)  

**Examples**: community GGUF quantizations, gpt-oss GGUF conversions

---

## Technical Comparison

### Architecture Support

| Aspect | vLLM | llama.cpp |
|--------|------|-----------|
| **Supported Models** | 100+ HF architectures | Any model with GGUF |
| **Llama family** | ✅ Excellent | ✅ Excellent |
| **Mistral family** | ✅ Excellent | ✅ Excellent |
| **gpt-oss** | ✅ Safetensors release (`gpt_oss` parser, `mxfp4`) | ✅ GGUF conversions |
| **Custom architectures** | ⚠️ Requires HF integration | ✅ Works if GGUF exists |
| **trust_remote_code** | ⚠️ Limited support | ✅ N/A (loads from GGUF) |

**gpt-oss**: vLLM for the safetensors release; llama.cpp for GGUF conversions  
**Winner for standard models**: vLLM (better performance)

### Performance

| Metric | vLLM | llama.cpp | Notes |
|--------|------|-----------|-------|
| **Throughput (tokens/sec)** | 50-70 (single GPU, 7B) | 30-50 | vLLM 1.5-2x faster |
| **Latency (TTFT)** | 50-100ms | 100-300ms | vLLM faster startup |
| **Memory efficiency** | Excellent (PagedAttention) | Good | vLLM 2-4x better KV cache |
| **Concurrency** | High (100+ requests) | Low (1-4 requests) | vLLM scales better |
| **CPU performance** | Very slow | Optimized | llama.cpp 10x+ faster on CPU |

**Performance winner**: vLLM (when architecture supported)  
**CPU winner**: llama.cpp

### Quantization

| Method | vLLM | llama.cpp |
|--------|------|-----------|
| **FP16/BF16** | ✅ Native | ✅ Via Q8_0+ |
| **FP8** | ✅ Runtime | ❌ Not directly |
| **INT8** | ✅ Runtime | ✅ Via Q8_0 |
| **AWQ/GPTQ (4-bit)** | ✅ Pre-quantized checkpoints | ❌ Different format |
| **Q8_0** | ⚠️ Via experimental GGUF | ✅ Native |
| **Q6_K, Q5_K, Q4_K** | ❌ Not supported | ✅ Native |
| **Q3_K, Q2_K** | ❌ Not supported | ✅ Native (not recommended) |

**Quantization winner**: llama.cpp (more options, aggressive compression)  
**Quality winner**: vLLM FP8/INT8 (runtime optimization)

### Deployment

| Aspect | vLLM | llama.cpp |
|--------|------|-----------|
| **Container image** | `vllm/vllm-openai:v0.28.0` (pinned in `versions.env`) | `ghcr.io/ggml-org/llama.cpp:server-cuda-b10731` (pinned) |
| **Startup time** | Fast (10-30s for 7B) | Moderate (30-60s for 120B) |
| **Model format** | HF Transformers, (GGUF exp) | GGUF only |
| **Online download** | ✅ From HuggingFace | ❌ Local files only |
| **Offline mode** | ✅ Local HF format | ✅ Local GGUF |
| **Multi-file models** | ✅ SafeTensors shards | ✅ Split GGUF loads natively (point at the first part) |

**Deployment winner**: Tie (different use cases)

---

## Memory Management Strategies

### vLLM Approach (PagedAttention)

```
Traditional KV cache:
Request with 100 tokens, 8K max:
- Allocates: 8K × hidden_size × 2 bytes
- Uses: 100 × hidden_size × 2 bytes
- Waste: 7900 tokens worth of VRAM ❌

vLLM PagedAttention:
- Allocates blocks on-demand (16 tokens each)
- Request needs: 100 tokens → 7 blocks
- Waste: Almost zero ✓

Result: 2-4x more requests fit in same VRAM
```

**Best for**: High concurrency, variable-length requests

### llama.cpp Approach (Layer Offloading)

```
Model: 120B parameters, 120 layers
Available VRAM: 184GB (4x 46GB GPUs)
Need: ~120GB for weights + ~20GB for KV/overhead

llama.cpp strategy:
1. Load as many layers as fit in VRAM
2. Offload overflow to CPU RAM
3. Hybrid execution (mostly GPU, some CPU)

Example:
-ngl 999: Tries to offload all 120 layers to GPU
Result: Layers 0-110 on GPU, layers 111-119 on CPU

Performance: Mostly fast (GPU), slight slowdown on CPU layers
```

**Best for**: Models that don't quite fit in VRAM

---

## Real-World Use Case: GPT-OSS 120B

### The Challenge

```
Model: GPT-OSS 120B Abliterated
Size: 240GB (BF16 weights)
Format: BF16 GGUF conversion (no MXFP4 checkpoint on this host)
Available VRAM: 184GB (4x L40S)
```

**Problem**: 240 GB of BF16 weights do not fit in 184 GB of VRAM.

### vLLM with the BF16 conversion (does not fit)

```bash
vllm serve huihui-ai/Huihui-gpt-oss-120b-BF16-abliterated \
  --tensor-parallel-size 4 \
  --gpu-memory-utilization 0.92

# 240GB weights / 4 GPUs = 60GB per GPU
# 60GB > 46GB available → OOM ❌
```

vLLM does serve gpt-oss: the official `openai/gpt-oss-120b` checkpoint ships MXFP4 experts (~60 GB) and runs
with `--reasoning-parser gpt_oss --tool-call-parser openai --quantization mxfp4` (see the vLLM Recipes gpt-oss
guide). This example is about a BF16 *conversion* that only exists as a GGUF on the host.

### llama.cpp Solution (Works!)

```bash
# Step 1: Quantize to Q8_0
# Size: 240GB → 120GB (2x compression, near-lossless)

# Step 2: Serve with llama.cpp
llama-server \
  -m gpt-oss-120b.Q8_0.gguf \
  -ngl 999 \
  --tensor-split 0.25,0.25,0.25,0.25 \
  -c 8192 \
  -b 512

# Memory usage:
# 120GB weights / 4 GPUs = 30GB per GPU
# 30GB + KV cache + overhead ≈ 35GB per GPU
# 35GB < 46GB available → Fits! ✓

# Performance:
# ~8-15 tokens/sec (acceptable for 120B)
# Serves successfully ✓
```

**Cortex makes this easy:**
```
1. Admin adds GPT-OSS 120B via Model Form
2. Selects engine: llama.cpp
3. Selects GGUF: Q8_0 file
4. Configures: ngl=999, tensor_split=0.25,0.25,0.25,0.25
5. Clicks "Start"
6. Model serves successfully! ✓
```

---

## Hybrid Deployment Strategy

### Recommended Cortex Setup

**vLLM models** (most workloads):
```
Llama 3 8B (chat):
  Engine: vLLM
  TP: 1
  Throughput: ~60 tok/sec
  Concurrency: 40+

Llama 3 70B (chat):
  Engine: vLLM
  TP: 4
  Throughput: ~25 tok/sec
  Concurrency: 10-15

Mistral 7B (chat):
  Engine: vLLM
  TP: 1
  Throughput: ~65 tok/sec
```

**llama.cpp models** (special cases):
```
GPT-OSS 120B (Q8_0 GGUF):
  Engine: llama.cpp
  Quantization: Q8_0
  GPU Layers: 999
  Tensor Split: 0.25,0.25,0.25,0.25
  Throughput: ~10 tok/sec
  Concurrency: 1-2

Reason: the model is only available as GGUF on this host
```

**Result:**
- 90% of requests → vLLM (fast, efficient)
- 10% of requests → llama.cpp (GPT-OSS specific)
- Gateway routes transparently
- Users don't notice which engine

---

## Administrative Workflow

### Creating a vLLM Model

```
1. Models page → "Add Model"
2. Engine Type: vLLM (Transformers/SafeTensors)
3. Mode: Online or Offline
4. Repo ID / Local Path: meta-llama/Llama-3-8B-Instruct
5. Configure: TP size, dtype, memory settings
6. Click "Launch Model" → "Start"
7. vLLM container spins up
8. Model serves at http://cortex-ip:8084/v1/chat/completions
```

### Creating a llama.cpp Model

```
1. Models page → "Add Model"
2. Engine Type: llama.cpp (GGUF)
3. Mode: Offline (required for llama.cpp)
4. Local Path: Browse to GGUF file
5. Configure: GPU layers, tensor split, context
6. Click "Launch Model" → "Start"
7. llama.cpp container spins up
8. Model serves at same endpoint (gateway routes by name)
```

**User Experience**: Identical! Engine choice is transparent.

---

## Cost/Benefit Analysis

### vLLM

**Costs:**
- Requires HF checkpoint (larger download)
- Limited to supported architectures
- More complex internals

**Benefits:**
- 2-3x better throughput
- 2-4x better memory efficiency
- High concurrency support
- Active development, frequent updates
- Native HF ecosystem integration

**ROI**: Excellent for standard models

### llama.cpp

**Costs:**
- Slower throughput (50-60% of vLLM)
- Lower concurrency (1-4 vs 50+)
- Manual quantization workflow
- Lower concurrency than vLLM

**Benefits:**
- **Serves any GGUF**, whatever the architecture
- Aggressive quantization (4x+ compression)
- CPU+GPU hybrid (flexible deployment)
- Single-file GGUF (easy distribution)
- Works when vLLM can't

**ROI**: Essential for GGUF-only models and tight VRAM

---

## Resource Utilization

### GPU VRAM Comparison (70B model)

**vLLM (BF16, TP=4):**
```
Weights: 140GB / 4 = 35GB per GPU
KV cache (8K, 32 seqs): ~12GB per GPU
Overhead: ~3GB per GPU
Total: ~50GB per GPU

Fits: Barely on 48GB GPUs, OOM on 40GB
```

**llama.cpp (Q8_0, TP=4):**
```
Weights (quantized): 70GB / 4 = 17.5GB per GPU
KV cache (8K, 4 seqs): ~3GB per GPU
Overhead: ~2GB per GPU
Total: ~22.5GB per GPU

Fits: Comfortably on 24GB+ GPUs
```

**Winner for tight VRAM**: llama.cpp (quantization helps)

### CPU Utilization

**vLLM:**
```
CPU usage: Low (mostly GPU-bound)
Prefill: GPU compute
Decode: GPU compute
Best on: Pure GPU servers
```

**llama.cpp:**
```
CPU usage: Moderate to high
Prefill: CPU assists GPU
Decode: Mostly GPU if -ngl high
Best on: Hybrid CPU+GPU servers
```

**Winner for CPU utilization**: llama.cpp (actually uses CPUs)

---

## Development and Maintenance

### Code Complexity in Cortex

**vLLM Integration:**
```python
# docker_manager.py: _build_command()
# ~180 lines of command building
# Handles: TP, PP, quantization, cache, prefill, graphs
# Complexity: Medium-High

# Maintenance: 
# - Follow vLLM releases
# - Update flag compatibility
# - Test new architectures
```

**llama.cpp Integration:**
```python
# docker_manager.py: _build_llamacpp_command()
# ~45 lines of command building
# Handles: ngl, tensor split, RoPE, NUMA
# Complexity: Low-Medium

# Maintenance:
# - Bump the pinned ghcr.io/ggml-org/llama.cpp server-cuda build in versions.env
# - GGUF compatibility tracking
```

**Maintenance burden**: similar (both images are pinned in `versions.env`)

### Testing Requirements

**vLLM:**
- Test per HF model architecture
- Verify quantization compatibility
- Multi-GPU NCCL configuration
- PagedAttention block sizes

**llama.cpp:**
- Test GGUF file resolution
- Verify quantization quality
- Multi-GPU tensor split
- CPU+GPU hybrid behavior

**Testing winner**: Similar effort, different focus

---

## Performance Benchmarks

### Single Request Latency

**Llama 3 8B (Same model, different engines):**

```
vLLM (BF16, single GPU):
- TTFT: 60ms
- Throughput: 55 tok/sec
- 128 tokens: ~2.3s total

llama.cpp (Q8_0, single GPU):
- TTFT: 150ms
- Throughput: 35 tok/sec
- 128 tokens: ~3.8s total

Winner: vLLM (1.6x faster)
```

### Concurrent Requests

**vLLM (Llama 3 8B, 8K context, L40S):**
```
Concurrent requests: 40
Total throughput: ~800 tok/sec across all
Per-request: ~20 tok/sec
VRAM: 38GB / 46GB

Scales well to 40+ requests ✓
```

**llama.cpp (Llama 3 8B, 8K context, L40S):**
```
Concurrent requests: 2-3
Total throughput: ~60 tok/sec
Per-request: ~20-30 tok/sec
VRAM: 12GB / 46GB

Doesn't scale well beyond 4 requests ⚠️
```

**Concurrency winner**: vLLM (dramatically better)

---

## Operational Differences

### Startup and Warmup

**vLLM:**
```
Container start → Model download (if online) → Weight loading
→ CUDA initialization → PagedAttention setup → Health: UP
Time: 15-45 seconds (depending on model size)
```

**llama.cpp:**
```
Container start → GGUF mmap/load → CUDA initialization
→ Layer allocation → Server ready → Health: UP
Time: 30-90 seconds (depending on model size)
```

**Startup winner**: vLLM (slightly faster)

### Resource Cleanup

**vLLM:**
```
Stop container:
- Graceful shutdown (5s timeout)
- CUDA memory freed automatically
- Container removed
Clean: Fast
```

**llama.cpp:**
```
Stop container:
- Graceful shutdown (10s timeout)
- Larger timeout for CPU offload cleanup
- Container removed
Clean: Slower but thorough
```

---

## API Compatibility

### OpenAI Endpoints

| Endpoint | vLLM | llama.cpp | Notes |
|----------|------|-----------|-------|
| **/v1/chat/completions** | ✅ Full | ✅ Full | Both compatible |
| **/v1/completions** | ✅ Full | ✅ Full | Both compatible |
| **/v1/embeddings** | ✅ Full | ⚠️ If model supports | vLLM better |
| **/v1/models** | ✅ Yes | ✅ Yes | Both support |
| **/health** | ✅ Native | ⚠️ Via /v1/models | vLLM has dedicated endpoint |
| **/metrics** | ✅ Prometheus | ⚠️ Optional | vLLM built-in |

**API winner**: vLLM (slightly more complete)

### Request Parameters

**Both support OpenAI standard**:
```json
{
  "model": "model-name",
  "messages": [...],
  "temperature": 0.7,
  "max_tokens": 128,
  "top_p": 0.95,
  "stream": true/false
}
```

**llama.cpp extras**:
```json
{
  "repeat_penalty": 1.1,
  "top_k": 40,
  "mirostat": 2,
  "mirostat_tau": 5.0
}
```

**vLLM extras**:
```json
{
  "presence_penalty": 0.5,
  "frequency_penalty": 0.5,
  "logit_bias": {...}
}
```

---

## Cortex Implementation Details

### Engine Selection Logic

**In Model Form:**
```tsx
<select value={engineType}>
  <option value="vllm">vLLM (Transformers/SafeTensors)</option>
  <option value="llamacpp">llama.cpp (GGUF)</option>
</select>

// Conditional rendering:
{engineType === 'vllm' && <VllmFields />}
{engineType === 'llamacpp' && <LlamaCppFields />}
```

**In docker_manager.py:**
```python
def start_container_for_model(m: Model, hf_token=None):
    engine_type = getattr(m, 'engine_type', 'vllm')
    
    if engine_type == 'llamacpp':
        return start_llamacpp_container_for_model(m)
    else:
        return start_vllm_container_for_model(m, hf_token)
```

### Container Naming

```
vLLM: vllm-model-{id}
llama.cpp: llamacpp-model-{id}

# Allows both engines to coexist
# No name conflicts
# Easy to identify in docker ps
```

### Database Schema

**Shared fields** (both engines):
```sql
id, name, served_model_name, task, state, port, container_name
```

**vLLM-specific**:
```sql
repo_id, dtype, tp_size, gpu_memory_utilization, max_model_len,
kv_cache_dtype, quantization, block_size, swap_space_gb, enforce_eager,
enable_prefix_caching, enable_chunked_prefill, cuda_graph_sizes
```

**llama.cpp-specific**:
```sql
ngl, tensor_split, batch_size, threads, context_size,
rope_freq_base, rope_freq_scale, flash_attention, mlock, no_mmap,
numa_policy, split_mode
```

**Discriminator**:
```sql
engine_type: 'vllm' | 'llamacpp'
```

---

## Decision Tree for Administrators

```
Choose Engine for New Model
│
├─ Is it a GGUF file (single or split)?
│  └─ YES → llama.cpp (always; the gateway rejects GGUF under vLLM)
│
├─ Is architecture in HF Transformers?
│  ├─ NO → llama.cpp (flexible)
│  └─ YES → Continue...
│
├─ Need high concurrency (20+ simultaneous)?
│  └─ YES → vLLM (better batching)
│
├─ Have sufficient VRAM for FP16/BF16?
│  ├─ NO → llama.cpp (better quantization)
│  └─ YES → vLLM (best performance)
│
└─ Default → vLLM (primary engine)
```

---

## Migration Paths

### vLLM → llama.cpp

**When to migrate:**
- Only a GGUF of the model is available
- Need aggressive quantization (Q4_K_M)
- VRAM constraints require CPU offload

**Steps:**
```
1. Export/download GGUF version of model
2. Quantize if needed: llama-quantize
3. Place in /var/cortex/models/
4. Create new model in Cortex
5. Engine: llama.cpp
6. Local Path: your-model.Q8_0.gguf
7. Configure llama.cpp settings
8. Start and test
```

### llama.cpp → vLLM

**When to migrate:**
- HF checkpoint becomes available
- Architecture gets vLLM support
- Need better throughput/concurrency

**Steps:**
```
1. Verify HF checkpoint exists
2. Test with vLLM locally (docker run)
3. Confirm architecture supported
4. Create vLLM model in Cortex
5. Mode: Online (HF repo) or Offline (local)
6. Configure vLLM settings
7. Start and benchmark
8. Compare vs llama.cpp
9. Archive old llama.cpp model if satisfied
```

---

## Cost Analysis

### Compute Costs (per 1M tokens)

**Assumptions**: 4x L40S GPUs ($2/GPU/hour typical cloud pricing)

**vLLM (Llama 3 70B):**
```
Throughput: 25 tok/sec
1M tokens: 40,000 seconds = 11.1 hours
Cost: 11.1 hours × 4 GPUs × $2 = $88.80
```

**llama.cpp (GPT-OSS 120B Q8_0):**
```
Throughput: 10 tok/sec
1M tokens: 100,000 seconds = 27.8 hours
Cost: 27.8 hours × 4 GPUs × $2 = $222.40
```

**But**: GPT-OSS 120B is much more capable than Llama 3 70B  
**Trade-off**: Pay 2.5x more for significantly better model

### Development Costs

**vLLM:**
- Setup: Easy (standard Docker image)
- Tuning: Moderate (many parameters)
- Maintenance: Low (stable releases)

**llama.cpp:**
- Setup: Moderate (custom Docker image)
- Tuning: Easy (fewer parameters)
- Maintenance: Moderate (rebuild image for updates)

---

## Future Roadmap

### vLLM Evolution

**Expected improvements:**
- Better FP8 quantization
- Multi-node simplification
- Speculative decoding maturity

**Cortex will track**:
- Bump `VLLM_IMAGE` in `versions.env` after testing a new release

### llama.cpp Evolution

**Expected improvements:**
- Better multi-GPU scaling
- More quantization schemes
- Faster inference kernels
- LoRA adapter improvements

**Cortex enhancements:**
- LoRA adapter UI
- In-browser quantization
- Multi-model serving per container

---

## Conclusion

### The Dual-Engine Strategy Works

**Why Cortex needs both:**

1. **vLLM** = Performance powerhouse for 95% of models
2. **llama.cpp** = Compatibility savior for the other 5%
3. **Together** = Complete solution

**Specifically for gpt-oss:**
- vLLM: ✅ the safetensors release (`gpt_oss` reasoning parser, `mxfp4`)
- llama.cpp: ✅ GGUF conversions (Q8_0 and below)
- **Conclusion**: the file format picks the engine

**User perspective:**
- Transparent engine selection
- Same API endpoints
- Same admin UI
- "Just works" regardless of engine

**Admin perspective:**
- Choose engine based on model
- Configure parameters in unified form
- Monitor both engines in System Monitor
- Manage lifecycle identically

---

## Key Takeaways

1. **vLLM** for standard HF models - unbeatable performance
2. **llama.cpp** for every GGUF file - single or multi-part
3. **Both** coexist in Cortex - best of both worlds
4. **Gateway** abstracts differences - users don't care
5. **Admin UI** treats both equally - unified experience

**Result**: Cortex can serve ANY model - mainstream (vLLM) or exotic (llama.cpp)! 🎉

---

## Quick Reference

### Decision Guide:

```
Model to serve: ?

├─ GGUF file? → llama.cpp (always)
├─ HF Transformers? → vLLM (unless custom architecture)
├─ Need max throughput? → vLLM
├─ Need aggressive quantization? → llama.cpp
└─ Default → vLLM
```

### Performance Expectations:

```
vLLM (standard model):
- Throughput: High (50-70 tok/sec single request)
- Concurrency: Excellent (40+ requests)
- Memory: Efficient (PagedAttention)

llama.cpp (120B Q8_0 GGUF):
- Throughput: Moderate (8-15 tok/sec)
- Concurrency: Limited (1-2 requests)
- Memory: Flexible (CPU offload)
```

---

## Smart Engine Guidance

Cortex now provides **automatic engine recommendations** when you browse model folders:

| Detected Files | Recommended Engine | Reason |
|----------------|-------------------|--------|
| SafeTensors + GGUF | vLLM + SafeTensors | Best vLLM performance |
| Multi-part GGUF only | llama.cpp | Loads split files natively |
| Single GGUF only | llama.cpp | Native GGUF support |

**In the UI**: Guidance banners appear with one-click actions to switch engines or formats.

See [Model Management](model-management.md#smart-engine-guidance) for details.

---

**For detailed guides:**
- vLLM: See [vLLM Guide](vllm.md)
- llama.cpp: See [llama.cpp Guide](llamaCPP.md)
- GGUF Format: See [GGUF Format Guide](gguf-format.md)
- Multi-Part GGUF: See [Multi-Part GGUF](gguf-multipart.md)
- Model Management: See [Model Management](model-management.md)
- Engine Research: See [Engine Research](engine-research.md)
- HuggingFace Models: See [HuggingFace Download](huggingface-model-download.md)


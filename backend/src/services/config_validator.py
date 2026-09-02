"""Configuration validation for dry-run checks.

Validates model configuration BEFORE starting container to catch issues early.
Focus on VRAM estimation and custom args validation.

Phase 3 feature - see cortexSustainmentPlan.md
"""

import logging
import os
from typing import Dict, List, Optional, Tuple, Any
from pydantic import BaseModel
from ..models import Model

logger = logging.getLogger(__name__)

# KV cache quantization multipliers (Gap #5)
# Maps cache_type to bytes per element
KV_CACHE_MULTIPLIERS = {
    'f32': 4.0,
    'f16': 2.0,
    'q8_0': 1.0,
    'q5_1': 0.75,
    'q5_0': 0.625,
    'q4_1': 0.5625,
    'q4_0': 0.5,
}


class ValidationWarning(BaseModel):
    """A validation warning with severity and suggested fix."""
    severity: str  # 'error' | 'warning' | 'info'
    category: str  # 'memory' | 'args' | 'config'
    title: str
    message: str
    fix: Optional[str] = None


class DryRunResult(BaseModel):
    """Result of dry-run validation."""
    valid: bool
    warnings: List[ValidationWarning]
    vram_estimate: Optional[Dict[str, Any]] = None
    command_preview: Optional[List[str]] = None


def estimate_vram_usage(m: Model, gpu_count: int = 1) -> Dict[str, Any]:
    """Estimate VRAM usage for a model configuration.
    
    Simple heuristic-based estimation (not precise, but catches obvious issues).
    
    Args:
        m: Model configuration
        gpu_count: Number of GPUs (for TP sharding)
        
    Returns:
        Dict with VRAM estimates per GPU
    """
    # Rough parameter count estimation from model path/name
    params_b = 7.0  # Default assumption
    
    # Try to guess from name
    name_lower = (m.name or m.local_path or m.repo_id or '').lower()
    if '70b' in name_lower or '72b' in name_lower:
        params_b = 70.0
    elif '30b' in name_lower or '34b' in name_lower:
        params_b = 30.0
    elif '13b' in name_lower or '14b' in name_lower:
        params_b = 13.0
    elif '20b' in name_lower:
        params_b = 20.0
    elif '9b' in name_lower or '8b' in name_lower:
        params_b = 8.0
    elif '7b' in name_lower:
        params_b = 7.0
    elif '3b' in name_lower:
        params_b = 3.0
    
    # Bytes per parameter based on dtype
    dtype = (m.dtype or 'bfloat16').lower()
    bytes_per_param = 2.0  # fp16/bf16
    if 'fp8' in dtype or 'int8' in dtype:
        bytes_per_param = 1.0
    elif 'fp32' in dtype:
        bytes_per_param = 4.0
    
    # Quantization reduces weight memory
    quant = (m.quantization or '').lower()
    if 'awq' in quant or 'gptq' in quant:
        bytes_per_param *= 0.25  # 4-bit
    elif 'int8' in quant or 'fp8' in quant:
        bytes_per_param *= 0.5
    
    # Base model weights
    model_weights_gb = (params_b * 1e9 * bytes_per_param) / (1024 ** 3)
    
    # KV cache estimation
    max_len = m.max_model_len or 8192
    max_seqs = getattr(m, 'max_num_seqs', None) or 256
    kv_bytes_per_token = 2.0  # Default
    
    kv_cache_dtype = getattr(m, 'kv_cache_dtype', None) or ''
    if 'fp8' in kv_cache_dtype.lower():
        kv_bytes_per_token = 1.0
    
    # Rough KV cache: tokens * layers * hidden_size * 2 (K+V) * bytes_per_elem
    # Simplification: ~2 bytes per token per billion params for fp16
    kv_cache_gb = (max_len * max_seqs * params_b * kv_bytes_per_token) / (1024 ** 3)
    
    # Tensor parallel sharding
    tp_size = m.tp_size or 1
    if tp_size > 1:
        model_weights_gb /= tp_size
        kv_cache_gb /= tp_size
    
    # Overhead (activation memory, fragmentation, etc.)
    overhead_gb = (model_weights_gb + kv_cache_gb) * 0.15
    
    # Total per GPU
    total_per_gpu_gb = model_weights_gb + kv_cache_gb + overhead_gb
    
    # Apply gpu_memory_utilization factor
    gpu_mem_util = m.gpu_memory_utilization or 0.9
    required_vram_gb = total_per_gpu_gb / gpu_mem_util
    
    return {
        "params_b": params_b,
        "model_weights_gb": round(model_weights_gb, 2),
        "kv_cache_gb": round(kv_cache_gb, 2),
        "overhead_gb": round(overhead_gb, 2),
        "total_per_gpu_gb": round(total_per_gpu_gb, 2),
        "required_vram_gb": round(required_vram_gb, 2),
        "gpu_count": tp_size,
        "note": "Estimate only - actual usage may vary by ±20%",
    }


def estimate_llamacpp_vram_usage(m: Model, gpu_count: int = 1) -> Dict[str, Any]:
    """Estimate VRAM usage for a llama.cpp (GGUF) model configuration (Gap #5).
    
    For GGUF models, we can get more accurate estimates because:
    1. Model weights are already quantized - file size is actual VRAM needed
    2. KV cache size depends on context_size, parallel_slots, and cache quantization
    3. Metadata embedded in GGUF gives us actual layer count and embedding size
    
    Args:
        m: Model configuration
        gpu_count: Number of GPUs (for tensor split)
        
    Returns:
        Dict with VRAM estimates per GPU
    """
    from ..config import get_settings
    from ..utils.gguf_utils import extract_gguf_metadata, validate_gguf_file
    
    settings = get_settings()
    
    # Default values (conservative estimates)
    model_weights_gb = 7.0  # Assume 7B model
    params_b = 7.0
    embedding_size = 4096
    num_layers = 32
    
    # Try to get actual file size from GGUF
    if m.local_path:
        host_base = settings.CORTEX_MODELS_DIR
        host_path = os.path.join(host_base, m.local_path)
        
        # Get file size
        gguf_file = None
        if m.local_path.lower().endswith('.gguf'):
            gguf_file = host_path
        elif os.path.isdir(host_path):
            # Find GGUF files in directory
            for f in os.listdir(host_path):
                if f.lower().endswith('.gguf'):
                    gguf_file = os.path.join(host_path, f)
                    break
        
        if gguf_file and os.path.isfile(gguf_file):
            # Get file size directly
            try:
                file_size_bytes = os.path.getsize(gguf_file)
                model_weights_gb = file_size_bytes / (1024 ** 3)
                
                # Estimate params from file size (rough: 1GB ≈ 2B params for Q4, 1B for Q8)
                quant_type = (m.local_path or '').lower()
                if 'q8' in quant_type or 'f16' in quant_type:
                    params_b = model_weights_gb * 1.0  # ~1B params per GB for Q8
                elif 'q6' in quant_type:
                    params_b = model_weights_gb * 1.33
                elif 'q5' in quant_type:
                    params_b = model_weights_gb * 1.6
                elif 'q4' in quant_type or 'q3' in quant_type:
                    params_b = model_weights_gb * 2.0  # ~2B params per GB for Q4
                else:
                    params_b = model_weights_gb * 1.5  # Conservative default
                
                # Try to extract metadata for more accurate estimates
                metadata = extract_gguf_metadata(gguf_file)
                if metadata:
                    if metadata.embedding_length:
                        embedding_size = metadata.embedding_length
                    if metadata.block_count:
                        num_layers = metadata.block_count
                
            except Exception as e:
                logger.warning(f"Could not get GGUF file size: {e}")
    
    # KV cache estimation
    # Formula: context_size × parallel_slots × layers × head_dim × 2 (K+V) × bytes_per_elem
    context_size = getattr(m, 'context_size', None) or 4096
    parallel_slots = getattr(m, 'parallel_slots', None) or 4
    
    # Head dimension is typically embedding_size / num_heads, but we approximate
    # KV cache per token ≈ 2 × layers × head_dim × kv_heads × bytes_per_elem
    # For GQA models, kv_heads is less than attention heads
    head_dim = embedding_size // 32  # Typical: hidden_size / num_heads
    kv_heads = max(1, num_layers // 4)  # Conservative GQA estimate
    
    # Get cache type multipliers
    cache_type_k = (getattr(m, 'cache_type_k', None) or 'f16').lower()
    cache_type_v = (getattr(m, 'cache_type_v', None) or 'f16').lower()
    
    bytes_per_k = KV_CACHE_MULTIPLIERS.get(cache_type_k, 2.0)
    bytes_per_v = KV_CACHE_MULTIPLIERS.get(cache_type_v, 2.0)
    
    # KV cache size in bytes
    # = context × slots × layers × head_dim × kv_heads × (bytes_k + bytes_v)
    kv_cache_bytes = (
        context_size * 
        parallel_slots * 
        num_layers * 
        head_dim * 
        kv_heads * 
        (bytes_per_k + bytes_per_v)
    )
    kv_cache_gb = kv_cache_bytes / (1024 ** 3)
    
    # GPU split if using multiple GPUs
    ngl = getattr(m, 'ngl', None) if getattr(m, 'ngl', None) is not None else 999
    if ngl == 0:
        # CPU only mode - no VRAM needed for model
        model_weights_gb = 0.0
        kv_cache_gb = 0.0  # KV cache also on CPU
    elif ngl < num_layers:
        # Partial GPU offload
        gpu_fraction = ngl / num_layers
        model_weights_gb *= gpu_fraction
    
    # Tensor split across multiple GPUs
    if gpu_count > 1:
        model_weights_gb /= gpu_count
        kv_cache_gb /= gpu_count
    
    # Overhead (CUDA workspace, allocator fragmentation, etc.)
    overhead_gb = (model_weights_gb + kv_cache_gb) * 0.15
    
    # Total per GPU
    total_per_gpu_gb = model_weights_gb + kv_cache_gb + overhead_gb
    
    # llama.cpp doesn't have a gpu_memory_utilization factor like vLLM
    # but we add a small margin for safety
    required_vram_gb = total_per_gpu_gb * 1.1
    
    return {
        "params_b": round(params_b, 1),
        "model_weights_gb": round(model_weights_gb, 2),
        "kv_cache_gb": round(kv_cache_gb, 2),
        "overhead_gb": round(overhead_gb, 2),
        "total_per_gpu_gb": round(total_per_gpu_gb, 2),
        "required_vram_gb": round(required_vram_gb, 2),
        "gpu_count": gpu_count,
        "context_size": context_size,
        "parallel_slots": parallel_slots,
        "cache_type_k": cache_type_k,
        "cache_type_v": cache_type_v,
        "ngl": ngl,
        "note": "Estimate only - actual usage may vary by ±20%",
    }


async def validate_model_config(m: Model) -> DryRunResult:
    """VRAM estimate against the GPUs the model will use, plus a few sanity checks.

    Engine-specific flag validation lives in the engine adapters; this covers
    what needs live hardware data.
    """
    import json
    warnings: List[ValidationWarning] = []
    engine_type = getattr(m, "engine_type", None) or "vllm"

    available_gpus: List[Dict[str, Any]] = []
    try:
        from .system_monitoring import get_gpu_metrics
        gpus = await get_gpu_metrics(None)
        available_gpus = [
            {"index": g.index, "mem_total_mb": g.mem_total_mb, "mem_used_mb": g.mem_used_mb}
            for g in gpus if g.mem_total_mb
        ]
    except Exception as e:  # pragma: no cover - environment specific
        logger.info("GPU info unavailable for dry-run: %s", e)

    try:
        selected = getattr(m, "selected_gpus", None)
        gpu_list = json.loads(selected) if isinstance(selected, str) else (selected or [])
    except Exception:
        gpu_list = []
    gpu_count = max(1, len(gpu_list))

    vram_est: Optional[Dict[str, Any]] = None
    try:
        if engine_type == "llamacpp":
            vram_est = estimate_llamacpp_vram_usage(m, gpu_count)
            fix = "Reduce context size / parallel slots, or use a quantized KV cache (q8_0 with flash attention)"
        else:
            vram_est = estimate_vram_usage(m, m.tp_size or 1)
            fix = "Reduce gpu_memory_utilization or max_model_len, or use --kv-cache-dtype fp8"
        required_gb = float(vram_est["required_vram_gb"])
        targets = [g for g in available_gpus if not gpu_list or g["index"] in gpu_list] or available_gpus[:gpu_count]
        for g in targets:
            total_gb = (g.get("mem_total_mb") or 0) / 1024
            free_gb = total_gb - (g.get("mem_used_mb") or 0) / 1024
            if required_gb > free_gb:
                warnings.append(ValidationWarning(severity="error", category="memory", title=f"Insufficient VRAM on GPU {g['index']}",
                                                  message=f"Estimated need: {required_gb:.1f} GB, free: {free_gb:.1f} GB", fix=fix))
            elif required_gb > free_gb * 0.9:
                warnings.append(ValidationWarning(severity="warning", category="memory", title=f"Tight VRAM on GPU {g['index']}",
                                                  message=f"Estimated need: {required_gb:.1f} GB, free: {free_gb:.1f} GB (little headroom)",
                                                  fix="Leave some headroom for the KV cache"))
    except Exception as e:
        logger.info("VRAM estimation skipped: %s", e)

    if available_gpus and gpu_list:
        missing = [g for g in gpu_list if g not in {a["index"] for a in available_gpus}]
        if missing:
            warnings.append(ValidationWarning(severity="error", category="config", title="Unknown GPU selected",
                                              message=f"GPU index(es) {missing} were not reported by the host", fix="Re-select GPUs"))

    max_len = getattr(m, "max_model_len", None) or 0
    if max_len > 131072:
        warnings.append(ValidationWarning(severity="warning", category="config", title="Very large context",
                                          message=f"max_model_len {max_len} may exhaust VRAM", fix="32K-64K is typical"))
    quant = (getattr(m, "quantization", None) or "").lower()
    model_path = (m.local_path or m.repo_id or m.name or "").lower()
    if quant in ("awq", "awq_marlin") and "awq" not in model_path:
        warnings.append(ValidationWarning(severity="warning", category="config", title="AWQ quantization mismatch",
                                          message="AWQ selected but the model name/path does not indicate AWQ weights",
                                          fix="AWQ needs a pre-quantized checkpoint"))
    if quant in ("gptq", "gptq_marlin") and "gptq" not in model_path:
        warnings.append(ValidationWarning(severity="warning", category="config", title="GPTQ quantization mismatch",
                                          message="GPTQ selected but the model name/path does not indicate GPTQ weights",
                                          fix="GPTQ needs a pre-quantized checkpoint"))
    return DryRunResult(valid=not any(w.severity == "error" for w in warnings), warnings=warnings, vram_estimate=vram_est)

from __future__ import annotations

import logging
import os
import time
import re
import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Any
from sqlalchemy import select, update, delete

from ..auth import require_admin
from ..config import get_settings
from ..models import Model, ConfigKV
from ..docker_manager import start_container_for_model, stop_container_for_model, tail_logs_for_model, OfflineImageUnavailableError
from ..services.registry_persistence import persist_model_registry
from ..services.model_testing import ModelTestResult, ReadinessResp, test_chat_model, test_embedding_model, check_model_readiness
from ..services.folder_inspector import inspect_model_folder
from ..services.hf_inspector import fetch_hf_config
from ..schemas.models import ModelItem, CreateModelRequest, UpdateModelRequest, BaseDirCfg, InspectFolderResp, HfConfigResp
from ..utils.gguf_utils import GGUFGroup, detect_quantization_from_filename, find_gguf_files_recursive, analyze_gguf_files
from ..utils.gpu_utils import normalize_gpu_selection as _normalize_gpu_selection
from ..state import register_model_endpoint, unregister_model_endpoint
from ..state import get_model_registry as _get_registry

logger = logging.getLogger(__name__)


def _get_session():
    try:
        from ..main import SessionLocal  # type: ignore
        return SessionLocal
    except Exception:
        return None

router = APIRouter()

@router.get("/models", response_model=List[ModelItem])
async def list_models(_: dict = Depends(require_admin)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        return []
    async with SessionLocal() as session:
        # Order by ID to maintain consistent position regardless of state changes
        res = await session.execute(select(Model).order_by(Model.id.asc()))
        rows = res.scalars().all()
        return [
            ModelItem(
                id=r.id,
                name=r.name,
                served_model_name=r.served_model_name,
                task=r.task,
                repo_id=getattr(r, 'repo_id', None),
                local_path=getattr(r, 'local_path', None),
                dtype=r.dtype,
                tp_size=r.tp_size if r.engine_type != 'llamacpp' else (
                    len(r.tensor_split.split(',')) if r.tensor_split else None
                ),
                gpu_memory_utilization=r.gpu_memory_utilization,
                max_model_len=r.max_model_len,
                kv_cache_dtype=r.kv_cache_dtype,
                max_num_batched_tokens=r.max_num_batched_tokens,
                quantization=r.quantization,
                block_size=r.block_size,
                swap_space_gb=r.swap_space_gb,
                enforce_eager=r.enforce_eager,
                trust_remote_code=getattr(r, 'trust_remote_code', None),
                cpu_offload_gb=getattr(r, 'cpu_offload_gb', None),
                enable_prefix_caching=getattr(r, 'enable_prefix_caching', None),
                prefix_caching_hash_algo=getattr(r, 'prefix_caching_hash_algo', None),
                enable_chunked_prefill=getattr(r, 'enable_chunked_prefill', None),
                max_num_seqs=getattr(r, 'max_num_seqs', None),
                cuda_graph_sizes=getattr(r, 'cuda_graph_sizes', None),
                pipeline_parallel_size=getattr(r, 'pipeline_parallel_size', None),
                device=getattr(r, 'device', None),
                tokenizer=getattr(r, 'tokenizer', None),
                hf_config_path=getattr(r, 'hf_config_path', None),
                engine_type=getattr(r, 'engine_type', 'vllm'),
                engine_image=getattr(r, 'engine_image', None),
                engine_version=getattr(r, 'engine_version', None),
                engine_digest=getattr(r, 'engine_digest', None),
                selected_gpus=_normalize_gpu_selection(getattr(r, 'selected_gpus', None)),
                ngl=getattr(r, 'ngl', None),
                tensor_split=getattr(r, 'tensor_split', None),
                batch_size=getattr(r, 'batch_size', None),
                ubatch_size=getattr(r, 'ubatch_size', None),
                threads=getattr(r, 'threads', None),
                context_size=getattr(r, 'context_size', None),
                parallel_slots=getattr(r, 'parallel_slots', None),
                rope_freq_base=getattr(r, 'rope_freq_base', None),
                rope_freq_scale=getattr(r, 'rope_freq_scale', None),
                flash_attention=getattr(r, 'flash_attention', None),
                mlock=getattr(r, 'mlock', None),
                no_mmap=getattr(r, 'no_mmap', None),
                numa_policy=getattr(r, 'numa_policy', None),
                split_mode=getattr(r, 'split_mode', None),
                cache_type_k=getattr(r, 'cache_type_k', None),
                cache_type_v=getattr(r, 'cache_type_v', None),
                # vLLM advanced engine args (Gap #4)
                attention_backend=getattr(r, 'attention_backend', None),
                disable_log_requests=getattr(r, 'disable_log_requests', None),
                disable_log_stats=getattr(r, 'disable_log_stats', None),
                gguf_weight_format=getattr(r, 'gguf_weight_format', None),
                vllm_v1_enabled=getattr(r, 'vllm_v1_enabled', None),
                # Version-aware entrypoint (Gap #5)
                entrypoint_override=getattr(r, 'entrypoint_override', None),
                # Debug logging configuration (Gap #11)
                debug_logging=getattr(r, 'debug_logging', None),
                trace_mode=getattr(r, 'trace_mode', None),
                # Request timeout configuration (Gap #13)
                engine_request_timeout=getattr(r, 'engine_request_timeout', None),
                max_log_len=getattr(r, 'max_log_len', None),
                # Request defaults (Plane C - Phase 1)
                request_defaults_json=getattr(r, 'request_defaults_json', None),
                request_timeout_sec=getattr(r, 'request_timeout_sec', None),
                stream_timeout_sec=getattr(r, 'stream_timeout_sec', None),
                # Custom startup args (Plane B - Phase 2)
                engine_startup_args_json=getattr(r, 'engine_startup_args_json', None),
                engine_startup_env_json=getattr(r, 'engine_startup_env_json', None),
                # Speculative decoding for llama.cpp (Gap #6)
                draft_model_path=getattr(r, 'draft_model_path', None),
                draft_n=getattr(r, 'draft_n', None),
                draft_p_min=getattr(r, 'draft_p_min', None),
                # Startup timeout configuration (Gap #2)
                startup_timeout_sec=getattr(r, 'startup_timeout_sec', None),
                # Logging configuration (Gap #3)
                verbose_logging=getattr(r, 'verbose_logging', None),
                # Startup options (Gap #6)
                check_tensors=getattr(r, 'check_tensors', None),
                skip_warmup=getattr(r, 'skip_warmup', None),
                # Chat template options (Gap #7)
                chat_template=getattr(r, 'chat_template', None),
                chat_template_file=getattr(r, 'chat_template_file', None),
                jinja_enabled=getattr(r, 'jinja_enabled', None),
                # Memory management (Gap #8)
                defrag_thold=getattr(r, 'defrag_thold', None),
                # LoRA adapter support (Gap #10)
                lora_adapters_json=getattr(r, 'lora_adapters_json', None),
                lora_init_without_apply=getattr(r, 'lora_init_without_apply', None),
                # Grammar support (Gap #11)
                grammar_file=getattr(r, 'grammar_file', None),
                # Embedding mode (Gap #13)
                enable_embeddings=getattr(r, 'enable_embeddings', None),
                # System prompt (Gap #14)
                system_prompt=getattr(r, 'system_prompt', None),
                # Continuous batching (Gap #15)
                cont_batching=getattr(r, 'cont_batching', None),
                state=r.state,
                archived=bool(getattr(r, 'archived', False)),
                port=r.port,
                container_name=r.container_name,
            ) for r in rows
        ]

@router.post("/models")
async def create_model(body: CreateModelRequest, _: dict = Depends(require_admin)):
    # Persist only; container creation will be added in next step
    if body.mode not in ("online", "offline"):
        raise HTTPException(status_code=400, detail="invalid_mode")
    if body.mode == "online" and not body.repo_id:
        raise HTTPException(status_code=400, detail="repo_id_required")
    if body.mode == "offline" and not body.local_path:
        raise HTTPException(status_code=400, detail="local_path_required")
    
    # Validate GGUF tokenizer availability in offline mode
    # This catches the common issue where users specify a HuggingFace tokenizer 
    # for GGUF models in offline mode, which will fail at container start time
    if body.mode == "offline" and body.engine_type == "vllm":
        is_gguf = body.local_path and str(body.local_path).lower().endswith('.gguf')
        if is_gguf and body.tokenizer:
            tokenizer = str(body.tokenizer).strip()
            # Check if tokenizer looks like a HuggingFace repo ID (contains "/")
            # and not a local path (doesn't start with "/" or "./" or contain "\\")
            is_hf_tokenizer = (
                "/" in tokenizer and 
                not tokenizer.startswith("/") and 
                not tokenizer.startswith("./") and
                "\\" not in tokenizer
            )
            if is_hf_tokenizer:
                # In offline mode with HF tokenizer, check if it's in HF cache
                from ..config import get_settings
                settings = get_settings()
                hf_cache = settings.HF_CACHE_DIR or "/var/cortex/hf-cache"
                
                # HuggingFace cache stores repos as models--org--repo format
                cache_folder_name = f"models--{tokenizer.replace('/', '--')}"
                tokenizer_cache_path = os.path.join(hf_cache, "hub", cache_folder_name)
                
                if not os.path.isdir(tokenizer_cache_path):
                    # Tokenizer not cached - provide actionable error
                    raise HTTPException(
                        status_code=400, 
                        detail=f"gguf_tokenizer_not_cached: The tokenizer '{tokenizer}' is not available in "
                               f"the HuggingFace cache. In offline mode, vLLM cannot download tokenizers. "
                               f"Options: 1) Use hf_config_path to point to a local directory containing "
                               f"tokenizer files (tokenizer.json, tokenizer_config.json, etc.). "
                               f"2) Pre-cache the tokenizer by running 'huggingface-cli download {tokenizer}' "
                               f"while online, then restart the model."
                    )
    
    # Engine-specific validation
    if body.engine_type == "llamacpp":
        if body.mode != "offline":
            raise HTTPException(status_code=400, detail="llamacpp requires offline mode")
        if not body.local_path:
            raise HTTPException(status_code=400, detail="llamacpp requires local_path")
        # Clear vLLM-specific fields for llamacpp models (keep database clean)
        body.tp_size = None
        body.gpu_memory_utilization = None
        body.kv_cache_dtype = None
        body.quantization = None
        body.block_size = None
        body.swap_space_gb = None
        body.max_num_batched_tokens = None
        body.enable_prefix_caching = None
        body.prefix_caching_hash_algo = None
        body.enable_chunked_prefill = None
        body.max_num_seqs = None
        body.cuda_graph_sizes = None
        body.pipeline_parallel_size = None
        body.cpu_offload_gb = None
    else:  # vllm
        # Clear llama.cpp-specific fields for vLLM models
        body.ngl = None
        body.tensor_split = None
        body.batch_size = None
        body.threads = None
        body.context_size = None
        body.rope_freq_base = None
        body.rope_freq_scale = None
        body.flash_attention = None
        body.mlock = None
        body.no_mmap = None
        body.numa_policy = None
        body.split_mode = None
    
    # Build request_defaults_json from sampling parameters + custom JSON (Phase 1 & 3)
    # These are request-time defaults, not container startup parameters
    request_defaults = {}
    
    # Start with standard sampling params
    if body.temperature is not None:
        request_defaults["temperature"] = body.temperature
    if body.top_p is not None:
        request_defaults["top_p"] = body.top_p
    if body.top_k is not None:
        request_defaults["top_k"] = body.top_k
    if body.repetition_penalty is not None:
        request_defaults["repetition_penalty"] = body.repetition_penalty
    if body.frequency_penalty is not None:
        request_defaults["frequency_penalty"] = body.frequency_penalty
    if body.presence_penalty is not None:
        request_defaults["presence_penalty"] = body.presence_penalty
    
    # Merge custom request extensions (vllm_xargs, custom fields, etc.)
    if body.custom_request_json:
        try:
            custom_fields = json.loads(body.custom_request_json)
            if isinstance(custom_fields, dict):
                request_defaults.update(custom_fields)
        except json.JSONDecodeError:
            # Invalid JSON - log warning but don't fail model creation
            logger.warning(f"Invalid custom_request_json for model {body.name}: {body.custom_request_json}")
    
    request_defaults_json = json.dumps(request_defaults) if request_defaults else None
    
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        m = Model(
            name=body.name,
            served_model_name=body.served_model_name,
            repo_id=body.repo_id,
            local_path=body.local_path,
            task=body.task,
            dtype=body.dtype,
            tp_size=body.tp_size,
            gpu_memory_utilization=body.gpu_memory_utilization,
            max_model_len=body.max_model_len,
            kv_cache_dtype=body.kv_cache_dtype,
            max_num_batched_tokens=body.max_num_batched_tokens,
            quantization=body.quantization,
            block_size=body.block_size,
            swap_space_gb=body.swap_space_gb,
            enforce_eager=body.enforce_eager,
            trust_remote_code=body.trust_remote_code,
            cpu_offload_gb=body.cpu_offload_gb,
            enable_prefix_caching=body.enable_prefix_caching,
            prefix_caching_hash_algo=body.prefix_caching_hash_algo,
            enable_chunked_prefill=body.enable_chunked_prefill,
            max_num_seqs=body.max_num_seqs,
            cuda_graph_sizes=body.cuda_graph_sizes,
            pipeline_parallel_size=body.pipeline_parallel_size,
            device=body.device,
            tokenizer=body.tokenizer,
            hf_config_path=body.hf_config_path,
            hf_token=body.hf_token,
            engine_type=body.engine_type,
            engine_image=getattr(body, 'engine_image', None),
            engine_version=getattr(body, 'engine_version', None),
            engine_digest=getattr(body, 'engine_digest', None),
            selected_gpus=json.dumps(body.selected_gpus) if body.selected_gpus else None,
            ngl=body.ngl,
            tensor_split=body.tensor_split,
            batch_size=body.batch_size,
            ubatch_size=body.ubatch_size,
            threads=body.threads,
            context_size=body.context_size,
            parallel_slots=body.parallel_slots,
            rope_freq_base=body.rope_freq_base,
            rope_freq_scale=body.rope_freq_scale,
            flash_attention=body.flash_attention,
            mlock=body.mlock,
            no_mmap=body.no_mmap,
            numa_policy=body.numa_policy,
            split_mode=body.split_mode,
            cache_type_k=body.cache_type_k,
            cache_type_v=body.cache_type_v,
            # vLLM advanced engine args (Gap #4)
            attention_backend=getattr(body, 'attention_backend', None),
            disable_log_requests=getattr(body, 'disable_log_requests', None),
            disable_log_stats=getattr(body, 'disable_log_stats', None),
            gguf_weight_format=getattr(body, 'gguf_weight_format', None),
            vllm_v1_enabled=getattr(body, 'vllm_v1_enabled', None),
            # Version-aware entrypoint (Gap #5)
            entrypoint_override=getattr(body, 'entrypoint_override', None),
            # Debug logging configuration (Gap #11)
            debug_logging=getattr(body, 'debug_logging', None),
            trace_mode=getattr(body, 'trace_mode', None),
            # Request timeout configuration (Gap #13)
            engine_request_timeout=getattr(body, 'engine_request_timeout', None),
            max_log_len=getattr(body, 'max_log_len', None),
            # Keep old columns for backward compat (Phase 1)
            repetition_penalty=body.repetition_penalty,
            frequency_penalty=body.frequency_penalty,
            presence_penalty=body.presence_penalty,
            temperature=body.temperature,
            top_k=body.top_k,
            top_p=body.top_p,
            # New: request_defaults_json (Plane C)
            request_defaults_json=request_defaults_json,
            # Custom startup args (Plane B - Phase 2)
            engine_startup_args_json=getattr(body, 'engine_startup_args_json', None),
            engine_startup_env_json=getattr(body, 'engine_startup_env_json', None),
            # Speculative decoding for llama.cpp (Gap #6)
            draft_model_path=getattr(body, 'draft_model_path', None),
            draft_n=getattr(body, 'draft_n', None),
            draft_p_min=getattr(body, 'draft_p_min', None),
            # Startup timeout configuration (Gap #2)
            startup_timeout_sec=getattr(body, 'startup_timeout_sec', None),
            # Logging configuration (Gap #3)
            verbose_logging=getattr(body, 'verbose_logging', None),
            # Startup options (Gap #6)
            check_tensors=getattr(body, 'check_tensors', None),
            skip_warmup=getattr(body, 'skip_warmup', None),
            # Chat template options (Gap #7)
            chat_template=getattr(body, 'chat_template', None),
            chat_template_file=getattr(body, 'chat_template_file', None),
            jinja_enabled=getattr(body, 'jinja_enabled', None),
            # Memory management (Gap #8)
            defrag_thold=getattr(body, 'defrag_thold', None),
            # LoRA adapter support (Gap #10)
            lora_adapters_json=getattr(body, 'lora_adapters_json', None),
            lora_init_without_apply=getattr(body, 'lora_init_without_apply', None),
            # Grammar support (Gap #11)
            grammar_file=getattr(body, 'grammar_file', None),
            # Embedding mode (Gap #13)
            enable_embeddings=getattr(body, 'enable_embeddings', None),
            # System prompt (Gap #14)
            system_prompt=getattr(body, 'system_prompt', None),
            # Continuous batching (Gap #15)
            cont_batching=getattr(body, 'cont_batching', None),
            state="stopped",
        )
        session.add(m)
        await session.commit()
        return {"id": m.id}

@router.patch("/models/{model_id}")
async def update_model(model_id: int, body: UpdateModelRequest, _: dict = Depends(require_admin)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        # Validation: If switching to GGUF path, ensure tokenizer is present and warn on multiple tokenizers (best-effort handled on UI via inspect)
        try:
            new_vals = body.dict(exclude_unset=True)
            local_path = str(getattr(m, 'local_path', '') or '')
            # Note: local_path is immutable post-create in UI, but we guard for completeness
            if local_path.lower().endswith('.gguf'):
                tok = new_vals.get('tokenizer', getattr(m, 'tokenizer', None))
                if not tok:
                    raise HTTPException(status_code=400, detail="tokenizer_required_for_gguf")
        except HTTPException:
            raise
        except Exception:
            pass
        # apply changes if provided (including optional hf_token)
        update_data = body.dict(exclude_unset=True)
        
        # Build request_defaults_json from sampling parameters + custom JSON (Phase 1 & 3)
        sampling_fields = ['temperature', 'top_p', 'top_k', 'repetition_penalty', 'frequency_penalty', 'presence_penalty']
        if any(field in update_data for field in sampling_fields) or 'custom_request_json' in update_data:
            # Rebuild request_defaults_json with new values
            request_defaults = {}
            for field in sampling_fields:
                value = update_data.get(field) if field in update_data else getattr(m, field, None)
                if value is not None:
                    request_defaults[field] = value
            
            # Merge custom request extensions
            custom_json = update_data.get('custom_request_json') if 'custom_request_json' in update_data else None
            if custom_json:
                try:
                    custom_fields = json.loads(custom_json)
                    if isinstance(custom_fields, dict):
                        request_defaults.update(custom_fields)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid custom_request_json for model {model_id}")
            
            # Remove custom_request_json from update_data (it's not a real column, just a helper)
            update_data.pop('custom_request_json', None)
            
            # Set the merged result
            update_data['request_defaults_json'] = json.dumps(request_defaults) if request_defaults else None
        
        # Handle selected_gpus serialization
        if 'selected_gpus' in update_data and update_data['selected_gpus'] is not None:
            update_data['selected_gpus'] = json.dumps(update_data['selected_gpus'])
        
        # Apply updates if any fields to update
        if update_data:
            for field, value in update_data.items():
                setattr(m, field, value)
            from sqlalchemy import update as _update
            await session.execute(_update(Model).where(Model.id == model_id).values(**update_data))
            await session.commit()
        
        return {"status": "ok"}

@router.post("/models/{model_id}/archive")
async def archive_model(model_id: int, _: dict = Depends(require_admin)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        await session.execute(update(Model).where(Model.id == model_id).values(archived=True))
        await session.commit()
        return {"status": "archived"}

@router.delete("/models/{model_id}")
async def delete_model(model_id: int, _: dict = Depends(require_admin)):
    """Delete model database record only. Model files are NEVER deleted from disk.
    
    This removes the model from Cortex's management but preserves all model files
    in the offline models directory. This is critical for manually-placed models
    that may be difficult or impossible to re-download in offline/air-gapped environments.
    
    To remove a model configuration:
    - The database record is deleted
    - Associated recipes are also deleted (cascade)
    - The container is stopped (if running)
    - Model files remain on disk untouched
    
    Administrators must manually delete model files from the filesystem if desired.
    """
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        # Ensure container is stopped and deregistered
        try:
            stop_container_for_model(m)
        except Exception:
            pass
        try:
            if m.served_model_name:
                unregister_model_endpoint(m.served_model_name)
        except Exception:
            pass
        # Delete associated recipes first to avoid foreign key constraint violations
        recipes_deleted = 0
        try:
            from ..models import Recipe
            result = await session.execute(delete(Recipe).where(Recipe.model_id == model_id))
            recipes_deleted = result.rowcount if hasattr(result, 'rowcount') else 0
        except Exception:
            # Best effort - continue with model deletion even if recipe deletion fails
            pass
        # Delete database record only - NEVER delete model files from disk
        # This protects manually-placed offline models from accidental deletion
        await session.execute(delete(Model).where(Model.id == model_id))
        await session.commit()
        msg = "Model files remain on disk - delete manually if needed"
        if recipes_deleted > 0:
            msg = f"{recipes_deleted} associated recipe(s) also deleted. " + msg
        return {"status": "deleted", "files_preserved": True, "recipes_deleted": recipes_deleted, "note": msg}

def _handle_multipart_gguf_merge(m: Model) -> None:
    """
    Detect if model uses a multi-part GGUF file and merge if necessary.
    Updates model.local_path to point to merged file if merge occurs.
    
    This runs automatically when starting a model that references a multi-part GGUF.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    if not m.local_path or not m.local_path.lower().endswith('.gguf'):
        return  # Not a GGUF file
    
    # Check if the path matches multi-part pattern
    filename = os.path.basename(m.local_path)
    multipart_match = re.match(r'(.+)-(\d{5})-of-(\d{5})\.gguf$', filename, re.IGNORECASE)
    
    if not multipart_match:
        return  # Not a multi-part file
    
    logger.info(f"Detected multi-part GGUF file: {m.local_path}")

    # New strategy: do NOT attempt to merge. Point to the first split file and
    # rely on llama.cpp to auto-detect and load remaining parts.
    
    # Parse the pattern
    base_name = multipart_match.group(1)
    total_parts = int(multipart_match.group(3))
    
    # Get directory paths
    s = get_settings()
    base_dir = s.CORTEX_MODELS_DIR or "/var/cortex/models"
    
    # Construct full path
    model_folder = os.path.dirname(m.local_path)
    target_dir = os.path.join(base_dir, model_folder)
    
    # Legacy cleanup: warn if old concatenated merged-*.gguf files exist
    try:
        legacy_merged = [n for n in os.listdir(target_dir) if n.lower().endswith('.gguf') and n.startswith('merged-')]
        if legacy_merged:
            logger.warning(
                "Detected legacy merged GGUF files in %s: %s (will ignore and use split parts)",
                target_dir,
                ", ".join(sorted(legacy_merged))
            )
    except Exception:
        pass

    # Resolve first part path
    first_part_filename = f"{base_name}-00001-of-{total_parts:05d}.gguf"
    first_part_path = os.path.join(target_dir, first_part_filename)

    if not os.path.exists(first_part_path):
        raise Exception(f"First GGUF part not found: {first_part_filename}")

    # Best-effort: ensure all expected parts exist before starting (fast check)
    missing = []
    for i in range(1, total_parts + 1):
        part_filename = f"{base_name}-{i:05d}-of-{total_parts:05d}.gguf"
        if not os.path.exists(os.path.join(target_dir, part_filename)):
            missing.append(part_filename)
    if missing:
        raise Exception(f"Incomplete multi-part GGUF: missing {len(missing)} parts; e.g. {missing[:3]}")

    # Update model to use the first part; llama.cpp will load the rest
    m.local_path = os.path.join(model_folder, first_part_filename)
    logger.info(
        "Using multi-part GGUF without merge; selected first part: %s",
        m.local_path,
    )


@router.post("/models/{model_id}/start")
async def start_model(model_id: int, _: dict = Depends(require_admin)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        try:
            # Pre-flight validation: check path exists before container creation
            if m.local_path and m.engine_type != 'llamacpp':
                # For vLLM, validate path exists
                from ..config import get_settings
                settings = get_settings()
                host_path = os.path.join(settings.CORTEX_MODELS_DIR, m.local_path)
                if not os.path.exists(host_path):
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Model path not found: {m.local_path}\n"
                            f"Checked: {host_path}\n"
                            f"Models directory: {settings.CORTEX_MODELS_DIR}\n"
                            f"Please verify the path exists and try again."
                        )
                    )
            
            # Auto-merge multi-part GGUF files if needed
            _handle_multipart_gguf_merge(m)
            
            # If merge occurred, persist the updated local_path
            if m.local_path:
                await session.execute(update(Model).where(Model.id == model_id).values(local_path=m.local_path))
                await session.commit()
            
            name, host_port = start_container_for_model(m, hf_token=getattr(m, 'hf_token', None))
            # Initially set to "loading" state - we'll verify actual health below
            await session.execute(update(Model).where(Model.id == model_id).values(state="loading", container_name=name, port=host_port))
            await session.commit()
            
            # Phase 3: Progressive startup verification with health polling
            # This handles both immediate container failures AND slow model loading
            # Gap #2: Configurable startup timeout
            import asyncio
            import docker
            import urllib.request
            
            client = docker.from_env()
            container = client.containers.get(name)
            
            # Get startup timeout from model or config defaults
            from ..config import get_settings
            settings = get_settings()
            engine_type = getattr(m, 'engine_type', 'vllm')
            default_timeout = settings.LLAMACPP_STARTUP_TIMEOUT if engine_type == 'llamacpp' else settings.VLLM_STARTUP_TIMEOUT
            startup_timeout = getattr(m, 'startup_timeout_sec', None) or default_timeout
            
            # Quick check for immediate container death (e.g., invalid args, missing model)
            # Poll every 0.5s for the first 5 seconds
            for i in range(10):
                await asyncio.sleep(0.5)
                try:
                    container.reload()
                    if container.status not in ('running', 'created', 'restarting'):
                        # Container exited - immediate failure
                        await session.execute(update(Model).where(Model.id == model_id).values(state="failed"))
                        await session.commit()
                        logger.warning(f"Model {model_id} container {name} exited with status: {container.status}")
                        return {"status": "failed", "container": name, "port": host_port, "error": f"Container exited: {container.status}"}
                except docker.errors.NotFound:
                    await session.execute(update(Model).where(Model.id == model_id).values(state="failed"))
                    await session.commit()
                    return {"status": "failed", "container": name, "port": host_port, "error": "Container not found"}
                except Exception as e:
                    logger.debug(f"Startup check iteration {i}: {e}")
            
            # Container is running - now check if health endpoint responds
            # Use configurable timeout for initial health polling (Gap #2)
            # Poll every 2 seconds, up to a reasonable initial check period (30 seconds)
            # The full startup_timeout is handled by Docker's healthcheck StartPeriod
            health_url = f"http://{name}:8000/health"
            is_ready = False
            initial_poll_duration = min(30, startup_timeout)  # Poll for up to 30s initially
            poll_attempts = initial_poll_duration // 2  # Every 2 seconds
            
            for attempt in range(poll_attempts):
                try:
                    req = urllib.request.Request(health_url, method='GET')
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        if resp.status == 200:
                            is_ready = True
                            break
                        elif resp.status == 503:
                            # 503 during startup usually means model is still loading
                            # Only treat as failed if we've exhausted all attempts
                            # vLLM returns 503 while loading, this is normal
                            logger.debug(f"Model {model_id} health check returned 503 (attempt {attempt+1}/{poll_attempts}) - still loading")
                except urllib.error.HTTPError as e:
                    if e.code == 503:
                        # 503 is expected during model loading - don't fail immediately
                        logger.debug(f"Model {model_id} health check HTTPError 503 (attempt {attempt+1}/{poll_attempts}) - still loading")
                except Exception as poll_err:
                    # Health endpoint not ready yet - expected during loading
                    logger.debug(f"Model {model_id} health check error (attempt {attempt+1}/{poll_attempts}): {poll_err}")
                await asyncio.sleep(2)
            
            # Update state based on health check result
            if is_ready:
                await session.execute(update(Model).where(Model.id == model_id).values(state="running"))
                await session.commit()
            else:
                # Model still loading - leave in "loading" state
                # Note: For large models, this is normal - they may take 10+ minutes
                # The frontend should poll readiness endpoint to track actual ready state
                # Docker healthcheck will continue monitoring with StartPeriod = startup_timeout
                logger.info(f"Model {model_id} container started but not yet ready - still loading (timeout: {startup_timeout}s)")
            
            # Register served name → URL so gateway can route by model
            # Include request defaults and engine type for Plane C (Phase 1)
            try:
                if m.served_model_name and host_port:
                    # Determine correct URL based on gateway network mode:
                    # - If gateway is on host network, use localhost:host_port
                    # - If gateway is on docker bridge, use container_name:8000
                    # Check if we can resolve the container name (docker bridge)
                    # or fall back to localhost (host network)
                    import socket
                    try:
                        socket.gethostbyname(name)
                        # Container name resolves - we're on the same Docker network
                        model_url = f"http://{name}:8000"
                    except socket.gaierror:
                        # Container name doesn't resolve - gateway is on host network
                        # Use localhost with the host-mapped port
                        model_url = f"http://127.0.0.1:{host_port}"
                        logger.info(f"Model {model_id}: Using host network URL {model_url} (container name not resolvable)")
                    
                    register_model_endpoint(
                        m.served_model_name, 
                        model_url, 
                        m.task or "generate",
                        engine_type=getattr(m, 'engine_type', 'vllm'),
                        request_defaults_json=getattr(m, 'request_defaults_json', None),
                        vllm_v1_enabled=getattr(m, 'vllm_v1_enabled', None),
                    )
                    # Persist registry after register
                    await persist_model_registry()
            except Exception:
                pass
            return {"status": "running", "container": name, "port": host_port}
        except OfflineImageUnavailableError as e:
            await session.execute(update(Model).where(Model.id == model_id).values(state="failed"))
            await session.commit()
            # Make this actionable for the UI/user; this often indicates "image not cached and no internet"
            raise HTTPException(status_code=503, detail=str(e))
        except ValueError as e:
            # Path validation errors - provide actionable feedback
            await session.execute(update(Model).where(Model.id == model_id).values(state="failed"))
            await session.commit()
            logger.error(f"Model {model_id} path validation failed: {e}")
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            await session.execute(update(Model).where(Model.id == model_id).values(state="failed"))
            await session.commit()
            # Capture full exception details for debugging
            import traceback
            error_detail = f"start_failed: {str(e)}\n\nFull error:\n{traceback.format_exc()}"
            logger.error(f"Model {model_id} startup failed: {error_detail}")
            raise HTTPException(status_code=500, detail=f"start_failed: {str(e)}")

@router.post("/models/{model_id}/stop")
async def stop_model(model_id: int, _: dict = Depends(require_admin)):
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        try:
            stop_container_for_model(m)
        except Exception:
            pass
        await session.execute(update(Model).where(Model.id == model_id).values(state="stopped"))
        try:
            if m.served_model_name:
                unregister_model_endpoint(m.served_model_name)
                # Persist registry after unregister
                await persist_model_registry()
        except Exception:
            pass
        await session.commit()
    return {"status": "stopped"}

@router.get("/models/{model_id}/logs")
async def model_logs(model_id: int, diagnose: bool = False, _: dict = Depends(require_admin)):
    """Get container logs with optional startup failure diagnosis.
    
    Args:
        model_id: Model ID
        diagnose: If true, include startup failure diagnosis
        
    Returns:
        If diagnose=false: Plain text logs (backward compat)
        If diagnose=true: JSON with logs, diagnosis, and summary
    """
    SessionLocal = _get_session()
    if SessionLocal is None:
        return "" if not diagnose else {"logs": "", "diagnosis": None}
    
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        
        logs = tail_logs_for_model(m)
        
        # Backward compat: return plain text if not diagnosing
        if not diagnose:
            return logs
        
        # Phase 3: Return enhanced response with diagnosis
        from ..services.startup_diagnostics import diagnose_startup_failure, extract_startup_summary
        
        diagnosis = None
        summary = None
        
        # Only diagnose if model is in failed state or logs suggest error
        if m.state == "failed" or "ERROR" in logs.upper() or "failed" in logs.lower():
            diagnosis = diagnose_startup_failure(logs)
        
        # Always extract summary stats if model loaded
        if "Model loading took" in logs:
            summary = extract_startup_summary(logs)
        
        return {
            "logs": logs,
            "diagnosis": diagnosis.dict() if diagnosis else None,
            "summary": summary,
            "state": m.state,
        }

@router.post("/models/{model_id}/apply")
async def apply_model_changes(model_id: int, _: dict = Depends(require_admin)):
    """Minimal apply: stop then start container to pick up updated flags."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="not_found")
        try:
            stop_container_for_model(m)
        except Exception:
            pass
        name, host_port = start_container_for_model(m, hf_token=getattr(m, 'hf_token', None))
        await session.execute(update(Model).where(Model.id == model_id).values(state="running", container_name=name, port=host_port))
        await session.commit()
        try:
            if m.served_model_name and host_port:
                register_model_endpoint(
                    m.served_model_name, 
                    f"http://{name}:8000", 
                    m.task or "generate",
                    engine_type=getattr(m, 'engine_type', 'vllm'),
                    request_defaults_json=getattr(m, 'request_defaults_json', None),
                    vllm_v1_enabled=getattr(m, 'vllm_v1_enabled', None),
                )
                # Persist registry after register
                await persist_model_registry()
        except Exception:
            pass
        return {"status": "applied", "container": name, "port": host_port}

@router.post("/models/{model_id}/dry-run")
async def model_dry_run(model_id: int, _: dict = Depends(require_admin)):
    """Validate config and return effective command (Phase 3 enhanced).
    
    Now includes:
    - VRAM estimation
    - Custom args validation
    - Configuration warnings
    """
    from ..services.config_validator import dry_run_validation
    
    result = await dry_run_validation(model_id)
    
    # Format command for display
    cmd_str = ""
    if result.command_preview:
        cmd_str = " ".join(result.command_preview)
    
    return {
        "command": result.command_preview or [],
        "command_str": cmd_str,
        "valid": result.valid,
        "warnings": [w.dict() for w in result.warnings],
        "vram_estimate": result.vram_estimate,
    }

# Base directory config endpoints (persist temporarily in memory env)
_BASE_DIR: Optional[str] = None

@router.get("/models/base-dir", response_model=BaseDirCfg)
async def get_base_dir(_: dict = Depends(require_admin)):
    global _BASE_DIR
    if _BASE_DIR is not None:
        return BaseDirCfg(base_dir=_BASE_DIR)
    SessionLocal = _get_session()
    if SessionLocal is None:
        # fallback to host-visible default for UI display
        s = get_settings()
        return BaseDirCfg(base_dir=s.CORTEX_MODELS_DIR_HOST or s.CORTEX_MODELS_DIR)
    async with SessionLocal() as session:
        res = await session.execute(select(ConfigKV).where(ConfigKV.key == "models_base_dir"))
        row = res.scalar_one_or_none()
        if row:
            _BASE_DIR = row.value
        else:
            s = get_settings()
            _BASE_DIR = s.CORTEX_MODELS_DIR_HOST or s.CORTEX_MODELS_DIR
        return BaseDirCfg(base_dir=_BASE_DIR)

@router.put("/models/base-dir")
async def put_base_dir(body: BaseDirCfg, _: dict = Depends(require_admin)):
    import os
    if not body.base_dir:
        raise HTTPException(status_code=400, detail="base_dir_required")
    if not os.path.isabs(body.base_dir):
        raise HTTPException(status_code=400, detail="base_dir_must_be_absolute")
    global _BASE_DIR
    _BASE_DIR = body.base_dir
    SessionLocal = _get_session()
    if SessionLocal is None:
        return {"status": "ok"}
    async with SessionLocal() as session:
        res = await session.execute(select(ConfigKV).where(ConfigKV.key == "models_base_dir"))
        row = res.scalar_one_or_none()
        if row:
            row.value = body.base_dir
        else:
            session.add(ConfigKV(key="models_base_dir", value=body.base_dir))
        await session.commit()
        return {"status": "ok"}

@router.get("/models/local-folders", response_model=List[str])
async def list_local_folders(base: str = Query(""), _: dict = Depends(require_admin)):
    import os
    s = get_settings()
    if not base:
        base = _BASE_DIR or ""
    if not base:
        return []
    # Map host path to container mount if user provided host path on Windows/macOS
    try:
        norm = base.replace("\\", "/").lower()
        host = (s.CORTEX_MODELS_DIR_HOST or "").replace("\\", "/").lower()
        if host and norm.startswith(host):
            base = s.CORTEX_MODELS_DIR
    except Exception:
        pass
    try:
        # Whitelist: only list direct subfolders
        items: list[str] = []
        for name in sorted(os.listdir(base)):
            full = os.path.join(base, name)
            if os.path.isdir(full):
                items.append(name)
        return items
    except Exception:
        return []


# Legacy merge functions removed - we now use llama.cpp's native split-file loading
# See docs/models/gguf-multipart.md for details on the new approach


@router.get("/models/inspect-folder", response_model=InspectFolderResp)
async def inspect_folder(base: str = Query(""), folder: str = Query(""), _: dict = Depends(require_admin)):
    """Inspect a direct subfolder of the models base dir.
    Returns presence of safetensors, list of .gguf files, tokenizer/config files and warnings.
    """
    import os
    s = get_settings()
    if not base:
        base = _BASE_DIR or ""
    if not base:
        raise HTTPException(status_code=400, detail="base_required")
    # Map host path to container mount if needed (Windows/macOS dev)
    try:
        norm = base.replace("\\", "/").lower()
        host = (s.CORTEX_MODELS_DIR_HOST or "").replace("\\", "/").lower()
        if host and norm.startswith(host):
            base = s.CORTEX_MODELS_DIR
    except Exception:
        pass
    target = os.path.join(base, folder or "")
    if not os.path.isdir(target):
        raise HTTPException(status_code=404, detail="folder_not_found")
    
    # Delegate to inspection service
    return inspect_model_folder(target)


@router.get("/models/hf-config", response_model=HfConfigResp)
async def hf_config(repo_id: str = Query("")):
    """Fetch HuggingFace model config.json and extract architecture info."""
    if not repo_id:
        raise HTTPException(status_code=400, detail="repo_id_required")
    
    # Delegate to HF inspection service
    return await fetch_hf_config(repo_id)


@router.post("/models/{model_id}/test", response_model=ModelTestResult)
async def test_model(model_id: int, _: dict = Depends(require_admin)):
    """Send a sanity check request to a running model to verify it's working.
    
    - For chat models: Sends 'Hello' message
    - For embedding models: Sends 'test' text
    - Returns full request/response with timing metrics
    """
    SessionLocal = _get_session()
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="database_unavailable")
    
    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="model_not_found")
        
        if m.state != "running":
            raise HTTPException(status_code=400, detail=f"Model is not running (current state: {m.state})")
        
        if not m.container_name:
            raise HTTPException(status_code=400, detail="No container name found for model")
        
        # Get model URL (prefer container name for internal routing)
        registry = _get_registry()
        model_entry = registry.get(m.served_model_name, {})
        base_url = model_entry.get("url") or f"http://{m.container_name}:8000"
        
        # Determine test type from task field
        test_type = "embeddings" if m.task and m.task.lower().startswith("embed") else "chat"
        
        start_time = time.time()
        result_data = {}
        
        try:
            settings = get_settings()
            if test_type == "embeddings":
                result_data = await test_embedding_model(base_url, m.served_model_name, settings.INTERNAL_VLLM_API_KEY)
            else:
                result_data = await test_chat_model(base_url, m.served_model_name, settings.INTERNAL_VLLM_API_KEY)
            
            latency_ms = int((time.time() - start_time) * 1000)
            
            return ModelTestResult(
                success=True,
                test_type=test_type,
                request=result_data["request"],
                response=result_data["response"],
                error=None,
                latency_ms=latency_ms,
                timestamp=time.time()
            )
            
        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            return ModelTestResult(
                success=False,
                test_type=test_type,
                request=result_data.get("request", {}) if result_data else {},
                response=None,
                error=str(e)[:500],  # Limit error message length
                latency_ms=latency_ms,
                timestamp=time.time()
            )


@router.get("/models/{model_id}/readiness", response_model=ReadinessResp)
async def model_readiness(model_id: int, _: dict = Depends(require_admin)):
    """Check whether a model is ready to serve requests."""
    SessionLocal = _get_session()
    if SessionLocal is None:
        return ReadinessResp(status="error", detail="database_unavailable")

    async with SessionLocal() as session:
        res = await session.execute(select(Model).where(Model.id == model_id))
        m = res.scalar_one_or_none()
        if not m:
            return ReadinessResp(status="error", detail="model_not_found")
        if m.state == "stopped":
            return ReadinessResp(status="stopped")
        if m.state == "failed":
            return ReadinessResp(status="error", detail="model_failed")
        if m.state == "loading":
            # Model is loading - check actual container health
            if not m.container_name:
                return ReadinessResp(status="loading", detail="container_starting")
            
            # CRITICAL: Check if container is still running before checking health endpoint
            # This catches cases where container exited due to startup errors
            try:
                import docker
                cli = docker.from_env()
                container = cli.containers.get(m.container_name)
                container_status = container.status
                
                if container_status not in ('running', 'created', 'restarting'):
                    # Container exited - mark as failed
                    await session.execute(update(Model).where(Model.id == model_id).values(state="failed"))
                    await session.commit()
                    logger.warning(f"Model {model_id} container exited with status: {container_status}")
                    return ReadinessResp(status="error", detail=f"container_exited_{container_status}")
            except docker.errors.NotFound:
                # Container disappeared - mark as failed
                await session.execute(update(Model).where(Model.id == model_id).values(state="failed"))
                await session.commit()
                return ReadinessResp(status="error", detail="container_not_found")
            except Exception as e:
                logger.debug(f"Container status check for {m.container_name}: {e}")
            
            # Container exists and running, check if health endpoint responds
            # Pass host port for when gateway is on host network
            result = await check_model_readiness(m.container_name, m.served_model_name, host_port=m.port)
            if result.status == "ready":
                # Model is now ready - update state to running
                await session.execute(update(Model).where(Model.id == model_id).values(state="running"))
                await session.commit()
                return result
            # Still loading (or error)
            if result.status == "loading":
                return ReadinessResp(status="loading", detail=result.detail or "model_initializing")
            # For errors, check if it's a terminal error
            if result.status == "error" and "engine_dead" in (result.detail or ""):
                await session.execute(update(Model).where(Model.id == model_id).values(state="failed"))
                await session.commit()
                return result
            # For other errors, still return loading status (model might be initializing)
            return ReadinessResp(status="loading", detail="model_initializing")
        if m.state != "running":
            return ReadinessResp(status="error", detail=f"unknown_state_{m.state}")
        if not m.container_name:
            return ReadinessResp(status="error", detail="no_container")
        
        # Delegate to testing service (pass host port for host network mode)
        return await check_model_readiness(m.container_name, m.served_model_name, host_port=m.port)


"""engine spec: spec-driven model columns, signed sessions, recipe snapshots

Revision ID: 0002_engine_spec
Revises: 0001_baseline
Create Date: 2026-09-02

- models: add spec fields, drop obsolete engine flags (vLLM --swap-space, --gguf-weight-format,
  VLLM_USE_V1, --disable-log-requests; llama.cpp --defrag-thold, --system-prompt-file, --mlock/--no-mmap
  → --load-mode, flash_attention bool → flash_attn on/off/auto), fold legacy sampling columns into
  request_defaults_json, add state_reason, unique served_model_name.
- recipes: replaced by a snapshot table (identity + config_json).
"""
import json

from alembic import op
import sqlalchemy as sa

revision = "0002_engine_spec"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

OLD_RECIPE_CONFIG_COLUMNS = ['engine_image', 'engine_version', 'engine_digest', 'selected_gpus', 'dtype', 'tp_size', 'gpu_memory_utilization', 'max_model_len', 'kv_cache_dtype', 'max_num_batched_tokens', 'quantization', 'block_size', 'swap_space_gb', 'enforce_eager', 'trust_remote_code', 'cpu_offload_gb', 'enable_prefix_caching', 'prefix_caching_hash_algo', 'enable_chunked_prefill', 'max_num_seqs', 'cuda_graph_sizes', 'pipeline_parallel_size', 'device', 'tokenizer', 'hf_config_path', 'hf_token', 'ngl', 'tensor_split', 'batch_size', 'ubatch_size', 'threads', 'context_size', 'parallel_slots', 'rope_freq_base', 'rope_freq_scale', 'flash_attention', 'mlock', 'no_mmap', 'numa_policy', 'split_mode', 'cache_type_k', 'cache_type_v', 'attention_backend', 'disable_log_requests', 'disable_log_stats', 'vllm_v1_enabled', 'entrypoint_override', 'debug_logging', 'trace_mode', 'engine_request_timeout', 'max_log_len', 'repetition_penalty', 'frequency_penalty', 'presence_penalty', 'temperature', 'top_k', 'top_p', 'request_defaults_json', 'request_timeout_sec', 'stream_timeout_sec', 'engine_startup_args_json', 'engine_startup_env_json']
LEGACY_SAMPLING = ("temperature", "top_p", "top_k", "repetition_penalty", "frequency_penalty", "presence_penalty")


def upgrade() -> None:
    conn = op.get_bind()

    # --- models: new columns -------------------------------------------------
    op.add_column("models", sa.Column("seed", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("tokenizer_mode", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("load_format", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("hf_overrides_json", sa.Text(), nullable=True))
    op.add_column("models", sa.Column("data_parallel_size", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("enable_expert_parallel", sa.Boolean(), nullable=True))
    op.add_column("models", sa.Column("distributed_executor_backend", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("kv_cache_memory_bytes", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("compilation_config_json", sa.Text(), nullable=True))
    op.add_column("models", sa.Column("async_scheduling", sa.Boolean(), nullable=True))
    op.add_column("models", sa.Column("enable_sleep_mode", sa.Boolean(), nullable=True))
    op.add_column("models", sa.Column("generation_config", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("override_generation_config_json", sa.Text(), nullable=True))
    op.add_column("models", sa.Column("reasoning_parser", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("enable_auto_tool_choice", sa.Boolean(), nullable=True))
    op.add_column("models", sa.Column("tool_call_parser", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("structured_outputs_config_json", sa.Text(), nullable=True))
    op.add_column("models", sa.Column("limit_mm_per_prompt_json", sa.Text(), nullable=True))
    op.add_column("models", sa.Column("enable_lora", sa.Boolean(), nullable=True))
    op.add_column("models", sa.Column("lora_modules_json", sa.Text(), nullable=True))
    op.add_column("models", sa.Column("max_loras", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("max_lora_rank", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("max_cpu_loras", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("speculative_config_json", sa.Text(), nullable=True))
    op.add_column("models", sa.Column("enable_log_requests", sa.Boolean(), nullable=True))
    op.add_column("models", sa.Column("main_gpu", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("load_mode", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("kv_unified", sa.Boolean(), nullable=True))
    op.add_column("models", sa.Column("kv_unified_per_slot", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("fit_memory", sa.Boolean(), nullable=True))
    op.add_column("models", sa.Column("flash_attn", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("threads_http", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("cache_reuse", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("context_shift", sa.Boolean(), nullable=True))
    op.add_column("models", sa.Column("n_cpu_moe", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("override_tensor", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("chat_template_kwargs_json", sa.Text(), nullable=True))
    op.add_column("models", sa.Column("reasoning_format", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("reasoning_budget", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("n_predict", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("pooling", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("rerank", sa.Boolean(), nullable=True))
    op.add_column("models", sa.Column("spec_type", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("spec_draft_n_min", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("spec_draft_ngl", sa.Integer(), nullable=True))
    op.add_column("models", sa.Column("mmproj", sa.String(512), nullable=True))
    op.add_column("models", sa.Column("mmproj_offload", sa.Boolean(), nullable=True))
    op.add_column("models", sa.Column("state_reason", sa.Text(), nullable=True))

    # --- data migration ----------------------------------------------------
    rows = conn.execute(sa.text(
        "SELECT id, flash_attention, mlock, no_mmap, disable_log_requests, request_defaults_json, "
        "temperature, top_p, top_k, repetition_penalty, frequency_penalty, presence_penalty, served_model_name FROM models"
    )).mappings().all()
    seen_names: dict[str, int] = {}
    for r in rows:
        updates: dict[str, object] = {}
        if r["flash_attention"] is not None:
            updates["flash_attn"] = "on" if r["flash_attention"] else "off"
        if r["mlock"]:
            updates["load_mode"] = "mlock"
        elif r["no_mmap"]:
            updates["load_mode"] = "none"
        # legacy sampling columns → request_defaults_json (JSON wins where both exist)
        try:
            rd = json.loads(r["request_defaults_json"]) if r["request_defaults_json"] else {}
            if not isinstance(rd, dict):
                rd = {}
        except Exception:
            rd = {}
        changed = False
        for k in LEGACY_SAMPLING:
            if k not in rd and r[k] is not None:
                rd[k] = r[k]
                changed = True
        if changed:
            updates["request_defaults_json"] = json.dumps(rd)
        # served_model_name must be unique
        name = r["served_model_name"] or f"model-{r['id']}"
        if name in seen_names:
            updates["served_model_name"] = f"{name}-{r['id']}"
        seen_names[name] = r["id"]
        if updates:
            sets = ", ".join(f"{k} = :{k}" for k in updates)
            conn.execute(sa.text(f"UPDATE models SET {sets} WHERE id = :id"), {**updates, "id": r["id"]})

    # --- models: drop obsolete columns ------------------------------------
    op.drop_column("models", "swap_space_gb")
    op.drop_column("models", "flash_attention")
    op.drop_column("models", "mlock")
    op.drop_column("models", "no_mmap")
    op.drop_column("models", "disable_log_requests")
    op.drop_column("models", "vllm_v1_enabled")
    op.drop_column("models", "gguf_weight_format")
    op.drop_column("models", "repetition_penalty")
    op.drop_column("models", "frequency_penalty")
    op.drop_column("models", "presence_penalty")
    op.drop_column("models", "temperature")
    op.drop_column("models", "top_k")
    op.drop_column("models", "top_p")
    op.drop_column("models", "defrag_thold")
    op.drop_column("models", "system_prompt")
    op.create_index("ix_models_served_model_name", "models", ["served_model_name"], unique=True)

    # --- recipes: snapshot table -------------------------------------------
    old_recipes = conn.execute(sa.text("SELECT * FROM recipes")).mappings().all()
    op.drop_table("recipes")
    op.create_table(
        "recipes",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False, unique=True, index=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("model_id", sa.Integer(), sa.ForeignKey("models.id", ondelete="SET NULL"), nullable=True),
        sa.Column("model_name", sa.String(255), nullable=False),
        sa.Column("served_model_name", sa.String(255), nullable=False),
        sa.Column("task", sa.String(32), nullable=False, server_default="generate"),
        sa.Column("engine_type", sa.String(16), nullable=False, server_default="vllm"),
        sa.Column("mode", sa.String(16), nullable=False, server_default="offline"),
        sa.Column("repo_id", sa.String(512), nullable=True),
        sa.Column("local_path", sa.String(512), nullable=True),
        sa.Column("config_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    for r in old_recipes:
        cfg = {}
        for c in OLD_RECIPE_CONFIG_COLUMNS:
            v = r.get(c)
            if v is None or c == "hf_token":
                continue
            if c == "selected_gpus":
                try:
                    v = json.loads(v) if isinstance(v, str) else v
                except Exception:
                    v = None
            if c == "flash_attention":
                cfg["flash_attn"] = "on" if v else "off"
                continue
            if c in ("mlock", "no_mmap"):
                if v:
                    cfg["load_mode"] = "mlock" if c == "mlock" else "none"
                continue
            if c in LEGACY_SAMPLING:
                rd = cfg.setdefault("_sampling", {})
                rd[c] = v
                continue
            cfg[c] = v
        sampling = cfg.pop("_sampling", {})
        if sampling:
            try:
                rd = json.loads(cfg.get("request_defaults_json") or "{}")
            except Exception:
                rd = {}
            for k, v in sampling.items():
                rd.setdefault(k, v)
            cfg["request_defaults_json"] = json.dumps(rd)
        conn.execute(sa.text(
            "INSERT INTO recipes (id, name, description, model_id, model_name, served_model_name, task, engine_type, mode, "
            "repo_id, local_path, config_json, created_at, updated_at) VALUES (:id, :name, :description, :model_id, :model_name, "
            ":served_model_name, :task, :engine_type, :mode, :repo_id, :local_path, :config_json, :created_at, :updated_at)"
        ), {
            "id": r["id"], "name": r["name"], "description": r.get("description"), "model_id": r.get("model_id"),
            "model_name": r.get("model_name") or r["name"], "served_model_name": r.get("served_model_name") or r["name"],
            "task": r.get("task") or "generate", "engine_type": r.get("engine_type") or "vllm", "mode": r.get("mode") or "offline",
            "repo_id": r.get("repo_id"), "local_path": r.get("local_path"), "config_json": json.dumps(cfg),
            "created_at": r.get("created_at"), "updated_at": r.get("updated_at"),
        })
    if old_recipes:
        conn.execute(sa.text("SELECT setval(pg_get_serial_sequence('recipes', 'id'), (SELECT MAX(id) FROM recipes))"))


def downgrade() -> None:
    raise RuntimeError("Downgrade from the engine-spec schema is not supported; restore a database backup instead.")

/**
 * Manage Models: seven sub-tabs (overview, engines, adding, config, operations, recipes,
 * troubleshooting). Content only — wording was audited against the code; keep facts here, not in
 * TSX. Tokens ({{MODELS_DIR}}, {{VLLM_IMAGE}}, {{LLAMACPP_IMAGE}}, {{DOCS_URL}}, …) come from
 * ../interpolate. The per-flag reference in the Configuration sub-tab is generated from the engine
 * spec (`spec-flags:vllm` / `spec-flags:llamacpp` custom blocks rendered by ManageModelsTab), so it
 * can never drift from backend/src/engines/spec.py; SPEC_FLAG_TIPS adds the curated guidance for a
 * field, keyed by its spec name (models.test.ts checks every key exists in the spec).
 */
import type { GuideTab, GuideTabGroup, Md } from '../types';

/** Curated per-flag guidance shown under the spec-generated card of the field with that name. */
export const SPEC_FLAG_TIPS: Record<string, Md> = {
  // vLLM
  dtype: "Precision for model weights. 'auto' follows the checkpoint. bfloat16 is the safe choice on Ampere and newer GPUs; float16 can overflow on some models, bfloat16 handles larger value ranges.",
  device: 'CPU mode starts the container without GPU access. Selected GPUs are ignored in CPU mode. Use CPU only for tiny models or smoke tests.',
  selected_gpus: 'GPUs exposed to the container. Tensor parallel × pipeline parallel must equal the number of selected GPUs. Cortex keeps TP aligned when you tick GPUs; the Summary step flags a mismatch before you launch.',
  tp_size: 'Shards every layer across GPUs; emitted only when > 1. Use TP for a single node with fast interconnect.',
  pipeline_parallel_size: 'Splits layers into stages; emitted only when > 1. Use PP only when the model does not fit with TP alone.',
  gpu_memory_utilization: "Share of each GPU's VRAM vLLM may reserve for weights plus KV cache. 'Not enough KV cache memory' errors: raise this, lower context length, or set an explicit KV cache memory (bytes).",
  max_model_len: 'Upper bound of tokens per request. Empty lets vLLM read max_position_embeddings from the checkpoint. KV cache VRAM scales linearly with context — lower it explicitly on small GPUs.',
  trust_remote_code: 'Allow custom Python from the checkpoint. Required for Nemotron and some Qwen/DeepSeek architectures. Only enable for sources you trust.',
  attention_backend: 'Force one attention implementation. FLASHINFER helps long contexts and MoE; TORCH_SDPA is the broadest fallback. The FA2 badge next to the field tells you whether your primary GPU supports Flash Attention 2 (SM 80+).',
  quantization: 'Weight quantization method. Pre-quantized checkpoints are usually auto-detected; set this only to force a kernel or when the config does not declare it. AWQ/GPTQ need matching repos; fp8 is dynamic for any model (best on Hopper/Ada); bitsandbytes and experts_int8 quantize at load time.',
  kv_cache_dtype: 'Precision of the KV cache. fp8 variants halve KV memory with minor quality impact. nvfp4 needs Blackwell; fp8_inc is for Intel Gaudi.',
  block_size: 'Paging granularity of the KV cache. 8 reduces fragmentation for long contexts on tight VRAM.',
  cpu_offload_gb: 'Spill part of the weights to system RAM (per GPU). Needs fast PCIe/NVLink; trades latency for capacity.',
  max_num_batched_tokens: 'Tokens processed per scheduler step. Higher raises prefill throughput and VRAM use. 2048-8192 with chunked prefill is typical.',
  max_num_seqs: 'Upper bound on simultaneously active requests. Start at 128-256; more concurrency needs more KV cache.',
  enforce_eager: 'Disables CUDA graphs and torch.compile: fastest startup, slower decode. Leave off for production; turn on to debug crashes during graph capture.',
  enable_prefix_caching: "Three-state switch: 'Default' sends nothing, 'On'/'Off' send `--enable-prefix-caching` / `--no-enable-prefix-caching`. On by default in the pinned vLLM release.",
  enable_chunked_prefill: "Three-state switch: 'Default' sends nothing, 'On'/'Off' send `--enable-chunked-prefill` / `--no-enable-chunked-prefill`. On by default in the pinned vLLM release.",
  cuda_graph_sizes: 'Batch sizes to pre-capture. Ignored when Enforce Eager is on. Only tune for steady, predictable workloads.',
  // llama.cpp
  context_size: 'Total KV context shared by all slots. Each slot gets context ÷ slots unless the KV cache is unified; the field shows the per-slot number live. With `--fit` on (default) llama.cpp trims an unset context to what fits in VRAM.',
  parallel_slots: 'Concurrent request slots. Few slots for long prompts, many for small concurrent requests.',
  batch_size: 'Logical prompt batch size. Keep `-ub` ≤ `-b`.',
  ubatch_size: 'Physical prompt batch size. Larger `-ub` speeds prefill at the cost of VRAM.',
  cache_type_k: 'Quantized types halve (q8_0) or quarter (q4_0) KV memory.',
  cache_type_v: "Quantized types halve (q8_0) or quarter (q4_0) KV memory. A quantized V cache requires flash attention (auto/on); the Summary step blocks 'off' + quantized V.",
  flash_attn: "A three-way select, not a checkbox. 'auto' enables it when the backend supports it. Force 'off' only on GPUs without support (pre-Ampere).",
  load_mode: 'Replaces the old mlock / no-mmap switches: mmap = memory-map, mlock = pin in RAM, dio = direct I/O, none = read fully. mlock needs enough free RAM for the whole file.',
  ngl: 'Layers offloaded to the GPU. Empty lets llama.cpp decide (with `--fit` it picks what fits); 0 = CPU only, 999 = all. Lower values enable CPU+GPU hybrid inference.',
  tensor_split: "An equal split is generated when you change the GPU count; manual ratios are kept until the count changes. Use the 'Equal split' link to regenerate.",
  main_gpu: 'Which GPU holds scratch buffers.',
  split_mode: 'How the model is split across GPUs. row needs a fast interconnect.',
  threads: 'CPU generation threads. Physical cores is a good ceiling.',
  fit_memory: 'Trims UNSET `-ngl` / `-c` to device memory. Turn it off for fully explicit configs.',
  kv_unified: 'Unified KV shares one pool across slots (pair with a per-slot limit).',
  draft_model_path: 'A smaller GGUF from the same family, e.g. draft/Qwen2.5-0.5B-Q8_0.gguf (path relative to the models dir). 4-10x smaller than the main model; Q8_0 keeps drafts accurate.',
  spec_type: "Left unset, llama.cpp infers the type from the draft model's metadata (sharded drafts need an explicit type). ngram-* types need no draft model. Leave unset unless you know the model supports eagle3/MTP.",
  draft_n: 'How many tokens are proposed per step. 3-16 typical; more helps predictable text like code.',
  spec_draft_n_min: 'Minimum number of draft tokens per step.',
  draft_p_min: 'Minimum draft probability to keep proposing. Lower p_min = more aggressive speculation.',
  spec_draft_ngl: 'GPU layers for the draft model.',
};

export const VLLM_RECIPES_URL = 'https://docs.vllm.ai/projects/recipes/en/latest/index.html';

export const overviewTab: GuideTab = {
  id: 'overview',
  title: 'Model Management',
  intro:
    "Cortex provides a unified interface for deploying and managing Large Language Models (LLMs) on your infrastructure. Whether you're running chat models, embedding services, or specialized AI workloads, the Models page is where you add, start, stop and configure them.",
  lead: [
    { kind: 'p', md: '**Chat/Generate** · **Embeddings** · **Multi-GPU** · **OpenAI Compatible**' },
    {
      kind: 'cards',
      items: [
        { title: 'Supported Engines', md: '**2** — vLLM & llama.cpp' },
        { title: 'Model Tasks', md: '**2** — Generate & Embed' },
        { title: 'GPU Support', md: '**Multi** — Tensor Parallelism' },
        { title: 'API Standard', md: '**v1** — OpenAI Compatible' },
      ],
    },
  ],
  sections: [
    {
      id: 'models-what-you-can-do',
      title: 'What You Can Do',
      blocks: [
        {
          kind: 'cards',
          items: [
            { icon: '➕', title: 'Add Models', md: 'Deploy models from HuggingFace or local files with guided configuration' },
            { icon: '⚙️', title: 'Configure', md: 'Tune GPU allocation, context length, batch sizes, and performance settings' },
            { icon: '▶️', title: 'Start/Stop', md: 'Control model containers with one-click operations' },
            { icon: '📊', title: 'Monitor', md: 'View logs, run tests, and track model health' },
          ],
        },
      ],
    },
    {
      id: 'models-key-concepts',
      title: 'Key Concepts',
      blocks: [
        {
          kind: 'cards',
          items: [
            { title: 'Inference Engine', md: 'The software that loads and runs your model. Cortex supports vLLM (best performance for safetensors checkpoints, including gpt-oss with the gpt_oss reasoning parser and mxfp4 quantization) and llama.cpp (every GGUF file, single or multi-part).' },
            { title: 'Model Task', md: "What the model does: 'generate' for chat/completion (text generation) or 'embed' for creating vector embeddings used in RAG and semantic search." },
            { title: 'Served Model Name', md: "The identifier clients use to call your model via the API. This appears in API requests as the 'model' parameter (e.g., 'my-llama-3')." },
            { title: 'Online vs Offline Mode', md: 'Online mode downloads models from HuggingFace on-demand. Offline mode uses pre-downloaded model files from local storage—essential for air-gapped environments.' },
            { title: 'Tensor Parallelism (TP)', md: "Splits a model across multiple GPUs to handle models larger than a single GPU's VRAM. Each GPU holds a portion of the model weights." },
            { title: 'Context Length', md: 'The maximum number of tokens (roughly 0.75 words each) a model can process in a single request. Longer contexts require more VRAM.' },
            { title: 'GGUF Format', md: 'A quantized model format used by llama.cpp. GGUF files have quantization built-in (e.g., Q4_K_M, Q8_0) and are typically smaller than SafeTensors.' },
            { title: 'Managed Container', md: 'Each model runs in its own Docker container (`vllm-model-<id>` or `llamacpp-model-<id>`) with the GPUs and settings you chose; the gateway routes requests to it by served model name.' },
          ],
        },
      ],
    },
    {
      id: 'models-how-it-works',
      title: 'How It Works',
      blocks: [
        {
          kind: 'steps',
          items: [
            { title: 'Add Model', md: 'Configure settings' },
            { title: 'Docker Container', md: 'Engine starts' },
            { title: 'Load Weights', md: 'GPU memory' },
            { title: 'Health Check', md: 'Ready state' },
            { title: 'Serve Requests', md: '`/v1/chat/completions`' },
          ],
        },
        { kind: 'p', md: '**Request Flow:** API requests arrive at Cortex → Validated with API key → Routed to the model container → Processed by inference engine → Response streamed back to client. All requests use the OpenAI-compatible API format.' },
      ],
    },
    {
      id: 'models-states',
      title: 'Model States',
      intro: 'Stopping passes briefly through `stopping` on the way back to `stopped`. While a model is `loading`, its Stop button reads **Cancel**.',
      blocks: [
        {
          kind: 'table',
          caption: 'What each state badge means',
          columns: ['State', 'Meaning'],
          rows: [
            ['`stopped`', 'Not running. Configuration exists but container is stopped.'],
            ['`starting`', 'Container initializing. Pulling image or preparing environment.'],
            ['`loading`', 'Model weights loading into GPU memory. May take several minutes for large models.'],
            ['`running`', 'Ready for inference. Model is actively serving requests.'],
            ['`failed`', 'Error occurred. Check logs for details—common causes include VRAM shortage or path issues.'],
          ],
        },
      ],
    },
    {
      id: 'models-quick-start',
      title: 'Quick Start Checklist',
      blocks: [
        {
          kind: 'steps',
          items: [
            { title: 'Verify GPU availability', md: 'Visit the [Health page](/health) to confirm your GPUs are detected and have sufficient VRAM.' },
            { title: 'Choose your engine', md: 'Use **vLLM** for most HuggingFace models, or **llama.cpp** for GGUF files (any GGUF, single or multi-part, always runs on llama.cpp).' },
            { title: 'Prepare your model', md: 'For **Online** mode, know your HuggingFace repo ID. For **Offline** mode, place model files in the configured models directory (`{{MODELS_DIR}}`).' },
            { title: 'Configure resources', md: 'Set tensor parallelism (number of GPUs), context length, and memory utilization based on your hardware.' },
            { title: 'Start and test', md: 'Launch the model, watch the logs, and run a test to verify it responds correctly.' },
          ],
        },
        { kind: 'custom', id: 'models-cta' },
        { kind: 'callout', variant: 'info', title: 'Tip', md: 'New to LLM deployment? Start with a smaller model (7B-8B parameters) to learn the workflow. Once comfortable, scale up to larger models with more GPUs. The **Calculator** button in the Models page helps estimate VRAM requirements before deployment.' },
      ],
    },
  ],
  attribution: 'Cortex Model Management Overview',
};

export const enginesTab: GuideTab = {
  id: 'engines',
  title: 'Choosing an Inference Engine',
  intro:
    'Cortex supports two inference engines, each optimized for different use cases. Your choice of engine determines which models you can run, performance characteristics, and configuration options. Understanding these differences helps you pick the right engine for your deployment.',
  sections: [
    {
      id: 'engine-comparison',
      title: 'Engine Comparison',
      blocks: [
        { kind: 'h', level: 3, text: '🚀 vLLM — High-Performance Inference (recommended)', id: 'engine-vllm' },
        {
          kind: 'list',
          items: [
            '**PagedAttention** — Memory-efficient KV cache management enables handling many concurrent requests',
            '**Continuous Batching** — Dynamically batches requests for maximum GPU utilization',
            '**Tensor Parallelism** — Split large models across multiple GPUs seamlessly',
            '**Flash Attention 2** — Hardware-accelerated attention on Ampere+ GPUs',
          ],
        },
        { kind: 'h', level: 3, text: 'Best for', id: 'engine-vllm-best-for' },
        {
          kind: 'checklist',
          items: [
            'Standard HuggingFace models (Llama 3, Mistral, Qwen, Phi, Gemma)',
            'High throughput requirements (50-70+ tokens/sec per stream)',
            'Many concurrent users (40+ simultaneous requests)',
            'SafeTensors format models',
            'Embedding models (nomic-embed, BGE, E5)',
          ],
        },
        { kind: 'callout', variant: 'warning', title: 'Limitations', md: '• Needs a full checkpoint folder (config.json, tokenizer files, safetensors)\n• Does not serve GGUF files (Cortex routes every GGUF to llama.cpp)\n• Requires CUDA-capable GPU' },
        { kind: 'h', level: 3, text: '🦙 llama.cpp — GGUF & Specialized Models', id: 'engine-llamacpp' },
        {
          kind: 'list',
          items: [
            '**Native GGUF Support** — First-class support for quantized GGUF models, including multi-part files',
            '**CPU + GPU Hybrid** — Keep some layers on the CPU when the model does not fit in VRAM',
            '**Aggressive Quantization** — Run large models in tight VRAM with Q4_K_M, Q5_K_M, etc.',
            '**Speculative Decoding** — Use draft models to accelerate inference',
          ],
        },
        { kind: 'h', level: 3, text: 'Best for', id: 'engine-llamacpp-best-for' },
        {
          kind: 'checklist',
          items: [
            'GGUF quantizations of any model, including gpt-oss GGUF conversions',
            'GGUF-only models (no HuggingFace checkpoint)',
            'Multi-part GGUF files (split models)',
            'Custom/experimental architectures',
            'Memory-constrained deployments (aggressive quantization)',
          ],
        },
        { kind: 'callout', variant: 'warning', title: 'Limitations', md: '• Lower throughput than vLLM (typically 20-40 tok/sec)\n• Requires Offline mode (no HuggingFace download)\n• Fewer concurrent slots than vLLM' },
      ],
    },
    {
      id: 'engine-performance',
      title: 'Performance Characteristics',
      blocks: [
        {
          kind: 'table',
          caption: 'Typical characteristics of each engine',
          columns: ['Metric', 'vLLM', 'llama.cpp'],
          rows: [
            ['Tokens/sec (single)', '50-70+', '20-40'],
            ['Concurrent requests', '40-256+', '1-32 slots'],
            ['Memory efficiency', 'Excellent (PagedAttention)', 'Good (quantization)'],
            ['Startup time', '1-5 minutes', '30s-2 minutes'],
            ['Multi-GPU', 'Tensor Parallelism', 'Tensor Split'],
            ['Model formats', 'SafeTensors / HF checkpoints', 'GGUF only'],
          ],
        },
        { kind: 'p', md: 'GGUF files (single or multi-part) are always served by llama.cpp; the gateway rejects vLLM + GGUF.' },
      ],
    },
    {
      id: 'engine-decision-guide',
      title: 'Decision Guide',
      blocks: [
        {
          kind: 'cards',
          items: [
            { title: 'Is your model gpt-oss (the safetensors release of openai/gpt-oss-20b or -120b)?', md: '**→ vLLM** — vLLM v0.28.0 serves gpt-oss natively: set Reasoning parser to gpt_oss, Tool call parser to openai and Quantization to mxfp4 (the vLLM Recipes site has the full settings). GGUF conversions of gpt-oss go to llama.cpp like every other GGUF.' },
            { title: 'Do you have multi-part GGUF files (model-00001-of-00003.gguf)?', md: '**→ llama.cpp** — llama.cpp loads split GGUF files natively; Cortex points it at the first part. vLLM is never used for GGUF, so no merge is needed.' },
            { title: 'Is your model on HuggingFace with SafeTensors?', md: '**→ vLLM** — vLLM provides 2-3x better throughput for standard models. Use it for Llama, Mistral, Qwen, Phi, Gemma, and most other popular architectures.' },
            { title: 'Do you need maximum throughput and concurrency?', md: "**→ vLLM** — vLLM's PagedAttention and continuous batching deliver significantly higher throughput for production workloads with many users." },
            { title: 'Are you running embedding models?', md: '**→ vLLM** — vLLM has excellent embedding model support with optimized batching. Choose vLLM for nomic-embed, BGE, E5, and similar models.' },
            { title: 'Do you need aggressive quantization (Q4_K_M) for limited VRAM?', md: '**→ llama.cpp** — While both support quantization, llama.cpp is optimized for running with aggressive quantization levels like Q4_K_M and Q5_K_M.' },
          ],
        },
      ],
    },
    {
      id: 'engine-formats',
      title: 'Model Formats: GGUF vs SafeTensors',
      blocks: [
        { kind: 'h', level: 3, text: '📦 GGUF Format' },
        {
          kind: 'list',
          items: [
            '**Pre-quantized** — Quantization (Q4_K_M, Q8_0, etc.) is baked into the file',
            '**Single or split files** — Can be one file or multiple parts for large models',
            '**Self-contained** — Model architecture info embedded in file',
            '**Offline only** — Must be pre-downloaded; no HuggingFace streaming',
          ],
        },
        { kind: 'p', md: 'Files: `model-Q4_K_M.gguf`, `model-00001-of-00003.gguf`' },
        { kind: 'h', level: 3, text: '🔐 SafeTensors Format' },
        {
          kind: 'list',
          items: [
            '**Full precision** — Weights stored in original dtype (FP16/BF16)',
            '**Quantize on-load** — vLLM can apply AWQ, GPTQ, FP8, INT8 at runtime',
            '**HuggingFace native** — Streaming download from HuggingFace Hub',
            '**Config files required** — Needs config.json, tokenizer files',
          ],
        },
        { kind: 'p', md: 'Files: `model.safetensors`, `config.json`, `tokenizer.json`' },
      ],
    },
    {
      id: 'engine-vllm-resources',
      title: 'vLLM Resources',
      blocks: [
        { kind: 'p', md: '**vLLM Recipes — Official Model Guides.** When setting up a vLLM model container, the official **vLLM Recipes** site provides community-maintained guides with known parameters and requirements for running specific models. This includes hardware recommendations, optimal configuration settings, and task-specific usage guides.' },
        {
          kind: 'link-cards',
          items: [{ title: 'vLLM Recipes Site', md: 'Includes guides for: Llama 3/4, Qwen 3, DeepSeek V3, Mistral, GPT-OSS, NVIDIA Nemotron, and many more.', href: VLLM_RECIPES_URL, label: 'Open' }],
        },
        { kind: 'callout', variant: 'warning', title: 'Note', md: "Not all models supported by vLLM have been documented on the Recipes site yet. If you don't find your specific model listed, searching online forums (Reddit, GitHub issues, HuggingFace discussions) may reveal community-discovered settings and workarounds." },
        { kind: 'callout', variant: 'info', title: 'Pro Tip', md: 'When Cortex inspects a model folder, it automatically recommends the best engine based on the files found. Look for the recommendation badge when selecting a folder in Offline mode—it analyzes whether you have SafeTensors, single-file GGUFs, or multi-part GGUFs and suggests accordingly.' },
      ],
    },
  ],
  attribution: 'Cortex Engine Selection Guide',
};

const FOLDER_TREE = `/models/
├── Llama-3.1-8B-Instruct/
│   ├── config.json
│   ├── model.safetensors
│   └── tokenizer.json
├── GPT-OSS-120B-GGUF/
│   ├── model-Q4_K_M.gguf
│   └── tokenizer.json
└── Mistral-7B-split/
    ├── model-00001-of-00003.gguf
    ├── model-00002-of-00003.gguf
    └── model-00003-of-00003.gguf`;

export const addingTab: GuideTab = {
  id: 'adding',
  title: 'Adding Models',
  intro:
    'Adding a model to Cortex involves a guided workflow that walks you through engine selection, model location, and configuration. This guide covers both **Online** mode (downloading from HuggingFace) and **Offline** mode (using pre-downloaded local files).',
  sections: [
    {
      id: 'adding-start',
      title: 'Starting the Workflow',
      blocks: [
        { kind: 'p', md: 'Navigate to **Models** in the sidebar, then click the **➕ Add Model** button in the top right. This opens a step-by-step wizard that guides you through configuration.' },
        { kind: 'list', ordered: true, items: ['Engine & Mode', 'Model Selection', 'Core Settings', 'Startup Config', 'Request Defaults', 'Summary & Launch'] },
      ],
    },
    {
      id: 'adding-modes',
      title: 'Online vs Offline Mode',
      blocks: [
        { kind: 'h', level: 3, text: '🌐 Online Mode — Download from HuggingFace Hub' },
        { kind: 'p', md: '**How it works.** Provide a HuggingFace repository ID (e.g., `meta-llama/Llama-3.1-8B-Instruct`). When you start the model, Cortex downloads the weights to its cache and loads them.' },
        { kind: 'list', items: ['**Repo ID:** owner/model-name format', '**HF Token:** Required for gated models (Llama, Mistral, etc.)'] },
        { kind: 'code', label: 'Example Repo IDs', copy: false, text: 'meta-llama/Llama-3.1-8B-Instruct\nmistralai/Mistral-7B-Instruct-v0.3\nQwen/Qwen2.5-7B-Instruct\nnomic-ai/nomic-embed-text-v1.5' },
        { kind: 'callout', variant: 'info', title: 'Gated Models', md: 'Many popular models require accepting terms on HuggingFace. Visit the model page, accept the license, then use an HF token with read permissions.' },
        { kind: 'h', level: 3, text: '📁 Offline Mode — Use local model files' },
        { kind: 'p', md: "**How it works.** Point to a folder containing model files on your local disk. Essential for air-gapped environments, GGUF models, or when you've pre-downloaded models for faster startup." },
        {
          kind: 'list',
          ordered: true,
          items: [
            'The models directory is fixed by `CORTEX_MODELS_DIR` (`{{MODELS_DIR}}` on this host) and shown read-only',
            'Place model folders inside this directory on the host',
            'Click **Refresh** to scan available folders',
            'Select a folder—Cortex inspects its contents',
          ],
        },
        { kind: 'code', label: 'Folder structure example (as seen inside the container)', copy: false, text: FOLDER_TREE },
        { kind: 'callout', variant: 'info', title: 'GGUF Models', md: 'When you select a folder with GGUF files, Cortex shows a file picker with quantization levels. Choose your preferred variant (Q4_K_M, Q8_0, etc.).' },
      ],
    },
    {
      id: 'adding-online-vllm',
      title: 'Walkthrough: Online Mode with vLLM',
      intro: 'The most common deployment: downloading a model from HuggingFace and running it with vLLM.',
      blocks: [
        {
          kind: 'steps',
          items: [
            { title: 'Engine & Mode Selection', md: 'Select **vLLM** as your engine and **Online** as your mode.' },
            { title: 'Model Selection', md: 'Enter the HuggingFace repository ID. For gated models, also provide your HuggingFace token.', code: 'meta-llama/Llama-3.1-8B-Instruct' },
            { title: 'Core Settings', md: "Configure model identity and resource allocation:\n**Name:** Friendly display name (e.g., \"Llama 3.1 8B\")\n**Served Model Name:** API identifier (e.g., \"llama-3.1-8b\")\n**Task:** generate (chat) or embed (embeddings)\n**GPUs:** Select which GPUs to use\n**Max model length:** Token limit; empty = the model's own maximum\n**GPU memory utilization:** Share of each GPU's VRAM vLLM may reserve; empty = 0.92\n**Everything else:** Empty fields are not sent, so the engine default applies" },
            { title: 'Startup Configuration', md: "*Optional:* Add custom command-line arguments or environment variables for the inference engine. Most users can skip this step—it's for advanced tuning." },
            { title: 'Request Defaults', md: "*Optional:* Set default sampling parameters (temperature, top_p, repetition penalty) that apply when clients don't specify them. Safe to skip for most deployments." },
            { title: 'Summary & Launch', md: 'Review the summary (source, engine image, GPUs, TP/PP, custom args). A **dry run** runs automatically: it shows the exact command, whether the image is cached and any warnings. Errors block **Launch Model** until fixed or explicitly overridden. Launch creates the configuration; then click **Start** in the Models table to deploy.' },
          ],
        },
      ],
    },
    {
      id: 'adding-offline-llamacpp',
      title: 'Walkthrough: Offline Mode with llama.cpp (GGUF)',
      intro: 'Running a GGUF model with llama.cpp. GGUF files are always served by llama.cpp: picking a GGUF-only folder selects llama.cpp automatically and disables vLLM.',
      blocks: [
        {
          kind: 'steps',
          items: [
            { title: 'Engine & Mode Selection', md: 'Select **llama.cpp**. Mode automatically switches to **Offline** (llama.cpp requires local files).' },
            { title: 'Model Selection', md: 'The models directory is fixed by `CORTEX_MODELS_DIR` and shown read-only. Drop your model folder there, then:\n1. Click **Refresh** to list the folders\n2. Select your model folder from the dropdown\n3. Cortex inspects the folder and shows the available GGUF quantizations\n4. Pick a quantization; the file path is filled in for you\n**GGUF Selection:** When multiple quantizations exist (Q4_K_M, Q5_K_M, Q8_0), Cortex groups them and recommends the best option. Multi-part files are detected automatically.\n**No tokenizer needed:** llama.cpp reads the tokenizer and chat template from the GGUF itself. The optional tokenizer / HF config overrides only exist for vLLM SafeTensors folders.' },
            { title: 'Core Settings (llama.cpp specific)', md: 'Configure llama.cpp-specific parameters:\n**Context Size (-c):** Total context window; empty = engine default\n**Parallel Slots (-np):** Concurrent request capacity; empty = auto\n**GPU Layers (-ngl):** Empty = auto, 0 = CPU only, 999 = all\n**GPU Selection:** Which GPUs to use (generates tensor_split)\n**Flash Attention:** auto / on / off (quantized V cache needs it on)\n**Load Mode:** auto / mmap / mlock / dio\n**KV Cache Type K/V:** f16 default; q8_0 halves KV memory\n**Context per slot:** Total context ÷ parallel slots (unless the KV cache is unified). For 16384 context with 16 slots = 1024 tokens per slot.' },
            { title: 'Advanced: Speculative Decoding', md: "*Optional but powerful:* In Core Settings, expand **Speculative decoding** and set the draft model (path relative to the models dir), optionally the speculative type (otherwise inferred from the draft model's metadata) and the draft token limits (`--spec-draft-n-max`/`-n-min`, `--spec-draft-p-min`, `--spec-draft-ngl`)." },
          ],
        },
      ],
    },
    {
      id: 'adding-tips',
      title: 'Tips for Success',
      blocks: [
        { kind: 'h', level: 3, text: '✓ Best Practices' },
        {
          kind: 'checklist',
          items: [
            'Start with conservative settings (lower context, fewer slots) and scale up',
            'Use the **Calculator** button to estimate VRAM before deployment',
            'Run a **Test** after starting to verify the model responds correctly',
            'Keep served model names simple and URL-safe (lowercase, hyphens)',
            'For production, save working configs as **Recipes** for easy redeployment',
          ],
        },
        { kind: 'h', level: 3, text: '✗ Common Pitfalls' },
        {
          kind: 'list',
          items: [
            'Forgetting HF token for gated models (Llama, Mistral)',
            'Setting context length higher than available VRAM can handle',
            'Serving gpt-oss safetensors on vLLM without the gpt_oss reasoning parser, openai tool parser and mxfp4 quantization (see [Engines](/guide?tab=manage-models#engines))',
            'Trying to serve a GGUF file with vLLM (the gateway rejects it: GGUF is llama.cpp only)',
            'Launching with dry-run errors ticked away instead of fixed (TP × PP ≠ GPUs, image not cached)',
          ],
        },
        { kind: 'custom', id: 'models-cta' },
      ],
    },
  ],
  attribution: 'Cortex Model Addition Guide',
};

export const configTab: GuideTab = {
  id: 'config',
  title: 'Configuration Guide',
  intro:
    'Model configuration determines resource allocation, performance characteristics, and behavior. This guide covers the key settings for both vLLM and llama.cpp engines, helping you optimize for your specific hardware and workload requirements.',
  lead: [
    { kind: 'callout', variant: 'info', title: 'Empty means engine default', md: "Every field you leave empty is **not sent** to the engine, so the engine's own default applies (shown as *(engine default)* next to the field). Only type a value when you want to override it. Sliders are paired with a number box and a **Reset** link that returns the field to unset." },
    { kind: 'callout', variant: 'info', title: 'Every engine flag is reachable', md: 'The curated sections cover the common settings. Everything else the gateway knows about is listed under **More options (from the engine spec)**, grouped by topic, with the exact CLI flag in the help text.' },
    { kind: 'p', md: 'The flag reference below is generated from the same engine spec the Add Model form uses (`GET /admin/engines/spec`), so every flag, default and choice list matches what the form offers. Tips in italics are curated guidance; everything else comes from the spec.' },
  ],
  sections: [
    {
      id: 'config-vllm',
      title: 'vLLM Configuration',
      intro: 'Settings for the pinned vLLM image, `{{VLLM_IMAGE}}`.',
      blocks: [
        { kind: 'callout', variant: 'info', title: 'Looking for model-specific settings?', md: 'The [vLLM Recipes](' + VLLM_RECIPES_URL + ') site provides official guidance for popular models (Llama, Qwen, DeepSeek, Nemotron, gpt-oss). Their extra flags go into **Startup Config** as custom args, or use one of the presets there.' },
        { kind: 'custom', id: 'spec-flags:vllm' },
        { kind: 'h', level: 3, text: 'Where the rest lives in the form' },
        { kind: 'p', md: 'Grouped under collapsible headers at the end of Core Settings: tokenizer mode and load format; data/expert parallelism and the distributed executor; explicit KV cache memory (bytes); compilation config, async scheduling and sleep mode; chat template, generation config source and overrides; reasoning parser, auto tool choice and tool-call parser; structured outputs config; multimodal limits; LoRA (enable, modules, max LoRAs/rank, CPU LoRAs); speculative decoding config (JSON); request logging, stats logging, debug/trace mode, iteration timeout and max log length; seed.' },
      ],
    },
    {
      id: 'config-llamacpp',
      title: 'llama.cpp Configuration',
      intro: 'Settings for the pinned llama-server image, `{{LLAMACPP_IMAGE}}`.',
      blocks: [
        { kind: 'callout', variant: 'success', title: 'GGUF is always served by llama.cpp', md: 'When you pick a GGUF file, Cortex selects llama.cpp automatically and disables vLLM. The tokenizer and chat template come from the GGUF itself; no Hugging Face tokenizer is needed.' },
        { kind: 'p', md: '**Speculative decoding:** a small draft model (or an n-gram predictor) proposes tokens that the main model verifies in one pass — see the *Adapters, speculative decoding & multimodal* group below.' },
        { kind: 'custom', id: 'spec-flags:llamacpp' },
        { kind: 'h', level: 3, text: 'Where the rest lives in the form', id: 'config-llamacpp-more' },
        { kind: 'p', md: 'MoE layers kept on CPU (`--n-cpu-moe`), override tensor placement (`-ot`), NUMA policy, HTTP threads, continuous batching, cache reuse and context shift, RoPE base/scale, jinja templates, chat template file and kwargs, reasoning format and budget, max tokens to predict, GBNF grammar file, embeddings / pooling / rerank endpoints, LoRA adapters, multimodal projector (`--mmproj`) and offload, verbose logging, tensor checks, warmup, seed.' },
      ],
    },
    {
      id: 'config-request-defaults',
      title: 'Request Defaults (Both Engines)',
      intro: "These parameters set defaults for API requests when clients don't specify them. They are merged into each request by the gateway and saved with the model; Save & Apply restarts a running model so the new defaults take effect. Leave a field empty to use the engine's default; the suggested values are only placeholders.",
      blocks: [
        {
          kind: 'table',
          caption: 'Sampling defaults',
          columns: ['Parameter', 'Range', 'Default', 'What it does', 'Tip'],
          rows: [
            ['Temperature', '0.0 - 2.0', 'engine default (suggested 0.8)', 'Randomness in generation. Lower = more deterministic; higher = more creative.', '0.0 = greedy. 0.7-0.9 for balanced output.'],
            ['Top P (Nucleus Sampling)', '0.0 - 1.0', 'engine default (suggested 0.9)', 'Sample from tokens comprising top P probability mass.', '0.9-0.95 is typical.'],
            ['Top K', '1 - 100', 'engine default (suggested 40)', 'Sample from the top K highest-probability tokens.', 'Lower values keep output more focused.'],
            ['Repetition Penalty', '1.0 - 2.0', 'engine default (suggested 1.2)', 'Penalizes repeating tokens. 1.0 = no penalty.', '1.1-1.3 prevents loops without sounding unnatural.'],
            ['Frequency Penalty', '-2.0 - 2.0', 'engine default (suggested 0.5)', 'Penalizes tokens by how often they appeared.', 'Encourages vocabulary diversity.'],
            ['Presence Penalty', '-2.0 - 2.0', 'engine default (suggested 0.5)', 'Penalizes tokens that appeared at all.', 'Encourages new topics.'],
          ],
        },
        { kind: 'callout', variant: 'info', md: '**Custom request JSON** merges extra fields (e.g. `vllm_xargs`, `stop`) into every request. It must be a JSON object.' },
      ],
    },
    {
      id: 'config-startup-dry-run',
      title: 'Startup Config, Dry Run & Save',
      blocks: [
        { kind: 'p', md: '**Custom args / env** are appended after the form-managed flags and win on conflict. The editor flags duplicates, reserved flags (`--host`, `--port`, `--api-key`, `--model`, `--served-model-name`, `--alias`, `--root-path`, `--ssl-*`) and collisions with a form field. A boolean *false* is passed as `--no-<flag>`; list values take one entry per line. Presets cover Nemotron, FlashInfer MoE FP8, CPU-MoE offload and long-context llama.cpp.' },
        { kind: 'p', md: '**Dry run** runs automatically when the Summary step opens (Add and Configure) and can be re-run. It shows the exact command and environment, whether the image is cached, an estimated VRAM figure and any warnings. Errors block **Launch / Save** until you tick *start anyway*; local checks (missing name, TP × PP mismatch, GGUF under vLLM, invalid JSON) must be fixed first.' },
        { kind: 'p', md: '**Save & Apply** (Configure) writes the configuration and, if the model is running, restarts it with the new settings; a stopped model just keeps the saved values for its next start.' },
      ],
    },
    {
      id: 'config-vram',
      title: 'VRAM Estimation Guide',
      intro: "Use the **Calculator** button in the Models page to estimate VRAM requirements. Here's a rough guide for common scenarios:",
      blocks: [
        {
          kind: 'table',
          caption: 'Approximate VRAM for base weights by model size and quantization',
          columns: ['Model Size', 'FP16 VRAM', 'Q8_0 VRAM', 'Q4_K_M VRAM', 'Recommended GPU(s)'],
          rows: [
            ['7B-8B', '~14-16 GB', '~8-9 GB', '~5-6 GB', '1× 24GB'],
            ['13B-14B', '~26-28 GB', '~14-15 GB', '~8-10 GB', '1× 48GB or 2× 24GB'],
            ['32B-34B', '~64-68 GB', '~34-36 GB', '~20-24 GB', '2× 48GB or 4× 24GB'],
            ['70B-72B', '~140-144 GB', '~72-76 GB', '~40-48 GB', '4× 48GB or 8× 24GB'],
            ['120B (GPT-OSS)', 'N/A', '~120 GB', '~60-72 GB', '4× 48GB (llama.cpp)'],
          ],
        },
        { kind: 'callout', variant: 'info', title: 'Note', md: 'These are base model weights only. KV cache for long contexts adds significant VRAM overhead. A 70B model at 32K context may need 20-40GB additional VRAM for KV cache.' },
      ],
    },
  ],
  attribution: 'Cortex Configuration Guide',
};

export const operationsTab: GuideTab = {
  id: 'operations',
  title: 'Model Operations',
  intro:
    'Once a model is configured, you can manage its lifecycle through the Models page. This guide covers the actions available for each model: starting, stopping, testing, viewing logs, archiving, and deleting configurations.',
  sections: [
    {
      id: 'ops-lifecycle',
      title: 'Model Lifecycle',
      blocks: [
        { kind: 'p', md: '`stopped` (not running) → `starting` (container init) → `loading` (loading weights) → `running` (ready for requests) — or `failed` (error occurred) → check logs' },
        { kind: 'p', md: 'Stopping passes through `stopping` back to `stopped`. While a model is loading, the Stop button reads **Cancel**.' },
      ],
    },
    {
      id: 'ops-actions',
      title: 'Available Actions',
      blocks: [
        {
          kind: 'cards',
          items: [
            { icon: '▶️', title: 'Start', md: 'Launch the model container and begin loading weights into GPU memory\n**When:** Model is stopped or failed\n**Effect:** Creates Docker container, mounts model files, starts inference engine' },
            { icon: '⏹️', title: 'Stop', md: 'Gracefully shut down the model container and release GPU resources\n**When:** Model is starting or running\n**Effect:** Stops the container and frees VRAM; the model returns to stopped' },
            { icon: '❌', title: 'Cancel', md: "Abort a model that's taking too long to load\n**When:** Model is loading (the Stop button reads Cancel)\n**Effect:** Same as Stop—terminates the loading process" },
            { icon: '🧪', title: 'Test', md: 'Send a test request to verify the model responds correctly\n**When:** Model is Running\n**Effect:** Sends a simple prompt, displays response and latency' },
            { icon: '📋', title: 'Logs', md: 'View container logs for debugging and monitoring\n**When:** Any state\n**Effect:** Opens log viewer with container output, errors, and startup messages' },
            { icon: '⚙️', title: 'Config', md: 'Edit model configuration settings\n**When:** Any state\n**Effect:** Opens the configuration wizard. Save & Apply stores the settings and restarts a running model; a stopped model keeps them for its next start.' },
            { icon: '📜', title: 'Recipe', md: 'Save current configuration as a reusable recipe\n**When:** Any state\n**Effect:** Opens the Blueprint Generation dialog; the saved recipe can be loaded into the Add Model form later' },
            { icon: '📦', title: 'Archive', md: 'Move model to vaulted configurations (hidden but preserved)\n**When:** Model is stopped or failed (the button is disabled while it runs)\n**Effect:** Model disappears from the main table and appears under Vaulted Configurations' },
            { icon: '🗑️', title: 'Delete', md: 'Permanently remove model configuration\n**When:** Model is Archived\n**Effect:** Configuration and any recipes saved from it are deleted; model files on disk are preserved' },
          ],
        },
      ],
    },
    {
      id: 'ops-starting',
      title: 'Starting a Model',
      intro: 'When you click **Start**, Cortex performs a series of operations:',
      blocks: [
        {
          kind: 'steps',
          items: [
            { title: 'Pre-flight (Dry Run)', md: 'Cortex builds the exact engine command, checks the image cache and estimates VRAM. If the check passes you see a toast with the estimate; if it reports errors a dialog lists them and you choose **Start anyway** or cancel.' },
            { title: 'Container Creation', md: 'A Docker container is created with the appropriate inference engine (vLLM or llama.cpp), GPU assignments, and volume mounts for model files.' },
            { title: 'Engine Startup', md: 'The inference engine starts inside the container. For Online mode, this includes downloading model weights from HuggingFace if not cached.' },
            { title: 'Model Loading', md: 'Weights are loaded into GPU memory. This is the longest step—large models can take several minutes. State shows as "Loading" with a pulsing indicator.' },
            { title: 'Health Check', md: "Cortex polls the model's readiness endpoint. When the model responds healthy, state transitions to \"Running\" and you see a success toast. If it fails, the state badge shows **FAILED** with the reason (hover or open Logs to see it), and the Logs modal runs a diagnosis." },
          ],
        },
        { kind: 'callout', variant: 'info', title: 'Tip', md: 'The Models page polls more frequently (every 3 seconds) when models are in Loading state, automatically updating when they become ready.' },
      ],
    },
    {
      id: 'ops-logs',
      title: 'Understanding Logs',
      intro: 'The **Logs** button opens a viewer showing container output. Logs are essential for diagnosing startup failures and performance issues.',
      blocks: [
        { kind: 'h', level: 3, text: 'What to Look For' },
        {
          kind: 'list',
          items: [
            '✓ **Startup messages:** Engine version, model path, GPU detection',
            '✓ **Loading progress:** Layer loading, memory allocation',
            '✓ **"Model loaded" or "Ready":** Confirms successful startup',
            '! **Error messages:** CUDA errors, OOM, path not found',
            '! **Warnings:** Compatibility issues, suboptimal settings',
          ],
        },
        { kind: 'h', level: 3, text: 'Common Log Patterns' },
        {
          kind: 'table',
          caption: 'Log lines you will see and what they mean',
          columns: ['Pattern', 'Meaning'],
          rows: [
            ['`CUDA out of memory`', 'Model too large for available VRAM. Reduce context, use quantization, or add GPUs.'],
            ['`Model path not found`', "The specified model path doesn't exist inside the container. Check volume mounts."],
            ['`Loading model weights...`', 'Normal—model is being loaded. Large models take several minutes.'],
            ['`avg generation throughput`', 'vLLM is running and reporting performance metrics.'],
          ],
        },
        { kind: 'h', level: 3, text: 'Diagnostic Banner' },
        { kind: 'p', md: 'When viewing logs for a failed model, Cortex shows a diagnostic banner at the top with a diagnosis produced by matching the log tail against a table of known error patterns. It provides actionable suggestions for common issues like CUDA version mismatches, path errors, and OOM conditions.' },
      ],
    },
    {
      id: 'ops-testing',
      title: 'Testing Models',
      intro: 'The **Test** button sends a quick request to verify your model works:',
      blocks: [
        {
          kind: 'cards',
          items: [
            { title: 'For Generate (Chat) Models', md: 'Sends a simple chat completion request with a brief prompt. Validates that the model generates text and reports the round-trip latency.' },
            { title: 'For Embed Models', md: 'Sends a text embedding request. Validates that the model returns vectors of the expected dimension.' },
          ],
        },
        { kind: 'h', level: 3, text: 'Test Results Show' },
        {
          kind: 'list',
          items: [
            '**Success/Failure status**',
            '**Round-trip latency** of the test request (no time-to-first-token)',
            "**Token usage** (prompt / completion / total) when the engine's response includes it",
            '**Sample output** (truncated for display)',
          ],
        },
        { kind: 'callout', variant: 'info', title: 'Best Practice', md: 'Always run a test after starting a new model to catch configuration issues before users hit them. A successful test confirms end-to-end functionality.' },
      ],
    },
    {
      id: 'ops-archive-delete',
      title: 'Archiving & Deleting',
      blocks: [
        { kind: 'h', level: 3, text: '📦 Archiving' },
        { kind: 'p', md: 'Archiving moves a model to the "Vaulted Configurations" section at the bottom of the page. The configuration is preserved but hidden from the main view.' },
        {
          kind: 'list',
          items: [
            "Use for models you're not currently using but may need later",
            'Only stopped or failed models can be archived; archived models can still show their logs and be deleted from the vault',
            'Helps keep the main table focused on active deployments',
          ],
        },
        { kind: 'h', level: 3, text: '🗑️ Deleting' },
        { kind: 'p', md: 'Deleting permanently removes the model configuration from Cortex. This action is only available for archived models (two-step safety).' },
        {
          kind: 'list',
          items: [
            'Configuration and any recipes saved from this model are permanently removed',
            '**Model files on disk are preserved**—Cortex never deletes your weights',
            'To restore, you must add the model again from scratch',
          ],
        },
        { kind: 'callout', variant: 'info', title: 'Safety Note', md: 'Before deleting, consider saving the configuration as a Recipe so you can easily recreate it if needed.' },
      ],
    },
    {
      id: 'ops-reconfigure',
      title: 'Reconfiguring Models',
      intro: "Click **Config** to modify a model's settings. Changes are saved but require a restart to take effect.",
      blocks: [
        { kind: 'h', level: 3, text: 'What You Can Change' },
        {
          kind: 'list',
          items: ['GPU allocation (add/remove GPUs)', 'Context length, batch sizes, memory utilization', 'Request defaults (temperature, penalties, etc.)', 'Custom startup arguments and environment variables'],
        },
        { kind: 'callout', variant: 'warning', title: 'Save & Apply', md: 'Click **Save & Apply** to persist your changes. If the model is running, the current container is stopped and a new one starts with the updated configuration (brief downtime). If the model is stopped, the settings are saved and used the next time you start it. Leaving a numeric field empty means "use the engine default".' },
        { kind: 'custom', id: 'models-cta' },
      ],
    },
  ],
  attribution: 'Cortex Model Operations Guide',
};

const RECIPE_JSON = `{
  "id": 3,
  "name": "Llama 3.1 8B Production",
  "description": "2x A6000",
  "model_name": "Llama 3.1 8B",
  "served_model_name": "llama-3.1-8b",
  "task": "generate",
  "engine_type": "vllm",
  "mode": "online",
  "repo_id": "meta-llama/Llama-3.1-8B-Instruct",
  "local_path": null,
  "config": {
    "tp_size": 2,
    "selected_gpus": [0, 1],
    "max_model_len": 32768,
    "gpu_memory_utilization": 0.9,
    "dtype": "bfloat16",
    "temperature": 0.7,
    "engine_startup_args_json": "[]",
    ...
  }
}`;

export const recipesTab: GuideTab = {
  id: 'recipes',
  title: 'Recipes',
  intro:
    "**What are Recipes?** Recipes are saved model configurations that you can reuse to deploy models with the same settings. They're perfect for standardizing deployments, sharing configurations across environments, or quickly recreating a working setup.",
  sections: [
    {
      id: 'recipes-why',
      title: 'Why Use Recipes?',
      blocks: [
        {
          kind: 'cards',
          items: [
            { icon: '⚡', title: 'Quick Deployment', md: 'Deploy models in seconds by applying a saved recipe instead of configuring from scratch' },
            { icon: '🔄', title: 'Reproducibility', md: 'Ensure consistent settings across deployments, environments, or servers' },
            { icon: '📤', title: 'Sharing', md: "Read a recipe's JSON with `GET /admin/recipes/{id}` and POST it to another Cortex instance" },
            { icon: '🛡️', title: 'Backup', md: 'Save working configurations before making changes—easy rollback if needed' },
          ],
        },
      ],
    },
    {
      id: 'recipes-create',
      title: 'Creating a Recipe',
      intro: 'There are two ways to create a recipe:',
      blocks: [
        { kind: 'h', level: 3, text: 'Method 1: From an Existing Model' },
        {
          kind: 'steps',
          items: [
            { title: 'Find the model', md: 'In the Models table, find the model you want to save' },
            { title: 'Click Recipe', md: 'Click the **Recipe** button in the Actions column' },
            { title: 'Name the blueprint', md: 'In the **Blueprint Generation** dialog, enter a Blueprint Name (e.g., "Llama 3.1 8B - 4 GPU Production") and an optional Strategy Description' },
            { title: 'Catalog it', md: 'Click **Catalog Blueprint**' },
          ],
        },
        { kind: 'p', md: 'The recipe captures all settings: engine, mode, GPU allocation, context length, request defaults, and custom arguments.' },
        { kind: 'h', level: 3, text: 'Method 2: During Model Creation' },
        {
          kind: 'steps',
          items: [
            { title: 'Configure a new model', md: 'Configure a new model through the Add Model wizard' },
            { title: 'Save it once it works', md: 'After the model is created and working, use Method 1 to save it' },
          ],
        },
        { kind: 'p', md: 'Tip: Always test a configuration before saving as a recipe to ensure it works correctly.' },
      ],
    },
    {
      id: 'recipes-use',
      title: 'Using Recipes',
      intro: 'Access your saved recipes from the **Recipes** button in the Models page header.',
      blocks: [
        { kind: 'h', level: 3, text: '▶️ Applying a Recipe' },
        {
          kind: 'steps',
          items: [
            { title: 'Open Recipes', md: 'Click **Recipes** in the page header' },
            { title: 'Pick one', md: 'Find your recipe in the list' },
            { title: 'Load it', md: 'Click **Load**' },
            { title: 'Review the wizard', md: 'The Add Model wizard opens pre-filled with recipe settings' },
            { title: 'Launch', md: 'Adjust if needed, then click **Launch Model**' },
          ],
        },
        { kind: 'h', level: 3, text: '📋 What Recipes Store' },
        {
          kind: 'list',
          items: [
            'Engine type (vLLM or llama.cpp)',
            'Mode (Online/Offline) and model source',
            'Model name and served model name',
            'Task type (generate/embed)',
            'GPU allocation and tensor parallelism settings',
            'Engine-specific configuration (context, memory, etc.)',
            'Request defaults (temperature, penalties, etc.)',
            'Custom startup arguments and environment variables',
          ],
        },
        { kind: 'callout', variant: 'info', title: 'Note', md: 'When applying a recipe, you can modify any settings before creating the model. The recipe serves as a starting point, not a rigid template.' },
      ],
    },
    {
      id: 'recipes-manage',
      title: 'Managing Recipes',
      intro: 'The Recipes modal shows all your saved configurations with options to manage them:',
      blocks: [
        {
          kind: 'cards',
          items: [
            { icon: '📥', title: 'Load', md: 'Open the Add Model wizard prefilled with the recipe (mode is derived from the source)' },
            { icon: '🔌', title: 'API', md: '`GET`/`POST`/`PATCH`/`DELETE /admin/recipes/{id}` and `POST /admin/recipes/from-model/{id}` for automation' },
            { icon: '🗑️', title: 'Delete', md: 'Remove a recipe you no longer need (asks for confirmation). Deleting a model also deletes the recipes saved from it.' },
          ],
        },
        { kind: 'h', level: 3, text: 'Recipe JSON Format (GET /admin/recipes/{id})' },
        { kind: 'p', md: 'A recipe is identity plus a `config` object holding every engine field and the request defaults. The same shape (plus `recipe_name`) is accepted by `POST /admin/recipes`:' },
        { kind: 'code', lang: 'json', label: 'Recipe JSON', copy: false, text: RECIPE_JSON },
      ],
    },
    {
      id: 'recipes-best-practices',
      title: 'Recipe Best Practices',
      blocks: [
        { kind: 'h', level: 3, text: '✓ Recommended' },
        {
          kind: 'checklist',
          items: [
            '**Use descriptive names** — Include model name, size, and use case',
            '**Test before saving** — Verify the configuration works correctly',
            '**Create environment variants** — "Model-Dev", "Model-Prod" with different settings',
            '**Back up via the API** — `GET /admin/recipes/{id}` returns the full JSON',
            '**Version your recipes** — "Llama3-v1", "Llama3-v2" when updating',
          ],
        },
        { kind: 'h', level: 3, text: '💡 Tips' },
        {
          kind: 'list',
          items: [
            "Recipes don't store model files—ensure files exist when applying recipes on new servers",
            'GPU indices in recipes may need adjustment for different hardware configurations',
            'For Online mode recipes, ensure HF token is configured if model is gated',
            'Create a "baseline" recipe for each model family, then derive variants',
          ],
        },
      ],
    },
    {
      id: 'recipes-naming',
      title: 'Naming Convention Examples',
      blocks: [
        { kind: 'h', level: 3, text: 'Good Recipe Names' },
        { kind: 'checklist', items: ['`Llama-3.1-8B-Instruct-2GPU-32K`', '`Mistral-7B-v0.3-Production-Q8`', '`GPT-OSS-120B-4GPU-llamacpp`', '`Nomic-Embed-v1.5-HighThroughput`', '`Qwen2.5-32B-Offline-Dev`'] },
        { kind: 'h', level: 3, text: 'Avoid These' },
        { kind: 'list', items: ['✗ `recipe1`', '✗ `test`', '✗ `model config`', '✗ `new recipe (2)`'] },
        { kind: 'custom', id: 'models-cta' },
      ],
    },
  ],
  attribution: 'Cortex Recipes Guide',
};

export const troubleshootingTab: GuideTab = {
  id: 'troubleshooting',
  title: 'Troubleshooting',
  intro:
    'Model deployment can sometimes encounter issues. This guide covers common problems, their causes, and how to resolve them. Always check the **Logs** for detailed error messages—they often provide specific information about what went wrong.',
  sections: [
    {
      id: 'ts-checklist',
      title: 'Quick Diagnostics Checklist',
      intro: 'Before diving into specific issues, run through this quick checklist:',
      blocks: [
        {
          kind: 'checklist',
          items: [
            'Are GPUs detected? Check the [Health page](/health)',
            'Is there enough free VRAM for the model?',
            'Is Docker running and accessible?',
            'Can Cortex reach the model files (volume mounted)?',
            'For Online mode: Is HF token set for gated models?',
            'For Offline mode: Do model files exist at the path?',
            'Is another model already using the same GPUs?',
            'Have you checked the container logs?',
          ],
        },
      ],
    },
    {
      id: 'ts-common-issues',
      title: 'Common Issues & Solutions',
      blocks: [
        {
          kind: 'issues',
          items: [
            {
              title: 'CUDA out of memory',
              symptoms: ['Model fails during loading with OOM error', "Error mentions 'CUDA error: out of memory'", 'Model loads partially then crashes'],
              causes: ['Model weights exceed available VRAM', 'KV cache for requested context length too large', 'Another model or process using GPU memory'],
              solutions: ['Reduce max_model_len (context length) — start with 4096-8192', 'Lower gpu_memory_utilization (try 0.85)', 'Use more GPUs (increase tensor parallelism)', 'Use a more aggressively quantized model (Q4 instead of Q8)', 'Stop other models using the same GPUs', 'For vLLM: Try FP8 quantization or KV cache FP8'],
            },
            {
              title: 'Model path not found / Invalid model path',
              symptoms: ["Error: 'Model path not found'", "Error: 'No such file or directory'", "Model stuck in 'starting' state then fails"],
              causes: ['`CORTEX_MODELS_DIR` points at the wrong host directory', 'Model folder not mounted into container', 'Typo in folder/file name', 'Volume mount permissions issue'],
              solutions: ['Verify `CORTEX_MODELS_DIR` (shown read-only in Model Selection; `{{MODELS_DIR}}` on this host) matches your Docker volume mount', 'Check that `/models` in container maps to your model directory on host', "For Offline mode: Use 'Refresh' to rescan and verify folder appears", 'Ensure model folder name matches exactly (case-sensitive)', 'Check file permissions on model directory'],
            },
            {
              title: 'HuggingFace authentication failed',
              symptoms: ["Error: '401 Unauthorized' or 'Access denied'", 'Model download fails immediately', "Error mentions 'gated model' or 'access required'"],
              causes: ['Missing HF token for gated model (Llama, Mistral, etc.)', 'Invalid or expired HF token', "Haven't accepted model license on HuggingFace"],
              solutions: ['Visit the model page on HuggingFace and accept the license agreement', "Generate a new HF token with 'Read' permissions at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)", "Enter the token in the 'HF Token' field when adding the model", 'Verify token works: `huggingface-cli whoami`'],
            },
            {
              title: 'NVIDIA driver incompatible / CUDA version mismatch',
              symptoms: ["Error: 'nvidia-container-cli: initialization error'", "Error mentions 'CUDA version' or 'driver version'", 'Container starts but GPU not accessible'],
              causes: ["NVIDIA driver too old for the container's CUDA version", 'nvidia-container-toolkit not installed', 'Docker not configured for GPU access'],
              solutions: ['Update the NVIDIA driver: 580+ for the pinned vLLM image (`{{VLLM_IMAGE}}`, CUDA 13), 570+ for llama.cpp (`{{LLAMACPP_IMAGE}}`, CUDA 12.8); see the [driver update guide]({{DOCS_URL}}operations/UPDATE_NVIDIA_DRIVERS/)', 'Install nvidia-container-toolkit if missing', 'Verify driver: `nvidia-smi` should show GPUs', 'Reboot after driver updates', 'Check Docker GPU access: `docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi`'],
            },
            {
              title: 'Model architecture not supported',
              symptoms: ["vLLM error: 'Model architecture not supported'", 'Error loading a recently released architecture', 'Unknown model type errors'],
              causes: ["Using vLLM with a model it doesn't support", 'gpt-oss started on vLLM without its parser/quantization settings', 'Custom architecture without trust_remote_code'],
              solutions: ['For gpt-oss safetensors: use vLLM with reasoning parser gpt_oss, tool-call parser openai and quantization mxfp4; GGUF conversions run on llama.cpp', "For custom architectures: Enable 'Trust remote code' in vLLM", 'Check vLLM supported model list in their documentation', 'Consider converting model to GGUF format for llama.cpp'],
            },
            {
              title: 'Tokenizer not found (vLLM SafeTensors folder)',
              symptoms: ["Error: 'Tokenizer not found' or 'tokenizer.json missing'", 'vLLM model fails to start', 'Model loads but generates garbage'],
              causes: ['The folder holds weights but no tokenizer files', 'Custom tokenizer needs tokenizer_mode=slow/mistral', 'GGUF file added under vLLM (rejected: gguf_requires_llamacpp)'],
              solutions: ['Copy tokenizer.json / tokenizer_config.json into the model folder', 'Or set the optional Tokenizer (HF repo or path) under Model Selection > Tokenizer & config overrides', 'Set tokenizer_mode in the spec section for Mistral tokenizers', 'For GGUF files use llama.cpp: the tokenizer is inside the GGUF'],
            },
            {
              title: 'Flash Attention errors',
              symptoms: ["Error: 'Flash attention not supported'", 'Performance warnings about attention backend', 'Crash during attention computation'],
              causes: ["GPU doesn't support Flash Attention 2 (pre-Ampere)", 'CUDA compute capability < 8.0', 'Incompatible attention configuration'],
              solutions: ['Disable Flash Attention for older GPUs (RTX 20xx and earlier)', 'For vLLM: leave Attention backend unset, or pick TRITON_ATTN / TORCH_SDPA', "For llama.cpp: Set Flash attention to 'off' (and keep the V cache at f16)", 'Check GPU compute capability: `nvidia-smi --query-gpu=compute_cap`'],
            },
            {
              title: 'Multi-part GGUF files not loading',
              symptoms: ['Only part of model loads', 'Error about missing parts', 'Start rejected with gguf_requires_llamacpp'],
              causes: ['GGUF chosen under vLLM (the gateway rejects it)', 'Missing parts in the sequence', 'Parts not in same directory'],
              solutions: ['Use llama.cpp: it loads split GGUF files natively when pointed at the first part', 'Ensure all parts are present: -00001-of-00003.gguf through -00003-of-00003.gguf', 'No merge step is needed', "Verify part count matches the 'of-XXXX' in filename"],
            },
            {
              title: 'Model takes too long to load',
              symptoms: ['Loading state persists for 10+ minutes', 'No errors but model never becomes ready', 'Slow progress in logs'],
              causes: ['Large model with limited PCIe bandwidth', 'Downloading from HuggingFace (Online mode)', 'Slow storage (HDD instead of SSD/NVMe)'],
              solutions: ['Be patient—70B+ models can take 5-15 minutes to load', 'Use local files (Offline mode) to skip download step', 'Move model files to fast storage (NVMe recommended)', 'Check logs for actual progress vs. stuck state', 'First load caches; subsequent loads are faster'],
            },
          ],
        },
      ],
    },
    {
      id: 'ts-commands',
      title: 'Useful Diagnostic Commands',
      blocks: [
        {
          kind: 'steps',
          items: [
            { title: 'Check GPU Status', md: 'Shows GPU utilization, memory usage, and running processes', code: 'nvidia-smi' },
            { title: 'Check Docker Containers', md: 'Lists every Cortex-managed engine container (`vllm-model-<id>` / `llamacpp-model-<id>`) and its status; remove a stuck one with `docker rm -f`', code: 'docker ps -a --filter label=cortex.managed=1' },
            { title: 'View Container Logs', md: 'Shows recent logs from a specific container', code: 'docker logs <container_id> --tail 100' },
            { title: 'Check Volume Mounts', md: 'Verifies model directory is properly mounted', code: 'docker inspect <container_id> | grep -A5 Mounts' },
            { title: 'Test HF Token', md: 'Verifies HuggingFace authentication is working', code: 'huggingface-cli whoami' },
            { title: 'Check Disk Space', md: 'Ensures sufficient space for model files and cache', code: 'df -h {{MODELS_DIR}}' },
          ],
        },
      ],
    },
    {
      id: 'ts-help',
      title: 'When to Seek Help',
      intro: "If you've tried the solutions above and are still stuck, gather this information before seeking help:",
      blocks: [
        { kind: 'h', level: 3, text: 'Collect This Information' },
        { kind: 'list', items: ['Full container logs (click Logs, copy all)', 'Model configuration (engine, mode, settings)', 'GPU info (nvidia-smi output)', 'Cortex version and engine versions', 'Steps to reproduce the issue'] },
        { kind: 'h', level: 3, text: 'Resources' },
        {
          kind: 'link-cards',
          items: [
            { title: 'vLLM Documentation', md: 'Official vLLM docs', href: 'https://docs.vllm.ai' },
            { title: 'llama.cpp GitHub', md: 'Source, issues and discussions', href: 'https://github.com/ggml-org/llama.cpp' },
            { title: 'NVIDIA Container Toolkit', md: 'GPU access for Docker', href: 'https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/overview.html' },
          ],
        },
        { kind: 'custom', id: 'models-cta' },
      ],
    },
  ],
  attribution: 'Cortex Troubleshooting Guide',
};

export const manageModels: GuideTabGroup = {
  id: 'manage-models',
  title: 'Model Management',
  intro: 'Deploy, configure, and manage models with Cortex. This guide covers everything from choosing the right inference engine to optimizing performance for your workloads.',
  tabs: [
    { ...overviewTab, label: 'Overview', icon: '📋' },
    { ...enginesTab, label: 'Engines', icon: '⚙️' },
    { ...addingTab, label: 'Adding Models', icon: '➕' },
    { ...configTab, label: 'Configuration', icon: '🔧' },
    { ...operationsTab, label: 'Operations', icon: '🎮' },
    { ...recipesTab, label: 'Recipes', icon: '📜' },
    { ...troubleshootingTab, label: 'Troubleshooting', icon: '🔍' },
  ],
};

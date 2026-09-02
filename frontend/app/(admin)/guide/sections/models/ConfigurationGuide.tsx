'use client';

import { Card, SectionTitle, InfoBox, Badge } from '../../../../../src/components/UI';

export default function ConfigurationGuide() {
  return (
    <section className="space-y-6">
      {/* Introduction */}
      <Card className="p-5 bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-red-500/5 border-white/5 space-y-3">
        <p className="text-[13px] text-white/80 leading-relaxed">
          Model configuration determines resource allocation, performance characteristics, and behavior.
          This guide covers the key settings for both vLLM and llama.cpp engines, helping you optimize
          for your specific hardware and workload requirements.
        </p>
        <InfoBox variant="cyan" title="Empty means engine default" className="text-[11px] p-3">
          Every field you leave empty is <strong>not sent</strong> to the engine, so the engine&apos;s own default applies
          (shown as <em>(engine default)</em> next to the field). Only type a value when you want to override it.
          Sliders are paired with a number box and a <strong>Reset</strong> link that returns the field to unset.
        </InfoBox>
        <InfoBox variant="blue" title="Every engine flag is reachable" className="text-[11px] p-3">
          The curated sections cover the common settings. Everything else the gateway knows about is listed under
          <strong> More options (from the engine spec)</strong>, grouped by topic, with the exact CLI flag in the help text.
        </InfoBox>
      </Card>

      {/* vLLM Configuration */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">vLLM Configuration (v0.28)</SectionTitle>

        <Card className="p-3 bg-blue-500/10 border-blue-500/30 flex items-start gap-3">
          <span className="text-lg">💡</span>
          <div className="flex-1">
            <p className="text-[11px] text-white/80 leading-relaxed">
              <strong className="text-blue-300">Looking for model-specific settings?</strong> The{' '}
              <a href="https://docs.vllm.ai/projects/recipes/en/latest/index.html" target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200 underline underline-offset-2">vLLM Recipes</a>
              {' '}site provides official guidance for popular models (Llama, Qwen, DeepSeek, Nemotron, gpt-oss).
              Their extra flags go into <strong>Startup Config</strong> as custom args, or use one of the presets there.
            </p>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4 bg-blue-500/5 border-blue-500/20 space-y-4">
            <div className="text-[11px] font-bold text-blue-300 uppercase tracking-wider">Core Settings</div>
            <ConfigItem name="DType (--dtype)" options={['auto', 'float16', 'bfloat16', 'float32']} default="auto"
              description="Precision for model weights. 'auto' follows the checkpoint. bfloat16 is the safe choice on Ampere and newer GPUs."
              tip="float16 can overflow on some models; bfloat16 handles larger value ranges." />
            <ConfigItem name="Device" options={['GPU', 'CPU']} default="GPU"
              description="CPU mode starts the container without GPU access. Selected GPUs are ignored in CPU mode."
              tip="Use CPU only for tiny models or smoke tests." />
            <ConfigItem name="Selected GPUs" options={['GPU indices (0, 1, 2...)']} default="GPU 0"
              description="GPUs exposed to the container. Tensor parallel × pipeline parallel must equal the number of selected GPUs."
              tip="Cortex keeps TP aligned when you tick GPUs; the Summary step flags a mismatch before you launch." />
            <ConfigItem name="Tensor / Pipeline parallel size" options={['1 - 64', '1 - 16']} default="1 / 1"
              description="--tensor-parallel-size shards every layer across GPUs; --pipeline-parallel-size splits layers into stages. Both are emitted only when > 1."
              tip="TP for a single node with fast interconnect; PP only when the model does not fit with TP alone." />
            <ConfigItem name="GPU Memory Utilization (--gpu-memory-utilization)" options={['0.05 - 0.99']} default="0.9 (engine 0.92)"
              description="Share of each GPU's VRAM vLLM may reserve for weights plus KV cache."
              tip="'Not enough KV cache memory' errors: raise this, lower context length, or set an explicit KV cache memory (bytes) in the spec section." />
            <ConfigItem name="Max Context Length (--max-model-len)" options={['512 - 262144', 'empty = model default']} default="model config"
              description="Upper bound of tokens per request. Empty lets vLLM read max_position_embeddings from the checkpoint."
              tip="KV cache VRAM scales linearly with context. Lower it explicitly on small GPUs." />
            <ConfigItem name="Trust Remote Code (--trust-remote-code)" options={['on', 'off']} default="off"
              description="Allow custom Python from the checkpoint. Required for Nemotron and some Qwen/DeepSeek architectures."
              tip="Only enable for sources you trust." />
          </Card>

          <Card className="p-4 bg-orange-500/5 border-orange-500/20 space-y-4">
            <div className="text-[11px] font-bold text-orange-300 uppercase tracking-wider">Memory, Quantization & Attention</div>
            <ConfigItem name="Attention Backend (--attention-backend)" options={['auto', 'FLASH_ATTN', 'FLASHINFER', 'TRITON_ATTN', 'FLEX_ATTENTION', 'TORCH_SDPA']} default="auto"
              description="Force one attention implementation. FLASHINFER helps long contexts and MoE; TORCH_SDPA is the broadest fallback."
              tip="The FA2 badge next to the field tells you whether your primary GPU supports Flash Attention 2 (SM 80+)." />
            <ConfigItem name="Quantization (--quantization)" options={['awq', 'awq_marlin', 'gptq', 'gptq_marlin', 'fp8', 'compressed-tensors', 'modelopt', 'modelopt_fp4', 'mxfp4', 'torchao', 'experts_int8', 'bitsandbytes']} default="none"
              description="Weight quantization method. Pre-quantized checkpoints are usually auto-detected; set this only to force a kernel or when the config does not declare it."
              tip="AWQ/GPTQ need matching repos; fp8 is dynamic for any model (best on Hopper/Ada); bitsandbytes and experts_int8 quantize at load time." />
            <ConfigItem name="KV Cache DType (--kv-cache-dtype)" options={['auto', 'bfloat16', 'float16', 'fp8', 'fp8_e4m3', 'fp8_e5m2', 'fp8_inc', 'nvfp4']} default="auto"
              description="Precision of the KV cache. fp8 variants halve KV memory with minor quality impact."
              tip="nvfp4 needs Blackwell; fp8_inc is for Intel Gaudi." />
            <ConfigItem name="KV Block Size (--block-size)" options={['1', '8', '16', '32', '64', '128']} default="16"
              description="Paging granularity of the KV cache."
              tip="8 reduces fragmentation for long contexts on tight VRAM." />
            <ConfigItem name="CPU Offload (--cpu-offload-gb)" options={['0 - 128 GiB per GPU']} default="0"
              description="Spill part of the weights to system RAM."
              tip="Needs fast PCIe/NVLink; trades latency for capacity." />
          </Card>

          <Card className="p-4 bg-cyan-500/5 border-cyan-500/20 space-y-4">
            <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">Scheduling & Throughput</div>
            <ConfigItem name="Max Batched Tokens (--max-num-batched-tokens)" options={['256 - 65536']} default="2048"
              description="Tokens processed per scheduler step. Higher raises prefill throughput and VRAM use."
              tip="2048-8192 with chunked prefill is typical." />
            <ConfigItem name="Max Concurrent Sequences (--max-num-seqs)" options={['1 - 2048']} default="128"
              description="Upper bound on simultaneously active requests."
              tip="Start at 128-256; more concurrency needs more KV cache." />
            <ConfigItem name="Enforce Eager (--enforce-eager)" options={['on', 'off']} default="off"
              description="Disables CUDA graphs and torch.compile: fastest startup, slower decode."
              tip="Leave off for production; turn on to debug crashes during graph capture." />
            <ConfigItem name="Prefix Caching / Chunked Prefill" options={['default', 'on', 'off']} default="on (engine)"
              description="Three-state switches: 'Default' sends nothing, 'On'/'Off' send --enable-x / --no-enable-x."
              tip="Both are on by default in vLLM v0.28." />
            <ConfigItem name="CUDA Graph Capture Sizes (--cudagraph-capture-sizes)" options={['e.g. 1,2,4,8,16']} default="engine default"
              description="Batch sizes to pre-capture. Ignored when Enforce Eager is on." tip="Only tune for steady, predictable workloads." />
          </Card>

          <Card className="p-4 bg-indigo-500/5 border-indigo-500/20 space-y-4">
            <div className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">More vLLM Options (spec section)</div>
            <p className="text-[11px] text-white/70 leading-relaxed">
              Grouped under collapsible headers at the end of Core Settings: tokenizer mode and load format; data/expert parallelism and the
              distributed executor; explicit KV cache memory (bytes); compilation config, async scheduling and sleep mode; chat template,
              generation config source and overrides; reasoning parser, auto tool choice and tool-call parser; structured outputs config;
              multimodal limits; LoRA (enable, modules, max LoRAs/rank, CPU LoRAs); speculative decoding config (JSON); request logging,
              stats logging, debug/trace mode, iteration timeout and max log length; seed.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {['tokenizer_mode', 'load_format', 'hf_overrides_json', 'data_parallel_size', 'enable_expert_parallel', 'kv_cache_memory_bytes', 'compilation_config_json', 'async_scheduling', 'reasoning_parser', 'tool_call_parser', 'structured_outputs_config_json', 'limit_mm_per_prompt_json', 'enable_lora', 'lora_modules_json', 'speculative_config_json', 'enable_log_requests', 'seed'].map((f) => (
                <Badge key={f} className="bg-white/5 text-white/50 border-white/5 text-[9px] normal-case">{f}</Badge>
              ))}
            </div>
          </Card>
        </div>
      </section>

      {/* llama.cpp Configuration */}
      <section className="space-y-3">
        <SectionTitle variant="emerald" className="text-[10px]">llama.cpp Configuration (llama-server b10731)</SectionTitle>
        <InfoBox variant="emerald" title="GGUF is always served by llama.cpp" className="text-[11px] p-3">
          When you pick a GGUF file, Cortex selects llama.cpp automatically and disables vLLM. The tokenizer and chat template come from the
          GGUF itself; no Hugging Face tokenizer is needed.
        </InfoBox>
        <div className="space-y-4">
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-4">
            <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Core Settings</div>
            <ConfigItem name="Context Size (-c)" options={['0 = model max', 'empty = engine default']} default="engine default"
              description="Total KV context shared by all slots. Each slot gets context ÷ slots unless the KV cache is unified."
              tip="The field shows the per-slot number live. With --fit on (default) llama.cpp trims an unset context to what fits in VRAM." />
            <ConfigItem name="Parallel Slots (-np)" options={['1 - 256', 'empty = auto']} default="auto"
              description="Concurrent request slots." tip="Few slots for long prompts, many for small concurrent requests." />
            <ConfigItem name="Batch / Micro-batch (-b / -ub)" options={['-b 2048', '-ub 512']} default="2048 / 512"
              description="Logical and physical prompt batch sizes. Larger -ub speeds prefill at the cost of VRAM." tip="Keep -ub ≤ -b." />
            <ConfigItem name="KV Cache Type K/V (--cache-type-k/-v)" options={['f32', 'f16', 'bf16', 'q8_0', 'q4_0', 'q4_1', 'iq4_nl', 'q5_0', 'q5_1']} default="f16"
              description="Quantized types halve (q8_0) or quarter (q4_0) KV memory."
              tip="A quantized V cache requires flash attention (auto/on); the Summary step blocks 'off' + quantized V." />
            <ConfigItem name="Flash Attention (--flash-attn)" options={['auto', 'on', 'off']} default="auto"
              description="A three-way select, not a checkbox. 'auto' enables it when the backend supports it."
              tip="Force 'off' only on GPUs without support (pre-Ampere)." />
            <ConfigItem name="Load Mode (--load-mode)" options={['auto', 'none', 'mmap', 'mlock', 'dio']} default="auto"
              description="Replaces the old mlock / no-mmap switches: mmap = memory-map, mlock = pin in RAM, dio = direct I/O, none = read fully."
              tip="mlock needs enough free RAM for the whole file." />
          </Card>

          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-4">
            <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">GPU Placement</div>
            <ConfigItem name="GPU Layers (-ngl)" options={['empty = auto', '0 = CPU only', '999 = all']} default="auto"
              description="Layers offloaded to the GPU. Empty lets llama.cpp decide (with --fit it picks what fits)." tip="Lower values enable CPU+GPU hybrid inference." />
            <ConfigItem name="Selected GPUs + Tensor Split (-ts)" options={['GPU indices', 'e.g. 3,1']} default="equal split"
              description="An equal split is generated when you change the GPU count; manual ratios are kept until the count changes." tip="Use the 'Equal split' link to regenerate." />
            <ConfigItem name="Main GPU / Split Mode (-mg / -sm)" options={['none', 'layer', 'row', 'tensor']} default="0 / layer"
              description="Which GPU holds scratch buffers and how the model is split." tip="row needs a fast interconnect." />
            <ConfigItem name="Threads (-t)" options={['1 - 512', 'empty = auto']} default="auto" description="CPU generation threads." tip="Physical cores is a good ceiling." />
            <ConfigItem name="Auto-fit (--fit) / Unified KV (--kv-unified)" options={['default', 'on', 'off']} default="fit on"
              description="--fit trims UNSET -ngl / -c to device memory. Unified KV shares one pool across slots (pair with a per-slot limit)." tip="Turn --fit off for fully explicit configs." />
          </Card>

          <Card className="p-4 bg-purple-500/5 border-purple-500/20 space-y-4">
            <div className="text-[11px] font-bold text-purple-300 uppercase tracking-wider">Speculative Decoding</div>
            <p className="text-[11px] text-white/70 leading-relaxed mb-3">
              A small draft model (or an n-gram predictor) proposes tokens that the main model verifies in one pass.
            </p>
            <ConfigItem name="Draft Model (--model-draft)" options={['path relative to the models dir']} default="(empty)"
              description="A smaller GGUF from the same family, e.g. draft/Qwen2.5-0.5B-Q8_0.gguf." tip="4-10x smaller than the main model; Q8_0 keeps drafts accurate." />
            <ConfigItem name="Speculative Type (--spec-type)" options={['draft-simple', 'draft-eagle3', 'draft-mtp', 'ngram-*']} default="draft-simple when a draft model is set"
              description="ngram-* types need no draft model." tip="Leave unset unless you know the model supports eagle3/MTP." />
            <ConfigItem name="Draft Tokens max / min (--spec-draft-n-max / -n-min)" options={['1 - 64', '0 - 64']} default="3 / engine default"
              description="How many tokens are proposed per step." tip="3-16 typical; more helps predictable text like code." />
            <ConfigItem name="Draft p_min / Draft GPU layers (--spec-draft-p-min / --spec-draft-ngl)" options={['0.0 - 1.0', '0 - 999']} default="engine default"
              description="Minimum draft probability to keep proposing, and GPU layers for the draft model." tip="Lower p_min = more aggressive speculation." />
          </Card>

          <Card className="p-4 bg-indigo-500/5 border-indigo-500/20 space-y-4">
            <div className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">More llama.cpp Options (spec section)</div>
            <p className="text-[11px] text-white/70 leading-relaxed">
              MoE layers kept on CPU (--n-cpu-moe), override tensor placement (-ot), NUMA policy, HTTP threads, continuous batching,
              cache reuse and context shift, RoPE base/scale, jinja templates, chat template file and kwargs, reasoning format and budget,
              max tokens to predict, GBNF grammar file, embeddings / pooling / rerank endpoints, LoRA adapters, multimodal projector
              (--mmproj) and offload, verbose logging, tensor checks, warmup, seed.
            </p>
          </Card>
        </div>
      </section>

      {/* Request Defaults */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Request Defaults (Both Engines)</SectionTitle>
        <Card className="p-4 bg-purple-500/5 border-purple-500/20 space-y-4">
          <p className="text-[11px] text-white/70 leading-relaxed mb-3">
            These parameters set defaults for API requests when clients don&apos;t specify them. They are applied by the gateway per request,
            never at container start, so changing them does not restart the model. Leave a field empty to use the engine&apos;s default;
            the suggested values are only placeholders.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ConfigItem name="Temperature" options={['0.0 - 2.0']} default="engine default (suggested 0.8)" description="Randomness in generation. Lower = more deterministic; higher = more creative." tip="0.0 = greedy. 0.7-0.9 for balanced output." />
            <ConfigItem name="Top P (Nucleus Sampling)" options={['0.0 - 1.0']} default="engine default (suggested 0.9)" description="Sample from tokens comprising top P probability mass." tip="0.9-0.95 is typical." />
            <ConfigItem name="Top K" options={['1 - 100']} default="engine default (suggested 40)" description="Sample from the top K highest-probability tokens." tip="Lower values make output more focused." />
            <ConfigItem name="Repetition Penalty" options={['1.0 - 2.0']} default="engine default (suggested 1.2)" description="Penalizes repeating tokens. 1.0 = no penalty." tip="1.1-1.3 prevents loops without sounding unnatural." />
            <ConfigItem name="Frequency Penalty" options={['-2.0 - 2.0']} default="engine default (suggested 0.5)" description="Penalizes tokens by how often they appeared." tip="Encourages vocabulary diversity." />
            <ConfigItem name="Presence Penalty" options={['-2.0 - 2.0']} default="engine default (suggested 0.5)" description="Penalizes tokens that appeared at all." tip="Encourages new topics." />
          </div>
          <InfoBox variant="blue" className="text-[10px] p-3">
            <strong>Custom request JSON</strong> merges extra fields (e.g. <code>vllm_xargs</code>, <code>stop</code>) into every request. It must be a JSON object.
          </InfoBox>
        </Card>
      </section>

      {/* Startup config & dry run */}
      <section className="space-y-3">
        <SectionTitle variant="red" className="text-[10px]">Startup Config, Dry Run & Save</SectionTitle>
        <Card className="p-4 bg-red-500/5 border-red-500/20 space-y-3 text-[11px] text-white/70 leading-relaxed">
          <p>
            <strong className="text-white">Custom args / env</strong> are appended after the form-managed flags and win on conflict. The editor
            flags duplicates, reserved flags (<code>--host</code>, <code>--port</code>, <code>--api-key</code>, <code>--model</code>, <code>--served-model-name</code>,
            <code>--alias</code>, <code>--root-path</code>, <code>--ssl-*</code>) and collisions with a form field. A boolean <em>false</em> is
            passed as <code>--no-&lt;flag&gt;</code>; list values take one entry per line. Presets cover Nemotron, FlashInfer MoE FP8, CPU-MoE
            offload and long-context llama.cpp.
          </p>
          <p>
            <strong className="text-white">Dry run</strong> runs automatically when the Summary step opens (Add and Configure) and can be re-run. It
            shows the exact command and environment, whether the image is cached, an estimated VRAM figure and any warnings. Errors block
            <strong> Launch / Save</strong> until you tick <em>start anyway</em>; local checks (missing name, TP × PP mismatch, GGUF under vLLM,
            invalid JSON) must be fixed first.
          </p>
          <p>
            <strong className="text-white">Save &amp; Apply</strong> (Configure) writes the configuration and, if the model is running, restarts it
            with the new settings; a stopped model just keeps the saved values for its next start.
          </p>
        </Card>
      </section>

      {/* VRAM Estimation */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">VRAM Estimation Guide</SectionTitle>
        <Card className="p-4 bg-cyan-500/5 border-cyan-500/20 space-y-4">
          <p className="text-[11px] text-white/70 leading-relaxed mb-3">
            Use the <strong className="text-cyan-300">🧮 Calculator</strong> button in the Models page to estimate
            VRAM requirements. Here&apos;s a rough guide for common scenarios:
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-white/50 border-b border-white/10">
                  <th className="pb-2 pr-4">Model Size</th>
                  <th className="pb-2 px-4">FP16 VRAM</th>
                  <th className="pb-2 px-4">Q8_0 VRAM</th>
                  <th className="pb-2 px-4">Q4_K_M VRAM</th>
                  <th className="pb-2 px-4">Recommended GPU(s)</th>
                </tr>
              </thead>
              <tbody className="text-white/70">
                <VramRow model="7B-8B" fp16="~14-16 GB" q8="~8-9 GB" q4="~5-6 GB" gpus="1× 24GB" />
                <VramRow model="13B-14B" fp16="~26-28 GB" q8="~14-15 GB" q4="~8-10 GB" gpus="1× 48GB or 2× 24GB" />
                <VramRow model="32B-34B" fp16="~64-68 GB" q8="~34-36 GB" q4="~20-24 GB" gpus="2× 48GB or 4× 24GB" />
                <VramRow model="70B-72B" fp16="~140-144 GB" q8="~72-76 GB" q4="~40-48 GB" gpus="4× 48GB or 8× 24GB" />
                <VramRow model="120B (GPT-OSS)" fp16="N/A" q8="~120 GB" q4="~60-72 GB" gpus="4× 48GB (llama.cpp)" />
              </tbody>
            </table>
          </div>
          <InfoBox variant="blue" className="text-[10px] p-3">
            <strong>Note:</strong> These are base model weights only. KV cache for long contexts adds significant
            VRAM overhead. A 70B model at 32K context may need 20-40GB additional VRAM for KV cache.
          </InfoBox>
        </Card>
      </section>

      <div className="text-[9px] text-white/20 uppercase font-black tracking-[0.3em] text-center pt-4 border-t border-white/5">
        Cortex Configuration Guide • <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/40 hover:underline transition-colors">Aulendur Labs</a>
      </div>
    </section>
  );
}

// Helper Components
function ConfigItem({ name, options, default: defaultVal, description, tip }: { name: string; options: string[]; default: string; description: string; tip: string }) {
  return (
    <div className="p-3 bg-black/20 rounded-lg border border-white/5 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-[12px] font-semibold text-white">{name}</span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/40">Default:</span>
          <Badge className="bg-white/10 text-white/70 border-white/10 text-[9px] normal-case">{defaultVal}</Badge>
        </div>
      </div>
      <p className="text-[11px] text-white/60 leading-relaxed">{description}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <Badge key={opt} className="bg-white/5 text-white/50 border-white/5 text-[9px] normal-case">{opt}</Badge>
        ))}
      </div>
      <p className="text-[10px] text-cyan-300/70 italic">💡 {tip}</p>
    </div>
  );
}

function VramRow({ model, fp16, q8, q4, gpus }: { model: string; fp16: string; q8: string; q4: string; gpus: string }) {
  return (
    <tr className="border-b border-white/5">
      <td className="py-2 pr-4 font-medium text-white">{model}</td>
      <td className="py-2 px-4">{fp16}</td>
      <td className="py-2 px-4">{q8}</td>
      <td className="py-2 px-4">{q4}</td>
      <td className="py-2 px-4 text-cyan-300">{gpus}</td>
    </tr>
  );
}

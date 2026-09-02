'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '../../../../../src/components/UI';
import { cn } from '../../../../../src/lib/cn';

export default function AddingModels() {
  return (
    <section className="space-y-6">
      {/* Introduction */}
      <Card className="p-5 bg-gradient-to-r from-emerald-500/5 via-purple-500/5 to-cyan-500/5 border-white/5">
        <p className="text-[13px] text-white/80 leading-relaxed">
          Adding a model to Cortex involves a guided workflow that walks you through engine selection, 
          model location, and configuration. This guide covers both <strong className="text-cyan-300">Online</strong> mode 
          (downloading from HuggingFace) and <strong className="text-purple-300">Offline</strong> mode 
          (using pre-downloaded local files).
        </p>
      </Card>

      {/* Add Model Button Location */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Starting the Workflow</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Navigate to <strong className="text-white">Models</strong> in the sidebar, then click the 
            <span className="inline-flex items-center mx-1.5 px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded text-[10px] font-bold">
              ➕ Add Model
            </span>
            button in the top right. This opens a step-by-step wizard that guides you through configuration.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-white/10 text-white/60 border-white/10 text-[9px]">Step 1: Engine & Mode</Badge>
            <Badge className="bg-white/10 text-white/60 border-white/10 text-[9px]">Step 2: Model Selection</Badge>
            <Badge className="bg-white/10 text-white/60 border-white/10 text-[9px]">Step 3: Core Settings</Badge>
            <Badge className="bg-white/10 text-white/60 border-white/10 text-[9px]">Step 4: Startup Config</Badge>
            <Badge className="bg-white/10 text-white/60 border-white/10 text-[9px]">Step 5: Request Defaults</Badge>
            <Badge className="bg-white/10 text-white/60 border-white/10 text-[9px]">Step 6: Summary & Launch</Badge>
          </div>
        </Card>
      </section>

      {/* Online vs Offline Modes */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Online vs Offline Mode</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Online Mode */}
          <Card className="p-5 bg-cyan-500/5 border-cyan-500/20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🌐</div>
              <div>
                <h3 className="text-[13px] font-bold text-cyan-300 uppercase tracking-wider">Online Mode</h3>
                <p className="text-[10px] text-white/50">Download from HuggingFace Hub</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">How it works</div>
              <p className="text-[11px] text-white/70 leading-relaxed">
                Provide a HuggingFace repository ID (e.g., <code className="text-cyan-300 bg-black/30 px-1 rounded">meta-llama/Llama-3.1-8B-Instruct</code>). 
                When you start the model, Cortex downloads the weights to its cache and loads them.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Required fields</div>
              <ul className="text-[11px] text-white/70 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400">•</span>
                  <span><strong>Repo ID:</strong> owner/model-name format</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400">•</span>
                  <span><strong>HF Token:</strong> Required for gated models (Llama, Mistral, etc.)</span>
                </li>
              </ul>
            </div>

            <div className="p-3 bg-black/30 rounded-lg border border-cyan-500/20 space-y-2">
              <div className="text-[10px] font-bold text-cyan-300">Example Repo IDs</div>
              <div className="text-[10px] text-white/60 space-y-1 font-mono">
                <div>meta-llama/Llama-3.1-8B-Instruct</div>
                <div>mistralai/Mistral-7B-Instruct-v0.3</div>
                <div>Qwen/Qwen2.5-7B-Instruct</div>
                <div>nomic-ai/nomic-embed-text-v1.5</div>
              </div>
            </div>

            <InfoBox variant="blue" className="text-[10px] p-2.5">
              <strong>Gated Models:</strong> Many popular models require accepting terms on HuggingFace. 
              Visit the model page, accept the license, then use an HF token with read permissions.
            </InfoBox>
          </Card>

          {/* Offline Mode */}
          <Card className="p-5 bg-purple-500/5 border-purple-500/20 space-y-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">📁</div>
              <div>
                <h3 className="text-[13px] font-bold text-purple-300 uppercase tracking-wider">Offline Mode</h3>
                <p className="text-[10px] text-white/50">Use local model files</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">How it works</div>
              <p className="text-[11px] text-white/70 leading-relaxed">
                Point to a folder containing model files on your local disk. Essential for air-gapped 
                environments, GGUF models, or when you've pre-downloaded models for faster startup.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Setup steps</div>
              <ol className="text-[11px] text-white/70 space-y-1.5">
                <StepItem num={1}>The models directory is fixed by <code>CORTEX_MODELS_DIR</code> and shown read-only</StepItem>
                <StepItem num={2}>Place model folders inside this directory on the host</StepItem>
                <StepItem num={3}>Click <strong>Refresh</strong> to scan available folders</StepItem>
                <StepItem num={4}>Select a folder—Cortex inspects its contents</StepItem>
              </ol>
            </div>

            <div className="p-3 bg-black/30 rounded-lg border border-purple-500/20 space-y-2">
              <div className="text-[10px] font-bold text-purple-300">Folder Structure Example</div>
              <pre className="text-[9px] text-white/60 font-mono">
{`/models/
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
    └── model-00003-of-00003.gguf`}
              </pre>
            </div>

            <InfoBox variant="purple" className="text-[10px] p-2.5">
              <strong>GGUF Models:</strong> When you select a folder with GGUF files, Cortex shows a 
              file picker with quantization levels. Choose your preferred variant (Q4_K_M, Q8_0, etc.).
            </InfoBox>
          </Card>
        </div>
      </section>

      {/* Step-by-Step: Online vLLM */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">Walkthrough: Online Mode with vLLM</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            The most common deployment: downloading a model from HuggingFace and running it with vLLM.
          </p>

          <div className="space-y-4">
            <WalkthroughStep 
              step={1} 
              title="Engine & Mode Selection" 
              color="blue"
            >
              <p className="text-[11px] text-white/70 leading-relaxed mb-2">
                Select <strong className="text-blue-300">vLLM</strong> as your engine and <strong className="text-cyan-300">Online</strong> as your mode.
              </p>
              <div className="flex gap-2">
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[9px]">vLLM Selected</Badge>
                <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[9px]">Online Mode</Badge>
              </div>
            </WalkthroughStep>

            <WalkthroughStep 
              step={2} 
              title="Model Selection" 
              color="emerald"
            >
              <p className="text-[11px] text-white/70 leading-relaxed mb-2">
                Enter the HuggingFace repository ID. For gated models, also provide your HuggingFace token.
              </p>
              <div className="p-2 bg-black/30 rounded border border-white/10">
                <div className="text-[10px] text-white/50 mb-1">Repo ID</div>
                <code className="text-[11px] text-emerald-300">meta-llama/Llama-3.1-8B-Instruct</code>
              </div>
            </WalkthroughStep>

            <WalkthroughStep 
              step={3} 
              title="Core Settings" 
              color="amber"
            >
              <p className="text-[11px] text-white/70 leading-relaxed mb-2">
                Configure model identity and resource allocation:
              </p>
              <ul className="text-[11px] text-white/70 space-y-1.5 ml-4">
                <li><strong>Name:</strong> Friendly display name (e.g., "Llama 3.1 8B")</li>
                <li><strong>Served Model Name:</strong> API identifier (e.g., "llama-3.1-8b")</li>
                <li><strong>Task:</strong> generate (chat) or embed (embeddings)</li>
                <li><strong>GPUs:</strong> Select which GPUs to use</li>
                <li><strong>Max Context:</strong> Token limit; empty = the model&apos;s own maximum</li>
                <li><strong>Memory Utilization:</strong> How much VRAM to use (0.8-0.95)</li>
                <li><strong>Everything else:</strong> Empty fields are not sent, so the engine default applies</li>
              </ul>
            </WalkthroughStep>

            <WalkthroughStep 
              step={4} 
              title="Startup Configuration" 
              color="red"
            >
              <p className="text-[11px] text-white/70 leading-relaxed mb-2">
                <em>Optional:</em> Add custom command-line arguments or environment variables for the inference engine.
                Most users can skip this step—it's for advanced tuning.
              </p>
            </WalkthroughStep>

            <WalkthroughStep 
              step={5} 
              title="Request Defaults" 
              color="purple"
            >
              <p className="text-[11px] text-white/70 leading-relaxed mb-2">
                <em>Optional:</em> Set default sampling parameters (temperature, top_p, repetition penalty) 
                that apply when clients don't specify them. Safe to skip for most deployments.
              </p>
            </WalkthroughStep>

            <WalkthroughStep 
              step={6} 
              title="Summary & Launch" 
              color="cyan"
            >
              <p className="text-[11px] text-white/70 leading-relaxed mb-2">
                Review the summary (source, engine image, GPUs, TP/PP, custom args). A <strong className="text-cyan-300">dry run</strong> runs
                automatically: it shows the exact command, whether the image is cached and any warnings. Errors block
                <strong className="text-cyan-300"> Launch Model</strong> until fixed or explicitly overridden. Launch creates the configuration;
                then click <strong className="text-emerald-300">Start</strong> in the Models table to deploy.
              </p>
            </WalkthroughStep>
          </div>
        </Card>
      </section>

      {/* Step-by-Step: Offline llama.cpp */}
      <section className="space-y-3">
        <SectionTitle variant="emerald" className="text-[10px]">Walkthrough: Offline Mode with llama.cpp (GGUF)</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Running a GGUF model with llama.cpp. GGUF files are always served by llama.cpp: picking a GGUF-only folder selects
            llama.cpp automatically and disables vLLM.
          </p>

          <div className="space-y-4">
            <WalkthroughStep 
              step={1} 
              title="Engine & Mode Selection" 
              color="emerald"
            >
              <p className="text-[11px] text-white/70 leading-relaxed mb-2">
                Select <strong className="text-emerald-300">llama.cpp</strong>. Mode automatically switches to 
                <strong className="text-purple-300"> Offline</strong> (llama.cpp requires local files).
              </p>
              <div className="flex gap-2">
                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px]">llama.cpp Selected</Badge>
                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[9px]">Offline Mode</Badge>
              </div>
            </WalkthroughStep>

            <WalkthroughStep 
              step={2} 
              title="Model Selection" 
              color="purple"
            >
              <div className="space-y-3">
                <p className="text-[11px] text-white/70 leading-relaxed">
                  The models directory is fixed by <code className="text-purple-300 bg-black/30 px-1 rounded">CORTEX_MODELS_DIR</code> and shown read-only.
                  Drop your model folder there, then:
                </p>
                <ol className="text-[11px] text-white/70 space-y-1.5 ml-4">
                  <li>1. Click <strong>Refresh</strong> to list the folders</li>
                  <li>2. Select your model folder from the dropdown</li>
                  <li>3. Cortex inspects the folder and shows the available GGUF quantizations</li>
                  <li>4. Pick a quantization; the file path is filled in for you</li>
                </ol>

                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg space-y-2">
                  <div className="text-[10px] font-bold text-purple-300">GGUF Selection</div>
                  <p className="text-[10px] text-white/60">
                    When multiple quantizations exist (Q4_K_M, Q5_K_M, Q8_0), Cortex groups them and 
                    recommends the best option. Multi-part files are detected automatically.
                  </p>
                </div>

                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-2">
                  <div className="text-[10px] font-bold text-emerald-300">No tokenizer needed</div>
                  <p className="text-[10px] text-white/60">
                    llama.cpp reads the tokenizer and chat template from the GGUF itself. The optional tokenizer / HF config
                    overrides only exist for vLLM SafeTensors folders.
                  </p>
                </div>
              </div>
            </WalkthroughStep>

            <WalkthroughStep 
              step={3} 
              title="Core Settings (llama.cpp specific)" 
              color="amber"
            >
              <p className="text-[11px] text-white/70 leading-relaxed mb-2">
                Configure llama.cpp-specific parameters:
              </p>
              <ul className="text-[11px] text-white/70 space-y-1.5 ml-4">
                <li><strong>Context Size (-c):</strong> Total context window; empty = engine default</li>
                <li><strong>Parallel Slots (-np):</strong> Concurrent request capacity; empty = auto</li>
                <li><strong>GPU Layers (-ngl):</strong> Empty = auto, 0 = CPU only, 999 = all</li>
                <li><strong>GPU Selection:</strong> Which GPUs to use (generates tensor_split)</li>
                <li><strong>Flash Attention:</strong> auto / on / off (quantized V cache needs it on)</li>
                <li><strong>Load Mode:</strong> auto / mmap / mlock / dio</li>
                <li><strong>KV Cache Type K/V:</strong> f16 default; q8_0 halves KV memory</li>
              </ul>
              <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-white/60">
                <strong className="text-blue-300">Context per slot:</strong> Total context ÷ parallel slots
                (unless the KV cache is unified). For 16384 context with 16 slots = 1024 tokens per slot.
              </div>
            </WalkthroughStep>

            <WalkthroughStep 
              step={4} 
              title="Advanced: Speculative Decoding" 
              color="purple"
            >
              <p className="text-[11px] text-white/70 leading-relaxed mb-2">
                <em>Optional but powerful:</em> In Core Settings, expand <strong>Speculative decoding</strong> and set the draft
                model (path relative to the models dir), the speculative type and the draft token limits (--spec-draft-n-max/-n-min,
                --spec-draft-p-min, --spec-draft-ngl).
              </p>
            </WalkthroughStep>
          </div>
        </Card>
      </section>

      {/* Tips and Common Issues */}
      <section className="space-y-3">
        <SectionTitle variant="amber" className="text-[10px]">Tips for Success</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-3">
            <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">✓ Best Practices</div>
            <ul className="text-[11px] text-white/70 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>Start with conservative settings (lower context, fewer slots) and scale up</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>Use the <strong>Calculator</strong> button to estimate VRAM before deployment</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>Run a <strong>Test</strong> after starting to verify the model responds correctly</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>Keep served model names simple and URL-safe (lowercase, hyphens)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                <span>For production, save working configs as <strong>Recipes</strong> for easy redeployment</span>
              </li>
            </ul>
          </Card>

          <Card className="p-4 bg-red-500/5 border-red-500/20 space-y-3">
            <div className="text-[10px] font-bold text-red-300 uppercase tracking-wider">✗ Common Pitfalls</div>
            <ul className="text-[11px] text-white/70 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-red-400">✗</span>
                <span>Forgetting HF token for gated models (Llama, Mistral)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400">✗</span>
                <span>Setting context length higher than available VRAM can handle</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400">✗</span>
                <span>Using vLLM with GPT-OSS models (only llama.cpp works)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400">✗</span>
                <span>Trying to serve a GGUF file with vLLM (the gateway rejects it: GGUF is llama.cpp only)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400">✗</span>
                <span>Launching with dry-run errors ticked away instead of fixed (TP × PP ≠ GPUs, image not cached)</span>
              </li>
            </ul>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <div className="flex gap-3 justify-center pt-4">
        <Link href="/models">
          <Button variant="cyan" size="sm" className="text-[10px]">
            Open Models Page →
          </Button>
        </Link>
      </div>

      <div className="text-[9px] text-white/20 uppercase font-black tracking-[0.3em] text-center pt-4 border-t border-white/5">
        Cortex Model Addition Guide • <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/40 hover:underline transition-colors">Aulendur Labs</a>
      </div>
    </section>
  );
}

// Helper Components
function StepItem({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/60">
        {num}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function WalkthroughStep({ 
  step, 
  title, 
  color, 
  children 
}: { 
  step: number; 
  title: string; 
  color: string; 
  children: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    blue: 'border-blue-500/30 bg-blue-500/5',
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    red: 'border-red-500/30 bg-red-500/5',
    purple: 'border-purple-500/30 bg-purple-500/5',
    cyan: 'border-cyan-500/30 bg-cyan-500/5',
  };
  const numColors: Record<string, string> = {
    blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    amber: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    red: 'bg-red-500/20 text-red-300 border-red-500/30',
    purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    cyan: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  };

  return (
    <div className={cn("p-3 rounded-lg border-l-4", colors[color])}>
      <div className="flex items-center gap-2 mb-2">
        <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold border", numColors[color])}>
          Step {step}
        </span>
        <span className="text-[12px] font-bold text-white">{title}</span>
      </div>
      {children}
    </div>
  );
}


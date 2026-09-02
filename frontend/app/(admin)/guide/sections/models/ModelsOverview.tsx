'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '@/components/UI';
import { cn } from '@/lib/cn';
import { Attribution } from '../Attribution';

export default function ModelsOverview() {
  return (
    <section className="space-y-6">
      {/* Hero Introduction */}
      <Card className="p-5 bg-gradient-to-r from-emerald-500/5 via-cyan-500/5 to-blue-500/5 border-white/5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <p className="text-[13px] text-white/80 leading-relaxed">
              Cortex provides a unified interface for deploying and managing Large Language Models (LLMs) 
              on your infrastructure. Whether you're running chat models, embedding services, or specialized 
              AI workloads, the Models page is where you add, start, stop and configure them.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">Chat/Generate</Badge>
              <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">Embeddings</Badge>
              <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/20">Multi-GPU</Badge>
              <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">OpenAI Compatible</Badge>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
              <StatBlock label="Supported Engines" value="2" detail="vLLM & llama.cpp" color="emerald" />
              <StatBlock label="Model Tasks" value="2" detail="Generate & Embed" color="blue" />
              <StatBlock label="GPU Support" value="Multi" detail="Tensor Parallelism" color="purple" />
              <StatBlock label="API Standard" value="v1" detail="OpenAI Compatible" color="cyan" />
            </div>
          </div>
        </div>
      </Card>

      {/* What You Can Do */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">What You Can Do</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <ActionCard 
            icon="➕" 
            title="Add Models" 
            description="Deploy models from HuggingFace or local files with guided configuration"
            color="emerald"
          />
          <ActionCard 
            icon="⚙️" 
            title="Configure" 
            description="Tune GPU allocation, context length, batch sizes, and performance settings"
            color="blue"
          />
          <ActionCard 
            icon="▶️" 
            title="Start/Stop" 
            description="Control model containers with one-click operations"
            color="purple"
          />
          <ActionCard 
            icon="📊" 
            title="Monitor" 
            description="View logs, run tests, and track model health"
            color="cyan"
          />
        </div>
      </section>

      {/* Key Concepts */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Key Concepts</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
            <ConceptItem 
              term="Inference Engine"
              definition="The software that loads and runs your model. Cortex supports vLLM (best performance for safetensors checkpoints, including gpt-oss with the gpt_oss reasoning parser and mxfp4 quantization) and llama.cpp (every GGUF file, single or multi-part)."
            />
            <ConceptItem 
              term="Model Task"
              definition="What the model does: 'generate' for chat/completion (text generation) or 'embed' for creating vector embeddings used in RAG and semantic search."
            />
            <ConceptItem 
              term="Served Model Name"
              definition="The identifier clients use to call your model via the API. This appears in API requests as the 'model' parameter (e.g., 'my-llama-3')."
            />
            <ConceptItem 
              term="Online vs Offline Mode"
              definition="Online mode downloads models from HuggingFace on-demand. Offline mode uses pre-downloaded model files from local storage—essential for air-gapped environments."
            />
          </Card>
          
          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
            <ConceptItem 
              term="Tensor Parallelism (TP)"
              definition="Splits a model across multiple GPUs to handle models larger than a single GPU's VRAM. Each GPU holds a portion of the model weights."
            />
            <ConceptItem 
              term="Context Length"
              definition="The maximum number of tokens (roughly 0.75 words each) a model can process in a single request. Longer contexts require more VRAM."
            />
            <ConceptItem 
              term="GGUF Format"
              definition="A quantized model format used by llama.cpp. GGUF files have quantization built-in (e.g., Q4_K_M, Q8_0) and are typically smaller than SafeTensors."
            />
            <ConceptItem 
              term="Managed Container"
              definition="Each model runs in its own Docker container (vllm-model-<id> or llamacpp-model-<id>) with the GPUs and settings you chose; the gateway routes requests to it by served model name."
            />
          </Card>
        </div>
      </section>

      {/* Architecture Overview */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">How It Works</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5">
          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] py-4">
            <FlowStep num={1} label="Add Model" desc="Configure settings" color="emerald" />
            <Arrow />
            <FlowStep num={2} label="Docker Container" desc="Engine starts" color="blue" />
            <Arrow />
            <FlowStep num={3} label="Load Weights" desc="GPU memory" color="purple" />
            <Arrow />
            <FlowStep num={4} label="Health Check" desc="Ready state" color="cyan" />
            <Arrow />
            <FlowStep num={5} label="Serve Requests" desc="/v1/chat/completions" color="emerald" />
          </div>
          <div className="mt-4 p-3 bg-black/30 rounded-lg border border-white/5">
            <div className="text-[11px] text-white/70 leading-relaxed">
              <strong className="text-white">Request Flow:</strong> API requests arrive at Cortex → 
              Validated with API key → Routed to the model container → Processed by inference engine → 
              Response streamed back to client. All requests use the OpenAI-compatible API format.
            </div>
          </div>
        </Card>
      </section>

      {/* Model States */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Model States</SectionTitle>
        <p className="text-[11px] text-white/60 leading-relaxed">
          Stopping passes briefly through <code className="text-cyan-300">stopping</code> on the way back to <code className="text-cyan-300">stopped</code>.
          While a model is <code className="text-cyan-300">loading</code>, its Stop button reads <strong className="text-white">Cancel</strong>.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StateCard 
            state="stopped" 
            color="neutral" 
            description="Not running. Configuration exists but container is stopped."
          />
          <StateCard 
            state="starting" 
            color="amber" 
            description="Container initializing. Pulling image or preparing environment."
          />
          <StateCard 
            state="loading" 
            color="cyan" 
            description="Model weights loading into GPU memory. May take several minutes for large models."
          />
          <StateCard 
            state="running" 
            color="emerald" 
            description="Ready for inference. Model is actively serving requests."
          />
          <StateCard 
            state="failed" 
            color="red" 
            description="Error occurred. Check logs for details—common causes include VRAM shortage or path issues."
          />
        </div>
      </section>

      {/* Quick Start */}
      <section className="space-y-3">
        <SectionTitle variant="emerald" className="text-[10px]">Quick Start Checklist</SectionTitle>
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-3">
          <ol className="space-y-2.5 text-[12px] text-white/80">
            <ChecklistItem num={1}>
              <strong className="text-white">Verify GPU availability</strong> — Visit the <Link href="/health" className="text-emerald-300 hover:text-emerald-200 underline">Health page</Link> to confirm your GPUs are detected and have sufficient VRAM.
            </ChecklistItem>
            <ChecklistItem num={2}>
              <strong className="text-white">Choose your engine</strong> — Use <span className="text-blue-300">vLLM</span> for most HuggingFace models, or <span className="text-emerald-300">llama.cpp</span> for GGUF files (any GGUF, single or multi-part, always runs on llama.cpp).
            </ChecklistItem>
            <ChecklistItem num={3}>
              <strong className="text-white">Prepare your model</strong> — For <span className="text-amber-300">Online</span> mode, know your HuggingFace repo ID. For <span className="text-purple-300">Offline</span> mode, place model files in the configured models directory.
            </ChecklistItem>
            <ChecklistItem num={4}>
              <strong className="text-white">Configure resources</strong> — Set tensor parallelism (number of GPUs), context length, and memory utilization based on your hardware.
            </ChecklistItem>
            <ChecklistItem num={5}>
              <strong className="text-white">Start and test</strong> — Launch the model, watch the logs, and run a test to verify it responds correctly.
            </ChecklistItem>
          </ol>
          <div className="mt-4 pt-3 border-t border-emerald-500/20 flex gap-3">
            <Link href="/models">
              <Button variant="cyan" size="sm" className="text-[10px]">
                Open Models Page →
              </Button>
            </Link>
            <Link href="/health">
              <Button variant="default" size="sm" className="text-[10px]">
                Check GPU Health
              </Button>
            </Link>
          </div>
        </Card>
      </section>

      {/* Important Notes */}
      <InfoBox variant="blue" className="text-[11px] p-4">
        <strong>Tip:</strong> New to LLM deployment? Start with a smaller model (7B-8B parameters) to learn the workflow. 
        Once comfortable, scale up to larger models with more GPUs. The <span className="text-cyan-300">Calculator</span> button 
        in the Models page helps estimate VRAM requirements before deployment.
      </InfoBox>

      <Attribution label="Cortex Model Management Overview" />
    </section>
  );
}

// Helper Components
function StatBlock({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-300',
    cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300',
  };
  return (
    <div className={cn("p-3 rounded-xl border text-center", colors[color])}>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/80">{label}</div>
      <div className="text-[9px] text-white/50 mt-0.5">{detail}</div>
    </div>
  );
}

function ActionCard({ icon, title, description, color }: { icon: string; title: string; description: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'hover:border-emerald-500/30 group-hover:text-emerald-400',
    blue: 'hover:border-blue-500/30 group-hover:text-blue-400',
    purple: 'hover:border-purple-500/30 group-hover:text-purple-400',
    cyan: 'hover:border-cyan-500/30 group-hover:text-cyan-400',
  };
  return (
    <Card className={cn("p-4 bg-white/[0.02] border-white/5 group transition-all duration-300", colors[color])}>
      <div className="text-2xl mb-2 group-hover:scale-110 transition-transform" aria-hidden="true">{icon}</div>
      <div className="text-[11px] font-bold text-white uppercase tracking-wider">{title}</div>
      <div className="text-[10px] text-white/50 mt-1 leading-relaxed">{description}</div>
    </Card>
  );
}

function ConceptItem({ term, definition }: { term: string; definition: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">{term}</div>
      <div className="text-[11px] text-white/60 leading-relaxed">{definition}</div>
    </div>
  );
}

function FlowStep({ num, label, desc, color }: { num: number; label: string; desc: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-300',
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-300',
    cyan: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300',
  };
  return (
    <div className={cn("px-3 py-2 rounded-lg border text-center min-w-[100px]", colors[color])}>
      <div className="text-[10px] opacity-60">Step {num}</div>
      <div className="font-bold">{label}</div>
      <div className="text-[9px] text-white/50">{desc}</div>
    </div>
  );
}

function Arrow() {
  return <span className="text-white/30 text-lg" aria-hidden="true">→</span>;
}

function StateCard({ state, color, description }: { state: string; color: string; description: string }) {
  const colors: Record<string, string> = {
    neutral: 'bg-white/5 border-white/10 text-white/40',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
    cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300 animate-pulse',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
    red: 'bg-red-500/10 border-red-500/20 text-red-300',
  };
  return (
    <div className={cn("p-3 rounded-xl border", colors[color])}>
      <div className="text-[10px] font-black uppercase tracking-wider">{state}</div>
      <div className="text-[9px] text-white/50 mt-1 leading-relaxed">{description}</div>
    </div>
  );
}

function ChecklistItem({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[11px] font-bold text-emerald-300">
        {num}
      </span>
      <div className="flex-1 pt-0.5">{children}</div>
    </li>
  );
}


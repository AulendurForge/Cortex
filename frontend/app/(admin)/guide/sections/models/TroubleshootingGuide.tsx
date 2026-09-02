'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '@/components/UI';
import { cn } from '@/lib/cn';
import { Attribution } from '../Attribution';

export default function TroubleshootingGuide() {
  return (
    <section className="space-y-6">
      {/* Introduction */}
      <Card className="p-5 bg-gradient-to-r from-red-500/5 via-amber-500/5 to-yellow-500/5 border-white/5">
        <p className="text-[13px] text-white/80 leading-relaxed">
          Model deployment can sometimes encounter issues. This guide covers common problems, their causes, 
          and how to resolve them. Always check the <strong className="text-blue-300">Logs</strong> for detailed 
          error messages—they often provide specific information about what went wrong.
        </p>
      </Card>

      {/* Quick Diagnostics */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Quick Diagnostics Checklist</SectionTitle>
        <Card className="p-4 bg-cyan-500/5 border-cyan-500/20 space-y-3">
          <p className="text-[12px] text-white/70 leading-relaxed mb-2">
            Before diving into specific issues, run through this quick checklist:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ul className="space-y-2 text-[11px] text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400" aria-hidden="true">□</span>
                <span>Are GPUs detected? Check <Link href="/health" className="text-cyan-300 underline">Health page</Link></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400" aria-hidden="true">□</span>
                <span>Is there enough free VRAM for the model?</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400" aria-hidden="true">□</span>
                <span>Is Docker running and accessible?</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400" aria-hidden="true">□</span>
                <span>Can Cortex reach the model files (volume mounted)?</span>
              </li>
            </ul>
            <ul className="space-y-2 text-[11px] text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400" aria-hidden="true">□</span>
                <span>For Online mode: Is HF token set for gated models?</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400" aria-hidden="true">□</span>
                <span>For Offline mode: Do model files exist at the path?</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400" aria-hidden="true">□</span>
                <span>Is another model already using the same GPUs?</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400" aria-hidden="true">□</span>
                <span>Have you checked the container logs?</span>
              </li>
            </ul>
          </div>
        </Card>
      </section>

      {/* Common Issues */}
      <section className="space-y-3">
        <SectionTitle variant="red" className="text-[10px]">Common Issues & Solutions</SectionTitle>
        <div className="space-y-4">
          {/* CUDA OOM */}
          <TroubleshootCard 
            issue="CUDA out of memory"
            symptoms={[
              "Model fails during loading with OOM error",
              "Error mentions 'CUDA error: out of memory'",
              "Model loads partially then crashes"
            ]}
            causes={[
              "Model weights exceed available VRAM",
              "KV cache for requested context length too large",
              "Another model or process using GPU memory"
            ]}
            solutions={[
              "Reduce max_model_len (context length) — start with 4096-8192",
              "Lower gpu_memory_utilization (try 0.85)",
              "Use more GPUs (increase tensor parallelism)",
              "Use a more aggressively quantized model (Q4 instead of Q8)",
              "Stop other models using the same GPUs",
              "For vLLM: Try FP8 quantization or KV cache FP8"
            ]}
            color="red"
          />

          {/* Model Path Not Found */}
          <TroubleshootCard 
            issue="Model path not found / Invalid model path"
            symptoms={[
              "Error: 'Model path not found'",
              "Error: 'No such file or directory'",
              "Model stuck in 'starting' state then fails"
            ]}
            causes={[
              "CORTEX_MODELS_DIR points at the wrong host directory",
              "Model folder not mounted into container",
              "Typo in folder/file name",
              "Volume mount permissions issue"
            ]}
            solutions={[
              "Verify CORTEX_MODELS_DIR (shown read-only in Model Selection) matches your Docker volume mount",
              "Check that /models in container maps to your model directory on host",
              "For Offline mode: Use 'Refresh' to rescan and verify folder appears",
              "Ensure model folder name matches exactly (case-sensitive)",
              "Check file permissions on model directory"
            ]}
            color="amber"
          />

          {/* HF Token Issues */}
          <TroubleshootCard 
            issue="HuggingFace authentication failed"
            symptoms={[
              "Error: '401 Unauthorized' or 'Access denied'",
              "Model download fails immediately",
              "Error mentions 'gated model' or 'access required'"
            ]}
            causes={[
              "Missing HF token for gated model (Llama, Mistral, etc.)",
              "Invalid or expired HF token",
              "Haven't accepted model license on HuggingFace"
            ]}
            solutions={[
              "Visit the model page on HuggingFace and accept the license agreement",
              "Generate a new HF token with 'Read' permissions at huggingface.co/settings/tokens",
              "Enter the token in the 'HF Token' field when adding the model",
              "Verify token works: huggingface-cli whoami"
            ]}
            color="amber"
          />

          {/* NVIDIA Driver Issues */}
          <TroubleshootCard 
            issue="NVIDIA driver incompatible / CUDA version mismatch"
            symptoms={[
              "Error: 'nvidia-container-cli: initialization error'",
              "Error mentions 'CUDA version' or 'driver version'",
              "Container starts but GPU not accessible"
            ]}
            causes={[
              "NVIDIA driver too old for the container's CUDA version",
              "nvidia-container-toolkit not installed",
              "Docker not configured for GPU access"
            ]}
            solutions={[
              "Update the NVIDIA driver: 580+ for vLLM v0.28.0 (CUDA 13), 570+ for llama.cpp b10731 (CUDA 12.8); see docs/operations/UPDATE_NVIDIA_DRIVERS.md",
              "Install nvidia-container-toolkit if missing",
              "Verify driver: nvidia-smi should show GPUs",
              "Reboot after driver updates",
              "Check Docker GPU access: docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi"
            ]}
            color="red"
          />

          {/* GPT-OSS / Architecture Issues */}
          <TroubleshootCard 
            issue="Model architecture not supported"
            symptoms={[
              "vLLM error: 'Model architecture not supported'",
              "Error loading a recently released architecture",
              "Unknown model type errors"
            ]}
            causes={[
              "Using vLLM with a model it doesn't support",
              "gpt-oss started on vLLM without its parser/quantization settings",
              "Custom architecture without trust_remote_code"
            ]}
            solutions={[
              "For gpt-oss safetensors: use vLLM with reasoning parser gpt_oss, tool-call parser openai and quantization mxfp4; GGUF conversions run on llama.cpp",
              "For custom architectures: Enable 'Trust remote code' in vLLM",
              "Check vLLM supported model list in their documentation",
              "Consider converting model to GGUF format for llama.cpp"
            ]}
            color="purple"
          />

          {/* Tokenizer Issues */}
          <TroubleshootCard 
            issue="Tokenizer not found (vLLM SafeTensors folder)"
            symptoms={[
              "Error: 'Tokenizer not found' or 'tokenizer.json missing'",
              "vLLM model fails to start",
              "Model loads but generates garbage"
            ]}
            causes={[
              "The folder holds weights but no tokenizer files",
              "Custom tokenizer needs tokenizer_mode=slow/mistral",
              "GGUF file added under vLLM (rejected: gguf_requires_llamacpp)"
            ]}
            solutions={[
              "Copy tokenizer.json / tokenizer_config.json into the model folder",
              "Or set the optional Tokenizer (HF repo or path) under Model Selection > Tokenizer & config overrides",
              "Set tokenizer_mode in the spec section for Mistral tokenizers",
              "For GGUF files use llama.cpp: the tokenizer is inside the GGUF"
            ]}
            color="amber"
          />

          {/* Flash Attention Issues */}
          <TroubleshootCard 
            issue="Flash Attention errors"
            symptoms={[
              "Error: 'Flash attention not supported'",
              "Performance warnings about attention backend",
              "Crash during attention computation"
            ]}
            causes={[
              "GPU doesn't support Flash Attention 2 (pre-Ampere)",
              "CUDA compute capability < 8.0",
              "Incompatible attention configuration"
            ]}
            solutions={[
              "Disable Flash Attention for older GPUs (RTX 20xx and earlier)",
              "For vLLM: leave Attention backend unset, or pick TRITON_ATTN / TORCH_SDPA",
              "For llama.cpp: Set Flash attention to 'off' (and keep the V cache at f16)",
              "Check GPU compute capability: nvidia-smi --query-gpu=compute_cap"
            ]}
            color="blue"
          />

          {/* Multi-part GGUF */}
          <TroubleshootCard 
            issue="Multi-part GGUF files not loading"
            symptoms={[
              "Only part of model loads",
              "Error about missing parts",
              "Start rejected with gguf_requires_llamacpp"
            ]}
            causes={[
              "GGUF chosen under vLLM (the gateway rejects it)",
              "Missing parts in the sequence",
              "Parts not in same directory"
            ]}
            solutions={[
              "Use llama.cpp: it loads split GGUF files natively when pointed at the first part",
              "Ensure all parts are present: -00001-of-00003.gguf through -00003-of-00003.gguf",
              "No merge step is needed",
              "Verify part count matches the 'of-XXXX' in filename"
            ]}
            color="emerald"
          />

          {/* Slow Loading */}
          <TroubleshootCard 
            issue="Model takes too long to load"
            symptoms={[
              "Loading state persists for 10+ minutes",
              "No errors but model never becomes ready",
              "Slow progress in logs"
            ]}
            causes={[
              "Large model with limited PCIe bandwidth",
              "Downloading from HuggingFace (Online mode)",
              "Slow storage (HDD instead of SSD/NVMe)"
            ]}
            solutions={[
              "Be patient—70B+ models can take 5-15 minutes to load",
              "Use local files (Offline mode) to skip download step",
              "Move model files to fast storage (NVMe recommended)",
              "Check logs for actual progress vs. stuck state",
              "First load caches; subsequent loads are faster"
            ]}
            color="blue"
          />
        </div>
      </section>

      {/* Diagnostic Commands */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">Useful Diagnostic Commands</SectionTitle>
        <Card className="p-4 bg-blue-500/5 border-blue-500/20 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CommandBlock 
              title="Check GPU Status"
              command="nvidia-smi"
              description="Shows GPU utilization, memory usage, and running processes"
            />
            <CommandBlock 
              title="Check Docker Containers"
              command="docker ps -a --filter label=cortex.managed=1"
              description="Lists every Cortex-managed engine container (vllm-model-<id> / llamacpp-model-<id>) and its status; remove a stuck one with docker rm -f"
            />
            <CommandBlock 
              title="View Container Logs"
              command="docker logs <container_id> --tail 100"
              description="Shows recent logs from a specific container"
            />
            <CommandBlock 
              title="Check Volume Mounts"
              command="docker inspect <container_id> | grep -A5 Mounts"
              description="Verifies model directory is properly mounted"
            />
            <CommandBlock 
              title="Test HF Token"
              command="huggingface-cli whoami"
              description="Verifies HuggingFace authentication is working"
            />
            <CommandBlock 
              title="Check Disk Space"
              command="df -h /var/cortex/models"
              description="Ensures sufficient space for model files and cache"
            />
          </div>
        </Card>
      </section>

      {/* When to Seek Help */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">When to Seek Help</SectionTitle>
        <Card className="p-4 bg-purple-500/5 border-purple-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            If you've tried the solutions above and are still stuck, gather this information before 
            seeking help:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Collect This Information</div>
              <ul className="text-[11px] text-white/70 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400" aria-hidden="true">•</span>
                  <span>Full container logs (click Logs, copy all)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400" aria-hidden="true">•</span>
                  <span>Model configuration (engine, mode, settings)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400" aria-hidden="true">•</span>
                  <span>GPU info (nvidia-smi output)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400" aria-hidden="true">•</span>
                  <span>Cortex version and engine versions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400" aria-hidden="true">•</span>
                  <span>Steps to reproduce the issue</span>
                </li>
              </ul>
            </div>

            <div className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Resources</div>
              <ul className="text-[11px] text-white/70 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400" aria-hidden="true">📖</span>
                  <span><a href="https://docs.vllm.ai" target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline">vLLM Documentation</a></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">🦙</span>
                  <span><a href="https://github.com/ggml-org/llama.cpp" target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline">llama.cpp GitHub</a></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400" aria-hidden="true">🐳</span>
                  <span><a href="https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/overview.html" target="_blank" rel="noopener noreferrer" className="text-blue-300 underline">NVIDIA Container Toolkit</a></span>
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </section>

      {/* Quick Actions */}
      <div className="flex gap-3 justify-center pt-4">
        <Link href="/models">
          <Button variant="cyan" size="sm" className="text-[10px]">
            Back to Models →
          </Button>
        </Link>
        <Link href="/health">
          <Button variant="default" size="sm" className="text-[10px]">
            Check Health Page
          </Button>
        </Link>
      </div>

      <Attribution label="Cortex Troubleshooting Guide" />
    </section>
  );
}

// Helper Components
function TroubleshootCard({ 
  issue, 
  symptoms, 
  causes, 
  solutions,
  color 
}: { 
  issue: string; 
  symptoms: string[];
  causes: string[];
  solutions: string[];
  color: string;
}) {
  const colors: Record<string, string> = {
    red: 'border-l-red-500 bg-red-500/5',
    amber: 'border-l-amber-500 bg-amber-500/5',
    blue: 'border-l-blue-500 bg-blue-500/5',
    purple: 'border-l-purple-500 bg-purple-500/5',
    emerald: 'border-l-emerald-500 bg-emerald-500/5',
  };
  const headerColors: Record<string, string> = {
    red: 'text-red-300',
    amber: 'text-amber-300',
    blue: 'text-blue-300',
    purple: 'text-purple-300',
    emerald: 'text-emerald-300',
  };

  return (
    <Card className={cn("p-4 border-l-4", colors[color])}>
      <div className="space-y-4">
        <h3 className={cn("text-[13px] font-bold uppercase tracking-wider", headerColors[color])}>
          {issue}
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Symptoms */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Symptoms</div>
            <ul className="space-y-1 text-[10px] text-white/60">
              {symptoms.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-white/30 mt-0.5" aria-hidden="true">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Causes */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Likely Causes</div>
            <ul className="space-y-1 text-[10px] text-white/60">
              {causes.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-amber-400 mt-0.5" aria-hidden="true">?</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Solutions */}
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Solutions</div>
            <ul className="space-y-1 text-[10px] text-white/70">
              {solutions.map((s, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-emerald-400 mt-0.5" aria-hidden="true">→</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}

function CommandBlock({ title, command, description }: { title: string; command: string; description: string }) {
  return (
    <div className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-2">
      <div className="text-[10px] font-bold text-white">{title}</div>
      <code className="block text-[10px] text-cyan-300 bg-black/50 p-2 rounded font-mono overflow-x-auto">
        {command}
      </code>
      <p className="text-[9px] text-white/50">{description}</p>
    </div>
  );
}


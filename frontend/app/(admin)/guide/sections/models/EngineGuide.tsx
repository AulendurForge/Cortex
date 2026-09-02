'use client';

import { Card, SectionTitle, InfoBox, Badge } from '@/components/UI';
import { cn } from '@/lib/cn';
import { Attribution } from '../Attribution';

export default function EngineGuide() {
  return (
    <section className="space-y-6">
      {/* Introduction */}
      <Card className="p-5 bg-gradient-to-r from-blue-500/5 via-emerald-500/5 to-purple-500/5 border-white/5">
        <p className="text-[13px] text-white/80 leading-relaxed">
          Cortex supports two inference engines, each optimized for different use cases. Your choice of engine 
          determines which models you can run, performance characteristics, and configuration options. 
          Understanding these differences helps you make the right choice for your deployment.
        </p>
      </Card>

      {/* Engine Comparison */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Engine Comparison</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* vLLM Card */}
          <Card className="p-5 bg-blue-500/5 border-blue-500/20 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-3xl" aria-hidden="true">🚀</div>
                <div>
                  <h3 className="text-lg font-black text-blue-300 uppercase tracking-wider">vLLM</h3>
                  <p className="text-[10px] text-white/50">High-Performance Inference</p>
                </div>
              </div>
              <Badge className="bg-blue-500/20 text-blue-200 border-blue-500/30 text-[9px]">RECOMMENDED</Badge>
            </div>
            
            <div className="space-y-3">
              <EngineFeature 
                feature="PagedAttention"
                description="Memory-efficient KV cache management enables handling many concurrent requests"
              />
              <EngineFeature 
                feature="Continuous Batching"
                description="Dynamically batches requests for maximum GPU utilization"
              />
              <EngineFeature 
                feature="Tensor Parallelism"
                description="Split large models across multiple GPUs seamlessly"
              />
              <EngineFeature 
                feature="Flash Attention 2"
                description="Hardware-accelerated attention on Ampere+ GPUs"
              />
            </div>

            <div className="pt-3 border-t border-blue-500/20 space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Best For</div>
              <ul className="text-[11px] text-white/70 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400" aria-hidden="true">✓</span>
                  <span>Standard HuggingFace models (Llama 3, Mistral, Qwen, Phi, Gemma)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400" aria-hidden="true">✓</span>
                  <span>High throughput requirements (50-70+ tokens/sec per stream)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400" aria-hidden="true">✓</span>
                  <span>Many concurrent users (40+ simultaneous requests)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400" aria-hidden="true">✓</span>
                  <span>SafeTensors format models</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400" aria-hidden="true">✓</span>
                  <span>Embedding models (nomic-embed, BGE, E5)</span>
                </li>
              </ul>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="text-[10px] text-amber-300 font-bold uppercase tracking-wider mb-1">Limitations</div>
              <ul className="text-[10px] text-white/60 space-y-1">
                <li>• Needs a full checkpoint folder (config.json, tokenizer files, safetensors)</li>
                <li>• Does not serve GGUF files (Cortex routes every GGUF to llama.cpp)</li>
                <li>• Requires CUDA-capable GPU</li>
              </ul>
            </div>
          </Card>

          {/* llama.cpp Card */}
          <Card className="p-5 bg-emerald-500/5 border-emerald-500/20 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-3xl" aria-hidden="true">🦙</div>
                <div>
                  <h3 className="text-lg font-black text-emerald-300 uppercase tracking-wider">llama.cpp</h3>
                  <p className="text-[10px] text-white/50">GGUF & Specialized Models</p>
                </div>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-500/30 text-[9px]">SPECIALIZED</Badge>
            </div>
            
            <div className="space-y-3">
              <EngineFeature 
                feature="Native GGUF Support"
                description="First-class support for quantized GGUF models, including multi-part files"
              />
              <EngineFeature 
                feature="CPU + GPU Hybrid"
                description="Keep some layers on the CPU when the model does not fit in VRAM"
              />
              <EngineFeature 
                feature="Aggressive Quantization"
                description="Run large models in tight VRAM with Q4_K_M, Q5_K_M, etc."
              />
              <EngineFeature 
                feature="Speculative Decoding"
                description="Use draft models to accelerate inference"
              />
            </div>

            <div className="pt-3 border-t border-emerald-500/20 space-y-2">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Best For</div>
              <ul className="text-[11px] text-white/70 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">✓</span>
                  <span>GGUF quantizations of any model, including gpt-oss GGUF conversions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">✓</span>
                  <span>GGUF-only models (no HuggingFace checkpoint)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">✓</span>
                  <span>Multi-part GGUF files (split models)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">✓</span>
                  <span>Custom/experimental architectures</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">✓</span>
                  <span>Memory-constrained deployments (aggressive quantization)</span>
                </li>
              </ul>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="text-[10px] text-amber-300 font-bold uppercase tracking-wider mb-1">Limitations</div>
              <ul className="text-[10px] text-white/60 space-y-1">
                <li>• Lower throughput than vLLM (typically 20-40 tok/sec)</li>
                <li>• Requires Offline mode (no HuggingFace download)</li>
                <li>• Fewer concurrent slots than vLLM</li>
              </ul>
            </div>
          </Card>
        </div>
      </section>

      {/* Performance Comparison */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Performance Characteristics</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-white/50 border-b border-white/10">
                <th className="pb-2 pr-4">Metric</th>
                <th className="pb-2 px-4 text-blue-300">vLLM</th>
                <th className="pb-2 px-4 text-emerald-300">llama.cpp</th>
              </tr>
            </thead>
            <tbody className="text-white/70">
              <ComparisonRow 
                metric="Tokens/sec (single)" 
                vllm="50-70+" 
                llamacpp="20-40" 
              />
              <ComparisonRow 
                metric="Concurrent requests" 
                vllm="40-256+" 
                llamacpp="1-32 slots" 
              />
              <ComparisonRow 
                metric="Memory efficiency" 
                vllm="Excellent (PagedAttention)" 
                llamacpp="Good (quantization)" 
              />
              <ComparisonRow 
                metric="Startup time" 
                vllm="1-5 minutes" 
                llamacpp="30s-2 minutes" 
              />
              <ComparisonRow 
                metric="Multi-GPU" 
                vllm="Tensor Parallelism" 
                llamacpp="Tensor Split" 
              />
              <ComparisonRow 
                metric="Model formats" 
                vllm="SafeTensors / HF checkpoints" 
                llamacpp="GGUF only" 
              />
            </tbody>
          </table>
          <p className="text-[9px] text-white/40 mt-3">GGUF files (single or multi-part) are always served by llama.cpp; the gateway rejects vLLM + GGUF.</p>
        </Card>
      </section>

      {/* Decision Guide */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Decision Guide</SectionTitle>
        <div className="space-y-3">
          <DecisionCard 
            question="Is your model gpt-oss (the safetensors release of openai/gpt-oss-20b or -120b)?"
            answer="vLLM"
            explanation="vLLM v0.28.0 serves gpt-oss natively: set Reasoning parser to gpt_oss, Tool call parser to openai and Quantization to mxfp4 (the vLLM Recipes site has the full settings). GGUF conversions of gpt-oss go to llama.cpp like every other GGUF."
            color="blue"
          />
          <DecisionCard 
            question="Do you have multi-part GGUF files (model-00001-of-00003.gguf)?"
            answer="llama.cpp"
            explanation="llama.cpp loads split GGUF files natively; Cortex points it at the first part. vLLM is never used for GGUF, so no merge is needed."
            color="emerald"
          />
          <DecisionCard 
            question="Is your model on HuggingFace with SafeTensors?"
            answer="vLLM"
            explanation="vLLM provides 2-3x better throughput for standard models. Use it for Llama, Mistral, Qwen, Phi, Gemma, and most other popular architectures."
            color="blue"
          />
          <DecisionCard 
            question="Do you need maximum throughput and concurrency?"
            answer="vLLM"
            explanation="vLLM's PagedAttention and continuous batching deliver significantly higher throughput for production workloads with many users."
            color="blue"
          />
          <DecisionCard 
            question="Are you running embedding models?"
            answer="vLLM"
            explanation="vLLM has excellent embedding model support with optimized batching. Choose vLLM for nomic-embed, BGE, E5, and similar models."
            color="blue"
          />
          <DecisionCard 
            question="Do you need aggressive quantization (Q4_K_M) for limited VRAM?"
            answer="llama.cpp"
            explanation="While both support quantization, llama.cpp is optimized for running with aggressive quantization levels like Q4_K_M and Q5_K_M."
            color="emerald"
          />
        </div>
      </section>

      {/* GGUF vs SafeTensors */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">Model Formats: GGUF vs SafeTensors</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-purple-500/5 border-purple-500/20 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden="true">📦</span>
              <h4 className="text-[12px] font-bold text-purple-300 uppercase tracking-wider">GGUF Format</h4>
            </div>
            <ul className="text-[11px] text-white/70 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-purple-400" aria-hidden="true">•</span>
                <span><strong>Pre-quantized</strong> — Quantization (Q4_K_M, Q8_0, etc.) is baked into the file</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400" aria-hidden="true">•</span>
                <span><strong>Single or split files</strong> — Can be one file or multiple parts for large models</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400" aria-hidden="true">•</span>
                <span><strong>Self-contained</strong> — Model architecture info embedded in file</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400" aria-hidden="true">•</span>
                <span><strong>Offline only</strong> — Must be pre-downloaded; no HuggingFace streaming</span>
              </li>
            </ul>
            <div className="text-[10px] text-white/50 bg-black/20 rounded p-2">
              Files: <code className="text-purple-300">model-Q4_K_M.gguf</code>, <code className="text-purple-300">model-00001-of-00003.gguf</code>
            </div>
          </Card>

          <Card className="p-4 bg-blue-500/5 border-blue-500/20 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden="true">🔐</span>
              <h4 className="text-[12px] font-bold text-blue-300 uppercase tracking-wider">SafeTensors Format</h4>
            </div>
            <ul className="text-[11px] text-white/70 space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-blue-400" aria-hidden="true">•</span>
                <span><strong>Full precision</strong> — Weights stored in original dtype (FP16/BF16)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400" aria-hidden="true">•</span>
                <span><strong>Quantize on-load</strong> — vLLM can apply AWQ, GPTQ, FP8, INT8 at runtime</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400" aria-hidden="true">•</span>
                <span><strong>HuggingFace native</strong> — Streaming download from HuggingFace Hub</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400" aria-hidden="true">•</span>
                <span><strong>Config files required</strong> — Needs config.json, tokenizer files</span>
              </li>
            </ul>
            <div className="text-[10px] text-white/50 bg-black/20 rounded p-2">
              Files: <code className="text-blue-300">model.safetensors</code>, <code className="text-blue-300">config.json</code>, <code className="text-blue-300">tokenizer.json</code>
            </div>
          </Card>
        </div>
      </section>

      {/* vLLM Resources */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">vLLM Resources</SectionTitle>
        <Card className="p-4 bg-gradient-to-r from-blue-500/5 to-purple-500/5 border-blue-500/20 space-y-3">
          <div className="flex items-start gap-3">
            <div className="text-2xl" aria-hidden="true">📚</div>
            <div className="flex-1 space-y-2">
              <h4 className="text-[12px] font-bold text-blue-300">vLLM Recipes — Official Model Guides</h4>
              <p className="text-[11px] text-white/70 leading-relaxed">
                When setting up a vLLM model container, the official <strong>vLLM Recipes</strong> site provides 
                community-maintained guides with known parameters and requirements for running specific models. 
                This includes hardware recommendations, optimal configuration settings, and task-specific usage guides.
              </p>
              <div className="flex flex-wrap gap-2">
                <a 
                  href="https://docs.vllm.ai/projects/recipes/en/latest/index.html" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 text-[10px] font-semibold rounded-lg border border-blue-500/30 transition-colors"
                >
                  <span aria-hidden="true">🔗</span> vLLM Recipes Site
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
              <div className="text-[10px] text-white/50 space-y-1 mt-2">
                <p><strong>Includes guides for:</strong> Llama 3/4, Qwen 3, DeepSeek V3, Mistral, GPT-OSS, NVIDIA Nemotron, and many more.</p>
              </div>
            </div>
          </div>
          
          <InfoBox variant="amber" className="text-[10px] p-3">
            <strong>Note:</strong> Not all models supported by vLLM have been documented on the Recipes site yet. 
            If you don't find your specific model listed, searching online forums (Reddit, GitHub issues, HuggingFace discussions) 
            may reveal community-discovered settings and workarounds.
          </InfoBox>
        </Card>
      </section>

      {/* Pro Tips */}
      <InfoBox variant="cyan" className="text-[11px] p-4">
        <strong>Pro Tip:</strong> When Cortex inspects a model folder, it automatically recommends the best engine 
        based on the files found. Look for the recommendation badge when selecting a folder in Offline mode—it 
        analyzes whether you have SafeTensors, single-file GGUFs, or multi-part GGUFs and suggests accordingly.
      </InfoBox>

      <Attribution label="Cortex Engine Selection Guide" />
    </section>
  );
}

// Helper Components
function EngineFeature({ feature, description }: { feature: string; description: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-white/30 mt-1" aria-hidden="true">◆</span>
      <div>
        <span className="text-[11px] font-semibold text-white">{feature}</span>
        <span className="text-[10px] text-white/50 ml-1.5">— {description}</span>
      </div>
    </div>
  );
}

function ComparisonRow({ metric, vllm, llamacpp }: { metric: string; vllm: string; llamacpp: string }) {
  return (
    <tr className="border-b border-white/5">
      <td className="py-2 pr-4 font-medium text-white">{metric}</td>
      <td className="py-2 px-4">{vllm}</td>
      <td className="py-2 px-4">{llamacpp}</td>
    </tr>
  );
}

function DecisionCard({ 
  question, 
  answer, 
  explanation, 
  color 
}: { 
  question: string; 
  answer: string; 
  explanation: string; 
  color: 'emerald' | 'blue';
}) {
  const colors = {
    emerald: 'bg-emerald-500/5 border-emerald-500/20',
    blue: 'bg-blue-500/5 border-blue-500/20',
  };
  const answerColors = {
    emerald: 'text-emerald-300 bg-emerald-500/20 border-emerald-500/30',
    blue: 'text-blue-300 bg-blue-500/20 border-blue-500/30',
  };
  return (
    <Card className={cn("p-4 border", colors[color])}>
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p className="text-[12px] text-white font-medium mb-1">{question}</p>
          <p className="text-[11px] text-white/60 leading-relaxed">{explanation}</p>
        </div>
        <div className={cn("px-3 py-1.5 rounded-lg border font-bold text-[11px] uppercase tracking-wider shrink-0", answerColors[color])}>
          → {answer}
        </div>
      </div>
    </Card>
  );
}


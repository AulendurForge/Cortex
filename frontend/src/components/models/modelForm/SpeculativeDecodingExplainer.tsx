'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface SpeculativeDecodingExplainerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Explainer modal for Speculative Decoding
 * Provides comprehensive documentation for users unfamiliar with the concept
 * Uses a portal to render outside parent modal containers
 */
export function SpeculativeDecodingExplainer({ isOpen, onClose }: SpeculativeDecodingExplainerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Handle escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div 
      className="fixed inset-0 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      style={{ zIndex: 99999 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0a1628] border border-purple-500/30 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl shadow-purple-500/10">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border-b border-purple-500/20 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
              <span className="text-xl">🚀</span>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Speculative Decoding Explained</h2>
              <p className="text-sm text-purple-300/70">Speed up your LLM inference with a clever trick</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6 space-y-6">
          
          {/* What Is It? */}
          <Section title="What is Speculative Decoding?" icon="🤔">
            <p className="text-white/80 leading-relaxed">
              <strong className="text-purple-300">Speculative decoding</strong> is a technique that can make your AI model generate text 
              <strong className="text-green-300"> 1.5x to 3x faster</strong> without any loss in quality.
            </p>
            <p className="text-white/70 leading-relaxed mt-3">
              Here's the simple idea: Instead of having your big, smart (but slow) model generate one token at a time, 
              you use a <strong className="text-cyan-300">small, fast "draft" model</strong> to quickly predict multiple tokens ahead. 
              Then your main model checks these predictions all at once and either accepts them or corrects them.
            </p>
            <div className="mt-4 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
              <div className="text-sm font-medium text-purple-300 mb-2">Think of it like this:</div>
              <p className="text-white/70 text-sm">
                Imagine you're writing an important document. Instead of thinking hard about every single word, 
                you have an assistant who quickly suggests the next few words. You can then quickly approve their suggestions 
                (very fast!) or write your own words when they're wrong (normal speed). Since the assistant is often right, 
                you save a lot of time overall.
              </p>
            </div>
          </Section>

          {/* Benefits */}
          <Section title="Why Use Speculative Decoding?" icon="✨">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BenefitCard
                icon="⚡"
                title="Faster Generation"
                description="Get 1.5x to 3x speedup on text generation, especially noticeable for longer outputs."
              />
              <BenefitCard
                icon="🎯"
                title="Same Quality"
                description="The output is mathematically identical to running without speculative decoding - no quality loss."
              />
              <BenefitCard
                icon="💰"
                title="Better Resource Usage"
                description="Get more throughput from your existing hardware without upgrading your GPU."
              />
              <BenefitCard
                icon="🔧"
                title="Easy to Configure"
                description="Just add a draft model path and optionally tune two simple parameters."
              />
            </div>
            
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-amber-400">💡</span>
                <p className="text-amber-200/80 text-sm">
                  <strong>Best results:</strong> Speculative decoding works best when the draft model is from the same 
                  "family" as your main model (e.g., both are Mistral, both are Llama). The draft model should be 
                  4-10x smaller than your main model.
                </p>
              </div>
            </div>
          </Section>

          {/* Requirements */}
          <Section title="What You Need" icon="📋">
            <div className="space-y-3">
              <RequirementItem
                number={1}
                title="A Main Model (Large)"
                description="Your primary GGUF model that you want to speed up. This is the 'smart' model that produces the final output."
                example="e.g., Mistral-Small-24B-Q4_K_M.gguf"
              />
              <RequirementItem
                number={2}
                title="A Draft Model (Small)"
                description="A smaller, faster GGUF model from the same family. This model 'guesses' tokens for the main model to verify."
                example="e.g., Mistral-Small-0.5B-Q8_0.gguf"
              />
              <RequirementItem
                number={3}
                title="Enough VRAM"
                description="You need enough GPU memory to load BOTH models simultaneously. The draft model is small, so this usually isn't a problem."
                example="e.g., Main: 12GB + Draft: 1GB = 13GB total"
              />
            </div>
          </Section>

          {/* Directory Structure Example */}
          <Section title="Example Setup: Directory Structure" icon="📁">
            <p className="text-white/70 text-sm mb-4">
              Here's a real-world example showing how to organize your models for speculative decoding. 
              In this example, we'll use a 24B main model with a 0.5B draft model.
            </p>
            
            <div className="bg-[#0d1117] border border-white/10 rounded-xl p-4 font-mono text-sm overflow-x-auto">
              <div className="text-white/50 mb-2"># Your models directory (mounted as /models in the container)</div>
              <DirectoryTree />
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="font-medium text-blue-300 mb-1">📦 Main Model Folder</div>
                <p className="text-white/60">
                  Contains your large model that you want to accelerate. This is what you select in 
                  the "Select your model item" dropdown.
                </p>
              </div>
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <div className="font-medium text-purple-300 mb-1">🚀 Draft Model Folder</div>
                <p className="text-white/60">
                  Contains the small, fast model. You provide the full container path to this 
                  in the "Draft Model Path" field.
                </p>
              </div>
            </div>
          </Section>

          {/* Configuration */}
          <Section title="How to Configure" icon="⚙️">
            <div className="space-y-4">
              <ConfigStep
                step={1}
                title="Select your main model"
                description="In the Model Selection step, choose your main model folder (e.g., 'Mistral-Small-24B-Instruct-GGUF')."
              />
              <ConfigStep
                step={2}
                title="Open Speculative Decoding settings"
                description="In the Core Settings step (llama.cpp), expand the 'Speculative decoding' section."
              />
              <ConfigStep
                step={3}
                title="Enter the draft model path"
                description="Enter the draft model path relative to the models directory (Cortex maps it to /models/... in the container)."
              >
                <code className="block mt-2 p-2 bg-black/30 rounded text-purple-300 text-xs">
                  Mistral-Small-0.5B-DRAFT-GGUF/Mistral-Small-0.5B-Q8_0.gguf
                </code>
              </ConfigStep>
              <ConfigStep
                step={4}
                title="(Optional) Tune parameters"
                description="Adjust 'Draft tokens (max/min)', 'Draft acceptance p_min', the speculative type and the draft model GPU layers if needed. Empty fields use llama.cpp defaults."
              />
            </div>
          </Section>

          {/* Parameters Explained */}
          <Section title="Understanding the Parameters" icon="🎛️">
            <div className="space-y-4">
              <ParameterExplainer
                name="Draft model (--model-draft)"
                description="Path to the draft GGUF relative to the models directory; Cortex mounts that directory at /models inside the container."
                defaultValue="(none - required)"
                tips={[
                  "Use a model from the same family as your main model",
                  "Draft model should be 4-10x smaller than main model",
                  "Use Q8_0 quantization for the draft model for best accuracy"
                ]}
              />
              <ParameterExplainer
                name="Draft tokens max (--spec-draft-n-max)"
                description="How many tokens the draft model predicts ahead at each step. Higher values mean more aggressive speculation."
                defaultValue="3 (engine default)"
                tips={[
                  "3-8 is good for most use cases (llama.cpp default is 3)",
                  "Higher values (24-32) can help with predictable text like code",
                  "Lower values (4-8) if you notice many rejected predictions"
                ]}
              />
              <ParameterExplainer
                name="Draft acceptance p_min (--spec-draft-p-min)"
                description="How confident the draft model needs to be before its prediction is considered. Lower = more aggressive, higher = more conservative."
                defaultValue="engine default"
                tips={[
                  "0.5 is a good balance for most cases",
                  "Try 0.3-0.4 for higher throughput (may reduce acceptance rate)",
                  "Try 0.6-0.7 if you want very accurate speculation only"
                ]}
              />
            </div>
          </Section>

          {/* Troubleshooting */}
          <Section title="Troubleshooting" icon="🔍">
            <div className="space-y-3">
              <TroubleshootItem
                problem="Model won't start / out of memory"
                solution="You don't have enough VRAM for both models. Try using a more quantized (smaller) version of either model, or disable speculative decoding."
              />
              <TroubleshootItem
                problem="Not seeing any speedup"
                solution="The draft model may be too different from the main model. Try a draft model from the same family. Also, speculative decoding helps less with very short responses."
              />
              <TroubleshootItem
                problem="Getting errors about draft model path"
                solution="Make sure the path starts with /models/ and points to the actual .gguf file, not just the folder. Check for typos in the filename."
              />
              <TroubleshootItem
                problem="Output quality seems different"
                solution="This shouldn't happen with speculative decoding. If it does, you may have a compatibility issue. Try a different draft model or disable the feature."
              />
            </div>
          </Section>

          {/* Quick Reference */}
          <Section title="Quick Reference Card" icon="📖">
            <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20 rounded-xl p-4">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-white/10">
                  <tr>
                    <td className="py-2 text-white/50 pr-4">Main Model Size</td>
                    <td className="py-2 text-white/80">7B - 70B+ (your large model)</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-white/50 pr-4">Draft Model Size</td>
                    <td className="py-2 text-white/80">0.5B - 3B (4-10x smaller than main)</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-white/50 pr-4">Expected Speedup</td>
                    <td className="py-2 text-green-300">1.5x - 3x faster generation</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-white/50 pr-4">Quality Impact</td>
                    <td className="py-2 text-cyan-300">None (mathematically identical output)</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-white/50 pr-4">Extra VRAM Needed</td>
                    <td className="py-2 text-white/80">~0.5GB - 2GB for draft model</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-white/50 pr-4">Best For</td>
                    <td className="py-2 text-white/80">Long text generation, code, conversations</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-6 py-4 bg-black/20 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-medium"
          >
            Got it!
          </button>
        </div>
      </div>
    </div>
  );

  // Use portal to render at document body level, outside parent modal constraints
  return createPortal(modalContent, document.body);
}

// Helper Components

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-3">
        <span>{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function BenefitCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-purple-500/30 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="font-medium text-white">{title}</span>
      </div>
      <p className="text-white/60 text-sm">{description}</p>
    </div>
  );
}

function RequirementItem({ number, title, description, example }: { number: number; title: string; description: string; example: string }) {
  return (
    <div className="flex gap-4 p-3 bg-white/5 rounded-lg border border-white/10">
      <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold text-sm flex-shrink-0">
        {number}
      </div>
      <div className="flex-1">
        <div className="font-medium text-white">{title}</div>
        <p className="text-white/60 text-sm mt-1">{description}</p>
        <code className="text-xs text-cyan-300 mt-1 block">{example}</code>
      </div>
    </div>
  );
}

function ConfigStep({ step, title, description, children }: { step: number; title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        {step}
      </div>
      <div className="flex-1 pb-4 border-b border-white/5 last:border-0">
        <div className="font-medium text-white">{title}</div>
        <p className="text-white/60 text-sm mt-1">{description}</p>
        {children}
      </div>
    </div>
  );
}

function ParameterExplainer({ name, description, defaultValue, tips }: { name: string; description: string; defaultValue: string; tips: string[] }) {
  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-white">{name}</span>
        <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded">Default: {defaultValue}</span>
      </div>
      <p className="text-white/60 text-sm">{description}</p>
      <div className="mt-3 space-y-1">
        {tips.map((tip, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-white/50">
            <span className="text-purple-400">•</span>
            <span>{tip}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TroubleshootItem({ problem, solution }: { problem: string; solution: string }) {
  return (
    <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
      <div className="flex items-start gap-2">
        <span className="text-red-400">❌</span>
        <div>
          <div className="font-medium text-white text-sm">{problem}</div>
          <p className="text-white/60 text-xs mt-1">
            <span className="text-green-400">✓</span> {solution}
          </p>
        </div>
      </div>
    </div>
  );
}

function DirectoryTree() {
  return (
    <div className="text-sm leading-relaxed">
      <div className="text-cyan-400">/var/cortex/models/</div>
      <div className="ml-4">
        <div className="text-white/80">├── <span className="text-blue-400">Mistral-Small-24B-Instruct-GGUF/</span> <span className="text-white/40">← Main model folder (select this)</span></div>
        <div className="ml-8 text-white/60">
          <div>├── config.json <span className="text-white/30">← Model config (optional)</span></div>
          <div>├── tokenizer.json <span className="text-white/30">← Tokenizer (optional if using HF repo)</span></div>
          <div>├── <span className="text-yellow-300">Mistral-Small-24B-Q4_K_M.gguf</span> <span className="text-white/30">← Your main GGUF file</span></div>
          <div>└── ... <span className="text-white/30">(other quantization options)</span></div>
        </div>
        <div className="text-white/40 mt-2">│</div>
        <div className="text-white/80">└── <span className="text-purple-400">Mistral-Small-0.5B-DRAFT-GGUF/</span> <span className="text-white/40">← Draft model folder</span></div>
        <div className="ml-8 text-white/60">
          <div>├── config.json</div>
          <div>└── <span className="text-green-300">Mistral-Small-0.5B-Q8_0.gguf</span> <span className="text-white/30">← Draft GGUF (use this path)</span></div>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="text-white/50 text-xs">Container path for Draft Model Path field:</div>
        <div className="text-purple-300 mt-1">/models/Mistral-Small-0.5B-DRAFT-GGUF/Mistral-Small-0.5B-Q8_0.gguf</div>
      </div>
    </div>
  );
}


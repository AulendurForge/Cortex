'use client';

import { Card, SectionTitle, Badge } from '../../../../src/components/UI';
import { cn } from '../../../../src/lib/cn';
import { Attribution } from './Attribution';

const CORTEX_VERSION = process.env.NEXT_PUBLIC_CORTEX_VERSION ?? '0.2.0';
const VLLM_IMAGE = 'vllm/vllm-openai:v0.28.0';
const LLAMACPP_IMAGE = 'ghcr.io/ggml-org/llama.cpp:server-cuda-b10731';

export default function AboutCortex() {
  return (
    <section className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <header className="space-y-2 text-center md:text-left">
        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">About Cortex</h1>
        <p className="text-white/60 text-sm leading-relaxed max-w-3xl">
          Cortex is an OpenAI-compatible gateway and admin console for running vLLM and llama.cpp models on your own
          hardware. It starts one managed container per model, meters every request against scoped API keys, and is built
          for air-gapped hosts: pinned engine images, offline model folders and transfer bundles instead of live downloads.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-3">
          <SectionTitle variant="purple" className="mb-1 text-[10px]">Facts</SectionTitle>
          <dl className="text-xs text-white/70 space-y-2">
            <FactRow label="Version"><Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-[10px]">v{CORTEX_VERSION}</Badge></FactRow>
            <FactRow label="vLLM image"><code className="text-cyan-300 font-mono text-[11px] break-all">{VLLM_IMAGE}</code></FactRow>
            <FactRow label="llama.cpp image"><code className="text-cyan-300 font-mono text-[11px] break-all">{LLAMACPP_IMAGE}</code></FactRow>
            <FactRow label="Source">
              <a href="https://github.com/AulendurForge/Cortex" target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2 break-all">github.com/AulendurForge/Cortex</a>
            </FactRow>
            <FactRow label="Documentation">
              <a href="https://aulendurforge.github.io/Cortex/" target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2 break-all">aulendurforge.github.io/Cortex</a>
            </FactRow>
          </dl>
        </Card>

        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-2">
          <SectionTitle variant="cyan" className="mb-1 text-[10px]">Aulendur Labs</SectionTitle>
          <p className="text-[11px] text-white/70 leading-relaxed">
            Cortex is the open-source model-serving infrastructure of{' '}
            <a href="https://aulendur.com" target="_blank" rel="noopener noreferrer" className="text-white/90 hover:text-white underline underline-offset-2">Aulendur Labs</a>{' '}
            (Omaha, Nebraska). Founded in 2024 by Aaron Parker (CEO) and Jorden Gershenson (CTO), both with more than ten
            years in defense, the company builds forecasting and operational-intelligence systems under the tagline
            &quot;Predict Everything&quot;: DeepLoom, a planetary-scale model for cross-domain forecasting (weather, energy,
            markets, logistics), and the WeaveCast Platform, its API gateway. The team holds TS/SCI clearances and builds
            for on-premises, ATO-ready deployment in defense and government environments.
          </p>
        </Card>
      </div>

      <section className="space-y-2">
        <SectionTitle variant="blue" className="text-[10px]">Capabilities</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <FeatureCard title="API" items={['OpenAI-compatible chat, completions and embeddings', 'Streaming (SSE) responses']} color="indigo" />
          <FeatureCard title="Access" items={['Scoped API keys with IP allowlists and expiry', 'Organizations and users; per-key usage metering']} color="purple" />
          <FeatureCard title="Models" items={['One managed container per model (vLLM or llama.cpp)', 'Dry run, readiness checks and live logs']} color="cyan" />
          <FeatureCard title="Reuse" items={['Recipes: save and reload a model configuration']} color="indigo" />
          <FeatureCard title="Air-gap" items={['Transfer bundles: images, weights and config on a USB drive', 'Offline model folders; pinned engine images']} color="purple" />
          <FeatureCard title="Observability" items={['Prometheus metrics for the gateway and engines', 'Usage journal with CSV export']} color="cyan" />
        </div>
      </section>

      <Attribution />
    </section>
  );
}

function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
      <dt className="text-[10px] uppercase tracking-wider text-white/50 font-bold sm:w-32 shrink-0">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

function FeatureCard({ title, items, color }: { title: string; items: string[]; color: 'indigo' | 'purple' | 'cyan' }) {
  const iconColors = {
    indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  };
  return (
    <Card className="p-3 bg-white/[0.01] border-white/5 transition-colors">
      <div className={cn('text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border w-fit mb-2', iconColors[color])}>{title}</div>
      <ul className="space-y-1">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-1.5 text-[11px] text-white/70">
            <span className="text-white/30" aria-hidden="true">•</span> {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

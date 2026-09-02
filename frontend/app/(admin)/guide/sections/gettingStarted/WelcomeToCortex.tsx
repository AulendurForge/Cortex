'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Card, SectionTitle, InfoBox, Badge, Button } from '../../../../../src/components/UI';
import { HostIpDisplay } from '../../../../../src/components/HostIpDisplay';
import { cn } from '../../../../../src/lib/cn';
import cortexLogo from '../../../../../src/assets/cortex logo white.PNG';

export default function WelcomeToCortex() {
  return (
    <section className="space-y-6">
      {/* Hero Welcome */}
      <Card className="p-6 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-cyan-500/10 border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-20 pointer-events-none">
          <Image 
            src={cortexLogo} 
            alt="Cortex Logo" 
            width={128} 
            height={128}
            className="w-32 h-32 object-contain"
          />
        </div>
        
        <div className="space-y-4 relative z-10">
          <div className="flex items-center gap-3">
            <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-[10px]">BETA 0.1</Badge>
            <span className="text-white/40 text-xs">•</span>
            <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="text-white/60 text-xs font-medium hover:text-white/90 hover:underline transition-colors">By Aulendur Labs</a>
          </div>
          
          <h1 className="text-3xl font-black text-white tracking-tight">
            Welcome to <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">Cortex</span>
          </h1>
          
          <p className="text-[14px] text-white/80 leading-relaxed max-w-3xl">
            Cortex is your unified control plane for deploying and managing Large Language Models (LLMs) on your infrastructure. 
            Whether you're running chat assistants, code completion models, or embedding services—Cortex handles the complexity 
            so you can focus on putting AI to work.
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20">Self-Hosted</Badge>
            <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">OpenAI-Compatible API</Badge>
            <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/20">Multi-GPU Support</Badge>
            <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Air-Gap Ready</Badge>
          </div>
        </div>
      </Card>

      {/* Network Info Banner */}
      <HostIpDisplay variant="banner" className="py-3" />

      {/* What Cortex Does */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">What Cortex Does For You</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <FeatureCard 
            icon="🚀"
            title="Deploy Models Easily"
            description="Download models from HuggingFace or use local files. Cortex handles container orchestration, GPU allocation, and health monitoring automatically."
            color="emerald"
          />
          <FeatureCard 
            icon="🔌"
            title="Standard API Interface"
            description="All models expose the same OpenAI-compatible API. Your applications connect to one endpoint—Cortex routes requests to the right model."
            color="blue"
          />
          <FeatureCard 
            icon="🔐"
            title="Secure Access Control"
            description="Create API keys with specific scopes. Track usage by user and organization. Full audit trail of every request."
            color="purple"
          />
          <FeatureCard 
            icon="📊"
            title="Monitor Everything"
            description="Real-time GPU utilization, token throughput, request latency—all visible in the dashboard. Know exactly what's happening."
            color="cyan"
          />
          <FeatureCard 
            icon="⚙️"
            title="Two Inference Engines"
            description="vLLM for high-throughput HuggingFace models. llama.cpp for GGUF files and specialized architectures. Choose what works best."
            color="amber"
          />
          <FeatureCard 
            icon="🏢"
            title="Multi-Tenant Ready"
            description="Organize users into organizations. Allocate resources and track usage per team. Scale from one user to enterprise deployments."
            color="rose"
          />
        </div>
      </section>

      {/* How It Works (High Level) */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">How Cortex Works</SectionTitle>
        <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[13px] text-white/70 leading-relaxed">
            Cortex sits between your applications and your GPU infrastructure. When you add a model, Cortex spins up an 
            isolated Docker container running the appropriate inference engine. Applications send requests to Cortex's 
            gateway, which validates credentials and routes to the model container.
          </p>
          
          <div className="flex flex-wrap items-center justify-center gap-3 py-4 text-[11px]">
            <FlowBlock label="Your Application" detail="SDK / curl / UI" color="blue" />
            <Arrow />
            <FlowBlock label="Cortex Gateway" detail="Auth & Routing" color="purple" />
            <Arrow />
            <FlowBlock label="Model Container" detail="vLLM or llama.cpp" color="emerald" />
            <Arrow />
            <FlowBlock label="GPU Hardware" detail="Your Infrastructure" color="cyan" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <InfoPoint 
              label="Single Endpoint" 
              detail="All models accessible via one URL—your applications don't need to know which GPU runs which model"
            />
            <InfoPoint 
              label="Hot Swapping" 
              detail="Start, stop, and reconfigure models without affecting other running services"
            />
            <InfoPoint 
              label="Resource Isolation" 
              detail="Each model runs in its own container with dedicated GPU allocation—no interference"
            />
          </div>
        </Card>
      </section>

      {/* Your Capabilities as Admin */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">What You Can Do as Administrator</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-3">
            <div className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
              <span>🤖</span> Model Management
            </div>
            <ul className="space-y-2 text-[12px] text-white/70">
              <CapabilityItem>Add models from HuggingFace Hub or local storage</CapabilityItem>
              <CapabilityItem>Configure GPU allocation and memory utilization</CapabilityItem>
              <CapabilityItem>Start, stop, and restart model containers</CapabilityItem>
              <CapabilityItem>View real-time logs and run health tests</CapabilityItem>
              <CapabilityItem>Save configurations as reusable recipes</CapabilityItem>
            </ul>
          </Card>

          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-3">
            <div className="text-[11px] font-bold text-purple-300 uppercase tracking-wider flex items-center gap-2">
              <span>🔑</span> Access Control
            </div>
            <ul className="space-y-2 text-[12px] text-white/70">
              <CapabilityItem>Create API keys with scoped permissions</CapabilityItem>
              <CapabilityItem>Assign keys to specific users and organizations</CapabilityItem>
              <CapabilityItem>Set rate limits and usage quotas</CapabilityItem>
              <CapabilityItem>Revoke access instantly when needed</CapabilityItem>
              <CapabilityItem>Track all API usage by key and user</CapabilityItem>
            </ul>
          </Card>

          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-3">
            <div className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <span>📊</span> Monitoring & Analytics
            </div>
            <ul className="space-y-2 text-[12px] text-white/70">
              <CapabilityItem>Monitor GPU utilization and memory across all cards</CapabilityItem>
              <CapabilityItem>Track tokens generated, latency, and throughput</CapabilityItem>
              <CapabilityItem>View usage breakdowns by user and organization</CapabilityItem>
              <CapabilityItem>Receive alerts when resources are constrained</CapabilityItem>
              <CapabilityItem>Export metrics to external monitoring systems</CapabilityItem>
            </ul>
          </Card>

          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-3">
            <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-2">
              <span>👥</span> Team Management
            </div>
            <ul className="space-y-2 text-[12px] text-white/70">
              <CapabilityItem>Create organizations for different teams or projects</CapabilityItem>
              <CapabilityItem>Add users with appropriate role assignments</CapabilityItem>
              <CapabilityItem>View per-org and per-user usage statistics</CapabilityItem>
              <CapabilityItem>Manage authentication and session security</CapabilityItem>
              <CapabilityItem>Configure multi-tenant isolation policies</CapabilityItem>
            </ul>
          </Card>
        </div>
      </section>

      {/* Quick Navigation */}
      <section className="space-y-3">
        <SectionTitle variant="emerald" className="text-[10px]">Navigate This Interface</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <NavCard href="/health" icon="❤️" title="Health" description="GPU & system status" />
          <NavCard href="/models" icon="🤖" title="Models" description="Deploy & manage LLMs" />
          <NavCard href="/chat" icon="💬" title="Chat" description="Test models directly" />
          <NavCard href="/keys" icon="🔑" title="API Keys" description="Manage access tokens" />
          <NavCard href="/usage" icon="📊" title="Usage" description="Analytics & metrics" />
          <NavCard href="/deployment" icon="📦" title="Transfer" description="Export & import bundles" />
        </div>
      </section>

      {/* Getting Started CTA */}
      <Card className="p-5 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-blue-500/10 border-emerald-500/20 space-y-4">
        <div className="flex items-start gap-4">
          <div className="text-3xl">🎯</div>
          <div className="space-y-2">
            <h3 className="text-[14px] font-bold text-white">Ready to Deploy Your First Model?</h3>
            <p className="text-[12px] text-white/70 leading-relaxed">
              The next section walks you through downloading a small model from HuggingFace and getting it running 
              in minutes. You'll learn the complete workflow from model acquisition to serving API requests.
            </p>
            <div className="flex gap-3 pt-2">
              <Button 
                variant="cyan" 
                size="sm" 
                className="text-[10px]"
                onClick={() => window.location.hash = 'first-model'}
              >
                Start Tutorial →
              </Button>
              <Link href="/health">
                <Button variant="default" size="sm" className="text-[10px]">
                  Check System Health First
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Card>

      {/* Important Notes */}
      <InfoBox variant="blue" className="text-[11px] p-4">
        <strong>Tip for New Administrators:</strong> Before deploying models, visit the{' '}
        <Link href="/health" className="text-cyan-300 underline">Health page</Link> to verify your GPUs are 
        detected and have available VRAM. Most deployment issues stem from resource constraints or driver problems.
      </InfoBox>

      <div className="text-[9px] text-white/20 uppercase font-black tracking-[0.3em] text-center pt-4 border-t border-white/5">
        Cortex Getting Started Guide • <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/40 hover:underline transition-colors">Aulendur Labs</a>
      </div>
    </section>
  );
}

// Helper Components
function FeatureCard({ icon, title, description, color }: { icon: string; title: string; description: string; color: string }) {
  const colors: Record<string, string> = {
    emerald: 'hover:border-emerald-500/30',
    blue: 'hover:border-blue-500/30',
    purple: 'hover:border-purple-500/30',
    cyan: 'hover:border-cyan-500/30',
    amber: 'hover:border-amber-500/30',
    rose: 'hover:border-rose-500/30',
  };
  return (
    <Card className={cn("p-4 bg-white/[0.02] border-white/5 group transition-all duration-300", colors[color])}>
      <div className="text-2xl mb-3 group-hover:scale-110 transition-transform">{icon}</div>
      <div className="text-[12px] font-bold text-white uppercase tracking-wider mb-1">{title}</div>
      <div className="text-[11px] text-white/60 leading-relaxed">{description}</div>
    </Card>
  );
}

function FlowBlock({ label, detail, color }: { label: string; detail: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-300',
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-300',
    emerald: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
    cyan: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300',
  };
  return (
    <div className={cn("px-4 py-3 rounded-xl border text-center min-w-[120px]", colors[color])}>
      <div className="font-bold text-[11px]">{label}</div>
      <div className="text-[9px] text-white/50 mt-0.5">{detail}</div>
    </div>
  );
}

function Arrow() {
  return <span className="text-white/30 text-lg">→</span>;
}

function InfoPoint({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="p-3 bg-black/30 rounded-lg border border-white/5">
      <div className="text-[10px] font-bold text-white/80 mb-1">{label}</div>
      <div className="text-[10px] text-white/50 leading-relaxed">{detail}</div>
    </div>
  );
}

function CapabilityItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-emerald-400 mt-0.5">✓</span>
      <span>{children}</span>
    </li>
  );
}

function NavCard({ href, icon, title, description }: { href: string; icon: string; title: string; description: string }) {
  return (
    <Link href={href}>
      <Card className="p-3 bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.04] transition-all duration-300 h-full">
        <div className="text-xl mb-1">{icon}</div>
        <div className="text-[10px] font-bold text-white uppercase tracking-wider">{title}</div>
        <div className="text-[9px] text-white/40 mt-0.5">{description}</div>
      </Card>
    </Link>
  );
}


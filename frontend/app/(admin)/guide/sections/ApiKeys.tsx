'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '../../../../src/components/UI';
import { useState, useEffect } from 'react';
import { useToast } from '../../../../src/providers/ToastProvider';
import { cn } from '../../../../src/lib/cn';
import { safeCopyToClipboard } from '../../../../src/lib/clipboard';

export default function ApiKeys() {
  const { addToast } = useToast();
  const [hostIP, setHostIP] = useState<string>('YOUR-GATEWAY-LAN-IP');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const envHostIP = process.env.NEXT_PUBLIC_HOST_IP;
      setHostIP(envHostIP && envHostIP !== 'localhost' ? envHostIP : window.location.hostname);
    }
  }, []);

  const copyToClipboard = async (text: string) => {
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      addToast({ title: 'Copied!', kind: 'success' });
    } else {
      addToast({ title: 'Failed to copy', kind: 'error' });
    }
  };

  return (
    <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <header className="space-y-2 text-center md:text-left">
        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">API Key Management</h1>
        <p className="text-white/60 text-sm leading-relaxed max-w-3xl">
          Control access to your Cortex deployment with scoped API keys. This guide covers how to provision, 
          monitor, and manage keys for users and applications—giving you fine-grained control over who can 
          access your AI inference capabilities.
        </p>
      </header>

      {/* Quick Navigation */}
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20">Access Control</Badge>
        <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/20">Scoped Permissions</Badge>
        <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Usage Tracking</Badge>
        <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">IP Restrictions</Badge>
      </div>

      {/* Quick Connect - API Endpoint */}
      <Card className="p-4 bg-gradient-to-r from-emerald-500/5 via-cyan-500/5 to-indigo-500/5 border-emerald-500/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-[10px] uppercase font-black text-emerald-300 tracking-wider">Cortex API Endpoint</div>
            <p className="text-[11px] text-white/50">Use this base URL when configuring your SDK or application</p>
          </div>
          <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[9px]">OpenAI Compatible</Badge>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/10 shadow-inner">
            <code className="text-sm text-emerald-400 font-mono font-bold tracking-wide">http://{hostIP}:8084/v1</code>
            <Button 
              variant="default" 
              size="sm" 
              className="h-8 px-4 text-[10px] font-bold uppercase tracking-wider ml-3" 
              onClick={() => copyToClipboard(`http://${hostIP}:8084/v1`)}
            >
              Copy URL
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-white/5">
          <div className="flex items-center gap-2 p-2 bg-black/20 rounded-lg">
            <span className="text-[10px] text-white/40 uppercase font-bold">Health Check</span>
            <code className="text-[10px] text-cyan-300/70 font-mono flex-1 truncate">http://{hostIP}:8084/health</code>
            <button 
              onClick={() => copyToClipboard(`http://${hostIP}:8084/health`)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Copy health endpoint"
            >
              <svg className="w-3 h-3 text-white/40 hover:text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 p-2 bg-black/20 rounded-lg">
            <span className="text-[10px] text-white/40 uppercase font-bold">Models</span>
            <code className="text-[10px] text-cyan-300/70 font-mono flex-1 truncate">http://{hostIP}:8084/v1/models</code>
            <button 
              onClick={() => copyToClipboard(`http://${hostIP}:8084/v1/models`)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Copy models endpoint"
            >
              <svg className="w-3 h-3 text-white/40 hover:text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2 p-2 bg-black/20 rounded-lg">
            <span className="text-[10px] text-white/40 uppercase font-bold">Chat</span>
            <code className="text-[10px] text-cyan-300/70 font-mono flex-1 truncate">http://{hostIP}:8084/v1/chat/completions</code>
            <button 
              onClick={() => copyToClipboard(`http://${hostIP}:8084/v1/chat/completions`)}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              title="Copy chat endpoint"
            >
              <svg className="w-3 h-3 text-white/40 hover:text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>
      </Card>

      {/* Overview Section */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="purple" className="text-[10px]">Overview</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-[12px] text-white/70 leading-relaxed">
              API keys are the primary authentication mechanism for Cortex's OpenAI-compatible API. Every request 
              to <code className="bg-white/10 px-1 py-0.5 rounded text-cyan-300">/v1/*</code> endpoints requires 
              a valid Bearer token. As an administrator, you control who gets access and what they can do.
            </p>
            <InfoBox variant="blue" className="text-[11px] p-3">
              <strong>Key Principle:</strong> Each API key is hashed (SHA-256) before storage. The full token is 
              only shown <strong>once</strong> at creation. If lost, the key must be revoked and a new one issued.
            </InfoBox>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Key Components</div>
            <div className="grid grid-cols-2 gap-2">
              <KeyComponent icon="🔑" label="Prefix" desc="8-char identifier" />
              <KeyComponent icon="🎯" label="Scopes" desc="Permission set" />
              <KeyComponent icon="📍" label="IP Allowlist" desc="Network restriction" />
              <KeyComponent icon="⏰" label="Expiration" desc="Time-based access" />
            </div>
          </div>
        </div>
      </Card>

      {/* Authentication Flow */}
      <Card className="p-4 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-cyan-500/5 border-white/5">
        <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider mb-3">Authentication Flow</div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-[11px]">
          <FlowStep num={1} label="Client Request" color="indigo" />
          <Arrow />
          <FlowStep num={2} label="Bearer Token" color="purple" />
          <Arrow />
          <FlowStep num={3} label="Validate Key" color="cyan" />
          <Arrow />
          <FlowStep num={4} label="Check Scopes" color="blue" />
          <Arrow />
          <FlowStep num={5} label="Process Request" color="emerald" />
        </div>
      </Card>

      {/* Understanding Scopes */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">1. Understanding Scopes</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4 bg-white/[0.02] border-white/5 lg:col-span-2 space-y-4">
            <p className="text-[12px] text-white/70 leading-relaxed">
              Scopes define what operations a key can perform. By assigning only the necessary scopes, 
              you follow the principle of <strong className="text-white">least privilege</strong>—limiting potential damage 
              if a key is compromised.
            </p>
            
            <div className="space-y-3">
              <ScopeDetail 
                name="chat"
                endpoint="/v1/chat/completions"
                description="Enables conversational AI interactions. Most common scope for chatbots and assistants."
                example='{"messages": [{"role": "user", "content": "Hello!"}]}'
              />
              <ScopeDetail 
                name="completions"
                endpoint="/v1/completions"
                description="Legacy text completion endpoint. Used for code generation and text continuation tasks."
                example='{"prompt": "Complete this sentence:", "max_tokens": 100}'
              />
              <ScopeDetail 
                name="embeddings"
                endpoint="/v1/embeddings"
                description="Vector embeddings for semantic search and RAG pipelines. Does not generate text."
                example='{"input": "text to embed", "model": "embedding-model"}'
              />
            </div>
          </Card>

          <Card className="p-4 bg-amber-500/5 border-amber-500/20 space-y-3">
            <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">Scope Recommendations</div>
            <div className="space-y-3">
              <ScopeRecommendation 
                useCase="Chatbot Application"
                scopes={['chat']}
                note="Only needs conversational endpoint"
              />
              <ScopeRecommendation 
                useCase="RAG Pipeline"
                scopes={['embeddings', 'chat']}
                note="Embed documents + generate answers"
              />
              <ScopeRecommendation 
                useCase="Full Development"
                scopes={['chat', 'completions', 'embeddings']}
                note="All capabilities for testing"
              />
              <ScopeRecommendation 
                useCase="Embedding Service Only"
                scopes={['embeddings']}
                note="Cannot generate any text"
              />
            </div>
          </Card>
        </div>
      </section>

      {/* Creating Keys */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">2. Creating API Keys</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
            <p className="text-[12px] text-white/70 leading-relaxed">
              Navigate to <strong className="text-white">Admin → API Keys</strong> to provision new keys. 
              You can assign keys to specific users and organizations for usage tracking and accountability.
            </p>
            
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Steps to Create a Key</div>
              <ol className="space-y-2 text-[11px] text-white/80">
                <StepItem num={1}>
                  Click <strong>"New Key"</strong> in the API Keys page
                </StepItem>
                <StepItem num={2}>
                  Configure <strong>Scopes</strong>:
                  <ul className="mt-1 ml-4 space-y-1 text-white/60">
                    <li>• Default: <code className="bg-white/10 px-1 rounded">chat,completions,embeddings</code></li>
                    <li>• Restrict as needed for specific use cases</li>
                  </ul>
                </StepItem>
                <StepItem num={3}>
                  <strong>Optional:</strong> Set IP Allowlist for network-level security
                </StepItem>
                <StepItem num={4}>
                  <strong>Optional:</strong> Assign to a User and/or Organization
                </StepItem>
                <StepItem num={5}>
                  <strong>Optional:</strong> Set an expiration date for temporary access
                </StepItem>
                <StepItem num={6}>
                  Click <strong>"Create Key"</strong> and immediately copy the token
                </StepItem>
              </ol>
            </div>

            <InfoBox variant="cyan" className="text-[11px] p-3">
              <strong>⚠️ Critical:</strong> The full API key is only displayed once. Copy it immediately and 
              store it securely. You cannot retrieve it later—you can only revoke and create a new one.
            </InfoBox>
          </Card>

          <div className="space-y-4">
            <Card className="p-4 bg-purple-500/5 border-purple-500/20 space-y-3">
              <div className="text-[10px] uppercase font-bold text-purple-300 tracking-wider">Key Assignment Options</div>
              <div className="space-y-3">
                <AssignmentOption 
                  type="System / Unassigned"
                  description="Generic key not tied to any user. Use for service accounts or shared infrastructure."
                  icon="🖥️"
                />
                <AssignmentOption 
                  type="Assigned to User"
                  description="Links usage tracking to a specific user account. Enables per-user analytics and accountability."
                  icon="👤"
                />
                <AssignmentOption 
                  type="Assigned to Organization"
                  description="Associates the key with an org for team-level usage tracking and billing separation."
                  icon="🏢"
                />
              </div>
            </Card>

            <Card className="p-4 bg-white/[0.02] border-white/5 space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Token Format</div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/10">
                <code className="text-[11px] text-emerald-400 font-mono break-all">
                  ctx_xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxx
                </code>
              </div>
              <div className="text-[10px] text-white/50 leading-relaxed">
                Keys use a <strong className="text-white/70">ctx_</strong> prefix followed by an 8-character 
                identifier (shown in the UI) and a secure random suffix (hidden after creation).
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* IP Restrictions */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">3. IP Allowlist Security</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
            <p className="text-[12px] text-white/70 leading-relaxed">
              Add an extra layer of security by restricting which IP addresses can use each key. 
              Even if a key is compromised, attackers cannot use it from unauthorized networks.
            </p>
            
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Allowlist Format</div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-500/10 text-emerald-300 text-[8px]">Single IP</Badge>
                  <code className="text-[10px] text-cyan-300">192.168.1.100</code>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-500/10 text-purple-300 text-[8px]">Multiple</Badge>
                  <code className="text-[10px] text-cyan-300">192.168.1.100, 10.0.0.50</code>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-500/10 text-blue-300 text-[8px]">CIDR Range</Badge>
                  <code className="text-[10px] text-cyan-300">10.0.0.0/24</code>
                </div>
              </div>
            </div>

            <InfoBox variant="blue" className="text-[11px] p-3">
              <strong>Note:</strong> When using a reverse proxy (nginx, Traefik), ensure the proxy 
              forwards the real client IP via <code className="bg-black/30 px-1 rounded">X-Forwarded-For</code> 
              or <code className="bg-black/30 px-1 rounded">X-Real-IP</code> headers.
            </InfoBox>
          </Card>

          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
            <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Use Case Examples</div>
            <div className="space-y-3">
              <IPUseCase 
                scenario="Production Server Only"
                allowlist="10.0.1.25"
                rationale="Only your application server can call the API"
              />
              <IPUseCase 
                scenario="Development Team Subnet"
                allowlist="192.168.10.0/24"
                rationale="Allow all developer workstations on the dev VLAN"
              />
              <IPUseCase 
                scenario="Multi-Site Deployment"
                allowlist="10.0.1.0/24, 172.16.0.0/16"
                rationale="Multiple office networks with different IP ranges"
              />
              <IPUseCase 
                scenario="Empty (No Restriction)"
                allowlist="(none)"
                rationale="Key works from any IP—use with caution"
              />
            </div>
          </Card>
        </div>
      </section>

      {/* User Self-Service */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">4. User Self-Service</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4 bg-white/[0.02] border-white/5 lg:col-span-2 space-y-4">
            <p className="text-[12px] text-white/70 leading-relaxed">
              Cortex supports user self-service key management. When users log into the admin UI, 
              they can create and manage their own API keys without admin intervention. This reduces 
              your operational burden while maintaining security through automatic user attribution.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">Self-Service Benefits</div>
                <ul className="space-y-1.5 text-[11px] text-white/70">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span>Users can generate keys on-demand</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span>Automatic user_id attribution for tracking</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span>Users can revoke their own compromised keys</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span>Reduces admin ticket volume</span>
                  </li>
                </ul>
              </div>
              <div className="space-y-2">
                <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">Admin Controls</div>
                <ul className="space-y-1.5 text-[11px] text-white/70">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400">◆</span>
                    <span>View all keys across all users</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400">◆</span>
                    <span>Revoke any key if necessary</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400">◆</span>
                    <span>Filter keys by user, org, or prefix</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400">◆</span>
                    <span>Monitor usage per key/user/org</span>
                  </li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-blue-500/5 border-blue-500/20 space-y-3">
            <div className="text-[10px] uppercase font-bold text-blue-300 tracking-wider">API Endpoints</div>
            <div className="space-y-3 text-[11px]">
              <div className="space-y-1">
                <div className="text-white font-semibold">Admin Endpoints</div>
                <code className="text-[10px] text-cyan-300 block">/admin/keys</code>
                <div className="text-white/50">Full CRUD access to all keys</div>
              </div>
              <div className="space-y-1">
                <div className="text-white font-semibold">Self-Service Endpoints</div>
                <code className="text-[10px] text-cyan-300 block">/admin/me/keys</code>
                <div className="text-white/50">Users manage only their own keys</div>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* Usage Tracking */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">5. Usage Tracking & Analytics</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              <p className="text-[12px] text-white/70 leading-relaxed">
                Every API request is logged with the associated key, enabling detailed usage analytics. 
                Navigate to <strong className="text-white">Admin → Usage</strong> to view request history, 
                token consumption, and latency metrics—filterable by key, user, or organization.
              </p>
              
              <div className="space-y-2">
                <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Tracked Metrics Per Request</div>
                <div className="grid grid-cols-2 gap-2">
                  <MetricItem label="Key ID" desc="Which key made the request" />
                  <MetricItem label="User/Org" desc="Attribution for billing" />
                  <MetricItem label="Model" desc="Which model was used" />
                  <MetricItem label="Task Type" desc="chat / completions / embeddings" />
                  <MetricItem label="Token Counts" desc="Prompt + completion tokens" />
                  <MetricItem label="Latency" desc="Response time in ms" />
                  <MetricItem label="Status Code" desc="Success (2xx) or errors" />
                  <MetricItem label="Request ID" desc="Unique trace identifier" />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-indigo-300 mb-2">Filter by Key</div>
                <p className="text-[11px] text-white/60 leading-relaxed">
                  In the Usage page, use the Key filter dropdown to see all requests made with a 
                  specific API key. Useful for investigating suspicious activity or auditing a user's consumption.
                </p>
              </div>

              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <div className="text-[10px] uppercase font-bold text-purple-300 mb-2">Last Used Timestamp</div>
                <p className="text-[11px] text-white/60 leading-relaxed">
                  The API Keys table shows when each key was last used. Keys that haven't been used 
                  in a long time may be candidates for revocation to reduce your attack surface.
                </p>
              </div>

              <Link href="/usage">
                <Button variant="purple" size="sm" className="w-full text-[10px]">
                  Open Usage Analytics →
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </section>

      {/* Key Lifecycle & Revocation */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">6. Key Lifecycle & Revocation</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Key States</div>
              <div className="space-y-2">
                <StateItem 
                  state="Active"
                  color="emerald"
                  description="Key is valid and can be used for API requests"
                />
                <StateItem 
                  state="Expired"
                  color="amber"
                  description="Key passed its expiration date and is automatically rejected"
                />
                <StateItem 
                  state="Revoked"
                  color="red"
                  description="Key was manually disabled by admin—cannot be re-enabled"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">When to Revoke</div>
              <ul className="space-y-1.5 text-[11px] text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-red-400">!</span>
                  <span>Key exposed in public repository or logs</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400">!</span>
                  <span>User leaves the organization</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400">!</span>
                  <span>Suspicious activity detected in usage logs</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400">!</span>
                  <span>Key hasn't been used in 90+ days (cleanup)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400">!</span>
                  <span>Project or integration is decommissioned</span>
                </li>
              </ul>
            </div>
          </Card>

          <Card className="p-4 bg-red-500/5 border-red-500/20 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-lg">⚠️</span>
              <div className="text-[11px] font-bold text-red-200 uppercase tracking-wider">Revocation Is Permanent</div>
            </div>
            <p className="text-[12px] text-white/70 leading-relaxed">
              Once a key is revoked, it cannot be re-enabled. Any application using the revoked key 
              will immediately receive <code className="bg-white/10 px-1 rounded">401 Unauthorized</code> errors.
            </p>
            
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Revocation Checklist</div>
              <ol className="space-y-2 text-[11px] text-white/80">
                <StepItem num={1}>
                  Identify the key prefix in the API Keys table
                </StepItem>
                <StepItem num={2}>
                  Click <strong>"Revoke"</strong> (appears on hover)
                </StepItem>
                <StepItem num={3}>
                  Confirm the action in the dialog
                </StepItem>
                <StepItem num={4}>
                  Notify affected users to update their integrations
                </StepItem>
                <StepItem num={5}>
                  Create a new key if access should continue
                </StepItem>
              </ol>
            </div>

            <InfoBox variant="cyan" className="text-[11px] p-3">
              <strong>Pro Tip:</strong> Before revoking, check the Usage page to see which applications 
              are actively using the key. Revocation without warning can cause service outages.
            </InfoBox>
          </Card>
        </div>
      </section>

      {/* Connecting from Docker Containers */}
      <section className="space-y-3">
        <SectionTitle variant="emerald" className="text-[10px]">7. Connecting from Docker Containers</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Cortex gateway runs with <strong className="text-white">host network mode</strong>, making it accessible 
            from any Docker container or external application without special network configuration.
          </p>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Access Methods</div>
              <div className="space-y-2">
                <ConnectionMethod 
                  method="host.docker.internal"
                  url={`http://host.docker.internal:8084/v1`}
                  note="Recommended for Docker containers (requires extra_hosts)"
                />
                <ConnectionMethod 
                  method="Host LAN IP"
                  url={`http://${hostIP}:8084/v1`}
                  note="Works from containers and LAN devices"
                />
                <ConnectionMethod 
                  method="Localhost"
                  url="http://localhost:8084/v1"
                  note="Same machine only"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">Docker Compose Example</div>
              <div className="relative">
                <pre className="text-[10px] bg-black/40 rounded-xl p-3 overflow-x-auto border border-white/5 text-white/60 font-mono leading-relaxed">
{`services:
  your-app:
    image: your-app-image
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      OPENAI_API_BASE: "http://host.docker.internal:8084/v1"
      OPENAI_API_KEY: "ctx_xxxxxxxx_..."`}
                </pre>
                <button 
                  onClick={() => copyToClipboard(`extra_hosts:\n  - "host.docker.internal:host-gateway"`)}
                  className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <InfoBox variant="blue" className="text-[11px] p-3">
            <strong>Linux Firewall Note:</strong> If using UFW firewall on Linux, run{' '}
            <code className="bg-black/30 px-1 rounded">make setup-firewall</code> once to allow Docker container traffic 
            to reach host services. This is a one-time setup.
          </InfoBox>
        </Card>
      </section>

      {/* SDK Integration */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">8. SDK & Client Integration</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Cortex is fully compatible with the <strong className="text-white">OpenAI SDK</strong> and any OpenAI-compatible 
            client (LangChain, LlamaIndex, etc.). Simply point the base URL to Cortex.
          </p>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black text-purple-400">Python</span>
                <Badge className="bg-purple-500/5 text-purple-300 text-[8px]">openai-python</Badge>
              </div>
              <div className="relative">
                <pre className="text-[10px] bg-black/40 rounded-xl p-3 overflow-x-auto border border-white/5 text-white/60 font-mono leading-relaxed">
{`from openai import OpenAI

client = OpenAI(
    base_url="http://${hostIP}:8084/v1",
    api_key="ctx_xxxxxxxx_..."  # Your key
)

response = client.chat.completions.create(
    model="your-model-name",
    messages=[{"role": "user", "content": "Hello!"}]
)`}
                </pre>
                <button 
                  onClick={() => copyToClipboard(`from openai import OpenAI\n\nclient = OpenAI(\n    base_url="http://${hostIP}:8084/v1",\n    api_key="YOUR_API_KEY"\n)`)}
                  className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-black text-indigo-400">Node.js / TypeScript</span>
                <Badge className="bg-indigo-500/5 text-indigo-300 text-[8px]">openai-node</Badge>
              </div>
              <div className="relative">
                <pre className="text-[10px] bg-black/40 rounded-xl p-3 overflow-x-auto border border-white/5 text-white/60 font-mono leading-relaxed">
{`import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: "http://${hostIP}:8084/v1",
  apiKey: "ctx_xxxxxxxx_...",  // Your key
});

const response = await client.chat.completions
  .create({
    model: "your-model-name",
    messages: [{ role: "user", content: "Hello!" }],
  });`}
                </pre>
                <button 
                  onClick={() => copyToClipboard(`import OpenAI from 'openai';\n\nconst client = new OpenAI({\n  baseURL: "http://${hostIP}:8084/v1",\n  apiKey: "YOUR_API_KEY",\n});`)}
                  className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-black text-cyan-400">cURL (Testing)</span>
            </div>
            <div className="relative">
              <pre className="text-[10px] bg-black/40 rounded-xl p-3 overflow-x-auto border border-white/5 text-white/60 font-mono leading-relaxed">
{`curl http://${hostIP}:8084/v1/chat/completions \\
  -H "Authorization: Bearer ctx_xxxxxxxx_..." \\
  -H "Content-Type: application/json" \\
  -d '{"model": "your-model", "messages": [{"role": "user", "content": "Hi"}]}'`}
              </pre>
              <button 
                onClick={() => copyToClipboard(`curl http://${hostIP}:8084/v1/chat/completions \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model": "your-model", "messages": [{"role": "user", "content": "Hi"}]}'`)}
                className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </Card>
      </section>

      {/* Best Practices */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">9. Best Practices</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-3">
            <div className="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">✓ Recommended</div>
            <ul className="space-y-2 text-[11px] text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Use <strong>least-privilege scopes</strong>—only grant what's needed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Set <strong>IP allowlists</strong> for production applications</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span><strong>Assign keys to users</strong> for accountability and tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Set <strong>expiration dates</strong> for temporary/contractor access</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span><strong>Review usage regularly</strong> for anomalies or inactive keys</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Store keys in <strong>environment variables</strong>, not in code</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5">✓</span>
                <span>Use <strong>separate keys</strong> per application/environment</span>
              </li>
            </ul>
          </Card>

          <Card className="p-4 bg-red-500/5 border-red-500/20 space-y-3">
            <div className="text-[10px] uppercase font-bold text-red-300 tracking-wider">✗ Avoid</div>
            <ul className="space-y-2 text-[11px] text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">✗</span>
                <span>Don't share a single key across multiple applications</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">✗</span>
                <span>Don't commit API keys to Git repositories</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">✗</span>
                <span>Don't expose keys in client-side JavaScript (browsers)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">✗</span>
                <span>Don't leave unused keys active indefinitely</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">✗</span>
                <span>Don't use the same key for dev/staging/production</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-0.5">✗</span>
                <span>Don't skip IP restrictions for production services</span>
              </li>
            </ul>
          </Card>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">10. Troubleshooting</SectionTitle>
        <div className="space-y-3">
          <TroubleshootItem 
            issue='401 Unauthorized — "Missing bearer token"'
            solution="Ensure your request includes the Authorization header with 'Bearer ' prefix. Example: Authorization: Bearer ctx_xxxxxxxx_..."
          />
          <TroubleshootItem 
            issue='401 Unauthorized — "Invalid API key"'
            solution="Verify the key prefix exists in the API Keys table and hasn't been revoked. Check for typos in the token. Remember: you can only see the full key once at creation."
          />
          <TroubleshootItem 
            issue='403 Forbidden — "IP not allowed"'
            solution="Your client IP is not in the key's allowlist. Check the allowlist configuration or remove IP restrictions if intentional. Verify reverse proxy is forwarding real client IPs."
          />
          <TroubleshootItem 
            issue='403 Forbidden — "Scope not permitted"'
            solution="The key doesn't have the required scope for this endpoint. Chat endpoint needs 'chat' scope, embeddings needs 'embeddings' scope, etc. Create a new key with appropriate scopes."
          />
          <TroubleshootItem 
            issue="Key usage not appearing in analytics"
            solution="Usage records are written asynchronously. Wait a few seconds and refresh the Usage page. If the database is unreachable, usage logging fails silently."
          />
          <TroubleshootItem 
            issue="Key expired but user still needs access"
            solution="Expired keys cannot be extended. Create a new key with the same configuration and update the user's integration. Consider using longer expiration or no expiration for permanent access."
          />
          <TroubleshootItem 
            issue="Connection timeout from Docker container"
            solution="Ensure extra_hosts is configured with 'host.docker.internal:host-gateway'. On Linux with UFW firewall, run 'make setup-firewall' from the Cortex directory to allow Docker container traffic."
          />
          <TroubleshootItem 
            issue="Cannot reach Cortex from external application"
            solution="Verify Cortex is running (make status). From Docker containers, use host.docker.internal:8084 or the host's LAN IP. Test with: curl http://HOST_IP:8084/health"
          />
        </div>
      </section>

      {/* Quick Reference */}
      <Card className="p-4 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-cyan-500/5 border-white/5">
        <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider mb-3">Quick Reference</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px]">
          <div>
            <div className="text-white/80 font-semibold mb-1">Available Scopes</div>
            <div className="text-white/60 text-[10px] space-y-0.5">
              <div><code className="text-cyan-300">chat</code> → /v1/chat/completions</div>
              <div><code className="text-cyan-300">completions</code> → /v1/completions</div>
              <div><code className="text-cyan-300">embeddings</code> → /v1/embeddings</div>
            </div>
          </div>
          <div>
            <div className="text-white/80 font-semibold mb-1">Key Token Format</div>
            <div className="text-white/60 text-[10px]">
              Prefix: <code className="text-cyan-300">ctx_</code><br/>
              Identifier: 8 chars (visible)<br/>
              Secret: 32+ chars (hidden)
            </div>
          </div>
          <div>
            <div className="text-white/80 font-semibold mb-1">Manage Keys</div>
            <Link href="/keys">
              <Button variant="cyan" size="sm" className="mt-1 text-[10px]">
                Open API Keys Page →
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="text-[9px] text-white/20 uppercase font-black tracking-[0.3em] text-center pt-4 border-t border-white/5">
        Cortex API Key Management Guide • <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/40 hover:underline transition-colors">Aulendur Labs</a>
      </div>
    </section>
  );
}

// Helper Components
function KeyComponent({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg border border-white/5">
      <span className="text-lg">{icon}</span>
      <div>
        <div className="text-[10px] font-bold text-white">{label}</div>
        <div className="text-[9px] text-white/50">{desc}</div>
      </div>
    </div>
  );
}

function FlowStep({ num, label, color }: { num: number; label: string; color: string }) {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300',
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-300',
    cyan: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300',
    blue: 'bg-blue-500/20 border-blue-500/30 text-blue-300',
    emerald: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
  };
  return (
    <div className={cn("px-3 py-1.5 rounded-lg border font-bold", colors[color])}>
      <span className="opacity-60">{num}.</span> {label}
    </div>
  );
}

function Arrow() {
  return <span className="text-white/30">→</span>;
}

function StepItem({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/70">
        {num}
      </span>
      <div className="flex-1">{children}</div>
    </li>
  );
}

function ScopeDetail({ name, endpoint, description, example }: { name: string; endpoint: string; description: string; example: string }) {
  return (
    <div className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-2">
      <div className="flex items-center justify-between">
        <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20 text-[10px] font-mono">{name}</Badge>
        <code className="text-[9px] text-white/40">{endpoint}</code>
      </div>
      <p className="text-[11px] text-white/60 leading-relaxed">{description}</p>
    </div>
  );
}

function ScopeRecommendation({ useCase, scopes, note }: { useCase: string; scopes: string[]; note: string }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-bold text-white">{useCase}</div>
      <div className="flex flex-wrap gap-1">
        {scopes.map(s => (
          <Badge key={s} className="bg-emerald-500/10 text-emerald-300 border-emerald-500/20 text-[8px]">{s}</Badge>
        ))}
      </div>
      <div className="text-[9px] text-white/40">{note}</div>
    </div>
  );
}

function AssignmentOption({ type, description, icon }: { type: string; description: string; icon: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-lg">{icon}</span>
      <div>
        <div className="text-[10px] font-bold text-white">{type}</div>
        <div className="text-[10px] text-white/50 leading-relaxed">{description}</div>
      </div>
    </div>
  );
}

function IPUseCase({ scenario, allowlist, rationale }: { scenario: string; allowlist: string; rationale: string }) {
  return (
    <div className="p-2.5 bg-white/5 rounded-lg border border-white/5 space-y-1">
      <div className="text-[10px] font-bold text-white">{scenario}</div>
      <code className="text-[9px] text-cyan-300 block">{allowlist}</code>
      <div className="text-[9px] text-white/40">{rationale}</div>
    </div>
  );
}

function MetricItem({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="p-2 bg-white/5 rounded-lg border border-white/5">
      <div className="text-[10px] font-bold text-white">{label}</div>
      <div className="text-[9px] text-white/40">{desc}</div>
    </div>
  );
}

function StateItem({ state, color, description }: { state: string; color: string; description: string }) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    red: 'bg-red-500/10 text-red-300 border-red-500/20',
  };
  return (
    <div className="flex items-center gap-3 p-2 bg-white/5 rounded-lg border border-white/5">
      <Badge className={cn("text-[9px]", colors[color])}>{state}</Badge>
      <span className="text-[11px] text-white/60">{description}</span>
    </div>
  );
}

function TroubleshootItem({ issue, solution }: { issue: string; solution: string }) {
  return (
    <Card className="p-3 bg-white/[0.02] border-white/5">
      <div className="flex items-start gap-3">
        <span className="text-amber-400 text-sm mt-0.5">?</span>
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-white font-mono">{issue}</div>
          <div className="text-[11px] text-white/60 leading-relaxed">{solution}</div>
        </div>
      </div>
    </Card>
  );
}

function ConnectionMethod({ method, url, note }: { method: string; url: string; note: string }) {
  return (
    <div className="p-2.5 bg-emerald-500/5 rounded-lg border border-emerald-500/20 space-y-1">
      <div className="text-[10px] font-bold text-emerald-300">{method}</div>
      <code className="text-[9px] text-cyan-300 block font-mono">{url}</code>
      <div className="text-[9px] text-white/40">{note}</div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '@/components/UI';
import { cn } from '@/lib/cn';
import { Attribution } from './Attribution';

export default function ChatPlayground() {
  return (
    <section className="space-y-6 duration-700">
      <header className="space-y-2 text-center md:text-left">
        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Chat Playground</h1>
        <p className="text-white/60 text-sm leading-relaxed max-w-3xl">
          Test and validate your running inference models interactively. The Chat Playground provides a simple interface 
          to verify model behavior, measure performance, and experiment with prompts—all without writing any code.
        </p>
      </header>

      {/* Quick Navigation */}
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-teal-500/10 text-teal-300 border-teal-500/20">Model Testing</Badge>
        <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Performance Metrics</Badge>
        <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/20">Chat History</Badge>
        <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">Context Tracking</Badge>
      </div>

      {/* What is Chat Playground */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="cyan" className="text-[10px]">What is the Chat Playground?</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-[12px] text-white/70 leading-relaxed">
              The Chat Playground is your go-to tool for <strong className="text-white">validating that models are working correctly</strong> after 
              deployment. Think of it as a quick "sanity check" before connecting external applications to your inference endpoints.
            </p>
            <InfoBox variant="blue" className="text-[11px] p-3">
              <strong>Key Use Cases:</strong> Verifying model responses, testing prompt formats, 
              measuring generation speed, and troubleshooting model behavior.
            </InfoBox>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">At a Glance</div>
            <div className="grid grid-cols-2 gap-2">
              <FeatureItem icon="💬" label="Interactive Chat" desc="Real-time responses" />
              <FeatureItem icon="📊" label="Live Metrics" desc="tok/s and TTFT" />
              <FeatureItem icon="💾" label="Auto-Save" desc="Cross-device history" />
              <FeatureItem icon="🎯" label="Context Tracking" desc="Usage visualization" />
            </div>
          </div>
        </div>
      </Card>

      {/* Getting Started */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Getting Started</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4 bg-white/[0.02] border-white/5 lg:col-span-2 space-y-4">
            <p className="text-[12px] text-white/70 leading-relaxed">
              Before using the Chat Playground, ensure you have at least one model running. 
              The picker lists <strong className="text-white">running chat models</strong>; embedding models are not offered.
            </p>
            
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Steps to Start Chatting</div>
              <ol className="space-y-2 text-[11px] text-white/80">
                <StepItem num={1}>
                  Navigate to <strong>Chat → Playground</strong> in the sidebar
                </StepItem>
                <StepItem num={2}>
                  Select a running model from the dropdown menu
                  <div className="mt-1 text-white/50 text-[10px]">
                    Only models in the running state appear here (embedding models are excluded)
                  </div>
                </StepItem>
                <StepItem num={3}>
                  Type your message in the input field at the bottom
                </StepItem>
                <StepItem num={4}>
                  Press <strong>Enter</strong> or click the send button to submit
                </StepItem>
                <StepItem num={5}>
                  Watch the response stream in real-time with live performance metrics
                </StepItem>
              </ol>
            </div>
          </Card>

          <Card className="p-4 bg-teal-500/5 border-teal-500/20 space-y-3">
            <div className="text-[10px] uppercase font-bold text-teal-300 tracking-wider">Prerequisites</div>
            <div className="space-y-3">
              <PrereqItem 
                label="Running Model" 
                required={true}
                desc="At least one model must be started and healthy"
              />
              <PrereqItem 
                label="Logged In" 
                required={true}
                desc="Chat history is saved per-user account"
              />
              <PrereqItem 
                label="API Keys" 
                required={false}
                desc="Not needed—Chat uses session auth"
              />
            </div>
            <Link href="/models">
              <Button variant="cyan" size="sm" className="w-full mt-2 text-[10px]">
                Manage Models →
              </Button>
            </Link>
          </Card>
        </div>
      </section>

      {/* Understanding the Interface */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Understanding the Interface</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
            <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Left Sidebar</div>
            <div className="space-y-3 text-[11px] text-white/70">
              <InterfaceItem 
                label="New Chat Button" 
                desc="Start a fresh conversation with the current model (or select a new one)"
              />
              <InterfaceItem 
                label="Chat History" 
                desc="Your previous conversations, sorted newest first. Click to resume any chat."
              />
              <InterfaceItem 
                label="Delete Options" 
                desc="Hover a chat and click the trash icon to delete it, or use 'Clear all chats' at the bottom"
              />
            </div>
          </Card>

          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
            <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Main Chat Area</div>
            <div className="space-y-3 text-[11px] text-white/70">
              <InterfaceItem 
                label="Model Selector" 
                desc="Dropdown showing running models. Locked after first message to maintain context."
              />
              <InterfaceItem 
                label="Message Thread" 
                desc="Conversation display with Cortex logo for assistant, user icon for you"
              />
              <InterfaceItem 
                label="Performance Bar" 
                desc="Shown while streaming: tokens per second and time to first token"
              />
              <InterfaceItem 
                label="Context Indicator" 
                desc="Visual bar showing how much of the model's context window is used"
              />
            </div>
          </Card>
        </div>
      </section>

      {/* Performance Metrics */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Performance Metrics Explained</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            During streaming, you'll see live performance metrics. These help you understand how well your 
            model and hardware are performing.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard 
              metric="tok/s"
              title="Tokens per Second"
              description="How fast the model generates output. Higher is better."
              goodRange="15-100+ tok/s"
              notes="Varies by model size, GPU, and context length"
              color="teal"
            />
            <MetricCard 
              metric="TTFT"
              title="Time to First Token"
              description="How long until the first word appears after you send a message."
              goodRange="50-500ms"
              notes="Affected by prompt length and model load"
              color="cyan"
            />
            <MetricCard 
              metric="Context"
              title="Context Used"
              description="Estimated tokens in the conversation versus the model's limit, shown as the bar above the input."
              goodRange="Under 80%"
              notes="Teal up to 80%, amber above 80%, red once the limit is exceeded"
              color="purple"
            />
          </div>

          <InfoBox variant="cyan" className="text-[11px] p-3">
            <strong>💡 Pro Tip:</strong> If you notice slow tok/s, try reducing the context length in model settings 
            or ensure no other heavy processes are using the GPU.
          </InfoBox>
        </Card>
      </section>

      {/* Context Window */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">Managing Context Window</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
            <p className="text-[12px] text-white/70 leading-relaxed">
              Every model has a <strong className="text-white">context window limit</strong>—the maximum number of tokens 
              it can process in a single conversation. The Chat Playground tracks this for you.
            </p>
            
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">What Happens at the Limit?</div>
              <ul className="space-y-2 text-[11px] text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5" aria-hidden="true">⚠</span>
                  <span>The full conversation is sent on every turn—nothing is trimmed—so a request past the limit fails</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5" aria-hidden="true">⚠</span>
                  <span>Every turn re-processes the whole history, so long chats get slower</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5" aria-hidden="true">✓</span>
                  <span>Start a <strong>New Chat</strong> to reset the context</span>
                </li>
              </ul>
            </div>
          </Card>

          <Card className="p-4 bg-blue-500/5 border-blue-500/20 space-y-3">
            <div className="text-[10px] uppercase font-bold text-blue-300 tracking-wider">Context Bar Colors</div>
            <div className="space-y-3 text-[11px]">
              <div className="flex items-center gap-3">
                <div className="w-12 h-2 rounded bg-teal-500/80"></div>
                <div className="text-white/70">
                  <strong className="text-teal-300">0-80%</strong> — Plenty of room
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-2 rounded bg-amber-500/80"></div>
                <div className="text-white/70">
                  <strong className="text-amber-300">80-100%</strong> — Getting full
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-2 rounded bg-red-500/80"></div>
                <div className="text-white/70">
                  <strong className="text-red-300">Over 100%</strong> — Over the limit
                </div>
              </div>
            </div>
            <div className="text-[10px] text-white/50 mt-2">
              When the bar turns red the next request exceeds the model&apos;s limit—start a new chat.
            </div>
          </Card>
        </div>
      </section>

      {/* Chat History */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Chat History & Persistence</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-[12px] text-white/70 leading-relaxed">
                Your chat sessions are <strong className="text-white">automatically saved</strong> to the server and tied 
                to your user account. This means:
              </p>
              <ul className="space-y-2 text-[11px] text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">✓</span>
                  <span>Access your chats from any computer</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">✓</span>
                  <span>History persists across browser sessions</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">✓</span>
                  <span>Only you can see your conversations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">✓</span>
                  <span>Administrators can see usage statistics (not content)</span>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Managing History</div>
              <div className="space-y-2 text-[11px] text-white/70">
                <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                  <strong className="text-white">Delete Single Chat:</strong>
                  <div className="text-white/50 mt-1">Hover over a chat in the sidebar and click the trash icon</div>
                </div>
                <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                  <strong className="text-white">Clear All History:</strong>
                  <div className="text-white/50 mt-1">Click "Clear all chats" at the bottom of the sidebar, then click it again within 3 seconds to confirm</div>
                </div>
                <div className="p-2 bg-white/5 rounded-lg border border-white/10">
                  <strong className="text-white">Auto-Naming:</strong>
                  <div className="text-white/50 mt-1">Chats are titled based on your first message</div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Best Practices */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Best Practices</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-3">
            <div className="text-[10px] uppercase font-bold text-emerald-300 tracking-wider">✓ Recommended</div>
            <ul className="space-y-2 text-[11px] text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5" aria-hidden="true">✓</span>
                <span>Test models right after deployment to verify they're working</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5" aria-hidden="true">✓</span>
                <span>Use specific prompts to test expected use cases</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5" aria-hidden="true">✓</span>
                <span>Check performance metrics to establish baselines</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5" aria-hidden="true">✓</span>
                <span>Start new chats when switching topics for cleaner context</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-0.5" aria-hidden="true">✓</span>
                <span>Compare different models with the same prompt</span>
              </li>
            </ul>
          </Card>

          <Card className="p-4 bg-amber-500/5 border-amber-500/20 space-y-3">
            <div className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">⚠ Keep in Mind</div>
            <ul className="space-y-2 text-[11px] text-white/70">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5" aria-hidden="true">⚠</span>
                <span>Chat Playground is for testing—not production workloads</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5" aria-hidden="true">⚠</span>
                <span>Model selection locks after first message to preserve context</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5" aria-hidden="true">⚠</span>
                <span>Very long conversations may hit context limits</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5" aria-hidden="true">⚠</span>
                <span>There are no system-prompt or temperature controls; sampling comes from the model&apos;s request defaults</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5" aria-hidden="true">⚠</span>
                <span>A turn you stop or that fails stays in the transcript but is not sent back to the model; use Retry to resend the last prompt</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5" aria-hidden="true">⚠</span>
                <span>If model is reconfigured, existing chats may behave differently</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-0.5" aria-hidden="true">⚠</span>
                <span>Usage is logged—admins can see you're using the playground</span>
              </li>
            </ul>
          </Card>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Troubleshooting</SectionTitle>
        <div className="space-y-3">
          <TroubleshootItem 
            issue="No models appear in the dropdown"
            solution="Ensure you have at least one generate (chat) model started. Go to the Models page and verify its state is running (green badge)."
          />
          <TroubleshootItem 
            issue="'Only embedding models are running'"
            solution="The picker excludes embedding models. Start a generate (chat) model on the Models page."
          />
          <TroubleshootItem 
            issue="Response is very slow"
            solution="Check the tok/s metric. If below 5, the model may be overloaded. Try stopping other models or reducing context length in model settings."
          />
          <TroubleshootItem 
            issue="Chat history doesn't appear"
            solution="Ensure you're logged in—chat history is per user. If the list could not be loaded, the sidebar shows the error; reload the page."
          />
          <TroubleshootItem 
            issue="Context bar is full but conversation is short"
            solution="The model may have a small context window. Check the model's configuration or start a new chat."
          />
          <TroubleshootItem 
            issue="Cannot change model after starting chat"
            solution="This is intentional—it prevents context confusion. Click 'New Chat' to select a different model."
          />
        </div>
      </section>

      {/* Quick Reference */}
      <Card className="p-4 bg-gradient-to-r from-teal-500/5 via-cyan-500/5 to-purple-500/5 border-white/5">
        <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider mb-3">Quick Reference</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px]">
          <div>
            <div className="text-white/80 font-semibold mb-1">Keyboard Shortcuts</div>
            <div className="text-white/60 text-[10px] space-y-1">
              <div><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[9px]">Enter</kbd> Send message</div>
              <div><kbd className="bg-white/10 px-1.5 py-0.5 rounded text-[9px]">Shift+Enter</kbd> New line</div>
            </div>
          </div>
          <div>
            <div className="text-white/80 font-semibold mb-1">Performance Goals</div>
            <div className="text-white/60 text-[10px] space-y-1">
              <div>tok/s: 15+ (good), 50+ (excellent)</div>
              <div>TTFT: &lt;500ms (good), &lt;200ms (excellent)</div>
            </div>
          </div>
          <div>
            <div className="text-white/80 font-semibold mb-1">Quick Access</div>
            <Link href="/chat">
              <Button variant="cyan" size="sm" className="mt-1 text-[10px]">
                Open Chat Playground →
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <Attribution label="Cortex Chat Playground Guide" />
    </section>
  );
}

// Helper Components
function FeatureItem({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg border border-white/5">
      <span className="text-lg" aria-hidden="true">{icon}</span>
      <div>
        <div className="text-[10px] font-bold text-white">{label}</div>
        <div className="text-[9px] text-white/50">{desc}</div>
      </div>
    </div>
  );
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

function PrereqItem({ label, required, desc }: { label: string; required: boolean; desc: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className={cn("text-[10px] font-bold", required ? "text-teal-300" : "text-white/60")}>
          {label}
        </span>
        {required && (
          <Badge className="bg-teal-500/10 text-teal-300 border-teal-500/20 text-[8px]">
            Required
          </Badge>
        )}
      </div>
      <div className="text-[10px] text-white/50 leading-relaxed">{desc}</div>
    </div>
  );
}

function InterfaceItem({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-cyan-400 mt-0.5" aria-hidden="true">•</span>
      <div>
        <strong className="text-white">{label}</strong>
        <div className="text-white/50">{desc}</div>
      </div>
    </div>
  );
}

function MetricCard({ metric, title, description, goodRange, notes, color }: { 
  metric: string; 
  title: string; 
  description: string; 
  goodRange: string;
  notes: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    teal: 'bg-teal-500/10 border-teal-500/20',
    cyan: 'bg-cyan-500/10 border-cyan-500/20',
    purple: 'bg-purple-500/10 border-purple-500/20',
  };
  const textColors: Record<string, string> = {
    teal: 'text-teal-300',
    cyan: 'text-cyan-300',
    purple: 'text-purple-300',
  };
  
  return (
    <div className={cn("p-3 rounded-xl border", colors[color])}>
      <div className={cn("text-lg font-black", textColors[color])}>{metric}</div>
      <div className="text-[11px] font-bold text-white mt-1">{title}</div>
      <div className="text-[10px] text-white/60 mt-1">{description}</div>
      <div className="mt-2 p-2 bg-black/20 rounded-lg">
        <div className="text-[9px] text-white/50 uppercase tracking-wider">Good Range</div>
        <div className="text-[10px] text-emerald-300 font-semibold">{goodRange}</div>
      </div>
      <div className="text-[9px] text-white/40 mt-2">{notes}</div>
    </div>
  );
}

function TroubleshootItem({ issue, solution }: { issue: string; solution: string }) {
  return (
    <Card className="p-3 bg-white/[0.02] border-white/5">
      <div className="flex items-start gap-3">
        <span className="text-amber-400 text-sm mt-0.5" aria-hidden="true">?</span>
        <div className="space-y-1">
          <div className="text-[11px] font-bold text-white">{issue}</div>
          <div className="text-[11px] text-white/60 leading-relaxed">{solution}</div>
        </div>
      </div>
    </Card>
  );
}


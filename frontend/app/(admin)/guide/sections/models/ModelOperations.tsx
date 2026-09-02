'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '@/components/UI';
import { cn } from '@/lib/cn';
import { Attribution } from '../Attribution';

export default function ModelOperations() {
  return (
    <section className="space-y-6">
      {/* Introduction */}
      <Card className="p-5 bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-red-500/5 border-white/5">
        <p className="text-[13px] text-white/80 leading-relaxed">
          Once a model is configured, you can manage its lifecycle through the Models page. This guide 
          covers the actions available for each model: starting, stopping, testing, viewing logs, 
          archiving, and deleting configurations.
        </p>
      </Card>

      {/* Model Lifecycle */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Model Lifecycle</SectionTitle>
        <Card className="p-4 bg-white/[0.02] border-white/5">
          <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] py-4">
            <LifecycleStep state="stopped" color="neutral" desc="Not running" />
            <Arrow />
            <LifecycleStep state="starting" color="amber" desc="Container init" />
            <Arrow />
            <LifecycleStep state="loading" color="cyan" desc="Loading weights" />
            <Arrow />
            <LifecycleStep state="running" color="emerald" desc="Ready for requests" />
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 text-[11px]">
            <span className="text-white/30">or</span>
            <LifecycleStep state="failed" color="red" desc="Error occurred" />
            <span className="text-white/30">→ check logs</span>
          </div>
          <p className="text-center text-[10px] text-white/50 mt-3">
            Stopping passes through <code>stopping</code> back to <code>stopped</code>. While a model is loading, the Stop button reads <strong>Cancel</strong>.
          </p>
        </Card>
      </section>

      {/* Actions Overview */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Available Actions</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ActionCard 
            icon="▶️"
            title="Start"
            description="Launch the model container and begin loading weights into GPU memory"
            when="Model is stopped or failed"
            effect="Creates Docker container, mounts model files, starts inference engine"
            color="emerald"
          />
          <ActionCard 
            icon="⏹️"
            title="Stop"
            description="Gracefully shut down the model container and release GPU resources"
            when="Model is starting or running"
            effect="Stops the container and frees VRAM; the model returns to stopped"
            color="red"
          />
          <ActionCard 
            icon="❌"
            title="Cancel"
            description="Abort a model that's taking too long to load"
            when="Model is loading (the Stop button reads Cancel)"
            effect="Same as Stop—terminates the loading process"
            color="amber"
          />
          <ActionCard 
            icon="🧪"
            title="Test"
            description="Send a test request to verify the model responds correctly"
            when="Model is Running"
            effect="Sends a simple prompt, displays response and latency"
            color="cyan"
          />
          <ActionCard 
            icon="📋"
            title="Logs"
            description="View container logs for debugging and monitoring"
            when="Any state"
            effect="Opens log viewer with container output, errors, and startup messages"
            color="blue"
          />
          <ActionCard 
            icon="⚙️"
            title="Config"
            description="Edit model configuration settings"
            when="Any state"
            effect="Opens the configuration wizard. Save & Apply stores the settings and restarts a running model; a stopped model keeps them for its next start."
            color="purple"
          />
          <ActionCard 
            icon="📜"
            title="Recipe"
            description="Save current configuration as a reusable recipe"
            when="Any state"
            effect="Opens the Blueprint Generation dialog; the saved recipe can be loaded into the Add Model form later"
            color="purple"
          />
          <ActionCard 
            icon="📦"
            title="Archive"
            description="Move model to vaulted configurations (hidden but preserved)"
            when="Model is stopped or failed (the button is disabled while it runs)"
            effect="Model disappears from the main table and appears under Vaulted Configurations"
            color="amber"
          />
          <ActionCard 
            icon="🗑️"
            title="Delete"
            description="Permanently remove model configuration"
            when="Model is Archived"
            effect="Configuration and any recipes saved from it are deleted; model files on disk are preserved"
            color="red"
          />
        </div>
      </section>

      {/* Starting a Model */}
      <section className="space-y-3">
        <SectionTitle variant="emerald" className="text-[10px]">Starting a Model</SectionTitle>
        <Card className="p-4 bg-emerald-500/5 border-emerald-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            When you click <strong className="text-emerald-300">Start</strong>, Cortex performs a series of operations:
          </p>

          <ol className="space-y-3 text-[11px] text-white/70">
            <ProcessStep num={1} title="Pre-flight (Dry Run)">
              Cortex builds the exact engine command, checks the image cache and estimates VRAM. If the check
              passes you see a toast with the estimate; if it reports errors a dialog lists them and you choose
              <strong> Start anyway</strong> or cancel.
            </ProcessStep>
            <ProcessStep num={2} title="Container Creation">
              A Docker container is created with the appropriate inference engine (vLLM or llama.cpp), 
              GPU assignments, and volume mounts for model files.
            </ProcessStep>
            <ProcessStep num={3} title="Engine Startup">
              The inference engine starts inside the container. For Online mode, this includes 
              downloading model weights from HuggingFace if not cached.
            </ProcessStep>
            <ProcessStep num={4} title="Model Loading">
              Weights are loaded into GPU memory. This is the longest step—large models can take 
              several minutes. State shows as "Loading" with a pulsing indicator.
            </ProcessStep>
            <ProcessStep num={5} title="Health Check">
              Cortex polls the model's readiness endpoint. When the model responds healthy,
              state transitions to "Running" and you see a success toast. If it fails, the state badge shows
              <strong> FAILED</strong> with the reason (hover or open Logs to see it), and the Logs modal runs a diagnosis.
            </ProcessStep>
          </ol>

          <InfoBox variant="blue" className="text-[10px] p-3">
            <strong>Tip:</strong> The Models page polls more frequently (every 3 seconds) when models are in 
            Loading state, automatically updating when they become ready.
          </InfoBox>
        </Card>
      </section>

      {/* Viewing Logs */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">Understanding Logs</SectionTitle>
        <Card className="p-4 bg-blue-500/5 border-blue-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            The <strong className="text-blue-300">Logs</strong> button opens a viewer showing container output. 
            Logs are essential for diagnosing startup failures and performance issues.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">What to Look For</div>
              <ul className="text-[11px] text-white/70 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">✓</span>
                  <span><strong>Startup messages:</strong> Engine version, model path, GPU detection</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">✓</span>
                  <span><strong>Loading progress:</strong> Layer loading, memory allocation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400" aria-hidden="true">✓</span>
                  <span><strong>"Model loaded" or "Ready":</strong> Confirms successful startup</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400" aria-hidden="true">!</span>
                  <span><strong>Error messages:</strong> CUDA errors, OOM, path not found</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400" aria-hidden="true">!</span>
                  <span><strong>Warnings:</strong> Compatibility issues, suboptimal settings</span>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Common Log Patterns</div>
              <div className="space-y-2 text-[10px]">
                <LogPattern 
                  pattern="CUDA out of memory"
                  meaning="Model too large for available VRAM. Reduce context, use quantization, or add GPUs."
                  color="red"
                />
                <LogPattern 
                  pattern="Model path not found"
                  meaning="The specified model path doesn't exist inside the container. Check volume mounts."
                  color="red"
                />
                <LogPattern 
                  pattern="Loading model weights..."
                  meaning="Normal—model is being loaded. Large models take several minutes."
                  color="cyan"
                />
                <LogPattern 
                  pattern="avg generation throughput"
                  meaning="vLLM is running and reporting performance metrics."
                  color="emerald"
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-black/30 rounded-lg border border-white/10">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider mb-2">Diagnostic Banner</div>
            <p className="text-[10px] text-white/60 leading-relaxed">
              When viewing logs for a failed model, Cortex shows a diagnostic banner at the top with 
              a diagnosis produced by matching the log tail against a table of known error patterns. It provides actionable suggestions for common issues 
              like CUDA version mismatches, path errors, and OOM conditions.
            </p>
          </div>
        </Card>
      </section>

      {/* Testing Models */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Testing Models</SectionTitle>
        <Card className="p-4 bg-cyan-500/5 border-cyan-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            The <strong className="text-cyan-300">Test</strong> button sends a quick request to verify your model works:
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-2">
              <div className="text-[10px] font-bold text-cyan-300">For Generate (Chat) Models</div>
              <p className="text-[10px] text-white/60 leading-relaxed">
                Sends a simple chat completion request with a brief prompt. Validates that the model 
                generates text and reports the round-trip latency.
              </p>
            </div>
            <div className="p-3 bg-black/30 rounded-lg border border-white/10 space-y-2">
              <div className="text-[10px] font-bold text-purple-300">For Embed Models</div>
              <p className="text-[10px] text-white/60 leading-relaxed">
                Sends a text embedding request. Validates that the model returns vectors of the 
                expected dimension.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Test Results Show</div>
            <ul className="text-[11px] text-white/70 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400" aria-hidden="true">•</span>
                <span><strong>Success/Failure status</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400" aria-hidden="true">•</span>
                <span><strong>Round-trip latency</strong> of the test request (no time-to-first-token)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400" aria-hidden="true">•</span>
                <span><strong>Token usage</strong> (prompt / completion / total) when the engine&apos;s response includes it</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400" aria-hidden="true">•</span>
                <span><strong>Sample output</strong> (truncated for display)</span>
              </li>
            </ul>
          </div>

          <InfoBox variant="blue" className="text-[10px] p-3">
            <strong>Best Practice:</strong> Always run a test after starting a new model to catch 
            configuration issues before users hit them. A successful test confirms end-to-end functionality.
          </InfoBox>
        </Card>
      </section>

      {/* Archiving and Deleting */}
      <section className="space-y-3">
        <SectionTitle variant="amber" className="text-[10px]">Archiving & Deleting</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-4 bg-amber-500/5 border-amber-500/20 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden="true">📦</span>
              <div className="text-[12px] font-bold text-amber-300 uppercase tracking-wider">Archiving</div>
            </div>
            <p className="text-[11px] text-white/70 leading-relaxed">
              Archiving moves a model to the "Vaulted Configurations" section at the bottom of the page. 
              The configuration is preserved but hidden from the main view.
            </p>
            <ul className="text-[11px] text-white/70 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-amber-400" aria-hidden="true">•</span>
                <span>Use for models you're not currently using but may need later</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400" aria-hidden="true">•</span>
                <span>Only stopped or failed models can be archived; archived models can still show their logs and be deleted from the vault</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400" aria-hidden="true">•</span>
                <span>Helps keep the main table focused on active deployments</span>
              </li>
            </ul>
          </Card>

          <Card className="p-4 bg-red-500/5 border-red-500/20 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden="true">🗑️</span>
              <div className="text-[12px] font-bold text-red-300 uppercase tracking-wider">Deleting</div>
            </div>
            <p className="text-[11px] text-white/70 leading-relaxed">
              Deleting permanently removes the model configuration from Cortex. This action is only 
              available for archived models (two-step safety).
            </p>
            <ul className="text-[11px] text-white/70 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-red-400" aria-hidden="true">•</span>
                <span>Configuration and any recipes saved from this model are permanently removed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400" aria-hidden="true">✓</span>
                <span><strong>Model files on disk are preserved</strong>—Cortex never deletes your weights</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400" aria-hidden="true">•</span>
                <span>To restore, you must add the model again from scratch</span>
              </li>
            </ul>
            <InfoBox variant="blue" className="text-[10px] p-2.5 mt-2">
              <strong>Safety Note:</strong> Before deleting, consider saving the configuration as a Recipe 
              so you can easily recreate it if needed.
            </InfoBox>
          </Card>
        </div>
      </section>

      {/* Reconfiguring Running Models */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Reconfiguring Models</SectionTitle>
        <Card className="p-4 bg-purple-500/5 border-purple-500/20 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Click <strong className="text-purple-300">Config</strong> to modify a model's settings. Changes are 
            saved but require a restart to take effect.
          </p>

          <div className="space-y-2">
            <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider">What You Can Change</div>
            <ul className="text-[11px] text-white/70 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-purple-400" aria-hidden="true">•</span>
                <span>GPU allocation (add/remove GPUs)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400" aria-hidden="true">•</span>
                <span>Context length, batch sizes, memory utilization</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400" aria-hidden="true">•</span>
                <span>Request defaults (temperature, penalties, etc.)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-400" aria-hidden="true">•</span>
                <span>Custom startup arguments and environment variables</span>
              </li>
            </ul>
          </div>

          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="text-[10px] text-amber-300 font-bold uppercase tracking-wider mb-1">Save & Apply</div>
            <p className="text-[10px] text-white/60 leading-relaxed">
              Click <strong>Save & Apply</strong> to persist your changes. If the model is running, the current
              container is stopped and a new one starts with the updated configuration (brief downtime).
              If the model is stopped, the settings are saved and used the next time you start it.
              Leaving a numeric field empty means &quot;use the engine default&quot;.
            </p>
          </div>
        </Card>
      </section>

      {/* Quick Actions */}
      <div className="flex gap-3 justify-center pt-4">
        <Link href="/models">
          <Button variant="cyan" size="sm" className="text-[10px]">
            Open Models Page →
          </Button>
        </Link>
      </div>

      <Attribution label="Cortex Model Operations Guide" />
    </section>
  );
}

// Helper Components
function LifecycleStep({ state, color, desc }: { state: string; color: string; desc: string }) {
  const colors: Record<string, string> = {
    neutral: 'bg-white/10 border-white/20 text-white/60',
    amber: 'bg-amber-500/20 border-amber-500/30 text-amber-300',
    cyan: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300',
    emerald: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300',
    red: 'bg-red-500/20 border-red-500/30 text-red-300',
  };
  return (
    <div className={cn("px-3 py-2 rounded-lg border text-center min-w-[90px]", colors[color])}>
      <div className="font-bold">{state}</div>
      <div className="text-[9px] text-white/50">{desc}</div>
    </div>
  );
}

function Arrow() {
  return <span className="text-white/30 text-lg" aria-hidden="true">→</span>;
}

function ActionCard({ 
  icon, 
  title, 
  description, 
  when, 
  effect,
  color 
}: { 
  icon: string;
  title: string;
  description: string;
  when: string;
  effect: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    emerald: 'hover:border-emerald-500/30',
    red: 'hover:border-red-500/30',
    amber: 'hover:border-amber-500/30',
    cyan: 'hover:border-cyan-500/30',
    blue: 'hover:border-blue-500/30',
    purple: 'hover:border-purple-500/30',
  };
  return (
    <Card className={cn("p-4 bg-white/[0.02] border-white/5 transition-all duration-300", colors[color])}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg" aria-hidden="true">{icon}</span>
        <span className="text-[12px] font-bold text-white uppercase tracking-wider">{title}</span>
      </div>
      <p className="text-[11px] text-white/70 leading-relaxed mb-2">{description}</p>
      <div className="space-y-1">
        <div className="text-[9px] text-white/40">
          <strong>When:</strong> {when}
        </div>
        <div className="text-[9px] text-white/40">
          <strong>Effect:</strong> {effect}
        </div>
      </div>
    </Card>
  );
}

function ProcessStep({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[11px] font-bold text-emerald-300">
        {num}
      </span>
      <div>
        <div className="text-[11px] font-bold text-white mb-0.5">{title}</div>
        <div className="text-[11px] text-white/60 leading-relaxed">{children}</div>
      </div>
    </li>
  );
}

function LogPattern({ pattern, meaning, color }: { pattern: string; meaning: string; color: string }) {
  const colors: Record<string, string> = {
    red: 'border-red-500/30 bg-red-500/10',
    cyan: 'border-cyan-500/30 bg-cyan-500/10',
    emerald: 'border-emerald-500/30 bg-emerald-500/10',
  };
  return (
    <div className={cn("p-2 rounded border", colors[color])}>
      <code className="text-white/80 font-mono">{pattern}</code>
      <p className="text-white/50 mt-0.5">{meaning}</p>
    </div>
  );
}


'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '@/components/UI';
import { cn } from '@/lib/cn';
import { Attribution } from './Attribution';

export default function AboutUsage() {
  return (
    <section className="space-y-6 duration-700">
      <header className="space-y-2 text-center md:text-left">
        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Usage Analytics</h1>
        <p className="text-white/60 text-sm leading-relaxed max-w-3xl">
          Track and analyze all inference requests flowing through your Cortex instance. Usage Analytics provides 
          visibility into request volume, token consumption, response latency, and error rates—essential data 
          for capacity planning, cost estimation, and troubleshooting.
        </p>
      </header>

      {/* Quick Navigation Tags */}
      <div className="flex flex-wrap gap-2">
        <Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20">Request Tracking</Badge>
        <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/20">Token Metering</Badge>
        <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">Latency Metrics</Badge>
        <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Export & Reports</Badge>
      </div>

      {/* What is Usage Analytics */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="blue" className="text-[10px]">What is Usage Analytics?</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-[12px] text-white/70 leading-relaxed">
              Every API request that flows through Cortex is <strong className="text-white">automatically recorded</strong> with 
              detailed metadata including the model used, tokens consumed, response time, and outcome. This data is 
              stored in your database and available for analysis through the Usage page.
            </p>
            <InfoBox variant="blue" className="text-[11px] p-3">
              <strong>What Gets Tracked:</strong> Chat completions, text completions, embeddings, and Chat Playground 
              sessions—whether accessed via API keys or the admin UI.
            </InfoBox>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Key Capabilities</div>
            <div className="grid grid-cols-2 gap-2">
              <FeatureItem icon="📊" label="Real-Time Stats" desc="Live dashboard updates" />
              <FeatureItem icon="🔍" label="Deep Filtering" desc="Time, model, task, status, key, user, org" />
              <FeatureItem icon="📈" label="Trend Analysis" desc="Time-series charts" />
              <FeatureItem icon="📁" label="CSV Export" desc="Data for external tools" />
            </div>
          </div>
        </div>
      </Card>

      {/* Understanding the Metrics */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Understanding Key Metrics</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MetricCard 
            metric="Tokens"
            title="Token Consumption"
            description="Tokens are the fundamental unit of LLM processing. Every request has prompt tokens (your input) and completion tokens (model output)."
            examples={[
              { label: "Prompt Tokens", desc: "Text you send to the model" },
              { label: "Completion Tokens", desc: "Text the model generates" },
              { label: "Total Tokens", desc: "Sum of prompt + completion" }
            ]}
            tip="Monitor total tokens to estimate costs and plan GPU capacity. High token counts indicate heavy usage."
            color="purple"
          />
          <MetricCard 
            metric="Latency"
            title="Response Latency"
            description="The time from request submission to complete response. Measured in milliseconds (ms) and shown as percentiles."
            examples={[
              { label: "p50 (Median)", desc: "Half of requests faster than this" },
              { label: "p95", desc: "95% of requests faster than this" },
              { label: "Average", desc: "Mean latency across all requests" }
            ]}
            tip="p95 latency spikes often indicate model overload or memory pressure. Check GPU utilization if p95 exceeds 2-3× p50."
            color="blue"
          />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <MetricCard 
            metric="TTFT"
            title="Time to First Token"
            description="How long users wait before seeing the first word of a response. Critical for perceived responsiveness in streaming applications."
            examples={[
              { label: "p50 / p95", desc: "From Prometheus: streamed requests in the last 5 minutes" },
              { label: "—", desc: "Shown when no streamed request happened in that window" }
            ]}
            tip="TTFT > 3s feels slow to users. If TTFT is high but overall latency is reasonable, consider prompt caching."
            color="cyan"
          />
          <MetricCard 
            metric="Status"
            title="Response Status Codes"
            description="HTTP status codes indicating request outcomes. Use these to track success rates and identify issues."
            examples={[
              { label: "2xx (Success)", desc: "Request completed normally" },
              { label: "4xx (Client Error)", desc: "Malformed request (400) or request timeout (408)" },
              { label: "5xx (Server Error)", desc: "Model crash, timeout, internal error" }
            ]}
            tip="A sudden spike in 5xx errors usually indicates model instability. Check container logs for details."
            color="amber"
          />
        </div>
      </section>

      {/* Dashboard Overview */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Dashboard Overview</SectionTitle>
        <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            The Usage page provides a comprehensive dashboard with multiple visualization and analysis tools:
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <DashboardFeature 
              title="KPI Strip"
              desc="Requests, tokens and latency p50 for the filtered window, plus time to first token p50 (Prometheus, streamed requests in the last 5 minutes; '—' without samples)."
              where="Top of page"
            />
            <DashboardFeature 
              title="Traffic Volume Chart"
              desc="Line chart showing request volume over time. Useful for identifying peak hours and usage patterns."
              where="Left chart area"
            />
            <DashboardFeature 
              title="Model Demand Chart"
              desc="Bar chart comparing request counts across models. Shows which models are most heavily utilized."
              where="Right chart area"
            />
            <DashboardFeature 
              title="Request Journal"
              desc="Detailed table of individual requests with timestamps, keys, tokens, latency, and status codes."
              where="Bottom of page"
            />
            <DashboardFeature 
              title="Filter Panel"
              desc="Time window, model, task, status, API key, user and organization. They apply to the KPIs, the charts and the journal; only the TTFT tile is independent."
              where="Below header"
            />
            <DashboardFeature 
              title="Live Mode"
              desc="Toggle auto-refresh to monitor traffic in real-time. Updates every 5-15 seconds when enabled."
              where="Header actions"
            />
          </div>
        </Card>
      </section>

      {/* Filtering & Analysis */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">Filtering & Analysis</SectionTitle>
        <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            Use filters to drill down into specific traffic patterns and isolate issues:
          </p>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Available Filters</div>
              <div className="space-y-2">
                <FilterItem 
                  name="Time Window" 
                  desc="1 h, 6 h, 24 h, 7 d or 30 d. Usage queries and exports reach back at most 30 days."
                />
                <FilterItem 
                  name="Model" 
                  desc="Focus on a specific model. The dropdown shows all models with recorded traffic."
                />
                <FilterItem 
                  name="Task" 
                  desc="Chat / Completions (recorded as generate) or Embeddings (embed)."
                />
                <FilterItem 
                  name="Status" 
                  desc="Show only successes (2xx), client errors (4xx), or server errors (5xx)."
                />
                <FilterItem 
                  name="API key / User / Organization" 
                  desc="Attribute traffic to a key, a user (Playground traffic carries the signed-in user) or an organization."
                />
                <FilterItem 
                  name="Rows" 
                  desc="Control pagination: 25, 50, or 100 records per page in the journal."
                />
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Analysis Scenarios</div>
              <div className="space-y-2 text-[11px]">
                <ScenarioItem 
                  title="Debug Failed Requests"
                  steps="Set Status to '5xx' or '4xx', then check the Request Journal for specific error patterns and request IDs."
                />
                <ScenarioItem 
                  title="Find Heavy Users"
                  steps="Filter by API key, user or organization, or export the CSV and group by key_id / user_id / org_id."
                />
                <ScenarioItem 
                  title="Compare Model Performance"
                  steps="Switch between models in the filter while watching the latency KPIs to compare response times."
                />
                <ScenarioItem 
                  title="Identify Peak Hours"
                  steps="Set time window to 24h or 7d and watch the Traffic Volume chart for recurring spikes."
                />
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Export & Reporting */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Export & Reporting</SectionTitle>
        <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <p className="text-[12px] text-white/70 leading-relaxed">
                The <strong className="text-white">Export</strong> button downloads a CSV file containing all records 
                matching your current filters. This data can be imported into spreadsheets, BI tools, or billing systems.
              </p>
              <InfoBox variant="purple" className="text-[11px] p-3">
                <strong>Export includes:</strong> ID, timestamp, API key ID, user ID, org ID, model, task, prompt tokens, completion tokens, 
                total tokens, latency (ms), status code, and request ID.
              </InfoBox>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Export Use Cases</div>
              <ul className="space-y-1.5 text-[11px] text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5" aria-hidden="true">◆</span>
                  <span><strong className="text-white/90">Cost allocation:</strong> Sum tokens by org_id or user_id for billing</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5" aria-hidden="true">◆</span>
                  <span><strong className="text-white/90">SLA reporting:</strong> Calculate percentile latencies over time</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5" aria-hidden="true">◆</span>
                  <span><strong className="text-white/90">Capacity planning:</strong> Analyze peak request rates and token volumes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5" aria-hidden="true">◆</span>
                  <span><strong className="text-white/90">Incident review:</strong> Export error records for postmortem analysis</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </section>

      {/* Live Monitoring */}
      <section className="space-y-3">
        <SectionTitle variant="cyan" className="text-[10px]">Live Monitoring</SectionTitle>
        <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-3">
              <p className="text-[12px] text-white/70 leading-relaxed">
                Click the <strong className="text-white">Live</strong> toggle in the header to enable real-time updates. 
                When active, the dashboard automatically refreshes every few seconds:
              </p>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="p-2 bg-white/[0.02] rounded-lg border border-white/5">
                  <span className="text-cyan-400 font-mono">5s</span>
                  <span className="text-white/50 ml-2">Request Journal updates</span>
                </div>
                <div className="p-2 bg-white/[0.02] rounded-lg border border-white/5">
                  <span className="text-cyan-400 font-mono">10s</span>
                  <span className="text-white/50 ml-2">Time-series chart updates</span>
                </div>
                <div className="p-2 bg-white/[0.02] rounded-lg border border-white/5">
                  <span className="text-cyan-400 font-mono">15s</span>
                  <span className="text-white/50 ml-2">Aggregate stats update</span>
                </div>
                <div className="p-2 bg-white/[0.02] rounded-lg border border-white/5">
                  <span className="text-cyan-400 font-mono">15s</span>
                  <span className="text-white/50 ml-2">Latency/TTFT metrics update</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-wider">Best For</div>
              <ul className="space-y-1.5 text-[11px] text-white/70">
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400" aria-hidden="true">→</span>
                  <span>Monitoring during load tests</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400" aria-hidden="true">→</span>
                  <span>Watching traffic after a new deployment</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400" aria-hidden="true">→</span>
                  <span>Real-time error detection</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-cyan-400" aria-hidden="true">→</span>
                  <span>Demonstrating system activity</span>
                </li>
              </ul>
            </div>
          </div>
        </Card>
      </section>

      {/* Understanding the Request Journal */}
      <section className="space-y-3">
        <SectionTitle variant="indigo" className="text-[10px]">Understanding the Request Journal</SectionTitle>
        <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
          <p className="text-[12px] text-white/70 leading-relaxed">
            The Request Journal shows individual API requests in reverse chronological order. Each row represents 
            one inference request with the following columns:
          </p>
          
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 px-3 text-white/50 uppercase tracking-wider text-[9px] font-bold">Column</th>
                  <th className="text-left py-2 px-3 text-white/50 uppercase tracking-wider text-[9px] font-bold">Description</th>
                  <th className="text-left py-2 px-3 text-white/50 uppercase tracking-wider text-[9px] font-bold">What to Look For</th>
                </tr>
              </thead>
              <tbody className="text-white/70">
                <tr className="border-b border-white/5">
                  <td className="py-2 px-3 font-mono text-indigo-300">Time</td>
                  <td className="py-2 px-3">When the request was made</td>
                  <td className="py-2 px-3 text-white/50">Cluster patterns or gaps in activity</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 px-3 font-mono text-cyan-300">Who</td>
                  <td className="py-2 px-3">API key prefix, or the user for Playground traffic (hover for the organization)</td>
                  <td className="py-2 px-3 text-white/50">Identify who made the request</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 px-3 font-mono text-white/90">Model</td>
                  <td className="py-2 px-3">Model that served the request</td>
                  <td className="py-2 px-3 text-white/50">Verify correct model routing</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 px-3"><Badge className="bg-indigo-500/10 text-indigo-300 border-indigo-500/20 text-[8px]">Task</Badge></td>
                  <td className="py-2 px-3">chat/completions or embeddings</td>
                  <td className="py-2 px-3 text-white/50">API endpoint used</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 px-3 font-mono text-white/60">Tokens</td>
                  <td className="py-2 px-3">Total tokens consumed</td>
                  <td className="py-2 px-3 text-white/50">Unusually high values may indicate runaway prompts</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 px-3 font-mono text-white/60">Latency</td>
                  <td className="py-2 px-3">Latency in milliseconds</td>
                  <td className="py-2 px-3 text-white/50">High values indicate slow responses</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-2 px-3"><Badge className="bg-emerald-500/10 text-emerald-400 text-[8px]">Status</Badge></td>
                  <td className="py-2 px-3">HTTP status code</td>
                  <td className="py-2 px-3 text-white/50">Non-2xx indicates errors</td>
                </tr>
                <tr>
                  <td className="py-2 px-3 font-mono text-[9px] text-white/40">Req ID</td>
                  <td className="py-2 px-3">Unique request identifier</td>
                  <td className="py-2 px-3 text-white/50">Use for log correlation</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* Common Tasks */}
      <section className="space-y-3">
        <SectionTitle variant="blue" className="text-[10px]">Common Tasks</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TaskCard 
            title="Investigate Slow Responses"
            steps={[
              "Look at the Latency p50 and p95 KPIs—a large gap indicates inconsistent performance",
              "Filter by the affected model to isolate the issue",
              "Check the Request Journal for requests with high latency values",
              "Cross-reference with System Monitor for GPU/memory constraints"
            ]}
            color="blue"
          />
          <TaskCard 
            title="Track Token Usage for Billing"
            steps={[
              "Set the time window to your billing period (e.g., 7 days)",
              "Click Export to download the CSV file",
              "Open in Excel/Sheets and sum the total_tokens column",
              "Group by key_id, user_id, org_id or model for per-team costs"
            ]}
            color="purple"
          />
          <TaskCard 
            title="Identify API Key Abuse"
            steps={[
              "Look for unusually high request counts in the Model Demand chart",
              "Export data and sort by key_id to find heavy users",
              "Check if specific keys have elevated error rates",
              "Disable suspicious keys from the API Keys page if needed"
            ]}
            color="amber"
          />
          <TaskCard 
            title="Capacity Planning"
            steps={[
              "Set time window to 7 days to see weekly patterns",
              "Note peak request rates in the Traffic Volume chart",
              "Calculate average tokens per request from export data",
              "Use System Monitor GPU metrics during peaks to assess headroom"
            ]}
            color="cyan"
          />
        </div>
      </section>

      {/* Tips & Best Practices */}
      <section className="space-y-3">
        <SectionTitle variant="purple" className="text-[10px]">Tips & Best Practices</SectionTitle>
        <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TipItem 
              title="Regular Exports"
              tip="Export usage data weekly or monthly for long-term trend analysis. Queries and exports only reach back 30 days, so exports are your long-term record."
            />
            <TipItem 
              title="Monitor Error Rates"
              tip="A healthy system should have < 1% error rate. Filter by 5xx status periodically to catch issues before they escalate."
            />
            <TipItem 
              title="Baseline Your Latency"
              tip="Document your typical p50 and p95 latency when the system is healthy. Use these as benchmarks to detect degradation."
            />
            <TipItem 
              title="TTFT vs Total Latency"
              tip="If TTFT is low but total latency is high, you're generating many tokens. If TTFT is high, the model is slow to start responding."
            />
            <TipItem 
              title="Use Request IDs"
              tip="When users report issues, ask for the request ID. You can search for it in the Request Journal or container logs."
            />
            <TipItem 
              title="Live Mode Sparingly"
              tip="Live mode increases database queries. Use it for active monitoring, but disable it when you're not watching."
            />
          </div>
        </Card>
      </section>

      {/* Troubleshooting */}
      <section className="space-y-3">
        <SectionTitle variant="amber" className="text-[10px]">Troubleshooting</SectionTitle>
        <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
          <div className="space-y-3">
            <TroubleshootItem 
              issue="Dashboard shows no data"
              solution="Ensure models are running and have received traffic. Usage is only recorded for actual API requests, not health checks."
            />
            <TroubleshootItem 
              issue="Tokens always show zero"
              solution="Streamed responses are metered when the stream ends, with the engine's real token counts. A zero means the engine returned no usage block—check the model's logs."
            />
            <TroubleshootItem 
              issue="Latency seems too high"
              solution="Filter by specific models to isolate the issue. Check the System Monitor for GPU memory pressure or high utilization."
            />
            <TroubleshootItem 
              issue="Export button doesn't work"
              solution="Exports are limited to 50,000 records. Try narrowing your time window or filters to reduce the result set."
            />
            <TroubleshootItem 
              issue="Live mode stops updating"
              solution="The browser tab may have been backgrounded. Refresh the page or re-enable Live mode."
            />
          </div>
        </Card>
      </section>

      {/* Quick Access */}
      <Card className="p-4 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-cyan-500/10 border-white/10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-white">Ready to analyze your usage?</h3>
            <p className="text-[11px] text-white/60">View real-time analytics and export data for reporting.</p>
          </div>
          <Link href="/usage">
            <Button variant="primary" size="sm">
              Open Usage Analytics →
            </Button>
          </Link>
        </div>
      </Card>

      <Attribution label="Cortex Usage Analytics Guide" />
    </section>
  );
}

/* Helper Components */

function FeatureItem({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2 p-2 bg-white/[0.02] rounded-lg border border-white/5">
      <span className="text-base" aria-hidden="true">{icon}</span>
      <div>
        <div className="text-[11px] font-semibold text-white/90">{label}</div>
        <div className="text-[10px] text-white/50">{desc}</div>
      </div>
    </div>
  );
}

function MetricCard({ 
  metric, 
  title, 
  description, 
  examples, 
  tip, 
  color 
}: { 
  metric: string; 
  title: string; 
  description: string; 
  examples: { label: string; desc: string }[];
  tip: string;
  color: string;
}) {
  const borderColors: Record<string, string> = {
    purple: 'border-purple-500/20',
    blue: 'border-blue-500/20',
    cyan: 'border-cyan-500/20',
    amber: 'border-amber-500/20',
  };
  const textColors: Record<string, string> = {
    purple: 'text-purple-300',
    blue: 'text-blue-300',
    cyan: 'text-cyan-300',
    amber: 'text-amber-300',
  };
  const bgColors: Record<string, string> = {
    purple: 'bg-purple-500/10',
    blue: 'bg-blue-500/10',
    cyan: 'bg-cyan-500/10',
    amber: 'bg-amber-500/10',
  };
  
  return (
    <Card className={cn("p-4 bg-white/[0.02] border-white/5 space-y-3", borderColors[color])}>
      <div className="flex items-center gap-2">
        <Badge className={cn("text-[9px] font-bold", bgColors[color], textColors[color], borderColors[color])}>
          {metric}
        </Badge>
        <span className="text-[12px] font-semibold text-white">{title}</span>
      </div>
      <p className="text-[11px] text-white/60 leading-relaxed">{description}</p>
      <div className="space-y-1.5">
        {examples.map((ex, i) => (
          <div key={i} className="flex items-start gap-2 text-[10px]">
            <span className={cn("font-mono", textColors[color])}>{ex.label}:</span>
            <span className="text-white/50">{ex.desc}</span>
          </div>
        ))}
      </div>
      <div className={cn("text-[10px] p-2 rounded-lg bg-white/[0.02] border border-white/5", textColors[color])}>
        💡 {tip}
      </div>
    </Card>
  );
}

function DashboardFeature({ title, desc, where }: { title: string; desc: string; where: string }) {
  return (
    <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-white">{title}</span>
        <span className="text-[9px] text-white/30 font-mono">{where}</span>
      </div>
      <p className="text-[10px] text-white/50 leading-relaxed">{desc}</p>
    </div>
  );
}

function FilterItem({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="p-2 bg-white/[0.02] rounded-lg border border-white/5">
      <div className="text-[11px] font-semibold text-white/90">{name}</div>
      <div className="text-[10px] text-white/50">{desc}</div>
    </div>
  );
}

function ScenarioItem({ title, steps }: { title: string; steps: string }) {
  return (
    <div className="p-2 bg-white/[0.02] rounded-lg border border-white/5">
      <div className="text-[11px] font-semibold text-blue-300">{title}</div>
      <div className="text-[10px] text-white/50 mt-1">{steps}</div>
    </div>
  );
}

function TaskCard({ title, steps, color }: { title: string; steps: string[]; color: string }) {
  const borderColors: Record<string, string> = {
    blue: 'border-l-blue-500/50',
    purple: 'border-l-purple-500/50',
    amber: 'border-l-amber-500/50',
    cyan: 'border-l-cyan-500/50',
  };
  
  return (
    <Card className={cn("p-4 bg-white/[0.02] border-white/5 border-l-2 space-y-3", borderColors[color])}>
      <h4 className="text-[12px] font-bold text-white">{title}</h4>
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-2 text-[11px] text-white/70">
            <span className="text-white/30 font-mono text-[10px] mt-0.5">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function TipItem({ title, tip }: { title: string; tip: string }) {
  return (
    <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
      <div className="text-[11px] font-semibold text-purple-300 mb-1">{title}</div>
      <div className="text-[10px] text-white/60 leading-relaxed">{tip}</div>
    </div>
  );
}

function TroubleshootItem({ issue, solution }: { issue: string; solution: string }) {
  return (
    <div className="flex items-start gap-3 p-3 bg-white/[0.02] rounded-lg border border-white/5">
      <span className="text-amber-400 text-sm mt-0.5" aria-hidden="true">⚠</span>
      <div className="space-y-1">
        <div className="text-[11px] font-semibold text-white">{issue}</div>
        <div className="text-[10px] text-white/60">{solution}</div>
      </div>
    </div>
  );
}

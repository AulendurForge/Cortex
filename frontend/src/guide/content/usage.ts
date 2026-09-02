/**
 * Usage Analytics: what is recorded, the KPIs, the dashboard, filters, export, live mode, the
 * request journal, common tasks and troubleshooting. Content only — wording audited against the
 * Usage page and the gateway's usage journal (30-day query window, 50,000-row export cap,
 * 5/10/15 s live refresh intervals, TTFT from Prometheus over the last 5 minutes).
 */
import type { GuideTab } from '../types';

export const usageTab: GuideTab = {
  id: 'about-usage',
  title: 'Usage Analytics',
  intro:
    'Track and analyze all inference requests flowing through your Cortex instance. Usage Analytics provides visibility into request volume, token consumption, response latency, and error rates—essential data for capacity planning, cost estimation, and troubleshooting.',
  lead: [{ kind: 'p', md: '**Request Tracking** · **Token Metering** · **Latency Metrics** · **Export & Reports**' }],
  sections: [
    {
      id: 'usage-what',
      title: 'What is Usage Analytics?',
      blocks: [
        { kind: 'p', md: 'Every API request that flows through Cortex is **automatically recorded** with detailed metadata including the model used, tokens consumed, response time, and outcome. This data is stored in your database and available for analysis through the Usage page.' },
        { kind: 'callout', variant: 'info', title: 'What Gets Tracked', md: 'Chat completions, text completions, embeddings, and Chat Playground sessions—whether accessed via API keys or the admin UI.' },
        { kind: 'h', level: 3, text: 'Key Capabilities' },
        {
          kind: 'cards',
          items: [
            { icon: '📊', title: 'Real-Time Stats', md: 'Live dashboard updates' },
            { icon: '🔍', title: 'Deep Filtering', md: 'Time, model, task, status, key, user, org' },
            { icon: '📈', title: 'Trend Analysis', md: 'Time-series charts' },
            { icon: '📁', title: 'CSV Export', md: 'Data for external tools' },
          ],
        },
      ],
    },
    {
      id: 'usage-metrics',
      title: 'Understanding Key Metrics',
      blocks: [
        {
          kind: 'cards',
          items: [
            {
              title: 'Tokens — Token Consumption',
              md: 'Tokens are the fundamental unit of LLM processing. Every request has prompt tokens (your input) and completion tokens (model output).\n**Prompt Tokens:** Text you send to the model\n**Completion Tokens:** Text the model generates\n**Total Tokens:** Sum of prompt + completion\n💡 Monitor total tokens to estimate costs and plan GPU capacity. High token counts indicate heavy usage.',
            },
            {
              title: 'Latency — Response Latency',
              md: 'The time from request submission to complete response. Measured in milliseconds (ms) and shown as percentiles.\n**p50 (Median):** Half of requests faster than this\n**p95:** 95% of requests faster than this\n**Average:** Mean latency across all requests\n💡 p95 latency spikes often indicate model overload or memory pressure. Check GPU utilization if p95 exceeds 2-3× p50.',
            },
            {
              title: 'TTFT — Time to First Token',
              md: 'How long users wait before seeing the first word of a response. Critical for perceived responsiveness in streaming applications.\n**p50 / p95:** From Prometheus: streamed requests in the last 5 minutes\n**—:** Shown when no streamed request happened in that window\n💡 TTFT > 3s feels slow to users. If TTFT is high but overall latency is reasonable, consider prompt caching.',
            },
            {
              title: 'Status — Response Status Codes',
              md: 'HTTP status codes indicating request outcomes. Use these to track success rates and identify issues.\n**2xx (Success):** Request completed normally\n**4xx (Client Error):** Malformed request (400) or request timeout (408)\n**5xx (Server Error):** Model crash, timeout, internal error\n💡 A sudden spike in 5xx errors usually indicates model instability. Check container logs for details.',
            },
          ],
        },
      ],
    },
    {
      id: 'usage-dashboard',
      title: 'Dashboard Overview',
      intro: 'The Usage page provides a comprehensive dashboard with multiple visualization and analysis tools:',
      blocks: [
        {
          kind: 'table',
          caption: 'Dashboard components',
          columns: ['Component', 'Where', 'What it shows'],
          rows: [
            ['**KPI Strip**', 'Top of page', "Requests, tokens and latency p50 for the filtered window, plus time to first token p50 (Prometheus, streamed requests in the last 5 minutes; '—' without samples)."],
            ['**Traffic Volume Chart**', 'Left chart area', 'Line chart showing request volume over time. Useful for identifying peak hours and usage patterns.'],
            ['**Model Demand Chart**', 'Right chart area', 'Bar chart comparing request counts across models. Shows which models are most heavily utilized.'],
            ['**Request Journal**', 'Bottom of page', 'Detailed table of individual requests with timestamps, keys, tokens, latency, and status codes.'],
            ['**Filter Panel**', 'Below header', 'Time window, model, task, status, API key, user and organization. They apply to the KPIs, the charts and the journal; only the TTFT tile is independent.'],
            ['**Live Mode**', 'Header actions', 'Toggle auto-refresh to monitor traffic in real-time. Updates every 5-15 seconds when enabled.'],
          ],
        },
      ],
    },
    {
      id: 'usage-filters',
      title: 'Filtering & Analysis',
      intro: 'Use filters to drill down into specific traffic patterns and isolate issues:',
      blocks: [
        { kind: 'h', level: 3, text: 'Available Filters' },
        {
          kind: 'table',
          caption: 'Filters on the Usage page',
          columns: ['Filter', 'Description'],
          rows: [
            ['**Time Window**', '1 h, 6 h, 24 h, 7 d or 30 d. Usage queries and exports reach back at most 30 days.'],
            ['**Model**', 'Focus on a specific model. The dropdown shows all models with recorded traffic.'],
            ['**Task**', 'Chat / Completions (recorded as generate) or Embeddings (embed).'],
            ['**Status**', 'Show only successes (2xx), client errors (4xx), or server errors (5xx).'],
            ['**API key / User / Organization**', 'Attribute traffic to a key, a user (Playground traffic carries the signed-in user) or an organization.'],
            ['**Rows**', 'Control pagination: 25, 50, or 100 records per page in the journal.'],
          ],
        },
        { kind: 'h', level: 3, text: 'Analysis Scenarios' },
        {
          kind: 'cards',
          items: [
            { title: 'Debug Failed Requests', md: "Set Status to '5xx' or '4xx', then check the Request Journal for specific error patterns and request IDs." },
            { title: 'Find Heavy Users', md: 'Filter by API key, user or organization, or export the CSV and group by key_id / user_id / org_id.' },
            { title: 'Compare Model Performance', md: 'Switch between models in the filter while watching the latency KPIs to compare response times.' },
            { title: 'Identify Peak Hours', md: 'Set time window to 24h or 7d and watch the Traffic Volume chart for recurring spikes.' },
          ],
        },
      ],
    },
    {
      id: 'usage-export',
      title: 'Export & Reporting',
      blocks: [
        { kind: 'p', md: 'The **Export** button downloads a CSV file containing all records matching your current filters. This data can be imported into spreadsheets, BI tools, or billing systems.' },
        { kind: 'callout', variant: 'info', title: 'Export includes', md: 'ID, timestamp, API key ID, user ID, org ID, model, task, prompt tokens, completion tokens, total tokens, latency (ms), status code, and request ID.' },
        { kind: 'h', level: 3, text: 'Export Use Cases' },
        {
          kind: 'list',
          items: [
            '**Cost allocation:** Sum tokens by org_id or user_id for billing',
            '**SLA reporting:** Calculate percentile latencies over time',
            '**Capacity planning:** Analyze peak request rates and token volumes',
            '**Incident review:** Export error records for postmortem analysis',
          ],
        },
      ],
    },
    {
      id: 'usage-live',
      title: 'Live Monitoring',
      blocks: [
        { kind: 'p', md: 'Click the **Live** toggle in the header to enable real-time updates. When active, the dashboard automatically refreshes every few seconds:' },
        {
          kind: 'table',
          caption: 'Refresh intervals in Live mode',
          columns: ['Interval', 'What updates'],
          rows: [
            ['`5s`', 'Request Journal updates'],
            ['`10s`', 'Time-series chart updates'],
            ['`15s`', 'Aggregate stats update'],
            ['`15s`', 'Latency/TTFT metrics update'],
          ],
        },
        { kind: 'h', level: 3, text: 'Best For' },
        { kind: 'list', items: ['Monitoring during load tests', 'Watching traffic after a new deployment', 'Real-time error detection', 'Demonstrating system activity'] },
      ],
    },
    {
      id: 'usage-journal',
      title: 'Understanding the Request Journal',
      intro: 'The Request Journal shows individual API requests in reverse chronological order. Each row represents one inference request with the following columns:',
      blocks: [
        {
          kind: 'table',
          caption: 'Request Journal columns',
          columns: ['Column', 'Description', 'What to Look For'],
          rows: [
            ['`Time`', 'When the request was made', 'Cluster patterns or gaps in activity'],
            ['`Who`', 'API key prefix, or the user for Playground traffic (hover for the organization)', 'Identify who made the request'],
            ['`Model`', 'Model that served the request', 'Verify correct model routing'],
            ['`Task`', 'chat/completions or embeddings', 'API endpoint used'],
            ['`Tokens`', 'Total tokens consumed', 'Unusually high values may indicate runaway prompts'],
            ['`Latency`', 'Latency in milliseconds', 'High values indicate slow responses'],
            ['`Status`', 'HTTP status code', 'Non-2xx indicates errors'],
            ['`Req ID`', 'Unique request identifier', 'Use for log correlation'],
          ],
        },
      ],
    },
    {
      id: 'usage-common-tasks',
      title: 'Common Tasks',
      blocks: [
        { kind: 'h', level: 3, text: 'Investigate Slow Responses' },
        {
          kind: 'steps',
          items: [
            { title: 'Look at the Latency p50 and p95 KPIs—a large gap indicates inconsistent performance' },
            { title: 'Filter by the affected model to isolate the issue' },
            { title: 'Check the Request Journal for requests with high latency values' },
            { title: 'Cross-reference with System Monitor for GPU/memory constraints' },
          ],
        },
        { kind: 'h', level: 3, text: 'Track Token Usage for Billing' },
        {
          kind: 'steps',
          items: [
            { title: 'Set the time window to your billing period (e.g., 7 days)' },
            { title: 'Click Export to download the CSV file' },
            { title: 'Open in Excel/Sheets and sum the total_tokens column' },
            { title: 'Group by key_id, user_id, org_id or model for per-team costs' },
          ],
        },
        { kind: 'h', level: 3, text: 'Identify API Key Abuse' },
        {
          kind: 'steps',
          items: [
            { title: 'Look for unusually high request counts in the Model Demand chart' },
            { title: 'Export data and sort by key_id to find heavy users' },
            { title: 'Check if specific keys have elevated error rates' },
            { title: 'Disable suspicious keys from the API Keys page if needed' },
          ],
        },
        { kind: 'h', level: 3, text: 'Capacity Planning' },
        {
          kind: 'steps',
          items: [
            { title: 'Set time window to 7 days to see weekly patterns' },
            { title: 'Note peak request rates in the Traffic Volume chart' },
            { title: 'Calculate average tokens per request from export data' },
            { title: 'Use System Monitor GPU metrics during peaks to assess headroom' },
          ],
        },
      ],
    },
    {
      id: 'usage-tips',
      title: 'Tips & Best Practices',
      blocks: [
        {
          kind: 'cards',
          items: [
            { title: 'Regular Exports', md: 'Export usage data weekly or monthly for long-term trend analysis. Queries and exports only reach back 30 days, so exports are your long-term record.' },
            { title: 'Monitor Error Rates', md: 'A healthy system should have < 1% error rate. Filter by 5xx status periodically to catch issues before they escalate.' },
            { title: 'Baseline Your Latency', md: 'Document your typical p50 and p95 latency when the system is healthy. Use these as benchmarks to detect degradation.' },
            { title: 'TTFT vs Total Latency', md: "If TTFT is low but total latency is high, you're generating many tokens. If TTFT is high, the model is slow to start responding." },
            { title: 'Use Request IDs', md: 'When users report issues, ask for the request ID. You can search for it in the Request Journal or container logs.' },
            { title: 'Live Mode Sparingly', md: "Live mode increases database queries. Use it for active monitoring, but disable it when you're not watching." },
          ],
        },
      ],
    },
    {
      id: 'usage-troubleshooting',
      title: 'Troubleshooting',
      blocks: [
        {
          kind: 'cards',
          items: [
            { title: 'Dashboard shows no data', md: 'Ensure models are running and have received traffic. Usage is only recorded for actual API requests, not health checks.' },
            { title: 'Tokens always show zero', md: "Streamed responses are metered when the stream ends, with the engine's real token counts. A zero means the engine returned no usage block—check the model's logs." },
            { title: 'Latency seems too high', md: 'Filter by specific models to isolate the issue. Check the System Monitor for GPU memory pressure or high utilization.' },
            { title: "Export button doesn't work", md: 'Exports are limited to 50,000 records. Try narrowing your time window or filters to reduce the result set.' },
            { title: 'Live mode stops updating', md: 'The browser tab may have been backgrounded. Refresh the page or re-enable Live mode.' },
          ],
        },
      ],
    },
    {
      id: 'usage-open',
      title: 'Ready to analyze your usage?',
      blocks: [
        { kind: 'link-cards', items: [{ title: 'Usage', md: 'View real-time analytics and export data for reporting.', href: '/usage', label: 'Open Usage Analytics' }] },
      ],
    },
  ],
  attribution: 'Cortex Usage Analytics Guide',
};

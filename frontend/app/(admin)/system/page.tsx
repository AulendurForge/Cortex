'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, ThresholdBadge, PageHeader, Button, Badge, InfoBox } from '@/components/UI';
import { LineChart } from '@/components/Charts';
import { Modal } from '@/components/Modal';
import { Tooltip } from '@/components/Tooltip';
import { Accordion, AccordionItem } from '@/components/monitoring/Accordion';
import { TimeRangeControls } from '@/components/monitoring/TimeRangeControls';
import apiFetch from '@/lib/api-clients';
import { z } from 'zod';
import { ThroughputSummarySchema, GpuMetricsListSchema, HostSummarySchema, HostTrendsSchema, CapabilitiesSchema, ModelMetricsListSchema } from '@/lib/validators';
import { HostIpDisplay } from '@/components/HostIpDisplay';
import { cn } from '@/lib/cn';
import { shortNum, fmtBps } from './helpers';
import { errMsg } from '@/lib/errors';

type Gpu = z.infer<typeof GpuMetricsListSchema>[number];
type ModelMetrics = z.infer<typeof ModelMetricsListSchema>[number];
type Point = { ts: number; value: number };

const LIVE_MS = 5_000;
const IDLE_MS = 30_000;


const gib = (mb?: number | null) => (mb == null ? '—' : `${(mb / 1024).toFixed(1)} GiB`);

export default function SystemMonitoringPage() {
  const qc = useQueryClient();
  const [rangeMin, setRangeMin] = useState<number>(15);
  const [live, setLive] = useState<boolean>(true);
  const [fullscreen, setFullscreen] = useState<{ title: string; content: React.ReactNode } | null>(null);
  const interval = live ? LIVE_MS : IDLE_MS;
  const common = { refetchInterval: interval, refetchIntervalInBackground: false, staleTime: 2_000 } as const;

  const caps = useQuery({ queryKey: ['system', 'capabilities'], queryFn: async () => CapabilitiesSchema.parse(await apiFetch<unknown>('/admin/system/capabilities')), staleTime: 60_000 });
  const throughput = useQuery({ queryKey: ['system', 'throughput'], queryFn: async () => ThroughputSummarySchema.parse(await apiFetch<unknown>('/admin/system/throughput')), ...common });
  const host = useQuery({ queryKey: ['system', 'host'], queryFn: async () => HostSummarySchema.parse(await apiFetch<unknown>('/admin/system/host/summary')), ...common });
  const gpus = useQuery({ queryKey: ['system', 'gpus'], queryFn: async () => GpuMetricsListSchema.parse(await apiFetch<unknown>('/admin/system/gpus')), ...common });
  const models = useQuery({ queryKey: ['system', 'models'], queryFn: async () => ModelMetricsListSchema.parse(await apiFetch<unknown>('/admin/models/metrics')), ...common });
  const step = rangeMin <= 60 ? 15 : rangeMin <= 360 ? 60 : 300;
  const trends = useQuery({
    queryKey: ['system', 'trends', rangeMin, step],
    queryFn: async () => HostTrendsSchema.parse(await apiFetch<unknown>(`/admin/system/host/trends?minutes=${rangeMin}&step_s=${step}`)),
    ...common,
    placeholderData: (prev) => prev,
  });

  // GPU utilisation / VRAM trends are sampled in the browser from the polled snapshot (DCGM has
  // no range endpoint yet), so they start when this page is opened and follow the selected range.
  const gpuHistory = useRef<Record<number, { util: Point[]; mem: Point[] }>>({});
  const [gpuTrends, setGpuTrends] = useState<Record<number, { util: Point[]; mem: Point[] }>>({});
  useEffect(() => {
    if (!gpus.data) return;
    const now = Date.now();
    const cutoff = now - rangeMin * 60 * 1000;
    const next = { ...gpuHistory.current };
    for (const g of gpus.data) {
      const cur = next[g.index] ?? { util: [], mem: [] };
      next[g.index] = {
        util: [...cur.util, { ts: now, value: g.utilization_pct ?? 0 }].filter((p) => p.ts >= cutoff).slice(-500),
        mem: [...cur.mem, { ts: now, value: g.mem_used_mb ?? 0 }].filter((p) => p.ts >= cutoff).slice(-500),
      };
    }
    gpuHistory.current = next;
    setGpuTrends(next);
  }, [gpus.data, rangeMin]);

  const queries = [throughput, host, gpus, models, trends];
  const error = queries.find((q) => q.isError)?.error;
  const lastUpdated = Math.max(0, ...queries.map((q) => q.dataUpdatedAt));
  const isFetching = queries.some((q) => q.isFetching);
  const refreshAll = () => qc.invalidateQueries({ queryKey: ['system'] });

  const t = throughput.data;
  const gpuList = gpus.data ?? [];
  const vramUsed = gpuList.reduce((a, g) => a + (g.mem_used_mb ?? 0), 0);
  const vramTotal = gpuList.every((g) => g.mem_total_mb != null) ? gpuList.reduce((a, g) => a + (g.mem_total_mb ?? 0), 0) : null;
  const cores = useMemo(() => Object.entries(trends.data?.cpu_per_core_pct ?? {}).sort((a, b) => Number(a[0]) - Number(b[0])), [trends.data]);
  const modelList = models.data ?? [];

  return (
    <section className="space-y-4">
      <PageHeader
        title="System Monitor"
        actions={
          <div className="flex items-center gap-3 bg-white/5 p-1 rounded-xl border border-white/10 glass shadow-lg">
            <div className="flex items-center gap-2 px-2 border-r border-white/10">
              <span className="text-[9px] uppercase font-black text-white/40 tracking-widest">Status</span>
              <span className={cn('text-[10px] font-mono font-bold flex items-center gap-1.5', error ? 'text-red-400' : live ? 'text-emerald-400' : 'text-white/60')}>
                <span className={cn('w-1.5 h-1.5 rounded-full', error ? 'bg-red-500' : live ? 'bg-emerald-500 animate-pulse' : 'bg-white/40')} aria-hidden />
                {error ? 'Error' : live ? `Live · ${LIVE_MS / 1000}s` : 'Paused'}
              </span>
            </div>
            <TimeRangeControls minutes={rangeMin} onChange={setRangeMin} live={live} onToggleLive={setLive} />
            <Button variant="cyan" size="sm" className="h-7 px-3 text-[10px] font-bold uppercase" onClick={refreshAll} loading={isFetching && !live}>Refresh</Button>
          </div>
        }
      />

      <HostIpDisplay variant="banner" className="py-2" />

      {error && <InfoBox variant="error" title="Some metrics could not be loaded" role="alert" className="py-2 text-xs">{errMsg(error)}</InfoBox>}
      {caps.data?.suggestions && caps.data.suggestions.length > 0 && (
        <InfoBox variant="blue" title="Monitoring setup" className="py-2 text-xs">
          <ul className="list-disc pl-4 space-y-0.5">{caps.data.suggestions.map((s: string) => <li key={s}>{s}</li>)}</ul>
        </InfoBox>
      )}

      <Card className="p-4 relative">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">Inference throughput <span className="normal-case tracking-normal font-medium text-white/40">(last minute, /v1 routes only)</span></div>
          <div className="text-[9px] font-mono text-white/40">{lastUpdated ? `updated ${new Date(lastUpdated).toLocaleTimeString()}` : '…'}</div>
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Requests" value={t ? shortNum(t.req_per_sec, 2) : undefined} suffix=" req/s" color="cyan" tooltip="Inference requests per second handled by the gateway (chat, completions, embeddings)." />
          <Kpi label="Prompt" value={t ? shortNum(t.prompt_tokens_per_sec) : undefined} suffix=" tok/s" color="indigo" tooltip="Prompt tokens processed per second, summed over vLLM and llama.cpp engines." />
          <Kpi label="Generation" value={t ? shortNum(t.generation_tokens_per_sec) : undefined} suffix=" tok/s" color="purple" tooltip="Tokens generated per second, summed over all engines." />
          <Kpi label="Latency p50" value={t?.latency_p50_ms != null ? shortNum(t.latency_p50_ms, 0) : undefined} suffix=" ms" color="blue" tooltip="Median end-to-end inference request latency over the last 5 minutes." empty={t ? 'no requests' : undefined} />
          <Kpi label="Latency p95" value={t?.latency_p95_ms != null ? shortNum(t.latency_p95_ms, 0) : undefined} suffix=" ms" color="amber" tooltip="95th percentile inference latency over the last 5 minutes." empty={t ? 'no requests' : undefined} />
          <Kpi label="TTFT p50" value={t?.ttft_p50_ms != null ? shortNum(t.ttft_p50_ms, 0) : undefined} suffix=" ms" color="emerald" tooltip="Median time to first token for streamed responses over the last 5 minutes." empty={t ? 'no streams' : undefined} />
        </div>
      </Card>

      <Accordion storageKey="sysmon">
        <AccordionItem
          id="gpus"
          title={<span className="font-bold tracking-tight text-white/90 text-sm uppercase">GPUs</span>}
          miniKpis={[
            { label: 'Count', value: gpuList.length },
            { label: 'Avg util', value: gpuList.length ? `${Math.round(gpuList.reduce((a, g) => a + (g.utilization_pct ?? 0), 0) / gpuList.length)}%` : '—' },
            { label: 'VRAM used', value: gpuList.length ? `${gib(vramUsed)}${vramTotal != null ? ` / ${gib(vramTotal)}` : ''}` : '—' },
          ]}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {gpuList.map((g) => <GpuCard key={g.index} g={g} trends={gpuTrends[g.index]} rangeMin={rangeMin} onFullscreen={setFullscreen} />)}
            {gpus.data && gpuList.length === 0 && (
              <div className="col-span-full py-12 text-center glass rounded-3xl border border-white/5">
                <div className="text-white/60 text-sm font-bold uppercase tracking-widest">No GPU metrics</div>
                <div className="text-white/40 text-xs mt-2">Start the stack with the <code>gpu</code> profile (dcgm-exporter) or install the NVIDIA runtime for the gateway.</div>
              </div>
            )}
          </div>
        </AccordionItem>

        <AccordionItem
          id="models"
          title={<span className="font-bold tracking-tight text-white/90 text-sm uppercase">Models</span>}
          miniKpis={[
            { label: 'Running', value: modelList.filter((m) => m.status === 'running').length },
            { label: 'Starting', value: modelList.filter((m) => m.status === 'starting' || m.status === 'loading').length },
            { label: 'Failed', value: modelList.filter((m) => m.status === 'failed').length },
          ]}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {modelList.map((m) => <ModelCard key={m.model_id} m={m} />)}
            {models.data && modelList.length === 0 && (
              <div className="col-span-full py-12 text-center glass rounded-3xl border border-white/5">
                <div className="text-white/60 text-sm font-bold uppercase tracking-widest">No active models</div>
                <div className="text-white/40 text-xs mt-2">Start a model from the Models page to see its engine metrics here.</div>
              </div>
            )}
          </div>
        </AccordionItem>

        <AccordionItem id="cpu" title={<span className="text-sm font-bold uppercase text-white/90">CPU</span>} miniKpis={[{ label: 'Util', value: host.data ? `${Math.round(host.data.cpu_util_pct)}%` : '—' }]}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Eyebrow tooltip="Average CPU usage across all cores.">Aggregate utilization</Eyebrow>
              <div className="bg-black/20 p-2 rounded-2xl border border-white/5">
                <LineChart data={(trends.data?.cpu_util_pct ?? []).map((p) => ({ ts: p.ts * 1000, value: p.value }))} valueSuffix="%" height={180} smooth={false} stroke="#6366f1" />
              </div>
            </div>
            <div className="space-y-2">
              <Eyebrow tooltip="Utilization of each CPU core.">Per core</Eyebrow>
              <div className="max-h-[200px] overflow-auto space-y-1.5 pr-2">
                {cores.map(([core, series]) => (
                  <div key={core} className="flex items-center gap-3 bg-white/5 p-1.5 rounded-xl border border-white/5">
                    <span className="text-[9px] font-mono font-bold text-indigo-300 w-8">C{core}</span>
                    <div className="flex-1 h-6"><LineChart data={(series ?? []).map((p) => ({ ts: p.ts * 1000, value: p.value }))} height={24} stroke="#818cf8" smooth={false} /></div>
                  </div>
                ))}
                {cores.length === 0 && <div className="text-[11px] text-white/40">Per-core data needs node-exporter (linux profile).</div>}
              </div>
            </div>
          </div>
        </AccordionItem>

        <AccordionItem id="memory" title={<span className="text-sm font-bold uppercase text-white/90">Memory</span>} miniKpis={[{ label: 'Used', value: host.data ? `${gib(host.data.mem_used_mb)}${host.data.mem_total_mb ? ` / ${gib(host.data.mem_total_mb)}` : ''}` : '—' }]}>
          <div className="bg-black/20 p-3 rounded-2xl border border-white/5 space-y-2">
            <Eyebrow tooltip="System memory in use by all processes on the host.">Used memory (GiB)</Eyebrow>
            <LineChart data={(trends.data?.mem_used_mb ?? []).map((p) => ({ ts: p.ts * 1000, value: p.value / 1024 }))} valueSuffix=" GiB" height={160} smooth={false} stroke="#3b82f6" />
          </div>
        </AccordionItem>

        <AccordionItem id="network" title={<span className="text-sm font-bold uppercase text-white/90">Network</span>} miniKpis={[{ label: 'RX / TX', value: host.data ? `${fmtBps(host.data.net_rx_bps)} / ${fmtBps(host.data.net_tx_bps)}` : '—' }]}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Eyebrow tooltip="Received across all non-loopback interfaces.">Inbound (Mbit/s)</Eyebrow>
              <div className="bg-black/20 p-2 rounded-2xl border border-white/5"><LineChart data={(trends.data?.net_rx_bps ?? []).map((p) => ({ ts: p.ts * 1000, value: (p.value * 8) / 1e6 }))} valueSuffix=" Mbit/s" stroke="#34d399" height={120} smooth={false} /></div>
            </div>
            <div className="space-y-2">
              <Eyebrow tooltip="Transmitted across all non-loopback interfaces.">Outbound (Mbit/s)</Eyebrow>
              <div className="bg-black/20 p-2 rounded-2xl border border-white/5"><LineChart data={(trends.data?.net_tx_bps ?? []).map((p) => ({ ts: p.ts * 1000, value: (p.value * 8) / 1e6 }))} valueSuffix=" Mbit/s" stroke="#22d3ee" height={120} smooth={false} /></div>
            </div>
          </div>
        </AccordionItem>
      </Accordion>

      <Modal open={!!fullscreen} onClose={() => setFullscreen(null)} title={fullscreen?.title} variant="fullscreen">
        <div className="h-full p-4">{fullscreen?.content}</div>
      </Modal>
    </section>
  );
}

function GpuCard({ g, trends, rangeMin, onFullscreen }: { g: Gpu; trends?: { util: Point[]; mem: Point[] }; rangeMin: number; onFullscreen: (f: { title: string; content: React.ReactNode }) => void }) {
  const util = trends?.util ?? [];
  const mem = trends?.mem ?? [];
  return (
    <Card className="p-3 border-white/5 bg-white/[0.02] hover:bg-white/[0.04]">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5">
        <div className="flex flex-col min-w-0">
          <div className="text-[9px] uppercase font-black text-white/40 tracking-[0.2em]">GPU {g.index}</div>
          <div className="text-[11px] font-bold text-white/80 truncate max-w-[200px]" title={g.name ?? undefined}>{g.name ?? 'Unknown GPU'}</div>
        </div>
        {typeof g.temperature_c === 'number' && (
          <div className="flex items-center gap-2">
            <ThresholdBadge level={g.temperature_c >= 85 ? 'crit' : g.temperature_c >= 75 ? 'warn' : 'ok'} />
            <span className="text-[10px] font-mono text-white/60">{g.temperature_c}°C</span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Tile label="Utilization" tooltip="Share of time GPU kernels were active." value={g.utilization_pct != null ? `${g.utilization_pct.toFixed(0)}%` : '—'} className="text-purple-400" />
        <Tile label="VRAM" tooltip="Video memory allocated (model weights and KV cache) over the card's capacity." value={g.mem_used_mb != null ? `${gib(g.mem_used_mb)}${g.mem_total_mb != null ? ` / ${gib(g.mem_total_mb)}` : ''}` : '—'} className="text-cyan-400 whitespace-nowrap" />
      </div>
      <div className="space-y-3">
        <TrendBox label="Utilization" note={`sampled while this page is open · last ${rangeMin} min`} onFullscreen={() => onFullscreen({ title: `GPU ${g.index} utilization`, content: <LineChart data={util} stroke="#8b5cf6" valueSuffix="%" height={500} smooth={false} /> })}>
          <LineChart data={util} stroke="#8b5cf6" height={60} smooth={false} valueSuffix="%" />
        </TrendBox>
        <TrendBox label="VRAM used" note="MB" onFullscreen={() => onFullscreen({ title: `GPU ${g.index} VRAM`, content: <LineChart data={mem} stroke="#f59e0b" valueSuffix=" MB" height={500} smooth={false} /> })}>
          <LineChart data={mem} stroke="#f59e0b" height={60} smooth={false} valueSuffix=" MB" />
        </TrendBox>
      </div>
    </Card>
  );
}

function ModelCard({ m }: { m: ModelMetrics }) {
  const badge = m.status === 'running' ? 'success' : m.status === 'failed' ? 'error' : 'warning';
  const kv = m.gpu_cache_usage_pct;
  return (
    <Card className="p-3 border-white/5 bg-white/[0.02] hover:bg-white/[0.04]">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-white/5 gap-2">
        <div className="flex flex-col min-w-0">
          <div className="text-[9px] uppercase font-black text-white/40 tracking-[0.2em] truncate">{m.engine_type ?? 'engine'}</div>
          <div className="text-[11px] font-bold text-white/80 truncate" title={m.model_name}>{m.served_name}</div>
        </div>
        <Badge variant={badge}>{m.status}</Badge>
      </div>
      {m.status === 'running' && !m.error && (
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Requests" tooltip="Requests being processed right now (queued in brackets)." className="text-purple-400"
            value={<>{m.num_requests_running ?? '—'}{(m.num_requests_waiting ?? 0) > 0 && <span className="text-[10px] text-amber-400 ml-1">(+{m.num_requests_waiting} queued)</span>}</>} />
          <Tile label="KV cache" tooltip="Share of the KV cache in use." className="text-cyan-400" value={kv != null ? `${(kv <= 1 ? kv * 100 : kv).toFixed(1)}%` : '—'} />
          <Tile label="Prompt tokens" tooltip="Prompt tokens processed since the container started." className="text-indigo-400" value={shortNum(m.prompt_tokens_total)} />
          <Tile label="Generated tokens" tooltip="Tokens generated since the container started." className="text-emerald-400" value={shortNum(m.generation_tokens_total)} />
          {(m.prompt_tokens_per_sec != null || m.generation_tokens_per_sec != null) && (
            <Tile label="Throughput" tooltip="Prompt / generation tokens per second reported by the engine." className="text-indigo-300" value={`${shortNum(m.prompt_tokens_per_sec)} / ${shortNum(m.generation_tokens_per_sec)} tok/s`} />
          )}
          {m.time_to_first_token_avg_ms != null && <Tile label="Avg TTFT" tooltip="Average time to first token since start." className="text-amber-400" value={`${m.time_to_first_token_avg_ms.toFixed(0)} ms`} />}
        </div>
      )}
      {(m.status === 'starting' || m.status === 'loading') && <div className="py-4 text-center text-white/60 text-sm animate-pulse">Loading model…</div>}
      {m.status === 'failed' && <div className="py-2 text-[11px] text-red-300 bg-red-500/10 px-2 rounded break-words">{m.state_reason ?? 'start failed'}</div>}
      {m.error && <div className="mt-2 text-[10px] text-amber-300 bg-amber-500/10 px-2 py-1 rounded break-words">{m.error}</div>}
    </Card>
  );
}

function Tile({ label, value, tooltip, className }: { label: string; value: React.ReactNode; tooltip: string; className?: string }) {
  return (
    <div className="p-2 bg-white/5 rounded-xl border border-white/5">
      <div className="text-[9px] uppercase font-black text-white/40 flex items-center gap-1">{label}<Tooltip text={tooltip} /></div>
      <div className={cn('text-sm font-mono font-bold', className)}>{value}</div>
    </div>
  );
}

function TrendBox({ label, note, onFullscreen, children }: { label: string; note?: string; onFullscreen: () => void; children: React.ReactNode }) {
  return (
    <div className="relative p-1.5 bg-black/20 rounded-xl border border-white/5">
      <div className="flex justify-between items-center px-1 mb-1 text-[9px] font-black text-white/40 uppercase tracking-widest">
        <span>{label}{note && <span className="normal-case tracking-normal font-medium text-white/30 ml-1">· {note}</span>}</span>
        <Button variant="default" size="sm" className="h-4 p-0 px-1 text-[8px]" onClick={onFullscreen} aria-label={`Open ${label} chart fullscreen`}>Expand</Button>
      </div>
      {children}
    </div>
  );
}

function Eyebrow({ children, tooltip }: { children: React.ReactNode; tooltip?: string }) {
  return <div className="text-[9px] uppercase font-black text-white/40 tracking-widest flex items-center gap-1">{children}{tooltip && <Tooltip text={tooltip} />}</div>;
}

function Kpi({ label, value, suffix = '', color = 'default', tooltip, empty }: { label: string; value: string | undefined; suffix?: string; color?: 'default' | 'cyan' | 'indigo' | 'purple' | 'blue' | 'amber' | 'emerald'; tooltip?: string; empty?: string }) {
  const gradients = { default: 'from-white/5 to-transparent', cyan: 'from-cyan-500/10 to-transparent', indigo: 'from-indigo-500/10 to-transparent', purple: 'from-purple-500/10 to-transparent', blue: 'from-blue-500/10 to-transparent', amber: 'from-amber-500/10 to-transparent', emerald: 'from-emerald-500/10 to-transparent' };
  const textColors = { default: 'text-white/90', cyan: 'text-cyan-300', indigo: 'text-indigo-300', purple: 'text-purple-300', blue: 'text-blue-300', amber: 'text-amber-300', emerald: 'text-emerald-300' };
  return (
    <div className={cn('glass rounded-xl p-3 bg-gradient-to-br border-white/5 shadow-lg', gradients[color])}>
      <div className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] mb-1 flex items-center gap-1">{label}{tooltip && <Tooltip text={tooltip} />}</div>
      <div className={cn('text-lg font-mono font-bold tracking-tighter', textColors[color])}>
        {value === undefined ? <span className="text-white/40 text-sm font-medium">{empty ?? '…'}</span> : <>{value}<span className="text-[10px] font-medium text-white/50">{suffix}</span></>}
      </div>
    </div>
  );
}

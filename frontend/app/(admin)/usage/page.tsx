'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiFetch from '../../../src/lib/api-clients';
import { getGatewayBaseUrl } from '../../../src/lib/api-clients';
import { UsageListSchema, UsageSeriesSchema, UsageAggListSchema, LatencySummarySchema, TtftSummarySchema } from '../../../src/lib/validators';
import { PageHeader, Card, Table, Button, Badge, Input, Select, Label, InfoBox, FormField, SectionTitle } from '../../../src/components/UI';
import { LineChart, BarChart } from '../../../src/components/Charts';
import { useEffect, useMemo, useState } from 'react';
import { RangeSlider } from '../../../src/components/RangeSlider';
import { Tooltip } from '../../../src/components/Tooltip';
import { cn } from '../../../src/lib/cn';

type UsageItem = {
  id: number;
  key_id: number | null;
  model_name: string;
  task: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  status_code: number;
  req_id: string;
  created_at: number;
};

export default function UsagePage() {
  const [filters, setFilters] = useState<{ hours: number; model?: string | ''; task?: string | ''; status?: string | ''; key_id?: number | ''; user_id?: number | ''; org_id?: number | '' }>({ hours: 24 });
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [live, setLive] = useState(false);

  useEffect(() => { setPage(0); }, [filters]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    p.set('limit', String(limit));
    p.set('offset', String(page * limit));
    if (filters.hours) p.set('hours', String(filters.hours));
    if (filters.model) p.set('model', String(filters.model));
    if (filters.task) p.set('task', String(filters.task));
    if (filters.status) p.set('status', String(filters.status));
    if (filters.key_id) p.set('key_id', String(filters.key_id));
    if (filters.user_id) p.set('user_id', String(filters.user_id));
    if (filters.org_id) p.set('org_id', String(filters.org_id));
    return p;
  }, [filters, page, limit]);

  const list = useQuery({
    queryKey: ['usage', filters],
    queryFn: async () => {
      const raw = await apiFetch<any>(`/admin/usage?${params.toString()}`);
      return UsageListSchema.parse(raw) as UsageItem[];
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: live ? 5000 : false,
  });

  const series = useQuery({
    queryKey: ['usageSeries', filters],
    queryFn: async () => {
      const modelPart = filters.model ? `&model=${encodeURIComponent(String(filters.model))}` : '';
      const raw = await apiFetch<any>(`/admin/usage/series?hours=${filters.hours}&bucket=${filters.hours <= 24 ? 'hour' : 'day'}${modelPart}`);
      return UsageSeriesSchema.parse(raw);
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: live ? 10000 : false,
  });

  const topModels = useQuery({
    queryKey: ['usageAgg', filters],
    queryFn: async () => {
      const modelPart = filters.model ? `&model=${encodeURIComponent(String(filters.model))}` : '';
      const raw = await apiFetch<any>(`/admin/usage/aggregate?hours=${filters.hours}${modelPart}`);
      return UsageAggListSchema.parse(raw);
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: live ? 15000 : false,
  });
  const latency = useQuery({
    queryKey: ['usageLatency', filters],
    queryFn: async () => {
      const modelPart = filters.model ? `&model=${encodeURIComponent(String(filters.model))}` : '';
      const raw = await apiFetch<any>(`/admin/usage/latency?hours=${filters.hours}${modelPart}`);
      return LatencySummarySchema.parse(raw);
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: live ? 15000 : false,
  });

  const ttft = useQuery({
    queryKey: ['usageTtft', live],
    queryFn: async () => {
      const raw = await apiFetch<any>(`/admin/usage/ttft`);
      return TtftSummarySchema.parse(raw);
    },
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    refetchInterval: live ? 15000 : false,
  });

  const usersLookup = useQuery({
    queryKey: ['usersLookup'],
    queryFn: async () => await apiFetch<any>('/admin/users/lookup'),
    staleTime: 60_000,
  });
  const orgsLookup = useQuery({
    queryKey: ['orgsLookup'],
    queryFn: async () => await apiFetch<any>('/admin/orgs/lookup'),
    staleTime: 60_000,
  });
  const keysLookup = useQuery({
    queryKey: ['keysLookup'],
    queryFn: async () => await apiFetch<any>('/admin/keys?limit=1000&include_names=true'),
    staleTime: 60_000,
  });

  const keyIdToInfo = useMemo(() => {
    const map: Record<number, { prefix: string; username?: string | null; org_name?: string | null }> = {};
    for (const k of (keysLookup.data || []) as any[]) {
      if (typeof k?.id === 'number') {
        map[k.id] = { prefix: String(k.prefix || ''), username: k.username || null, org_name: k.org_name || null };
      }
    }
    return map;
  }, [keysLookup.data]);

  return (
    <section className="space-y-4">
      <PageHeader
        title="Usage Analytics"
        actions={(
          <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-xl border border-white/10 glass">
            <Button variant="default" size="sm" onClick={() => { list.refetch(); series.refetch(); topModels.refetch(); latency.refetch(); ttft.refetch(); }}>Refresh</Button>
            <Button variant={live ? 'cyan' : 'default'} size="sm" onClick={() => setLive(v => !v)} className={cn(live && "shadow-cyan-500/20")}>{live ? '● Live' : '○ Live'}</Button>
            <Button variant="purple" size="sm" onClick={() => { const base = getGatewayBaseUrl(); window.open(`${base}/admin/usage/export?${params.toString()}`, '_blank'); }}>Export</Button>
          </div>
        )}
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div className="md:col-span-2 xl:col-span-1">
            <Label className="text-[10px] uppercase font-black tracking-widest text-white/30 mb-2">Time Window</Label>
            <RangeSlider
              stops={[{ label: '1h', value: 1 }, { label: '6h', value: 6 }, { label: '24h', value: 24 }, { label: '7d', value: 168 }]}
              value={filters.hours}
              onChange={(v) => setFilters({ ...filters, hours: v })}
            />
          </div>
          <FormField label="Model"><Select selectSize="sm" value={filters.model ?? ''} onChange={(e) => setFilters({ ...filters, model: e.target.value })}><option value="">Any</option>{(topModels.data || []).map(m => <option key={m.model_name} value={m.model_name}>{m.model_name}</option>)}</Select></FormField>
          <FormField label="Task"><Select selectSize="sm" value={filters.task ?? ''} onChange={(e) => setFilters({ ...filters, task: e.target.value })}><option value="">Any</option><option value="chat">Chat</option><option value="completions">Completions</option><option value="embeddings">Embeddings</option></Select></FormField>
          <FormField label="Status"><Select selectSize="sm" value={filters.status ?? ''} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Any</option><option value="2xx">Success</option><option value="4xx">Client Err</option><option value="5xx">Server Err</option></Select></FormField>
          <FormField label="Rows"><Select selectSize="sm" value={String(limit)} onChange={(e) => { setPage(0); setLimit(Number(e.target.value)); }}><option value="25">25</option><option value="50">50</option><option value="100">100</option></Select></FormField>
        </div>
      </Card>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiUsage label="Requests" value={(series.data || []).reduce((a, b) => a + b.requests, 0)} color="indigo" />
        <KpiUsage label="Tokens" value={(series.data || []).reduce((a, b) => a + b.total_tokens, 0)} color="purple" />
        <KpiUsage label="Latency p50" value={latency.data ? `${Math.round(latency.data.p50_ms)}ms` : '—'} color="blue" />
        <KpiUsage label="TTFT p50" value={ttft.data ? `${ttft.data.p50_s.toFixed(2)}s` : '—'} color="cyan" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionTitle variant="blue" className="text-[10px]">Traffic Volume</SectionTitle>
          <div className="bg-black/20 p-2 rounded-xl border border-white/5">
            <LineChart data={(series.data || []).map(p => ({ ts: p.ts, value: p.requests }))} height={180} stroke="#6366f1" />
          </div>
        </Card>
        <Card className="p-4">
          <SectionTitle variant="purple" className="text-[10px]">Model Demand</SectionTitle>
          <div className="bg-black/20 p-2 rounded-xl border border-white/5">
            <BarChart data={(topModels.data || []).map(m => ({ label: m.model_name, value: m.requests }))} barColor="#a855f7" />
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden border-white/5 bg-white/[0.01]">
        <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
          <SectionTitle variant="cyan" className="mb-0 text-[10px]">Request Journal (Page {page + 1})</SectionTitle>
          <div className="flex items-center gap-1.5">
            <Button size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>←</Button>
            <Button size="sm" onClick={() => setPage(p => p + 1)} disabled={!list.data || list.data.length < limit}>→</Button>
          </div>
        </div>
        <Table>
          <thead>
            <tr><th>Time</th><th>Key</th><th>Model</th><th>Task</th><th>Tokens</th><th>Lat</th><th>Stat</th><th>Req ID</th></tr>
          </thead>
          <tbody>
            {(list.data || []).map(u => (
              <tr key={u.id} className="group text-[11px]">
                <td className="text-white/40 font-mono">{new Date(u.created_at * 1000).toLocaleTimeString()}</td>
                <td className="font-mono text-cyan-300/70">{u.key_id != null ? (keyIdToInfo[u.key_id]?.prefix || '...') : '—'}</td>
                <td className="font-semibold text-white/80">{u.model_name}</td>
                <td><Badge className="bg-indigo-500/5 text-indigo-300/70 border-indigo-500/10 text-[8px]">{u.task}</Badge></td>
                <td className="font-mono text-white/60">{u.total_tokens}</td>
                <td className="font-mono text-white/60">{u.latency_ms}ms</td>
                <td><Badge className={u.status_code < 300 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}>{u.status_code}</Badge></td>
                <td className="font-mono text-[9px] text-white/10 group-hover:text-white/40 truncate max-w-[80px]">{u.req_id}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </section>
  );
}

function KpiUsage({ label, value, color = 'indigo' }: { label: string; value: string | number; color: any }) {
  const textColors = { indigo: 'text-indigo-300', purple: 'text-purple-300', blue: 'text-blue-300', cyan: 'text-cyan-300' };
  return (
    <Card className="p-3 border-white/5 bg-white/[0.02]">
      <div className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">{label}</div>
      <div className={cn("text-lg font-mono font-bold tracking-tight", textColors[color as keyof typeof textColors])}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </Card>
  );
}

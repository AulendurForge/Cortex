'use client';

import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import apiFetch from '@/lib/api-clients';
import { getGatewayBaseUrl } from '@/lib/api-clients';
import {
  UsageListSchema, UsageSeriesSchema, UsageAggListSchema, LatencySummarySchema, TtftSummarySchema, KeysListSchema,
} from '@/lib/validators';
import { PageHeader, Card, Table, Button, Badge, Select, Label, FormField, SectionTitle, InfoBox } from '@/components/UI';
import { LineChart, BarChart } from '@/components/Charts';
import { useEffect, useMemo, useState } from 'react';
import { RangeSlider } from '@/components/RangeSlider';
import { cn } from '@/lib/cn';
import { bucketFor } from './helpers';

type UsageItem = z.infer<typeof UsageListSchema>[number];
const LookupSchema = z.array(z.object({ id: z.number(), username: z.string().optional(), name: z.string().optional() }));

/** Records are stored with the engine task; the API also accepts the endpoint names. */
const TASK_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Any' },
  { value: 'generate', label: 'Chat / Completions' },
  { value: 'embed', label: 'Embeddings' },
];

type Filters = { hours: number; model: string; task: string; status: string; key_id: string; user_id: string; org_id: string };
const EMPTY: Filters = { hours: 24, model: '', task: '', status: '', key_id: '', user_id: '', org_id: '' };

function filterParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  p.set('hours', String(f.hours));
  if (f.model) p.set('model', f.model);
  if (f.task) p.set('task', f.task);
  if (f.status) p.set('status', f.status);
  if (f.key_id) p.set('key_id', f.key_id);
  if (f.user_id) p.set('user_id', f.user_id);
  if (f.org_id) p.set('org_id', f.org_id);
  return p;
}

function fmtWhen(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
}

export default function UsagePage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [live, setLive] = useState(false);

  useEffect(() => { setPage(0); }, [filters]);

  const fp = useMemo(() => filterParams(filters).toString(), [filters]);
  const listParams = useMemo(() => {
    const p = filterParams(filters);
    p.set('limit', String(limit));
    p.set('offset', String(page * limit));
    return p.toString();
  }, [filters, page, limit]);

  const poll = (ms: number) => (live ? ms : false);
  const list = useQuery({
    queryKey: ['usage', 'list', fp, page, limit],
    queryFn: async () => UsageListSchema.parse(await apiFetch<unknown>(`/admin/usage?${listParams}`)),
    staleTime: 10_000, refetchOnWindowFocus: false, refetchInterval: poll(5000), placeholderData: (prev) => prev,
  });
  const series = useQuery({
    queryKey: ['usage', 'series', fp],
    queryFn: async () => UsageSeriesSchema.parse(await apiFetch<unknown>(`/admin/usage/series?${fp}&bucket=${bucketFor(filters.hours)}`)),
    staleTime: 10_000, refetchOnWindowFocus: false, refetchInterval: poll(10000),
  });
  const byModel = useQuery({
    queryKey: ['usage', 'aggregate', fp],
    queryFn: async () => UsageAggListSchema.parse(await apiFetch<unknown>(`/admin/usage/aggregate?${fp}`)),
    staleTime: 10_000, refetchOnWindowFocus: false, refetchInterval: poll(15000),
  });
  // model options must not depend on the model filter itself, or the list collapses to one entry
  const allModels = useQuery({
    queryKey: ['usage', 'models', filters.hours],
    queryFn: async () => UsageAggListSchema.parse(await apiFetch<unknown>(`/admin/usage/aggregate?hours=${filters.hours}`)),
    staleTime: 30_000, refetchOnWindowFocus: false,
  });
  const latency = useQuery({
    queryKey: ['usage', 'latency', fp],
    queryFn: async () => LatencySummarySchema.parse(await apiFetch<unknown>(`/admin/usage/latency?${fp}`)),
    staleTime: 10_000, refetchOnWindowFocus: false, refetchInterval: poll(15000),
  });
  const ttft = useQuery({
    queryKey: ['usage', 'ttft'],
    queryFn: async () => TtftSummarySchema.parse(await apiFetch<unknown>('/admin/usage/ttft')),
    staleTime: 10_000, refetchOnWindowFocus: false, refetchInterval: poll(15000),
  });
  const usersLookup = useQuery({ queryKey: ['users', 'lookup'], queryFn: async () => LookupSchema.parse(await apiFetch<unknown>('/admin/users/lookup')), staleTime: 60_000 });
  const orgsLookup = useQuery({ queryKey: ['orgs', 'lookup'], queryFn: async () => LookupSchema.parse(await apiFetch<unknown>('/admin/orgs/lookup')), staleTime: 60_000 });
  const keysLookup = useQuery({ queryKey: ['keys', 'lookup'], queryFn: async () => KeysListSchema.parse(await apiFetch<unknown>('/admin/keys?limit=500&include_disabled=true&include_names=true')), staleTime: 60_000 });

  const keyById = useMemo(() => {
    const map = new Map<number, { prefix: string; username?: string | null }>();
    for (const k of keysLookup.data ?? []) map.set(k.id, { prefix: k.prefix, username: k.username });
    return map;
  }, [keysLookup.data]);

  const requests = (series.data ?? []).reduce((a, b) => a + b.requests, 0);
  const tokens = (series.data ?? []).reduce((a, b) => a + b.total_tokens, 0);
  const refetchAll = () => { list.refetch(); series.refetch(); byModel.refetch(); latency.refetch(); ttft.refetch(); };
  const filtersActive = Boolean(filters.model || filters.task || filters.status || filters.key_id || filters.user_id || filters.org_id);
  const rows: UsageItem[] = list.data ?? [];

  return (
    <section className="space-y-4">
      <PageHeader
        title="Usage"
        actions={(
          <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-xl border border-white/10 glass">
            <Button variant="default" size="sm" onClick={refetchAll} loading={list.isFetching && !live}>Refresh</Button>
            <Button variant={live ? 'cyan' : 'default'} size="sm" onClick={() => setLive(v => !v)} aria-pressed={live} className={cn(live && 'shadow-cyan-500/20')}>{live ? '● Live' : '○ Live'}</Button>
            <Button variant="purple" size="sm" onClick={() => { window.open(`${getGatewayBaseUrl()}/admin/usage/export?${fp}`, '_blank', 'noopener'); }}>Export CSV</Button>
          </div>
        )}
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase font-black tracking-widest text-white/40 mb-2">Time window</Label>
            <RangeSlider
              stops={[{ label: '1h', value: 1 }, { label: '6h', value: 6 }, { label: '24h', value: 24 }, { label: '7d', value: 168 }, { label: '30d', value: 720 }]}
              value={filters.hours}
              onChange={(v) => setFilters({ ...filters, hours: v })}
            />
          </div>
          <FormField label="Model"><Select selectSize="sm" value={filters.model} onChange={(e) => setFilters({ ...filters, model: e.target.value })}><option value="">Any</option>{(allModels.data ?? []).map(m => <option key={m.model_name} value={m.model_name}>{m.model_name}</option>)}</Select></FormField>
          <FormField label="Task"><Select selectSize="sm" value={filters.task} onChange={(e) => setFilters({ ...filters, task: e.target.value })}>{TASK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></FormField>
          <FormField label="Status"><Select selectSize="sm" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Any</option><option value="2xx">Success (2xx)</option><option value="4xx">Client error (4xx)</option><option value="5xx">Server error (5xx)</option></Select></FormField>
          <FormField label="API key"><Select selectSize="sm" value={filters.key_id} onChange={(e) => setFilters({ ...filters, key_id: e.target.value })}><option value="">Any</option>{(keysLookup.data ?? []).map(k => <option key={k.id} value={String(k.id)}>{k.prefix}{k.username ? ` · ${k.username}` : ''}{k.disabled ? ' (revoked)' : ''}</option>)}</Select></FormField>
          <FormField label="User"><Select selectSize="sm" value={filters.user_id} onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}><option value="">Any</option>{(usersLookup.data ?? []).map(u => <option key={u.id} value={String(u.id)}>{u.username ?? u.id}</option>)}</Select></FormField>
          <FormField label="Organization"><Select selectSize="sm" value={filters.org_id} onChange={(e) => setFilters({ ...filters, org_id: e.target.value })}><option value="">Any</option>{(orgsLookup.data ?? []).map(o => <option key={o.id} value={String(o.id)}>{o.name ?? o.id}</option>)}</Select></FormField>
        </div>
        {filtersActive && (
          <div className="mt-3 flex items-center gap-3 text-[11px] text-white/50">
            <span>Filters apply to the KPIs, charts and the journal.</span>
            <Button size="sm" onClick={() => setFilters({ ...EMPTY, hours: filters.hours })}>Clear filters</Button>
          </div>
        )}
      </Card>

      {(series.isError || list.isError) && (
        <InfoBox variant="error" title="Could not load usage" role="alert">
          {String((series.error as { message?: string } | null)?.message ?? (list.error as { message?: string } | null)?.message ?? 'request failed')}
        </InfoBox>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Requests" value={requests.toLocaleString()} hint={`last ${labelHours(filters.hours)}`} color="indigo" />
        <Kpi label="Tokens" value={tokens.toLocaleString()} hint="prompt + completion" color="purple" />
        <Kpi label="Latency p50" value={latency.data && latency.data.samples !== 0 ? `${Math.round(latency.data.p50_ms)} ms` : '—'} hint={latency.data ? `p95 ${Math.round(latency.data.p95_ms)} ms · successful requests` : ''} color="blue" />
        <Kpi label="Time to first token p50" value={ttft.data?.p50_s != null ? `${ttft.data.p50_s.toFixed(2)} s` : '—'} hint={ttft.data?.p50_s != null ? `p95 ${(ttft.data.p95_s ?? 0).toFixed(2)} s · streamed, last 5 min` : 'no streamed requests in the last 5 min'} color="cyan" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionTitle variant="blue" className="text-[10px]">Requests per {bucketFor(filters.hours)}</SectionTitle>
          <div className="bg-black/20 p-2 rounded-xl border border-white/5">
            {series.isLoading ? <ChartPlaceholder text="Loading…" /> : requests === 0 ? <ChartPlaceholder text="No requests in this window" /> : (
              <LineChart data={(series.data ?? []).map(p => ({ ts: p.ts * 1000, value: p.requests }))} height={180} stroke="#6366f1" smooth={false} />
            )}
          </div>
        </Card>
        <Card className="p-4">
          <SectionTitle variant="purple" className="text-[10px]">Requests by model</SectionTitle>
          <div className="bg-black/20 p-2 rounded-xl border border-white/5">
            {byModel.isLoading ? <ChartPlaceholder text="Loading…" /> : (byModel.data ?? []).length === 0 ? <ChartPlaceholder text="No requests in this window" /> : (
              <BarChart data={(byModel.data ?? []).map(m => ({ label: m.model_name, value: m.requests }))} barColor="#a855f7" />
            )}
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden border-white/5 bg-white/[0.01]">
        <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
          <SectionTitle variant="cyan" className="mb-0 text-[10px]">Request journal · page {page + 1}</SectionTitle>
          <div className="flex items-center gap-1.5">
            <FormField label="Rows" className="mb-0">
              <Select selectSize="sm" value={String(limit)} onChange={(e) => { setPage(0); setLimit(Number(e.target.value)); }} aria-label="Rows per page"><option value="25">25</option><option value="50">50</option><option value="100">100</option></Select>
            </FormField>
            <Button size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page">←</Button>
            <Button size="sm" onClick={() => setPage(p => p + 1)} disabled={rows.length < limit} aria-label="Next page">→</Button>
          </div>
        </div>
        <Table>
          <thead>
            <tr><th>Time</th><th>Who</th><th>Model</th><th>Task</th><th>Tokens</th><th>Latency</th><th>Status</th><th>Request id</th></tr>
          </thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={8} className="text-center text-white/50 py-6">Loading…</td></tr>}
            {list.isError && !list.isLoading && <tr><td colSpan={8} className="text-center text-red-300 py-6">Could not load the journal.</td></tr>}
            {!list.isLoading && !list.isError && rows.length === 0 && <tr><td colSpan={8} className="text-center text-white/50 py-6">No requests match these filters.</td></tr>}
            {rows.map(u => {
              const key = u.key_id != null ? keyById.get(u.key_id) : undefined;
              const who = key ? `key ${key.prefix}${key.username ? ` · ${key.username}` : ''}` : u.username ? `${u.username} (session)` : u.key_id != null ? `key #${u.key_id}` : '—';
              return (
                <tr key={u.id} className="group text-[11px]">
                  <td className="text-white/50 font-mono whitespace-nowrap">{fmtWhen(u.created_at)}</td>
                  <td className="font-mono text-cyan-300/80" title={u.org_name ?? undefined}>{who}</td>
                  <td className="font-semibold text-white/80">{u.model_name}</td>
                  <td><Badge className="bg-indigo-500/5 text-indigo-300/80 border-indigo-500/10 text-[9px]">{u.task === 'embed' ? 'embeddings' : u.task === 'generate' ? 'chat/completions' : u.task}</Badge></td>
                  <td className="font-mono text-white/60" title={`${u.prompt_tokens} prompt + ${u.completion_tokens} completion`}>{u.total_tokens}</td>
                  <td className="font-mono text-white/60">{u.latency_ms} ms</td>
                  <td><Badge className={u.status_code < 300 ? 'bg-emerald-500/10 text-emerald-400' : u.status_code < 500 ? 'bg-amber-500/10 text-amber-300' : 'bg-red-500/10 text-red-400'}>{u.status_code}</Badge></td>
                  <td className="font-mono text-[9px] text-white/30 group-hover:text-white/60 truncate max-w-[120px]" title={u.req_id}>{u.req_id}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </section>
  );
}

function labelHours(h: number): string {
  return h < 24 ? `${h}h` : h % 24 === 0 ? `${h / 24}d` : `${h}h`;
}

function ChartPlaceholder({ text }: { text: string }) {
  return <div className="h-[180px] flex items-center justify-center text-[11px] text-white/40">{text}</div>;
}

function Kpi({ label, value, hint, color }: { label: string; value: string; hint?: string; color: 'indigo' | 'purple' | 'blue' | 'cyan' }) {
  const textColors = { indigo: 'text-indigo-300', purple: 'text-purple-300', blue: 'text-blue-300', cyan: 'text-cyan-300' };
  return (
    <Card className="p-3 border-white/5 bg-white/[0.02]">
      <div className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">{label}</div>
      <div className={cn('text-lg font-mono font-bold tracking-tight', textColors[color])}>{value}</div>
      {hint && <div className="text-[10px] text-white/40 mt-0.5">{hint}</div>}
    </Card>
  );
}

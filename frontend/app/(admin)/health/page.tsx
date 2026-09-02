'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiFetch from '@/lib/api-clients';
import { HealthSnapshotSchema, type HealthMeta } from '@/lib/validators';
import { PageHeader, Button, Card, Badge, InfoBox } from '@/components/UI';
import { Accordion, AccordionItem } from '@/components/monitoring/Accordion';
import { LineChart } from '@/components/Charts';
import { HostIpDisplay } from '@/components/HostIpDisplay';
import { useToast } from '@/providers/ToastProvider';
import { cn } from '@/lib/cn';
import { safeCopyToClipboard } from '@/lib/clipboard';
import { upstreamStatus } from './helpers';
import { errMsg } from '@/lib/errors';

const GROUPS: { id: string; title: string; match: (m: HealthMeta | undefined) => boolean }[] = [
  { id: 'generate', title: 'Inference', match: (m) => (m?.category ?? '') === 'generate' },
  { id: 'embed', title: 'Embeddings', match: (m) => (m?.category ?? '') === 'embed' },
  { id: 'other', title: 'Other upstreams', match: (m) => !['generate', 'embed'].includes(m?.category ?? '') },
];


export default function HealthPage() {
  const { addToast } = useToast();
  const qc = useQueryClient();
  const snapshot = useQuery({
    queryKey: ['upstreams'],
    queryFn: async () => HealthSnapshotSchema.parse(await apiFetch<unknown>('/admin/upstreams')),
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
  const refresh = useMutation({
    mutationFn: async () => apiFetch<{ results: { url: string; ok: boolean }[] }>('/admin/upstreams/refresh-health', { method: 'POST', body: JSON.stringify({}) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['upstreams'] });
      const down = r.results.filter((x) => !x.ok).length;
      addToast({ title: `Probed ${r.results.length} upstream${r.results.length === 1 ? '' : 's'}${down ? `, ${down} down` : ''}`, kind: down ? 'error' : 'success' });
    },
    onError: (e) => addToast({ title: `Refresh failed: ${errMsg(e)}`, kind: 'error' }),
  });

  const data = snapshot.data;
  const now = data?.now ?? Date.now() / 1000;
  const ttl = data?.health_ttl_sec ?? 30;
  const entries = Object.entries(data?.health ?? {});

  return (
    <section className="space-y-4">
      <PageHeader
        title="Health"
        subtitle="Live state of every inference upstream: managed model containers and static pools."
        actions={<Button variant="cyan" size="sm" onClick={() => refresh.mutate()} loading={refresh.isPending} className="px-6">Probe now</Button>}
      />

      <HostIpDisplay variant="banner" className="py-2.5" />

      {snapshot.isLoading && <div className="text-center py-12 text-white/50 text-xs">Loading…</div>}
      {snapshot.isError && <InfoBox variant="error" title="Could not load health" role="alert">{errMsg(snapshot.error)}</InfoBox>}
      {data && entries.length === 0 && (
        <InfoBox variant="blue" title="No upstreams yet">
          Start a model on the Models page; it appears here as soon as its container is running. Probes run every few seconds automatically.
        </InfoBox>
      )}

      {data && entries.length > 0 && (
        <Accordion storageKey="health-groups">
          {GROUPS.map((group) => {
            const upstreams = entries.filter(([url]) => group.match(data.meta[url]));
            if (upstreams.length === 0) return null;
            const live = upstreams.filter(([, h]) => upstreamStatus(h, now, ttl) === 'online').length;
            return (
              <AccordionItem
                key={group.id}
                id={group.id}
                title={<span className="font-bold tracking-tight text-white/90 text-sm uppercase">{group.title}</span>}
                miniKpis={[{ label: 'Online', value: live }, { label: 'Total', value: upstreams.length }]}
              >
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {upstreams.map(([url, h]) => {
                    const m = data.meta[url] ?? {};
                    const status = upstreamStatus(h, now, ttl);
                    const history = m.history ?? [];
                    const series = history.map((p) => ({ ts: p.ts * 1000, value: p.latency_ms }));
                    const tps = m.tokens_per_sec;
                    const httpOk = m.last_status_code != null && m.last_status_code < 500;
                    const names = m.served_names ?? [];
                    return (
                      <Card key={url} className="p-3 border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300">
                        <div className="flex items-start justify-between gap-3 mb-2 pb-2 border-b border-white/5">
                          <div className="space-y-1.5 flex-1 min-w-0">
                            {names.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {names.map((n) => (
                                  <span key={n} className="inline-flex items-center gap-1">
                                    <code className="font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">{n}</code>
                                    <button
                                      type="button"
                                      aria-label={`Copy served name ${n}`}
                                      onClick={async () => { if (await safeCopyToClipboard(n)) addToast({ title: 'Copied', kind: 'success' }); }}
                                      className="p-1 bg-emerald-500/5 text-emerald-500/60 rounded hover:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                    </button>
                                  </span>
                                ))}
                              </div>
                            ) : <div className="text-xs font-bold text-white/90 truncate">{url}</div>}

                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono">
                              <Stat label="Latency" value={m.last_latency_ms != null ? `${m.last_latency_ms} ms` : '—'} className="text-cyan-400" />
                              <Stat label="HTTP" value={m.last_status_code != null ? String(m.last_status_code) : '—'} className={httpOk ? 'text-emerald-400' : 'text-red-400'} />
                              <Stat label="Tokens/s (prompt / gen)" value={tps ? `${(tps.prompt ?? 0).toFixed(1)} / ${(tps.generation ?? 0).toFixed(1)}` : '—'} className="text-indigo-400" />
                              {m.breaker && m.breaker.state === 'OPEN' && (
                                <Stat label="Breaker" value={`open, ${Math.ceil(m.breaker.cooldown_remaining_sec)} s`} className="text-amber-300" />
                              )}
                              {(m.consecutive_fails ?? 0) > 0 && <Stat label="Failed probes" value={String(m.consecutive_fails)} className="text-red-300" />}
                            </div>
                            {m.last_error && status !== 'online' && <div className="text-[10px] text-red-300/90">Last error: {m.last_error}</div>}
                          </div>

                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <Badge className={cn('px-2 py-0.5 text-[9px] font-black tracking-widest',
                              status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : status === 'stale' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                  : 'bg-red-500/10 text-red-400 border-red-500/20')}>
                              {status === 'online' ? 'ONLINE' : status === 'stale' ? 'STALE' : 'OFFLINE'}
                            </Badge>
                            <code className="text-[9px] text-white/40 font-bold tracking-tighter truncate max-w-[140px]" title={url}>{url}</code>
                            <span className="text-[9px] text-white/40">probed {Math.max(0, Math.round(now - h.ts))} s ago</span>
                          </div>
                        </div>

                        {series.length > 1 && (
                          <div className="bg-black/20 p-1.5 rounded-xl border border-white/5">
                            <LineChart data={series} height={60} smooth={false} stroke="#06b6d4" />
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </section>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-white/40 uppercase font-black text-[9px]">{label}</span>
      <span className={cn('font-bold', className)}>{value}</span>
    </div>
  );
}

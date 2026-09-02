'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import apiFetch from '@/lib/api-clients';
import { KeysListSchema, CreateKeyResponseSchema } from '@/lib/validators';
import { useToast } from '@/providers/ToastProvider';
import { useUser } from '@/providers/UserProvider';
import { Modal } from '@/components/Modal';
import { PageHeader, Card, Table, Button, Badge, Input, Select, Label, InfoBox, FormField, SectionTitle } from '@/components/UI';
import { ConfirmDialog } from '@/components/Confirm';
import { safeCopyToClipboard } from '@/lib/clipboard';
import { localInputToIso } from './helpers';
import { errMsg } from '@/lib/errors';

type KeyRow = z.infer<typeof KeysListSchema>[number];
const LookupSchema = z.array(z.object({ id: z.number(), username: z.string().optional(), name: z.string().optional() }));


function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = window.setTimeout(() => setV(value), ms); return () => window.clearTimeout(t); }, [value, ms]);
  return v;
}

export default function KeysPage() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const { user } = useUser();
  // Admins manage every key; everyone else manages their own through the self-service endpoints.
  const isAdmin = user?.role === 'admin';
  const base = isAdmin ? '/admin/keys' : '/admin/me/keys';

  const [token, setToken] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<KeyRow | null>(null);
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [filters, setFilters] = useState<{ q: string; user_id: string; org_id: string; sort: string }>({ q: '', user_id: '', org_id: '', sort: 'created_at:desc' });
  const q = useDebounced(filters.q, 300);

  const orgs = useQuery({ queryKey: ['orgs', 'lookup'], queryFn: async () => LookupSchema.parse(await apiFetch<unknown>('/admin/orgs/lookup')), enabled: isAdmin, staleTime: 60_000 });
  const users = useQuery({ queryKey: ['users', 'lookup'], queryFn: async () => LookupSchema.parse(await apiFetch<unknown>('/admin/users/lookup')), enabled: isAdmin, staleTime: 60_000 });

  const list = useQuery({
    queryKey: ['keys', base, q, filters.user_id, filters.org_id, filters.sort, includeRevoked],
    enabled: !!user,
    queryFn: async () => {
      const p = new URLSearchParams();
      if (isAdmin) {
        if (q) p.set('q', q);
        if (filters.user_id) p.set('user_id', filters.user_id);
        if (filters.org_id) p.set('org_id', filters.org_id);
        if (filters.sort) p.set('sort', filters.sort);
        p.set('include_names', 'true');
        p.set('limit', '500');
      }
      if (includeRevoked) p.set('include_disabled', 'true');
      return KeysListSchema.parse(await apiFetch<unknown>(`${base}?${p.toString()}`));
    },
  });

  const create = useMutation({
    mutationFn: async (input: Record<string, unknown>) => CreateKeyResponseSchema.parse(await apiFetch<unknown>(base, { method: 'POST', body: JSON.stringify(input) })),
    onSuccess: (data) => {
      setToken(data.token);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['keys'] });
      addToast({ title: `Key ${data.prefix}… created`, kind: 'success' });
    },
    onError: (e) => addToast({ title: `Create failed: ${errMsg(e)}`, kind: 'error' }),
  });
  const revoke = useMutation({
    mutationFn: async (id: number) => apiFetch(`${base}/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['keys'] }); addToast({ title: 'Key revoked', kind: 'success' }); },
    onError: (e) => addToast({ title: `Revoke failed: ${errMsg(e)}`, kind: 'error' }),
  });

  const rows = useMemo(() => (list.data ?? []).filter((k) => includeRevoked || !k.disabled), [list.data, includeRevoked]);

  const onCreate = (fd: FormData) => {
    const userRaw = String(fd.get('user_id') ?? '').trim();
    const orgRaw = String(fd.get('org_id') ?? '').trim();
    const payload: Record<string, unknown> = {
      scopes: String(fd.get('scopes') || 'chat,completions,embeddings'),
      expires_at: localInputToIso(String(fd.get('expires_at') ?? '')),
      ip_allowlist: String(fd.get('ip_allowlist') ?? ''),
    };
    if (isAdmin) {
      if (userRaw) payload.user_id = Number(userRaw);
      if (orgRaw) payload.org_id = Number(orgRaw);
    }
    create.mutate(payload);
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title={isAdmin ? 'All API Keys' : 'My API Keys'}
        subtitle={isAdmin ? 'Every key on this gateway. Keys are shown once at creation and stored hashed.' : 'Keys you own for calling the API. A key is shown once at creation and stored hashed.'}
        actions={
          <div className="flex flex-col md:flex-row items-stretch md:items-end gap-2">
            {isAdmin && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-white/5 p-1.5 rounded-xl border border-white/10 glass">
                <FormField label="Search prefix"><Input className="bg-black/20 h-8" placeholder="Prefix…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></FormField>
                <FormField label="User"><Select selectSize="sm" className="bg-black/20 h-8" value={filters.user_id} onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}><option value="">All users</option>{(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}</Select></FormField>
                <FormField label="Organization"><Select selectSize="sm" className="bg-black/20 h-8" value={filters.org_id} onChange={(e) => setFilters({ ...filters, org_id: e.target.value })}><option value="">All orgs</option>{(orgs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></FormField>
                <FormField label="Sort"><Select selectSize="sm" className="bg-black/20 h-8" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}><option value="created_at:desc">Newest</option><option value="last_used_at:desc">Recently used</option></Select></FormField>
              </div>
            )}
            <label className="flex items-center gap-2 text-[11px] text-white/60 px-2 self-center">
              <input type="checkbox" checked={includeRevoked} onChange={(e) => setIncludeRevoked(e.target.checked)} /> show revoked
            </label>
            <Button variant="cyan" size="sm" onClick={() => setOpen(true)} className="h-11 px-6 font-bold uppercase tracking-widest text-[10px]">New key</Button>
          </div>
        }
      />

      {list.isError && <InfoBox variant="error" title="Could not load keys" role="alert">{errMsg(list.error)}</InfoBox>}

      <Card className="p-0 overflow-hidden shadow-xl border-white/5 bg-white/[0.01]">
        <Table>
          <thead>
            <tr>
              <th className="pl-6">Prefix</th>
              <th>Scopes</th>
              <th>Created</th>
              <th>Last used</th>
              <th>Expires</th>
              {isAdmin && <th>Owner</th>}
              <th className="text-right pr-6">Action</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-white/50">Loading…</td></tr>}
            {rows.map((k) => (
              <tr key={k.id} className={`group text-xs ${k.disabled ? 'opacity-50' : ''}`}>
                <td className="pl-6 font-mono text-cyan-300 font-bold tracking-wider">{k.prefix}{k.disabled && <Badge className="ml-2 bg-red-500/10 text-red-300 border-red-500/20 text-[9px]">revoked</Badge>}</td>
                <td><div className="flex flex-wrap gap-1">{k.scopes.split(',').map((s) => <Badge key={s} className="bg-indigo-500/5 text-indigo-300/80 border-indigo-500/10 text-[9px]">{s.trim()}</Badge>)}</div></td>
                <td className="text-white/50 font-mono text-[10px]">{fmtDate(k.created_at)}</td>
                <td className="text-white/50 font-mono text-[10px]">{k.last_used_at ? fmtDate(k.last_used_at) : 'never'}</td>
                <td className="text-white/50 font-mono text-[10px]">{k.expires_at ? fmtDate(k.expires_at) : 'never'}</td>
                {isAdmin && (
                  <td>
                    <div className="flex flex-col">
                      <span className="font-semibold text-white/80">{k.username ?? '—'}</span>
                      <span className="text-[9px] text-white/40 uppercase">{k.org_name ?? 'no organization'}</span>
                    </div>
                  </td>
                )}
                <td className="text-right pr-6">
                  {!k.disabled && (
                    <Button variant="danger" size="sm" onClick={() => setConfirmRevoke(k)} aria-label={`Revoke key ${k.prefix}`}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 px-3">
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!list.isLoading && !list.isError && rows.length === 0 && (
              <tr><td colSpan={isAdmin ? 7 : 6} className="text-center py-12 text-white/50">No API keys yet. Create one to call the gateway.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Create API key" variant="workflow">
        <form action={onCreate} className="p-4 space-y-4">
          <SectionTitle variant="purple" className="text-[10px]">Key configuration</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Scopes" description="Comma-separated: chat, completions, embeddings">
              <Input name="scopes" defaultValue="chat,completions,embeddings" placeholder="chat,completions,embeddings" />
            </FormField>
            <FormField label="IP allowlist" description="Optional. Comma-separated IP addresses or CIDR ranges; the host's own IP is added automatically. Empty allows every address.">
              <Input name="ip_allowlist" placeholder="e.g. 192.168.1.20, 10.0.0.0/24" />
            </FormField>
          </div>
          {isAdmin && (
            <>
              <SectionTitle variant="cyan" className="text-[10px]">Assignment</SectionTitle>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="User (optional)" description="Usage is attributed to this user.">
                  <Select name="user_id"><option value="">Unassigned</option>{(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}</Select>
                </FormField>
                <FormField label="Organization (optional)">
                  <Select name="org_id"><option value="">Unassigned</option>{(orgs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
                </FormField>
              </div>
            </>
          )}
          <FormField label="Expires (optional)" description="Local time; stored as UTC. Leave empty for a key that never expires.">
            <Input name="expires_at" type="datetime-local" />
          </FormField>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/5">
            <Button variant="default" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" loading={create.isPending} className="px-8">Create key</Button>
          </div>
        </form>
      </Modal>

      <Modal open={token != null} onClose={() => setToken(null)} title="Key created" variant="center">
        <div className="p-6 space-y-6">
          <InfoBox variant="cyan" title="Copy it now">This is the only time the full key is shown. It is stored hashed and cannot be recovered later.</InfoBox>
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-white/50">Your API key</Label>
            <div className="flex items-center gap-2 p-3 bg-black/40 rounded-xl border border-white/10 font-mono text-emerald-400 break-all text-sm">
              <span className="flex-1">{token}</span>
              <Button size="sm" aria-label="Copy API key" onClick={async () => { if (await safeCopyToClipboard(token ?? '')) addToast({ title: 'Key copied', kind: 'success' }); }}>Copy</Button>
            </div>
          </div>
          <div className="flex justify-end pt-2"><Button variant="primary" onClick={() => setToken(null)} className="px-8">Done</Button></div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmRevoke != null}
        title={`Revoke key ${confirmRevoke?.prefix ?? ''}?`}
        description={<div className="text-white/70">Clients using this key get 401 Unauthorized immediately. This cannot be undone.</div>}
        confirmLabel="Revoke key"
        onConfirm={() => { if (confirmRevoke) revoke.mutate(confirmRevoke.id); setConfirmRevoke(null); }}
        onClose={() => setConfirmRevoke(null)}
      />
    </section>
  );
}

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiFetch from '../../../src/lib/api-clients';
import { KeysListSchema, CreateKeyResponseSchema } from '../../../src/lib/validators';
import { useState } from 'react';
import { useToast } from '../../../src/providers/ToastProvider';
import { Modal } from '../../../src/components/Modal';
import { PageHeader, Card, Table, Button, Badge, Input, Select, Label, InfoBox, FormField, SectionTitle } from '../../../src/components/UI';
import { ConfirmDialog } from '../../../src/components/Confirm';
import { useEffect, useState as useReactState } from 'react';
import { z } from 'zod';
import { cn } from '../../../src/lib/cn';
import { safeCopyToClipboard } from '../../../src/lib/clipboard';

const KeyCreateSchema = z.object({
  scopes: z.string().default('chat,completions,embeddings'),
  expires_at: z.string().nullable().optional(),
  ip_allowlist: z.string().default(''),
  user_id: z.number().optional(),
  org_id: z.number().optional(),
});

type KeyRow = { id: number; prefix: string; scopes: string; expires_at: string | null; last_used_at: string | null; disabled: boolean };
type CreateResp = { id: number; prefix: string; token: string };

export default function KeysPage() {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { addToast } = useToast();
  const [orgOptions, setOrgOptions] = useReactState<{ id: number; name: string }[]>([]);
  const [userOptions, setUserOptions] = useReactState<{ id: number; username: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const orgs = await apiFetch<any>('/admin/orgs/lookup');
        setOrgOptions(orgs || []);
      } catch {}
      try {
        const users = await apiFetch<any>('/admin/users/lookup');
        setUserOptions(users || []);
      } catch {}
    })();
  }, []);

  const [filters, setFilters] = useReactState<{ q: string; user_id?: number | ''; org_id?: number | ''; sort: string }>({ q: '', sort: 'created_at:desc' });
  const list = useQuery({
    queryKey: ['keys', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.user_id) params.set('user_id', String(filters.user_id));
      if (filters.org_id) params.set('org_id', String(filters.org_id));
      if (filters.sort) params.set('sort', filters.sort);
      params.set('include_names', 'true');
      const raw = await apiFetch<any>(`/admin/keys?${params.toString()}`);
      const parsed = KeysListSchema.parse(raw);
      return parsed as KeyRow[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: z.infer<typeof KeyCreateSchema>) => {
      const raw = await apiFetch<any>('/admin/keys', { method: 'POST', body: JSON.stringify(input) });
      const parsed = CreateKeyResponseSchema.parse(raw);
      return parsed as CreateResp;
    },
    onSuccess: (data) => {
      setToken(data.token);
      setTokenModalOpen(true);
      qc.invalidateQueries({ queryKey: ['keys'] });
      setErrorMsg(null);
      addToast({ title: 'Key created', kind: 'success' });
      setOpen(false);
    },
    onError: (e: any) => {
      const rid = e?.request_id ? ` (request_id: ${e.request_id})` : '';
      setErrorMsg(`Create failed: ${e?.message ?? 'unknown'}${rid}`);
      setMessage(null);
      addToast({ title: `Create failed: ${e?.message ?? 'unknown'}`, kind: 'error' });
    }
  });

  const [confirmRevoke, setConfirmRevoke] = useReactState<number | null>(null);
  const revoke = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['keys'] });
      setMessage('Key revoked');
      setErrorMsg(null);
    },
    onError: (e: any) => {
      const rid = e?.request_id ? ` (request_id: ${e.request_id})` : '';
      setErrorMsg(`Revoke failed: ${e?.message ?? 'unknown'}${rid}`);
      setMessage(null);
    }
  });

  const onCreate = async (formData: FormData) => {
    const userRaw = String(formData.get('user_id') || '').trim();
    const orgRaw = String(formData.get('org_id') || '').trim();
    const payload = KeyCreateSchema.parse({
      scopes: formData.get('scopes') || 'chat,completions,embeddings',
      expires_at: formData.get('expires_at') || null,
      ip_allowlist: formData.get('ip_allowlist') || '',
      user_id: userRaw ? Number(userRaw) : undefined,
      org_id: orgRaw ? Number(orgRaw) : undefined,
    });
    await create.mutateAsync(payload);
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="API Security"
        actions={
          <div className="flex flex-col md:flex-row items-stretch md:items-end gap-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 bg-white/5 p-1.5 rounded-xl border border-white/10 glass">
              <FormField label="Search"><Input className="bg-black/20 h-8" placeholder="Prefix…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></FormField>
              <FormField label="User"><Select selectSize="sm" className="bg-black/20 h-8" value={String(filters.user_id ?? '')} onChange={(e) => setFilters({ ...filters, user_id: e.target.value ? Number(e.target.value) : '' })}><option value="">All Users</option>{userOptions.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}</Select></FormField>
              <FormField label="Org"><Select selectSize="sm" className="bg-black/20 h-8" value={String(filters.org_id ?? '')} onChange={(e) => setFilters({ ...filters, org_id: e.target.value ? Number(e.target.value) : '' })}><option value="">All Orgs</option>{orgOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></FormField>
              <FormField label="Sort"><Select selectSize="sm" className="bg-black/20 h-8" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}><option value="created_at:desc">Newest</option><option value="last_used_at:desc">Recent</option></Select></FormField>
            </div>
            <Button variant="cyan" size="sm" onClick={() => setOpen(true)} className="h-11 px-6 font-bold uppercase tracking-widest text-[10px]">
              <span className="mr-2 text-base">🔑</span> New Key
            </Button>
          </div>
        }
      />

      <Card className="p-0 overflow-hidden shadow-xl border-white/5 bg-white/[0.01]">
        <Table>
          <thead>
            <tr>
              <th className="pl-6">Prefix</th>
              <th>Scopes</th>
              <th>Last Used</th>
              <th>Assignment</th>
              <th className="text-right pr-6">Action</th>
            </tr>
          </thead>
          <tbody>
            {(list.data || []).map((k) => (
              <tr key={k.id} className="group text-xs">
                <td className="pl-6 font-mono text-cyan-300 font-bold tracking-wider">{k.prefix}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {k.scopes.split(',').map(s => (
                      <Badge key={s} className="bg-indigo-500/5 text-indigo-300/70 border-indigo-500/10 text-[8px]">{s.trim()}</Badge>
                    ))}
                  </div>
                </td>
                <td className="text-white/40 font-mono text-[10px]">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
                <td>
                  <div className="flex flex-col">
                    <span className="font-semibold text-white/80">{(k as any).username || '—'}</span>
                    <span className="text-[9px] text-white/30 uppercase tracking-tighter">{(k as any).org_name || 'Global'}</span>
                  </div>
                </td>
                <td className="text-right pr-6">
                  {!k.disabled && (
                    <Button 
                      variant="danger" 
                      size="sm" 
                      onClick={() => setConfirmRevoke(k.id)} 
                      className="opacity-0 group-hover:opacity-100 px-3"
                    >
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {(list.data || []).length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-white/40">
                  <div className="text-4xl mb-4 opacity-20">🗝️</div>
                  No API keys generated yet.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Create API Key" variant="workflow">
        <form action={(fd) => onCreate(fd)} className="p-4 space-y-4">
          <SectionTitle variant="purple" className="text-[10px]">Key Configuration</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Scopes" description="Comma-separated scopes (default: chat,completions,embeddings)">
              <Input name="scopes" defaultValue="chat,completions,embeddings" placeholder="chat,completions,embeddings" />
            </FormField>
            <FormField label="IP Allowlist" description="Optional: Comma-separated IP addresses or CIDR blocks">
              <Input name="ip_allowlist" placeholder="e.g. 192.168.1.1, 10.0.0.0/24" />
            </FormField>
          </div>
          
          <SectionTitle variant="cyan" className="text-[10px]">Assignment</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="User (Optional)">
              <Select name="user_id">
                <option value="">System / Unassigned</option>
                {userOptions.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </Select>
            </FormField>
            <FormField label="Organization (Optional)">
              <Select name="org_id">
                <option value="">Global / Unassigned</option>
                {orgOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </FormField>
          </div>

          <FormField label="Expires At (Optional)" description="Leave empty for never">
            <Input name="expires_at" type="datetime-local" />
          </FormField>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/5">
            <Button variant="default" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={create.isPending} className="px-8">
              {create.isPending ? '...' : 'Create Key'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={tokenModalOpen} onClose={() => setTokenModalOpen(false)} title="Key Created Successfully" variant="center">
        <div className="p-6 space-y-6">
          <InfoBox variant="cyan" title="Security Warning">
            This is the only time your full API key will be displayed. Please copy it and store it securely.
          </InfoBox>
          
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-white/40">Your API Key</Label>
            <div className="flex items-center gap-2 p-3 bg-black/40 rounded-xl border border-white/10 font-mono text-emerald-400 break-all text-sm">
              {token}
              <button 
                onClick={async () => { 
                  const ok = await safeCopyToClipboard(token || ''); 
                  if (ok) addToast({ title: 'Token copied!', kind: 'success' });
                }} 
                className="shrink-0 p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button variant="primary" onClick={() => setTokenModalOpen(false)} className="px-8">Done</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmRevoke != null}
        title="Revoke API Key?"
        description={<div className="text-white/70">This will disable the key immediately. Clients using this key will receive 401 Unauthorized errors. <strong>This action cannot be undone.</strong></div>}
        confirmLabel="Revoke Key"
        onConfirm={() => { if (confirmRevoke != null) revoke.mutate(confirmRevoke); setConfirmRevoke(null); }}
        onClose={() => setConfirmRevoke(null)}
      />
    </section>
  );
}

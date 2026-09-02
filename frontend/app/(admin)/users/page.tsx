'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Card, Table, Button, PageHeader, Badge, Input, Select, InfoBox, FormField, SectionTitle } from '@/components/UI';
import apiFetch from '@/lib/api-clients';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/Confirm';
import { useToast } from '@/providers/ToastProvider';
import { useUser } from '@/providers/UserProvider';

const UserSchema = z.object({ id: z.number(), username: z.string(), role: z.string(), org_id: z.number().nullable(), status: z.string() });
const UsersSchema = z.array(UserSchema);
const OrgLookupSchema = z.array(z.object({ id: z.number(), name: z.string() }));
type User = z.infer<typeof UserSchema>;

const PAGE = 100;
const USERNAME_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,63}$/;

type ApiErr = { message?: string; request_id?: string; code?: unknown };
function errMsg(e: unknown): string {
  const err = e as ApiErr | null;
  const m = err?.message ?? 'request failed';
  return m === 'username_exists' ? 'That username is already taken.' : m;
}

export default function UsersPage() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const { user: me } = useUser();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<User | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [filters, setFilters] = useState<{ q: string; org_id: string; role: string; status: string; sort: string }>({ q: '', org_id: '', role: '', status: '', sort: 'created_at:desc' });

  const users = useQuery({
    queryKey: ['users', filters, limit],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (filters.q) p.set('q', filters.q);
      if (filters.org_id) p.set('org_id', filters.org_id);
      if (filters.role) p.set('role', filters.role);
      if (filters.status) p.set('status', filters.status);
      if (filters.sort) p.set('sort', filters.sort);
      p.set('limit', String(limit));
      return UsersSchema.parse(await apiFetch<unknown>(`/admin/users?${p.toString()}`));
    },
    placeholderData: (prev) => prev,
  });
  const orgs = useQuery({ queryKey: ['orgs', 'lookup'], queryFn: async () => OrgLookupSchema.parse(await apiFetch<unknown>('/admin/orgs/lookup')), staleTime: 60_000 });
  const orgNameById = useMemo(() => new Map((orgs.data ?? []).map((o) => [o.id, o.name] as const)), [orgs.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });
  const create = useMutation({
    mutationFn: (body: { username: string; password: string; role: string; org_id: number | null }) => apiFetch<User>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (u) => { invalidate(); setOpen(false); setFormError(null); addToast({ title: `User ${u.username} created`, kind: 'success' }); },
    onError: (e) => setFormError(errMsg(e)),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: number; role?: string; org_id?: number | null; password?: string; status?: string }) => apiFetch<User>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (u) => { invalidate(); setEdit(null); setFormError(null); addToast({ title: `User ${u.username} updated`, kind: 'success' }); },
    onError: (e) => setFormError(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); setConfirmDelete(null); addToast({ title: 'User deleted', kind: 'success' }); },
    onError: (e) => { setConfirmDelete(null); addToast({ title: 'Could not delete user', description: errMsg(e), kind: 'error' }); },
  });

  const onCreate = (fd: FormData) => {
    const username = String(fd.get('username') ?? '').trim();
    const password = String(fd.get('password') ?? '');
    const role = String(fd.get('role') || 'User');
    const orgRaw = String(fd.get('org_id') ?? '');
    if (!USERNAME_RE.test(username)) { setFormError('Username: 1–64 characters, letters, digits, . _ - @'); return; }
    if (password.length < 8) { setFormError('Password must be at least 8 characters.'); return; }
    create.mutate({ username, password, role, org_id: orgRaw ? Number(orgRaw) : null });
  };
  const onEdit = (fd: FormData) => {
    if (!edit) return;
    const password = String(fd.get('password') ?? '');
    if (password && password.length < 8) { setFormError('Password must be at least 8 characters.'); return; }
    const orgRaw = String(fd.get('org_id') ?? '');
    const isSelf = edit.username === me?.name;
    update.mutate({
      id: edit.id,
      role: isSelf ? undefined : String(fd.get('role') || edit.role),
      status: isSelf ? undefined : String(fd.get('status') || edit.status),
      org_id: orgRaw ? Number(orgRaw) : null,   // explicit null unassigns
      password: password || undefined,
    });
  };

  const rows = users.data ?? [];

  return (
    <section className="space-y-4">
      <PageHeader
        title="Users"
        subtitle="Accounts that can sign in to this console. Admins manage everything; users can chat and manage their own API keys."
        actions={
          <div className="flex flex-col md:flex-row items-stretch md:items-end gap-2">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 bg-white/5 p-1.5 rounded-xl border border-white/10 glass">
              <FormField label="Search"><Input className="bg-black/20 h-8" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="username" /></FormField>
              <FormField label="Organization"><Select selectSize="sm" className="bg-black/20 h-8" value={filters.org_id} onChange={(e) => setFilters({ ...filters, org_id: e.target.value })}><option value="">All</option>{(orgs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></FormField>
              <FormField label="Role"><Select selectSize="sm" className="bg-black/20 h-8" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}><option value="">All</option><option>User</option><option>Admin</option></Select></FormField>
              <FormField label="Status"><Select selectSize="sm" className="bg-black/20 h-8" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All</option><option value="active">active</option><option value="disabled">disabled</option></Select></FormField>
              <FormField label="Sort"><Select selectSize="sm" className="bg-black/20 h-8" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}><option value="created_at:desc">Newest</option><option value="username:asc">Name</option></Select></FormField>
            </div>
            <Button variant="cyan" size="sm" onClick={() => { setFormError(null); setOpen(true); }} className="h-11 px-6 font-bold uppercase tracking-widest text-[10px]">New user</Button>
          </div>
        }
      />

      {users.isError && <InfoBox variant="error" title="Could not load users" role="alert">{errMsg(users.error)}</InfoBox>}

      <Card className="p-0 overflow-hidden shadow-xl border-white/5 bg-white/[0.01]">
        <Table>
          <thead>
            <tr><th className="pl-6">Username</th><th>Role</th><th>Organization</th><th>Status</th><th className="text-right pr-6">Actions</th></tr>
          </thead>
          <tbody>
            {users.isLoading && <tr><td colSpan={5} className="text-center py-8 text-white/50">Loading…</td></tr>}
            {rows.map((u) => {
              const isSelf = u.username === me?.name;
              return (
                <tr key={u.id} className="group text-xs">
                  <td className="font-semibold text-white pl-6">{u.username}{isSelf && <span className="ml-2 text-[9px] text-white/50 uppercase">you</span>}</td>
                  <td><Badge className={u.role === 'Admin' ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' : 'bg-blue-500/10 text-blue-300 border-blue-500/20'}>{u.role}</Badge></td>
                  <td className="font-medium text-white/70">{u.org_id != null ? (orgNameById.get(u.org_id) ?? `#${u.org_id}`) : '—'}</td>
                  <td><Badge className={u.status === 'active' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-red-500/10 text-red-300 border-red-500/20'}>{u.status}</Badge></td>
                  <td className="text-right pr-6">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <Button size="sm" onClick={() => { setFormError(null); setEdit(u); }} aria-label={`Edit ${u.username}`}>Edit</Button>
                      <Button variant="danger" size="sm" onClick={() => setConfirmDelete(u)} disabled={isSelf} title={isSelf ? 'You cannot delete your own account' : undefined} aria-label={`Delete ${u.username}`}>Delete</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!users.isLoading && !users.isError && rows.length === 0 && (
              <tr><td colSpan={5} className="text-center py-12 text-white/50">No users match these filters.</td></tr>
            )}
          </tbody>
        </Table>
        {rows.length >= limit && (
          <div className="p-3 border-t border-white/5 text-center">
            <Button size="sm" onClick={() => setLimit((l) => l + PAGE)} loading={users.isFetching}>Load more (showing {rows.length})</Button>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Create user" variant="workflow">
        <form action={onCreate} className="p-4 space-y-4">
          <SectionTitle variant="purple" className="text-[10px]">Credentials</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Username" description="1–64 characters: letters, digits, . _ - @"><Input name="username" autoComplete="off" required /></FormField>
            <FormField label="Password" description="At least 8 characters"><Input name="password" type="password" autoComplete="new-password" required minLength={8} /></FormField>
          </div>
          <SectionTitle variant="cyan" className="text-[10px]">Access</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Role" description="Admins manage models, keys, users and usage. Users can chat and manage their own keys."><Select name="role"><option>User</option><option>Admin</option></Select></FormField>
            <FormField label="Organization"><Select name="org_id"><option value="">None</option>{(orgs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></FormField>
          </div>
          {formError && <InfoBox variant="error" role="alert">{formError}</InfoBox>}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/5">
            <Button variant="default" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" loading={create.isPending} className="px-8">Create</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Edit ${edit?.username ?? ''}`} variant="workflow">
        {edit && (
          <form action={onEdit} className="p-4 space-y-4">
            <SectionTitle variant="purple" className="text-[10px]">Account</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Role" description={edit.username === me?.name ? 'You cannot change your own role.' : undefined}>
                <Select name="role" defaultValue={edit.role} disabled={edit.username === me?.name}><option>User</option><option>Admin</option></Select>
              </FormField>
              <FormField label="Status" description={edit.username === me?.name ? 'You cannot disable your own account.' : 'Disabled accounts cannot sign in; their API keys keep working until revoked.'}>
                <Select name="status" defaultValue={edit.status} disabled={edit.username === me?.name}><option value="active">active</option><option value="disabled">disabled</option></Select>
              </FormField>
              <FormField label="Organization"><Select name="org_id" defaultValue={String(edit.org_id ?? '')}><option value="">None</option>{(orgs.data ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></FormField>
            </div>
            <SectionTitle variant="cyan" className="text-[10px]">Security</SectionTitle>
            <FormField label="New password" description="Leave blank to keep the current password."><Input name="password" type="password" autoComplete="new-password" minLength={8} /></FormField>
            {formError && <InfoBox variant="error" role="alert">{formError}</InfoBox>}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/5">
              <Button variant="default" size="sm" onClick={() => setEdit(null)}>Cancel</Button>
              <Button variant="primary" size="sm" type="submit" loading={update.isPending} className="px-8">Save</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete ${confirmDelete?.username ?? ''}?`}
        description={<div>The account is removed permanently. Its API keys and usage records are kept but no longer attributed to a user. To lock someone out temporarily, set the status to disabled instead.</div>}
        confirmLabel="Delete"
        danger
        pending={remove.isPending}
        onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); }}
        onClose={() => setConfirmDelete(null)}
      />
    </section>
  );
}

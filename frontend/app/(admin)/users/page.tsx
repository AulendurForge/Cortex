'use client';

import { Card, Table, Button, PageHeader, Badge, Input, Select, Label, InfoBox, FormField, SectionTitle } from '../../../src/components/UI';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiFetch from '../../../src/lib/api-clients';
import { useMemo, useState } from 'react';
import { Modal } from '../../../src/components/Modal';
import { ConfirmDialog } from '../../../src/components/Confirm';
import { cn } from '../../../src/lib/cn';

type User = { id: number; username: string; role: string; org_id: number | null; status: string };
type Org = { id: number; name: string };

export default function UsersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<User | null>(null);
  const [filters, setFilters] = useState<{ q: string; org_id?: number | ''; role?: string | ''; status?: string | ''; sort: string }>({ q: '', sort: 'created_at:desc' });
  const users = useQuery({
    queryKey: ['users', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.org_id) params.set('org_id', String(filters.org_id));
      if (filters.role) params.set('role', String(filters.role));
      if (filters.status) params.set('status', String(filters.status));
      if (filters.sort) params.set('sort', filters.sort);
      return await apiFetch<User[]>(`/admin/users?${params.toString()}`);
    }
  });
  const orgs = useQuery({ queryKey: ['orgsLookup'], queryFn: () => apiFetch<Org[]>('/admin/orgs/lookup') });
  const orgNameById = useMemo(() => {
    const map = new Map<number, string>();
    (orgs.data || []).forEach(o => map.set(o.id, o.name));
    return map;
  }, [orgs.data]);
  const create = useMutation({
    mutationFn: (body: { username: string; password: string; role: string; org_id?: number }) =>
      apiFetch<User>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const update = useMutation({
    mutationFn: (body: { id: number; role?: string; org_id?: number; password?: string; status?: string }) =>
      apiFetch<User>(`/admin/users/${body.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const onCreate = async (fd: FormData) => {
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '').trim();
    const role = String(fd.get('role') || 'User');
    const org_id = Number(fd.get('org_id') || '') || undefined;
    if (!username || !password) return;
    await create.mutateAsync({ username, password, role, org_id });
    setOpen(false);
  };

  return (
    <section className="space-y-4">
      <PageHeader
        title="Access Control"
        actions={
          <div className="flex flex-col md:flex-row items-stretch md:items-end gap-2">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-white/5 p-1.5 rounded-xl border border-white/10 glass">
              <FormField label="Search"><Input className="bg-black/20 h-8" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></FormField>
              <FormField label="Org"><Select selectSize="sm" className="bg-black/20 h-8" value={String(filters.org_id ?? '')} onChange={(e) => setFilters({ ...filters, org_id: e.target.value ? Number(e.target.value) : '' })}><option value="">All</option>{(orgs.data || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></FormField>
              <FormField label="Role"><Select selectSize="sm" className="bg-black/20 h-8" value={String(filters.role ?? '')} onChange={(e) => setFilters({ ...filters, role: e.target.value || '' })}><option value="">All</option><option>User</option><option>Admin</option></Select></FormField>
              <FormField label="Status"><Select selectSize="sm" className="bg-black/20 h-8" value={String(filters.status ?? '')} onChange={(e) => setFilters({ ...filters, status: e.target.value || '' })}><option value="">All</option><option>active</option><option>disabled</option></Select></FormField>
              <FormField label="Sort"><Select selectSize="sm" className="bg-black/20 h-8" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}><option value="created_at:desc">Newest</option><option value="username:asc">Name</option></Select></FormField>
            </div>
            <Button variant="cyan" size="sm" onClick={() => setOpen(true)} className="h-11 px-6 font-bold uppercase tracking-widest text-[10px]">
              <span className="mr-2 text-base">👤</span> New User
            </Button>
          </div>
        }
      />

      <Card className="p-0 overflow-hidden shadow-xl border-white/5 bg-white/[0.01]">
        <Table>
          <thead>
            <tr><th>Username</th><th>Role</th><th>Organization</th><th>Status</th><th className="text-right pr-6">Actions</th></tr>
          </thead>
          <tbody>
            {(users.data || []).map((u) => (
              <tr key={u.id} className="group text-xs">
                <td className="font-semibold text-white pl-6">{u.username}</td>
                <td><Badge className={u.role === 'Admin' ? 'bg-purple-500/5 text-purple-300/70 border-purple-500/10' : 'bg-blue-500/5 text-blue-300/70 border-blue-500/10'}>{u.role}</Badge></td>
                <td className="font-medium text-white/60">{u.org_id ? (orgNameById.get(u.org_id) || u.org_id) : '—'}</td>
                <td><Badge className={u.status === 'active' ? 'bg-emerald-500/5 text-emerald-300/70 border-emerald-500/10' : 'bg-red-500/5 text-red-300/70 border-red-500/10'}>{u.status}</Badge></td>
                <td className="text-right pr-6">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" onClick={() => setEdit(u)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirmDelete(u)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
            {(users.data || []).length === 0 && (
              <tr><td colSpan={5} className="text-center py-12 text-white/20 uppercase tracking-widest font-black text-[10px]">Zero matches found</td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Create New User" variant="workflow">
        <form action={(fd) => onCreate(fd)} className="p-4 space-y-4">
          <SectionTitle variant="purple" className="text-[10px]">User Credentials</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Username"><Input name="username" placeholder="administrator" required /></FormField>
            <FormField label="Password"><Input name="password" type="password" placeholder="••••••••" required /></FormField>
          </div>
          <SectionTitle variant="cyan" className="text-[10px]">Access Control</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="System Role"><Select name="role"><option>User</option><option>Admin</option></Select></FormField>
            <FormField label="Primary Organization"><Select name="org_id"><option value="">None (Unassigned)</option>{(orgs.data || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></FormField>
          </div>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/5">
            <Button variant="default" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={create.isPending} className="px-8">{create.isPending ? '...' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit User" variant="workflow">
        <form action={(fd) => {
          if (!edit) return;
          const role = String(fd.get('role') || edit.role);
          const org_id = (fd.get('org_id') as string) ? Number(fd.get('org_id')) : undefined;
          const password = String(fd.get('password') || '');
          update.mutate({ id: edit.id, role, org_id, password: password || undefined });
          setEdit(null);
        }} className="p-4 space-y-4">
          <div className="flex items-center gap-3 p-3 glass bg-white/5 rounded-2xl border border-white/5">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/40 to-purple-500/40 flex items-center justify-center text-lg font-bold border border-white/10">{edit?.username.charAt(0).toUpperCase()}</div>
            <div>
              <div className="text-[11px] font-bold text-white uppercase tracking-wider">{edit?.username}</div>
              <div className="text-[9px] text-white/30 font-mono tracking-tighter">UID: {edit?.id}</div>
            </div>
          </div>
          <SectionTitle variant="purple" className="text-[10px]">Account Settings</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="System Role"><Select name="role" defaultValue={edit?.role}><option>User</option><option>Admin</option></Select></FormField>
            <FormField label="Primary Organization"><Select name="org_id" defaultValue={String(edit?.org_id ?? '')}><option value="">None</option>{(orgs.data || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></FormField>
          </div>
          <SectionTitle variant="cyan" className="text-[10px]">Security</SectionTitle>
          <FormField label="Reset Password" description="Leave blank to keep existing."><Input name="password" type="password" placeholder="Enter new password…" /></FormField>
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/5">
            <Button variant="default" size="sm" onClick={() => setEdit(null)}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" disabled={update.isPending} className="px-8">{update.isPending ? '...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Account?"
        description={<div>Permanently remove <strong>{confirmDelete?.username}</strong>? This action is irreversible.</div>}
        confirmLabel="Delete"
        onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); setConfirmDelete(null); }}
        onClose={() => setConfirmDelete(null)}
      />
    </section>
  );
}

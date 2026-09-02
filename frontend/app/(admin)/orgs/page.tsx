'use client';

import { Card, Table, Button, PageHeader, Badge, Input, Select, Label, InfoBox, FormField, SectionTitle } from '../../../src/components/UI';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiFetch from '../../../src/lib/api-clients';
import { useState } from 'react';
import { Modal } from '../../../src/components/Modal';
import { ConfirmDialog } from '../../../src/components/Confirm';
import { useToast } from '../../../src/providers/ToastProvider';

type Org = { id: number; name: string };

export default function OrgsPage() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<Org | null>(null);
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: () => apiFetch<Org[]>('/admin/orgs') });
  const create = useMutation({
    mutationFn: (name: string) => apiFetch<Org>('/admin/orgs', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs'] }),
  });
  const update = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => apiFetch<Org>(`/admin/orgs/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs'] }),
  });
  const [confirmDelete, setConfirmDelete] = useState<Org | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/upstreams/orgs/${id}`, { method: 'DELETE' }).catch(() => apiFetch(`/admin/orgs/${id}`, { method: 'DELETE' })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs'] }),
    onError: (e: unknown) => {
      const err = e as { message?: string; request_id?: string } | undefined;
      addToast({ title: 'Delete failed', description: `${err?.message || ''}${err?.request_id ? ` (request_id: ${err.request_id})` : ''}`.trim() || undefined, kind: 'error' });
    },
  });

  const onCreate = async (form: FormData) => {
    const name = String(form.get('name') || '').trim();
    if (!name) return;
    await create.mutateAsync(name);
    setOpen(false);
  };

  return (
    <section className="space-y-4">
      <PageHeader 
        title="Organization Units" 
        actions={
          <Button variant="cyan" size="sm" onClick={() => setOpen(true)} className="h-11 px-6 font-bold uppercase tracking-widest text-[10px]">
            <span className="mr-2 text-base">🏢</span> New Org/Program
          </Button>
        } 
      />

      <Card className="p-0 overflow-hidden shadow-xl border-white/5 bg-white/[0.01]">
        <Table>
          <thead>
            <tr><th className="pl-6">Organization Name</th><th className="text-right pr-6">Actions</th></tr>
          </thead>
          <tbody>
            {(orgs.data || []).map((o) => (
              <tr key={o.id} className="group text-xs">
                <td className="pl-6 font-semibold text-white">
                  <div className="flex items-center gap-3 py-1">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-300">
                      {o.name.charAt(0).toUpperCase()}
                    </div>
                    {o.name}
                  </div>
                </td>
                <td className="text-right pr-6">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" onClick={() => setEditOrg(o)}>Rename</Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirmDelete(o)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
            {(orgs.data || []).length === 0 && (
              <tr>
                <td colSpan={2} className="text-center py-12 text-white/40">
                  <div className="text-4xl mb-4 opacity-20">🏢</div>
                  No organizations found.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Org/Program" variant="center">
        <form action={(fd) => onCreate(fd)} className="p-6 space-y-6">
          <SectionTitle variant="purple">Organization Details</SectionTitle>
          <FormField label="Organization Name" description="Enter the name of the new department, program, or organization.">
            <Input name="name" placeholder="e.g. Unit Alpha" required />
          </FormField>
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button variant="default" onClick={() => setOpen(false)} type="button">Cancel</Button>
            <Button variant="primary" type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating...' : 'Create Organization'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editOrg} onClose={() => setEditOrg(null)} title="Rename Org/Program" variant="center">
        <form action={(fd) => {
          const name = String(fd.get('name') || '').trim();
          if (editOrg && name) update.mutate({ id: editOrg.id, name });
          setEditOrg(null);
        }} className="p-6 space-y-6">
          <SectionTitle variant="cyan">Modify Details</SectionTitle>
          <FormField label="Organization Name">
            <Input name="name" defaultValue={editOrg?.name || ''} placeholder="e.g. Unit Alpha" required />
          </FormField>
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button variant="default" onClick={() => setEditOrg(null)} type="button">Cancel</Button>
            <Button variant="primary" type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Organization?"
        description={
          <div className="text-white/70">
            Are you sure you want to delete <strong>{confirmDelete?.name}</strong>? 
            Users and keys assigned to this organization will be unassigned. 
            <strong>This action cannot be undone.</strong>
          </div>
        }
        confirmLabel="Delete Organization"
        onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); setConfirmDelete(null); }}
        onClose={() => setConfirmDelete(null)}
      />
    </section>
  );
}

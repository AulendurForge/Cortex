'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Card, Table, Button, PageHeader, Input, InfoBox, FormField, SectionTitle } from '@/components/UI';
import apiFetch from '@/lib/api-clients';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/Confirm';
import { useToast } from '@/providers/ToastProvider';

const OrgSchema = z.object({ id: z.number(), name: z.string() });
const OrgsSchema = z.array(OrgSchema);
type Org = z.infer<typeof OrgSchema>;

function errMsg(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? 'request failed';
  return m === 'name_exists' ? 'An organization with that name already exists.' : m;
}

export default function OrgsPage() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<Org | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Org | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const orgs = useQuery({ queryKey: ['orgs'], queryFn: async () => OrgsSchema.parse(await apiFetch<unknown>('/admin/orgs')) });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['orgs'] }); };
  const create = useMutation({
    mutationFn: (name: string) => apiFetch<Org>('/admin/orgs', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: (o) => { invalidate(); setOpen(false); setFormError(null); addToast({ title: `Organization ${o.name} created`, kind: 'success' }); },
    onError: (e) => setFormError(errMsg(e)),
  });
  const update = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => apiFetch<Org>(`/admin/orgs/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
    onSuccess: () => { invalidate(); setEditOrg(null); setFormError(null); addToast({ title: 'Organization renamed', kind: 'success' }); },
    onError: (e) => setFormError(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/orgs/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['users'] }); setConfirmDelete(null); addToast({ title: 'Organization deleted', kind: 'success' }); },
    onError: (e) => { setConfirmDelete(null); addToast({ title: 'Could not delete organization', description: errMsg(e), kind: 'error' }); },
  });

  const onCreate = (fd: FormData) => {
    const name = String(fd.get('name') ?? '').trim();
    if (!name) { setFormError('Enter a name.'); return; }
    create.mutate(name);
  };
  const onRename = (fd: FormData) => {
    if (!editOrg) return;
    const name = String(fd.get('name') ?? '').trim();
    if (!name) { setFormError('Enter a name.'); return; }
    if (name === editOrg.name) { setEditOrg(null); return; }
    update.mutate({ id: editOrg.id, name });
  };
  const rows = orgs.data ?? [];

  return (
    <section className="space-y-4">
      <PageHeader
        title="Organizations & Programs"
        subtitle="Group users and API keys so usage can be attributed and filtered per team or program."
        actions={<Button variant="cyan" size="sm" onClick={() => { setFormError(null); setOpen(true); }} className="h-11 px-6 font-bold uppercase tracking-widest text-[10px]">New organization</Button>}
      />

      {orgs.isError && <InfoBox variant="error" title="Could not load organizations" role="alert">{errMsg(orgs.error)}</InfoBox>}

      <Card className="p-0 overflow-hidden shadow-xl border-white/5 bg-white/[0.01]">
        <Table>
          <thead><tr><th className="pl-6">Name</th><th className="text-right pr-6">Actions</th></tr></thead>
          <tbody>
            {orgs.isLoading && <tr><td colSpan={2} className="text-center py-8 text-white/50">Loading…</td></tr>}
            {rows.map((o) => (
              <tr key={o.id} className="group text-xs">
                <td className="pl-6 font-semibold text-white">
                  <div className="flex items-center gap-3 py-1">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-[10px] font-bold text-indigo-300" aria-hidden>{o.name.charAt(0).toUpperCase()}</div>
                    {o.name}
                  </div>
                </td>
                <td className="text-right pr-6">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                    <Button size="sm" onClick={() => { setFormError(null); setEditOrg(o); }} aria-label={`Rename ${o.name}`}>Rename</Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirmDelete(o)} aria-label={`Delete ${o.name}`}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
            {!orgs.isLoading && !orgs.isError && rows.length === 0 && (
              <tr><td colSpan={2} className="text-center py-12 text-white/50">No organizations yet.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Create organization" variant="center">
        <form action={onCreate} className="p-6 space-y-6">
          <SectionTitle variant="purple">Details</SectionTitle>
          <FormField label="Name" description="A department, program or team, e.g. Unit Alpha.">
            <Input name="name" placeholder="e.g. Unit Alpha" required autoComplete="off" />
          </FormField>
          {formError && <InfoBox variant="error" role="alert">{formError}</InfoBox>}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Button variant="default" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={create.isPending}>Create</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editOrg} onClose={() => setEditOrg(null)} title={`Rename ${editOrg?.name ?? ''}`} variant="center">
        {editOrg && (
          <form action={onRename} className="p-6 space-y-6">
            <FormField label="Name"><Input name="name" defaultValue={editOrg.name} required autoComplete="off" /></FormField>
            {formError && <InfoBox variant="error" role="alert">{formError}</InfoBox>}
            <div className="flex items-center justify-end gap-3 pt-4">
              <Button variant="default" onClick={() => setEditOrg(null)}>Cancel</Button>
              <Button variant="primary" type="submit" loading={update.isPending}>Save</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Delete ${confirmDelete?.name ?? ''}?`}
        description={<div className="text-white/70">Users and API keys assigned to this organization are kept and become unassigned. This cannot be undone.</div>}
        confirmLabel="Delete organization"
        danger
        pending={remove.isPending}
        onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); }}
        onClose={() => setConfirmDelete(null)}
      />
    </section>
  );
}

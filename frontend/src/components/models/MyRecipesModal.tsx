'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import apiFetch, { ApiError } from '../../lib/api-clients';
import { RecipeItem, RecipeListSchema } from '../../lib/validators';
import { Card, Table, Button, Badge, InfoBox } from '../UI';
import { Modal } from '../Modal';
import { ConfirmDialog } from '../Confirm';
import { useToast } from '../../providers/ToastProvider';

interface MyRecipesModalProps {
  open: boolean;
  onClose: () => void;
  onSelectRecipe: (recipe: RecipeItem) => void;
}

/** Saved recipes (GET /admin/recipes): load one into the Add form or delete it. */
export function MyRecipesModal({ open, onClose, onSelectRecipe }: MyRecipesModalProps) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const recipes = useQuery<RecipeItem[], ApiError>({
    queryKey: ['recipes'],
    queryFn: async () => RecipeListSchema.parse(await apiFetch<unknown>('/admin/recipes')),
    enabled: open,
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/recipes/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recipes'] }); addToast({ title: 'Recipe deleted', kind: 'success' }); setDeleteId(null); },
  });

  const rows = recipes.data ?? [];

  return (
    <>
      <Modal open={open} onClose={onClose} title="Recipes" variant="fullscreen">
        <div className="space-y-4 max-w-6xl mx-auto py-2">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">My Recipes</h1>
            <p className="text-white/50 text-xs leading-relaxed max-w-2xl">
              A recipe is a named snapshot of a model&apos;s full configuration (engine, source, every engine flag, request defaults).
              Load one to prefill the Add Model form; identity fields stay editable.
            </p>
          </header>

          {recipes.isError && (
            <InfoBox variant="error" title="Could not load recipes" role="alert">
              <div className="text-xs">{recipes.error.message}{recipes.error.request_id && <span className="text-white/40"> (request {recipes.error.request_id})</span>}</div>
              <Button size="sm" className="mt-2" onClick={() => { void recipes.refetch(); }}>Retry</Button>
            </InfoBox>
          )}

          <Card className="p-0 overflow-hidden shadow-2xl border-white/5 bg-white/[0.01]">
            <Table>
              <thead>
                <tr>
                  <th className="pl-6">Recipe</th>
                  <th>Model</th>
                  <th>Engine</th>
                  <th>Source</th>
                  <th>Updated</th>
                  <th className="text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="pl-6">
                      <div className="flex items-center gap-3 py-1.5">
                        <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-xs" aria-hidden>📜</div>
                        <div className="flex flex-col">
                          <span className="font-bold text-white text-xs">{r.name}</span>
                          {r.description && <span className="text-[10px] text-white/40 max-w-md truncate" title={r.description}>{r.description}</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span className="text-xs text-white/80">{r.model_name}</span>
                        <span className="text-[9px] font-mono text-white/40">{r.served_model_name} · {r.task}</span>
                      </div>
                    </td>
                    <td>
                      <Badge className={r.engine_type === 'llamacpp' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-blue-500/10 text-blue-300 border-blue-500/20'}>
                        {r.engine_type === 'llamacpp' ? 'llama.cpp' : 'vLLM'}
                      </Badge>
                    </td>
                    <td className="text-[10px] text-white/60 uppercase">{r.mode}</td>
                    <td className="text-[9px] text-white/40 font-mono">{r.updated_at || r.created_at ? new Date((r.updated_at || r.created_at) as string).toLocaleDateString() : '—'}</td>
                    <td className="text-right pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="cyan" size="sm" onClick={() => { onSelectRecipe(r); onClose(); }} className="px-3 font-bold uppercase tracking-widest text-[8px]">Load</Button>
                        <Button variant="danger" size="sm" onClick={() => setDeleteId(r.id)} className="px-2" aria-label={`Delete recipe ${r.name}`}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!recipes.isError && rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-white/40">
                      <div className="text-4xl mb-4 opacity-10" aria-hidden>📜</div>
                      <div className="text-xs font-bold uppercase tracking-[0.2em]">{recipes.isLoading ? 'Loading…' : 'No recipes yet'}</div>
                      {!recipes.isLoading && <p className="text-[10px] mt-1 italic">Use &quot;Recipe&quot; on a model row to save its configuration.</p>}
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>

          <InfoBox variant="blue" title="Tip" className="text-[10px] p-2">
            Recipes capture GPU placement (TP/PP, GPU list) and quantization exactly; check the Summary step after loading one on a different host.
          </InfoBox>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete recipe?"
        description="The recipe is removed from the catalog. Models created from it are not affected."
        confirmLabel="Delete recipe"
        danger
        pending={remove.isPending}
        pendingLabel="Deleting…"
        error={remove.isError ? (remove.error as Partial<ApiError>)?.message || 'Delete failed' : null}
        onConfirm={() => deleteId !== null && remove.mutate(deleteId)}
        onClose={() => { setDeleteId(null); remove.reset(); }}
      />
    </>
  );
}

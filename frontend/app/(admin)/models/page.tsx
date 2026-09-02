'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiFetch, { ApiError, getGatewayBaseUrl } from '@/lib/api-clients';
import { DryRunResult, DryRunResultSchema, ModelItem, ModelListSchema, RecipeDetailSchema } from '@/lib/validators';
import { Card, Button, PageHeader, InfoBox, SectionTitle } from '@/components/UI';
import { Modal } from '@/components/Modal';
import { ModelWorkflowForm } from '@/components/models/ModelWorkflowForm';
import { ModelFormValues, apiItemToFormValues, recipeToFormValues } from '@/components/models/modelFormValues';
import { LogsViewer } from '@/components/models/LogsViewer';
import { DiagnosticBanner } from '@/components/models/DiagnosticBanner';
import { ConfirmDialog } from '@/components/Confirm';
import { ResourceCalculatorModal } from '@/components/models/ResourceCalculatorModal';
import { TestResultsModal, TestResult } from '@/components/models/TestResultsModal';
import { SaveRecipeDialog } from '@/components/models/SaveRecipeDialog';
import { MyRecipesModal } from '@/components/models/MyRecipesModal';
import { ArchivedModelsTable, ModelsListError, ModelsTable } from '@/components/models/ModelsTable';
import { describeStartError } from '@/components/models/startErrors';
import { useUser } from '@/providers/UserProvider';
import { useToast } from '@/providers/ToastProvider';
import { errMsg } from '@/lib/errors';

type StatusRow = { name?: string; served_model_name?: string; task?: string; state?: string };


export default function ModelsPage() {
  // Resolved on the client only: the SSR pass cannot know the browser's hostname (avoids a hydration mismatch)
  const [gatewayUrl, setGatewayUrl] = React.useState('');
  React.useEffect(() => { setGatewayUrl(getGatewayBaseUrl()); }, []);
  const qc = useQueryClient();
  const { user } = useUser();
  const { addToast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [open, setOpen] = React.useState(false);
  const [logsFor, setLogsFor] = React.useState<number | null>(null);
  const [archiveId, setArchiveId] = React.useState<number | null>(null);
  const [deleteId, setDeleteId] = React.useState<number | null>(null);
  const [configId, setConfigId] = React.useState<number | null>(null);
  const [calcOpen, setCalcOpen] = React.useState(false);
  const [prefill, setPrefill] = React.useState<Partial<ModelFormValues> | null>(null);
  const [prefillKey, setPrefillKey] = React.useState(0);
  const [testResult, setTestResult] = React.useState<{ id: number; result: TestResult } | null>(null);
  const [saveRecipeModelId, setSaveRecipeModelId] = React.useState<number | null>(null);
  const [myRecipesOpen, setMyRecipesOpen] = React.useState(false);
  const [startCheck, setStartCheck] = React.useState<{ id: number; result: DryRunResult } | null>(null);
  const prevStatesRef = React.useRef<Record<number, string>>({});

  const list = useQuery<ModelItem[], ApiError>({
    queryKey: ['models', isAdmin],
    // wait for the session before choosing the endpoint (avoids a flash of the public status list)
    enabled: !!user,
    queryFn: async () => {
      if (isAdmin) {
        // the supervisor flips loading -> running itself; polling the list is enough
        return ModelListSchema.parse(await apiFetch<unknown>('/admin/models'));
      }
      const raw = await apiFetch<{ data?: StatusRow[] }>('/v1/models/status');
      const arr = Array.isArray(raw?.data) ? raw.data : [];
      return arr.map((r, idx) => ModelListSchema.element.parse({
        id: idx + 1, name: r.name || r.served_model_name || '-', served_model_name: r.served_model_name || r.name || '-',
        task: r.task || 'generate', state: r.state === 'running' ? 'running' : 'stopped', archived: false,
      }));
    },
    staleTime: 5000,
    refetchInterval: (query) => {
      const data = query.state.data;
      const busy = data?.some((m) => m.state === 'loading' || m.state === 'starting' || m.state === 'stopping');
      return busy ? 3000 : 15000;
    },
  });
  const models = React.useMemo(() => list.data ?? [], [list.data]);
  const byId = (id: number | null) => (id == null ? undefined : models.find((m) => m.id === id));

  React.useEffect(() => {
    const prev = prevStatesRef.current;
    for (const m of models) {
      if (prev[m.id] === 'loading' && m.state === 'running') addToast({ title: `${m.name} is now running`, description: 'Ready for inference requests', kind: 'success' });
      if (prev[m.id] === 'loading' && m.state === 'failed') addToast({ title: `${m.name} failed to start`, description: m.state_reason || "Check 'Logs' for details", kind: 'error' });
      prev[m.id] = m.state;
    }
  }, [models, addToast]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['models'] });
  const closeAdd = () => { setOpen(false); setPrefill(null); };

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => apiFetch('/admin/models', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => { invalidate(); addToast({ title: 'Model created', kind: 'success' }); closeAdd(); },
    onError: (e: unknown) => { const f = describeStartError(e); addToast({ title: f.title, description: f.description, kind: 'error' }); },
  });
  const start = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}/start`, { method: 'POST' }),
    onSuccess: () => { invalidate(); addToast({ title: 'Container starting', description: "Open 'Logs' to follow progress", kind: 'info' }); },
    onError: (e: unknown) => { const f = describeStartError(e); addToast({ title: f.title, description: f.description, kind: 'error' }); },
  });
  const stop = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}/stop`, { method: 'POST' }),
    onSuccess: () => { invalidate(); addToast({ title: 'Model stopped', kind: 'success' }); },
    onError: (e: unknown) => addToast({ title: 'Failed to stop model', description: errMsg(e), kind: 'error' }),
  });
  const archive = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}/archive`, { method: 'POST' }),
    onSuccess: () => { invalidate(); setArchiveId(null); addToast({ title: 'Model archived', kind: 'success' }); },
    onError: (e: unknown) => addToast({ title: 'Could not archive', description: errMsg(e), kind: 'error' }),
  });
  const del = useMutation({
    mutationFn: async (id: number) => apiFetch(`/admin/models/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); setDeleteId(null); addToast({ title: 'Model deleted', kind: 'success' }); },
    onError: (e: unknown) => addToast({ title: 'Could not delete', description: errMsg(e), kind: 'error' }),
  });
  // Save first; a failed restart must not read as "save failed" (the configuration is already stored).
  const apply = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => {
      await apiFetch(`/admin/models/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      try {
        const r = await apiFetch<{ status?: string; restarted?: boolean }>(`/admin/models/${id}/apply`, { method: 'POST' });
        return { saved: true as const, apply: r, applyError: null as string | null };
      } catch (e) {
        return { saved: true as const, apply: null, applyError: errMsg(e) };
      }
    },
    onSuccess: (r) => {
      invalidate(); setConfigId(null);
      if (r.applyError) addToast({ title: 'Configuration saved, but the restart failed', description: r.applyError, kind: 'error' });
      else if (r.apply?.restarted) addToast({ title: 'Configuration saved', description: 'The model is restarting with the new settings', kind: 'info' });
      else addToast({ title: 'Configuration saved', description: 'Applies the next time the model starts', kind: 'success' });
    },
    onError: (e: unknown) => { const f = describeStartError(e); addToast({ title: `Save failed: ${f.title}`, description: f.description, kind: 'error' }); },
  });
  const testModel = useMutation({
    mutationFn: async (id: number) => ({ id, result: await apiFetch<TestResult>(`/admin/models/${id}/test`, { method: 'POST' }) }),
    onSuccess: (data) => { setTestResult(data); addToast({ title: data.result.success ? 'Test passed' : 'Test failed', kind: data.result.success ? 'success' : 'error' }); },
    onError: (e: unknown) => addToast({ title: 'Test failed', description: errMsg(e), kind: 'error' }),
  });
  // Pre-start check: run the saved model's dry run; errors open a confirm dialog instead of starting anyway.
  const startCheckMut = useMutation({
    mutationFn: async (id: number) => ({ id, result: DryRunResultSchema.parse(await apiFetch<unknown>(`/admin/models/${id}/dry-run`, { method: 'POST' })) }),
    onSuccess: ({ id, result }) => {
      if (result.valid) {
        const est = result.vram_estimate;
        if (est && typeof est.required_vram_gb !== 'undefined') addToast({ title: 'Pre-flight check passed', description: `Estimated ${String(est.required_vram_gb)} GB per GPU`, kind: 'info' });
        start.mutate(id);
      } else {
        setStartCheck({ id, result });
      }
    },
    onError: (_e, id) => start.mutate(id),
  });

  const loadRecipe = async (recipeId: number) => {
    try {
      const detail = RecipeDetailSchema.parse(await apiFetch<unknown>(`/admin/recipes/${recipeId}`));
      setPrefill(recipeToFormValues(detail));
      setPrefillKey((k) => k + 1);
      setOpen(true);
      addToast({ title: `Recipe "${detail.name}" loaded`, description: 'Review the prefilled settings, then launch', kind: 'success' });
    } catch (e) {
      addToast({ title: 'Could not load recipe', description: errMsg(e), kind: 'error' });
    }
  };

  const pending = { startingId: start.isPending ? start.variables ?? null : startCheckMut.isPending ? startCheckMut.variables ?? null : null, stoppingId: stop.isPending ? stop.variables ?? null : null, testingId: testModel.isPending ? testModel.variables ?? null : null };
  const actions = {
    onLogs: setLogsFor, onRecipe: setSaveRecipeModelId, onTest: (id: number) => testModel.mutate(id), onStart: (id: number) => startCheckMut.mutate(id),
    onStop: (id: number) => stop.mutate(id), onConfig: setConfigId, onArchive: setArchiveId, onDelete: setDeleteId,
  };
  const configModel = byId(configId);
  const logsModel = byId(logsFor);

  return (
    <section className="space-y-4">
      <PageHeader title="Models" actions={isAdmin && (
        <div className="flex items-center gap-2">
          <Button variant="default" size="sm" onClick={() => setCalcOpen(true)}><span className="mr-1">🧮</span> Calculator</Button>
          <Button variant="purple" size="sm" onClick={() => setMyRecipesOpen(true)}><span className="mr-1">📜</span> Recipes</Button>
          <Button variant="cyan" size="sm" onClick={() => { setPrefill(null); setPrefillKey((k) => k + 1); setOpen(true); }}><span className="mr-1">➕</span> Add Model</Button>
        </div>
      )} />

      <InfoBox variant="blue" title="Connectivity" className="py-2.5">
        <div className="text-xs text-white/80 mb-1">Endpoint: <code className="bg-white/10 px-1 py-0.5 rounded border border-white/10 font-mono text-[10px]">{gatewayUrl || 'resolving…'}</code></div>
        <a href="/guide?tab=api-keys" className="text-xs font-semibold text-blue-300 hover:text-blue-200 transition-colors">📖 API Guide →</a>
      </InfoBox>

      {list.isError && <ModelsListError error={list.error} onRetry={() => { void list.refetch(); }} />}

      <Card className="p-0 overflow-hidden shadow-xl">
        <ModelsTable models={models} isAdmin={isAdmin} actions={actions} pending={pending} isLoading={list.isLoading} />
      </Card>

      {isAdmin && models.some((m) => m.archived) && (
        <Card className="p-0 overflow-hidden border-white/5 bg-white/[0.01]">
          <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02]"><SectionTitle variant="blue" className="mb-0 text-[10px]">Vaulted Configurations</SectionTitle></div>
          <ArchivedModelsTable models={models.filter((m) => m.archived)} actions={actions} pending={pending} />
        </Card>
      )}

      {isAdmin && (
        <Modal open={open} onClose={closeAdd} title="Add Model" variant="workflow">
          <ModelWorkflowForm key={`add-${prefillKey}`} onCancel={closeAdd} onSubmit={(body) => create.mutate(body)} submitLabel={create.isPending ? 'Creating…' : 'Launch Model'} submitPending={create.isPending} defaults={prefill ?? undefined} />
        </Modal>
      )}

      {isAdmin && (
        <ResourceCalculatorModal open={calcOpen} onClose={() => setCalcOpen(false)} onApply={(r) => { setCalcOpen(false); if (r?.values) { setPrefill((prev) => ({ ...(prev || {}), ...r.values })); setPrefillKey((k) => k + 1); setOpen(true); } }} />
      )}

      {isAdmin && (
        <Modal open={configId != null} onClose={() => setConfigId(null)} title={`Configure ${configModel?.name ?? 'Model'}`} variant="workflow">
          {configId != null && configModel && (
            <ModelWorkflowForm key={`config-${configId}`} modelId={configId} defaults={apiItemToFormValues(configModel)} modeLocked onCancel={() => setConfigId(null)} onSubmit={(body) => apply.mutate({ id: configId, body })} submitLabel={apply.isPending ? 'Saving…' : 'Save & Apply'} submitPending={apply.isPending} />
          )}
        </Modal>
      )}

      {isAdmin && (
        <Modal open={logsFor != null} onClose={() => setLogsFor(null)} title={`Logs · ${logsModel?.name ?? ''}`}>
          {logsFor != null && (
            <div className="space-y-3">
              <DiagnosticBanner modelId={logsFor} modelState={logsModel?.state || 'unknown'} stateReason={logsModel?.state_reason} />
              <LogsViewer modelId={logsFor} modelName={logsModel?.name} modelState={logsModel?.state} stateReason={logsModel?.state_reason} />
            </div>
          )}
        </Modal>
      )}

      {isAdmin && (
        <ConfirmDialog open={archiveId != null} title="Archive Model?" description="Archiving hides this model from the main table; it can be deleted from the vault." pending={archive.isPending} pendingLabel="Archiving…" error={archive.isError ? errMsg(archive.error) : null} onConfirm={() => archiveId != null && archive.mutate(archiveId)} onClose={() => { setArchiveId(null); archive.reset(); }} />
      )}
      {isAdmin && (
        <ConfirmDialog open={deleteId != null} title="Delete Configuration?" description="The model files on disk are preserved. The Cortex configuration and any recipes saved from this model are removed." confirmLabel="Delete" danger pending={del.isPending} pendingLabel="Deleting…" error={del.isError ? errMsg(del.error) : null} onConfirm={() => deleteId != null && del.mutate(deleteId)} onClose={() => { setDeleteId(null); del.reset(); }} />
      )}
      {isAdmin && (
        <ConfirmDialog
          open={startCheck != null}
          title="Pre-flight check found errors"
          confirmLabel="Start anyway"
          danger
          pending={start.isPending}
          pendingLabel="Starting…"
          description={startCheck && (
            <ul className="space-y-1 text-xs">
              {startCheck.result.warnings.map((w, i) => (
                <li key={i} className={w.severity === 'error' ? 'text-red-200' : 'text-amber-200'}><strong>{w.title || w.severity}:</strong> {w.message}{w.fix ? ` — ${w.fix}` : ''}</li>
              ))}
            </ul>
          )}
          onConfirm={() => { if (startCheck) { start.mutate(startCheck.id); setStartCheck(null); } }}
          onClose={() => setStartCheck(null)}
        />
      )}

      <TestResultsModal open={!!testResult} onClose={() => setTestResult(null)} result={testResult?.result ?? null} modelName={byId(testResult?.id ?? null)?.name} />

      {isAdmin && saveRecipeModelId != null && (
        <SaveRecipeDialog open onClose={() => setSaveRecipeModelId(null)} onSuccess={() => qc.invalidateQueries({ queryKey: ['recipes'] })} modelId={saveRecipeModelId} modelName={byId(saveRecipeModelId)?.name || ''} engineType={byId(saveRecipeModelId)?.engine_type || ''} />
      )}

      {isAdmin && <MyRecipesModal open={myRecipesOpen} onClose={() => setMyRecipesOpen(false)} onSelectRecipe={(r) => { void loadRecipe(r.id); }} />}
    </section>
  );
}

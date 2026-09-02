'use client';

import React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, InfoBox, Input, Table, TextArea, FormField } from '../../../src/components/UI';
import { useToast } from '../../../src/providers/ToastProvider';
import { cn } from '../../../src/lib/cn';
import type { ModelItem } from '../../../src/lib/validators';
import {
  ExportArtifactsSchema, ExportRequest, ImageOption, ImageRole, JobController, QK,
  errMsg, flattenLocations, formatBytes, startExport, useBundleImages, useDebounced, useExportPlan, useExportableModels, useLocations,
} from './api';
import { JobProgress } from './JobProgress';
import { EmptyState, ErrorAlert, Stat, StepHeader, Toggle } from './Steps';

const ROLE_LABEL: Record<ImageRole, string> = {
  engine: 'Engine images',
  infra: 'Infrastructure images',
  program: 'Cortex program images',
  deps: 'Dependency images (offline rebuilds)',
};

function toggleIn<T>(list: T[], v: T, on: boolean): T[] {
  if (on) return list.includes(v) ? list : [...list, v];
  return list.filter((x) => x !== v);
}

export function ExportWizard({ ctl }: { ctl: JobController }) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const locations = useLocations();
  const images = useBundleImages();
  const models = useExportableModels();

  const [destination, setDestination] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [nameTouched, setNameTouched] = React.useState(false);
  const [selectedImages, setSelectedImages] = React.useState<string[]>([]);
  const [extraRefs, setExtraRefs] = React.useState<string[]>([]);
  const [extraInput, setExtraInput] = React.useState('');
  const [includeInfra, setIncludeInfra] = React.useState(false);
  const [includeProgram, setIncludeProgram] = React.useState(false);
  const [selectedModels, setSelectedModels] = React.useState<number[]>([]);
  const [includeModelFiles, setIncludeModelFiles] = React.useState(true);
  const [includeDb, setIncludeDb] = React.useState(false);
  const [pullMissing, setPullMissing] = React.useState(true);
  const [notes, setNotes] = React.useState('');
  const [startError, setStartError] = React.useState<string | null>(null);

  const options = React.useMemo(() => flattenLocations(locations.data), [locations.data]);
  const writableOptions = React.useMemo(() => options.filter((o) => o.writable), [options]);

  // Pick a sensible default destination once: the first writable mount point, else the exports dir.
  React.useEffect(() => {
    if (destination != null || writableOptions.length === 0) return;
    const usb = writableOptions.find((o) => o.depth === 1);
    setDestination((usb ?? writableOptions[0])?.path ?? null);
  }, [destination, writableOptions]);

  const request: ExportRequest | null = React.useMemo(() => {
    if (!destination) return null;
    return {
      destination,
      name: name.trim(),
      image_refs: [...selectedImages, ...extraRefs],
      include_infra_images: includeInfra,
      include_program_images: includeProgram,
      model_ids: selectedModels,
      include_model_files: includeModelFiles,
      include_db_dump: includeDb,
      pull_missing: pullMissing,
      notes: notes.trim(),
    };
  }, [destination, name, selectedImages, extraRefs, includeInfra, includeProgram, selectedModels, includeModelFiles, includeDb, pullMissing, notes]);
  const debounced = useDebounced(request, 400);
  const plan = useExportPlan(debounced);
  const planData = plan.data;

  // Default bundle name comes from the plan (cortex-bundle-<timestamp>); filled once, then it is the admin's.
  React.useEffect(() => {
    if (!nameTouched && name === '' && planData?.bundle_name) setName(planData.bundle_name);
  }, [planData?.bundle_name, name, nameTouched]);

  const start = useMutation({
    mutationFn: (req: ExportRequest) => startExport(req),
    onSuccess: (job) => {
      setStartError(null);
      ctl.claimJob(job.id);
      qc.setQueryData(QK.status, job);
      qc.invalidateQueries({ queryKey: QK.status });
      addToast({ title: 'Export started', description: `Writing ${job.output_dir}`, kind: 'success' });
    },
    onError: (e: unknown) => setStartError(errMsg(e)),
  });

  const imagesByRole = React.useMemo(() => {
    const g: Record<ImageRole, ImageOption[]> = { engine: [], infra: [], program: [], deps: [] };
    for (const i of images.data ?? []) g[i.role].push(i);
    return g;
  }, [images.data]);
  const requiredByModels = React.useMemo(() => new Set((planData?.models ?? []).map((m) => m.engine_image)), [planData?.models]);

  const addExtra = () => {
    const ref = extraInput.trim();
    if (!ref) return;
    if (!/^[\w.\-/:@]+$/.test(ref)) {
      addToast({ title: 'Invalid image tag', description: 'Use the form repository/name:tag, e.g. vllm/vllm-openai:v0.28.1', kind: 'error' });
      return;
    }
    setExtraRefs((l) => (l.includes(ref) ? l : [...l, ref]));
    setExtraInput('');
  };

  const nothingSelected = !!request && request.image_refs.length === 0 && request.model_ids.length === 0 && !request.include_infra_images && !request.include_program_images && !request.include_db_dump;
  const blocked = !request || !planData || plan.isError || nothingSelected || !planData.sufficient || (planData.missing_images.length > 0 && !pullMissing) || ctl.busy || start.isPending;

  const myJob = ctl.job && ctl.job.id === ctl.claimedJobId && ctl.job.job_type === 'bundle_export' ? ctl.job : null;
  const artifacts = myJob?.status === 'completed' ? ExportArtifactsSchema.safeParse(myJob.artifacts) : null;

  if (myJob) {
    return (
      <div className="space-y-4">
        <StepHeader n={4} title="Progress" hint="The gateway saves the images and copies the model files. You can leave this page; the job keeps running." done={myJob.status === 'completed'} />
        <JobProgress
          job={myJob}
          onCancel={ctl.cancel}
          cancelling={ctl.cancelling}
          onDismiss={() => { ctl.releaseJob(); qc.invalidateQueries({ queryKey: QK.locations }); }}
          dismissLabel="Start another export"
        >
          <InfoBox variant="emerald" title="Bundle written">
            <div className="space-y-2 text-[12px]">
              {artifacts?.success ? (
                <>
                  <div>
                    Saved to <code className="text-emerald-100 font-mono">{artifacts.data.bundle_host_dir}</code> on the host
                    {' '}({artifacts.data.images} image{artifacts.data.images === 1 ? '' : 's'}, {artifacts.data.models} model{artifacts.data.models === 1 ? '' : 's'}, {formatBytes(artifacts.data.size_bytes)}).
                  </div>
                </>
              ) : (
                <div>Saved to <code className="text-emerald-100 font-mono">{myJob.output_dir}</code>.</div>
              )}
              <div className="text-white/80">
                <strong>Next:</strong> unmount the drive (<code>sudo umount &lt;mount point&gt;</code>), take it to the offline host, and open <strong>Transfer → Import</strong> there.
              </div>
            </div>
          </InfoBox>
        </JobProgress>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ctl.busy && (
        <InfoBox variant="warning" title="Another job is running">
          Starting an export is blocked until the current job finishes or is cancelled.
        </InfoBox>
      )}

      {/* ---------------------------------------------------------------- 1. Destination */}
      <Card className="p-4">
        <StepHeader n={1} title="Destination" hint={<>Plug in a drive and mount it under <code>/media</code> or <code>/mnt</code> on the host, then refresh. The exports directory always works and can be copied off later.</>} />
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-[11px] text-white/50">Paths are shown as seen on the host.</div>
          <Button size="sm" onClick={() => locations.refetch()} disabled={locations.isFetching}>{locations.isFetching ? 'Refreshing…' : 'Refresh'}</Button>
        </div>
        {locations.isError && <ErrorAlert title="Could not list locations">{errMsg(locations.error)}</ErrorAlert>}
        {locations.isLoading && <div className="text-xs text-white/50">Looking for drives…</div>}
        {locations.isSuccess && options.length === 0 && (
          <EmptyState>No transfer locations are configured. Mount a drive under <code>/media</code> or <code>/mnt</code> on the host and refresh.</EmptyState>
        )}
        {locations.isSuccess && options.length > 0 && writableOptions.length === 0 && (
          <InfoBox variant="warning" className="mb-2">
            No writable location found. On the host run <code>sudo chown 1000 &lt;mount point&gt;</code> for ext4 drives (exFAT/NTFS drives are writable by everyone), then refresh.
          </InfoBox>
        )}
        <div role="radiogroup" aria-label="Destination" className="space-y-1.5">
          {options.map((o) => {
            const active = destination === o.path;
            return (
              <label
                key={o.path}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors',
                  o.depth === 1 && 'ml-6',
                  !o.writable ? 'opacity-50 cursor-not-allowed border-white/5' : active ? 'border-cyan-400/40 bg-cyan-500/10 cursor-pointer' : 'border-white/10 hover:bg-white/[0.05] cursor-pointer'
                )}
              >
                <input type="radio" name="destination" className="accent-cyan-400" checked={active} disabled={!o.writable} onChange={() => setDestination(o.path)} />
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-sm text-white/90 break-all">{o.host_path}</span>
                  <span className="block text-[11px] text-white/50">
                    {o.writable ? <>{formatBytes(o.free_bytes)} free{o.bundles.length > 0 && <> · {o.bundles.length} bundle{o.bundles.length === 1 ? '' : 's'} already here</>}</> : o.reason}
                  </span>
                </span>
                {o.depth === 1 && o.writable && <Badge variant="info">mount</Badge>}
              </label>
            );
          })}
        </div>
        <div className="mt-4 max-w-md">
          <FormField label="Bundle name" description="A folder with this name is created inside the destination.">
            <Input
              value={name}
              placeholder={planData?.bundle_name ?? 'cortex-bundle-…'}
              onChange={(e) => { setNameTouched(true); setName(e.target.value); }}
              aria-label="Bundle name"
            />
          </FormField>
        </div>
      </Card>

      {/* ---------------------------------------------------------------- 2. Contents */}
      <Card className="p-4 space-y-5">
        <StepHeader n={2} title="What to include" hint="Selecting a model automatically adds the exact engine image it runs on." />

        <section className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-white/50">{ROLE_LABEL.engine}</div>
          {images.isError && <ErrorAlert title="Could not list images">{errMsg(images.error)}</ErrorAlert>}
          {images.isLoading && <div className="text-xs text-white/50">Reading the Docker image cache…</div>}
          {images.isSuccess && imagesByRole.engine.length === 0 && <EmptyState>No engine images known yet.</EmptyState>}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
            {imagesByRole.engine.map((img) => {
              const required = requiredByModels.has(img.ref);
              const checked = selectedImages.includes(img.ref) || required;
              return (
                <label key={img.ref} className={cn('flex items-start gap-3 rounded-xl border px-3 py-2 cursor-pointer', checked ? 'border-cyan-400/30 bg-cyan-500/5' : 'border-white/10 hover:bg-white/[0.05]')}>
                  <input type="checkbox" className="mt-1 accent-cyan-400" checked={checked} disabled={required} onChange={(e) => setSelectedImages((l) => toggleIn(l, img.ref, e.target.checked))} />
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-[12px] text-white/90 break-all">{img.ref}</span>
                    <span className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-white/50">
                      <Badge variant={img.cached ? 'success' : 'warning'}>{img.cached ? 'cached' : 'will be pulled'}</Badge>
                      <span>{formatBytes(img.size_bytes)}</span>
                      {required && <Badge variant="info">required by selected model</Badge>}
                      <span title={img.sources.join(', ')} className="truncate">{img.sources[0]}{img.sources.length > 1 ? ` +${img.sources.length - 1}` : ''}</span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <div className="flex-1 min-w-[260px]">
              <FormField label="Other image tag" description="Any image the offline host should have, e.g. vllm/vllm-openai:v0.28.1. It is pulled if it is not cached.">
                <Input value={extraInput} onChange={(e) => setExtraInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra(); } }} placeholder="repository/name:tag" aria-label="Other image tag" />
              </FormField>
            </div>
            <Button onClick={addExtra} disabled={!extraInput.trim()}>Add</Button>
          </div>
          {extraRefs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {extraRefs.map((r) => (
                <span key={r} className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 font-mono text-[11px]">
                  {r}
                  <button type="button" className="text-white/50 hover:text-white" aria-label={`Remove ${r}`} onClick={() => setExtraRefs((l) => l.filter((x) => x !== r))}>×</button>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Toggle
              checked={includeInfra}
              onChange={setIncludeInfra}
              label="Include infrastructure images"
              help={<>postgres, redis, prometheus… — needed only for a fresh install on the offline host.{imagesByRole.infra.length === 0 && ' (none configured)'}</>}
            />
            {includeInfra && <ImageSubList items={imagesByRole.infra} />}
          </div>
          <div className="space-y-1.5">
            <Toggle
              checked={includeProgram}
              onChange={setIncludeProgram}
              label="Include Cortex program images"
              help="Gateway, UI and their dependency images so the offline host can install or rebuild Cortex without internet."
            />
            {includeProgram && <ImageSubList items={[...imagesByRole.program, ...imagesByRole.deps]} />}
          </div>
        </section>

        <section className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-white/50">Models</div>
          {models.isError && <ErrorAlert title="Could not list models">{errMsg(models.error)}</ErrorAlert>}
          {models.isLoading && <div className="text-xs text-white/50">Loading models…</div>}
          {models.isSuccess && models.data.length === 0 && <EmptyState>No models are registered. Add one on the Models page first.</EmptyState>}
          {models.isSuccess && models.data.length > 0 && (
            <ModelPicker models={models.data} selected={selectedModels} onChange={setSelectedModels} planned={planData?.models ?? []} />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 pt-1">
            <Toggle checked={includeModelFiles} onChange={setIncludeModelFiles} label="Include model files" help="Copy the weights of the selected models. Turn off to ship only the configuration (the offline host must already have the files)." />
            <Toggle checked={includeDb} onChange={setIncludeDb} label="Include database dump" help="A pg_dump of the Cortex database: users, API keys, organisations and every model configuration. Restore it on the other host from Import → Advanced." />
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <Toggle
            checked={pullMissing}
            onChange={setPullMissing}
            label="Pull missing images from the internet"
            help={pullMissing ? 'Images that are not in the local Docker cache are downloaded first. Turn this off when this host is offline.' : 'Off: only cached images can be exported; a missing image stops the export before anything is written.'}
          />
          <FormField label="Notes (optional)" description="Stored in the bundle for whoever imports it.">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px]" placeholder="e.g. Weekly refresh for the lab cluster" />
          </FormField>
        </section>
      </Card>

      {/* ---------------------------------------------------------------- 3. Review */}
      <Card className="p-4 space-y-3">
        <StepHeader n={3} title="Review" hint="Live estimate; nothing is written until you start the export." />
        {!request && <EmptyState>Choose a destination first.</EmptyState>}
        {plan.isError && <ErrorAlert title="Cannot plan this export">{errMsg(plan.error)}</ErrorAlert>}
        {request && planData && (
          <div className={cn('space-y-3', plan.isFetching && 'opacity-70')} aria-busy={plan.isFetching}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <Stat label="Bundle" value={<span className="font-mono text-[12px] break-all">{planData.destination_host}/{planData.bundle_name}</span>} />
              <Stat
                label="Estimated size"
                value={<>{formatBytes(planData.estimated_bytes)}{planData.images.some((i) => i.size_bytes == null) && <span className="block text-[10px] font-normal text-amber-200">+ {planData.images.filter((i) => i.size_bytes == null).length} image(s) of unknown size (not cached yet)</span>}</>}
                tone={planData.sufficient ? 'default' : 'bad'}
              />
              <Stat label="Free at destination" value={formatBytes(planData.free_bytes)} tone={planData.sufficient ? 'ok' : 'bad'} />
              <Stat label="Contents" value={`${planData.images.length} image${planData.images.length === 1 ? '' : 's'} · ${planData.models.length} model${planData.models.length === 1 ? '' : 's'}${planData.db_dump ? ' · DB dump' : ''}`} />
            </div>
            {!planData.sufficient && (
              <ErrorAlert title="Not enough free space">
                The bundle needs about {formatBytes(planData.estimated_bytes)} (plus 10% headroom) but {planData.destination_host} has only {formatBytes(planData.free_bytes)} free. Pick another destination or remove items.
              </ErrorAlert>
            )}
            {nothingSelected && <InfoBox variant="warning">Nothing selected yet — pick at least one image, model or the database dump.</InfoBox>}
            {planData.warnings.length > 0 && (
              <InfoBox variant="warning" title="Warnings">
                <ul className="list-disc pl-5 space-y-0.5 text-[12px]">
                  {planData.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              </InfoBox>
            )}
            {planData.images.length > 0 && (
              <Table>
                <thead><tr><th>Image</th><th>Role</th><th>Size</th><th>Status</th></tr></thead>
                <tbody>
                  {planData.images.map((i) => (
                    <tr key={i.ref}>
                      <td className="font-mono text-[12px] break-all">{i.ref}</td>
                      <td className="text-[11px] text-white/60">{i.role}</td>
                      <td className="text-[12px]">{formatBytes(i.size_bytes)}</td>
                      <td><Badge variant={i.cached ? 'success' : pullMissing ? 'warning' : 'error'}>{i.cached ? 'cached' : pullMissing ? 'will be pulled' : 'missing'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {planData.models.length > 0 && (
              <Table>
                <thead><tr><th>Model</th><th>Served name</th><th>Engine image</th><th>Files</th></tr></thead>
                <tbody>
                  {planData.models.map((m) => (
                    <tr key={m.id}>
                      <td className="text-[12px]">{m.name}</td>
                      <td className="font-mono text-[12px]">{m.served_model_name}</td>
                      <td className="font-mono text-[11px] break-all">{m.engine_image}</td>
                      <td className="text-[12px]">{m.files_present ? (includeModelFiles ? formatBytes(m.size_bytes) : 'config only') : <span className="text-amber-200">no local files</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        )}
        {startError && <ErrorAlert title="Export could not start">{startError}</ErrorAlert>}
        <div className="flex items-center justify-end gap-3 pt-1">
          {plan.isFetching && <span className="text-[11px] text-white/40">Updating estimate…</span>}
          <Button variant="cyan" onClick={() => { if (request) start.mutate(request); }} disabled={blocked} aria-busy={start.isPending}>
            {start.isPending ? 'Starting…' : 'Start export'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ImageSubList({ items }: { items: ImageOption[] }) {
  if (items.length === 0) return <div className="text-[11px] text-white/40 px-1">Nothing to add — the gateway has no images configured for this group.</div>;
  return (
    <ul className="space-y-1 px-1">
      {items.map((i) => (
        <li key={i.ref} className="flex items-center gap-2 text-[11px]">
          <span className="font-mono text-white/80 break-all">{i.ref}</span>
          <Badge variant={i.cached ? 'success' : 'warning'}>{i.cached ? 'cached' : 'will be pulled'}</Badge>
          <span className="text-white/50">{formatBytes(i.size_bytes)}</span>
        </li>
      ))}
    </ul>
  );
}

function ModelPicker({ models, selected, onChange, planned }: {
  models: ModelItem[];
  selected: number[];
  onChange: (ids: number[]) => void;
  planned: { id: number; files_present: boolean; size_bytes?: number | null }[];
}) {
  const plannedById = React.useMemo(() => new Map(planned.map((p) => [p.id, p])), [planned]);
  const allSelected = models.length > 0 && models.every((m) => selected.includes(m.id));
  return (
    <Table>
      <thead>
        <tr>
          <th className="w-8"><input type="checkbox" aria-label="Select all models" className="accent-cyan-400" checked={allSelected} onChange={(e) => onChange(e.target.checked ? models.map((m) => m.id) : [])} /></th>
          <th>Name</th><th>Served name</th><th>Engine</th><th>Engine image</th><th>Local files</th>
        </tr>
      </thead>
      <tbody>
        {models.map((m) => {
          const on = selected.includes(m.id);
          const p = plannedById.get(m.id);
          return (
            <tr key={m.id} className={cn(on && 'bg-cyan-500/5')}>
              <td><input type="checkbox" className="accent-cyan-400" aria-label={`Select ${m.name}`} checked={on} onChange={(e) => onChange(toggleIn(selected, m.id, e.target.checked))} /></td>
              <td className="text-[12px]">{m.name}</td>
              <td className="font-mono text-[12px]">{m.served_model_name}</td>
              <td className="text-[11px] text-white/70">{m.engine_type}</td>
              <td className="font-mono text-[11px] text-white/70 break-all">{m.engine_image || <span className="text-white/40">pinned default</span>}</td>
              <td className="text-[12px]">
                {p ? (p.files_present ? <span className="text-emerald-200">yes · {formatBytes(p.size_bytes)}</span> : <span className="text-amber-200">no (online model)</span>)
                   : (m.local_path ? <span className="text-white/70">yes</span> : <span className="text-white/40">no (online model)</span>)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export default ExportWizard;

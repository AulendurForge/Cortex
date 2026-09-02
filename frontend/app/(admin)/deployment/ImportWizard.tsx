'use client';

import React from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, InfoBox, Input, Select, Table, FormField } from '@/components/UI';
import { ConfirmDialog } from '@/components/Confirm';
import { useToast } from '@/providers/ToastProvider';
import { cn } from '@/lib/cn';
import type { ApiError } from '@/lib/api-clients';
import {
  BundleOk, CONFLICT_STRATEGIES, ConflictStrategy, DbDumpInfo, ImportArtifactsSchema, ImportRequest, JobController, QK, ScanResult,
  errMsg, fetchDbDumpInfo, formatBytes, isBundleOk, isScanModelOk, relativeTime, scanBundle, startDbRestore, startImport, useLocations,
} from './api';
import { JobProgress } from './JobProgress';
import { EmptyState, ErrorAlert, Stat, StepHeader, Toggle } from './Steps';

function toggleIn<T>(list: T[], v: T, on: boolean): T[] {
  if (on) return list.includes(v) ? list : [...list, v];
  return list.filter((x) => x !== v);
}

export function ImportWizard({ ctl }: { ctl: JobController }) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const locations = useLocations();

  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [manualPath, setManualPath] = React.useState('');
  const [imageSel, setImageSel] = React.useState<string[]>([]);
  const [modelSel, setModelSel] = React.useState<string[]>([]);
  const [conflict, setConflict] = React.useState<ConflictStrategy>('rename');
  const [verify, setVerify] = React.useState(false);
  const [copyFiles, setCopyFiles] = React.useState(true);
  const [startError, setStartError] = React.useState<string | null>(null);

  const scan = useMutation<ScanResult, ApiError, string>({
    mutationFn: (path) => scanBundle(path, false),
    onSuccess: (res) => {
      setImageSel(res.images.map((i) => i.ref));
      setModelSel(res.models.filter(isScanModelOk).map((m) => m.served_model_name));
      setStartError(null);
    },
  });
  const scanned = scan.data ?? null;

  const start = useMutation({
    mutationFn: (req: ImportRequest) => startImport(req),
    onSuccess: (job) => {
      setStartError(null);
      ctl.claimJob(job.id);
      qc.setQueryData(QK.status, job);
      qc.invalidateQueries({ queryKey: QK.status });
      addToast({ title: 'Import started', kind: 'success' });
    },
    onError: (e: unknown) => setStartError(errMsg(e)),
  });

  const groups = React.useMemo(() => {
    const out: { host_path: string; bundles: BundleOk[]; broken: { path: string; host_path: string; error: string }[] }[] = [];
    for (const root of locations.data ?? []) {
      const entries = [root, ...root.children];
      for (const e of entries) {
        if (e.bundles.length === 0) continue;
        out.push({ host_path: e.host_path, bundles: e.bundles.filter(isBundleOk), broken: e.bundles.filter((b) => !isBundleOk(b)) as { path: string; host_path: string; error: string }[] });
      }
    }
    return out;
  }, [locations.data]);
  const bundleCount = groups.reduce((n, g) => n + g.bundles.length, 0);

  const pathToScan = manualPath.trim() || selectedPath;

  // Derived review numbers
  const okModels = React.useMemo(() => (scanned?.models ?? []).filter(isScanModelOk), [scanned]);
  const selectedModels = okModels.filter((m) => modelSel.includes(m.served_model_name));
  const selectedImages = (scanned?.images ?? []).filter((i) => imageSel.includes(i.ref));
  const bytesToCopy = copyFiles ? selectedModels.filter((m) => m.files_in_bundle && !m.files_present_on_host).reduce((n, m) => n + m.size_bytes, 0) : 0;
  const bytesToLoad = selectedImages.filter((i) => !i.already_loaded && i.file_present).reduce((n, i) => n + i.file_bytes, 0);
  const modelsDirShort = scanned ? scanned.models_dir_free_bytes < bytesToCopy : false;
  const dockerShort = scanned?.docker_free_bytes != null ? scanned.docker_free_bytes < bytesToLoad : false;
  const needsWritableModelsDir = bytesToCopy > 0 && scanned != null && !scanned.models_dir_writable;
  const conflicts = selectedModels.filter((m) => m.already_registered);
  const blocked = !scanned || ctl.busy || start.isPending || (selectedModels.length === 0 && selectedImages.length === 0) || modelsDirShort || (conflict === 'error' && conflicts.length > 0);

  const myJob = ctl.job && ctl.job.id === ctl.claimedJobId && ctl.job.job_type === 'bundle_import' ? ctl.job : null;
  const results = myJob?.status === 'completed' ? ImportArtifactsSchema.safeParse(myJob.artifacts) : null;

  const doStart = () => {
    if (!scanned) return;
    start.mutate({
      path: scanned.path,
      load_images: selectedImages.length > 0,
      image_refs: selectedImages.map((i) => i.ref),
      import_models: selectedModels.length > 0,
      served_model_names: selectedModels.map((m) => m.served_model_name),
      copy_files: copyFiles,
      conflict,
      verify_checksums: verify,
    });
  };

  return (
    <div className="space-y-6">
      {ctl.busy && !myJob && (
        <InfoBox variant="warning" title="Another job is running">
          Starting an import is blocked until the current job finishes or is cancelled.
        </InfoBox>
      )}

      {myJob ? (
        <div className="space-y-4">
          <StepHeader n={3} title="Import" hint="Images are loaded into Docker, model files are copied into the models directory and the models are registered." done={myJob.status === 'completed'} />
          <JobProgress
            job={myJob}
            onCancel={ctl.cancel}
            cancelling={ctl.cancelling}
            onDismiss={() => { ctl.releaseJob(); scan.reset(); qc.invalidateQueries({ queryKey: ['models'] }); }}
            dismissLabel="Import another bundle"
          >
            <InfoBox variant="emerald" title="Import finished">
              {results?.success ? <ImportResults r={results.data} /> : <div className="text-[12px]">Done. Open the Models page to start the imported models.</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/models" className="btn btn-cyan btn-sm">Go to Models →</Link>
              </div>
            </InfoBox>
          </JobProgress>
        </div>
      ) : (
        <>
          {/* ---------------------------------------------------------- 1. Pick */}
          <Card className="p-4">
            <StepHeader n={1} title="Pick a bundle" hint={<>Bundles are folders containing <code>bundle.json</code>. Plug in the drive, mount it under <code>/media</code> or <code>/mnt</code> on the host, then refresh.</>} done={!!scanned} />
            <div className="flex items-center justify-end mb-2">
              <Button size="sm" onClick={() => locations.refetch()} disabled={locations.isFetching}>{locations.isFetching ? 'Refreshing…' : 'Refresh'}</Button>
            </div>
            {locations.isError && <ErrorAlert title="Could not list locations">{errMsg(locations.error)}</ErrorAlert>}
            {locations.isLoading && <div className="text-xs text-white/50">Looking for bundles…</div>}
            {locations.isSuccess && bundleCount === 0 && groups.every((g) => g.broken.length === 0) && (
              <EmptyState>
                No bundles found in the exports directory or on any mounted drive. Mount the drive that holds the bundle (<code>sudo mount /dev/sdX1 /media/usb</code>) and refresh, or type the bundle path below.
              </EmptyState>
            )}
            <div role="radiogroup" aria-label="Bundles" className="space-y-3">
              {groups.map((g) => (
                <div key={g.host_path}>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-white/40 mb-1 font-mono">{g.host_path}</div>
                  <div className="space-y-1.5">
                    {g.bundles.map((b) => {
                      const active = selectedPath === b.path && !manualPath.trim();
                      return (
                        <label key={b.path} className={cn('flex items-start gap-3 rounded-xl border px-3 py-2 cursor-pointer transition-colors', active ? 'border-cyan-400/40 bg-cyan-500/10' : 'border-white/10 hover:bg-white/[0.05]')}>
                          <input type="radio" name="bundle" className="mt-1 accent-cyan-400" checked={active} onChange={() => { setSelectedPath(b.path); setManualPath(''); }} />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm text-white/90">{b.name}</span>
                              <span className="text-[11px] text-white/50">{formatBytes(b.size_bytes)}</span>
                            </span>
                            <span className="block text-[11px] text-white/50 mt-0.5">
                              created {relativeTime(b.created_at)}{b.source_host && <> on <span className="text-white/70">{b.source_host}</span></>}{b.cortex_version && <> · Cortex {b.cortex_version}</>}
                            </span>
                            <span className="flex flex-wrap gap-1.5 mt-1.5">
                              <Badge>{b.images} image{b.images === 1 ? '' : 's'}</Badge>
                              <Badge>{b.models} model{b.models === 1 ? '' : 's'}</Badge>
                              {b.program && <Badge variant="info">program</Badge>}
                              {b.db_dump && <Badge variant="warning">db dump</Badge>}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    {g.broken.map((b) => (
                      <div key={b.path} className="flex items-start gap-3 rounded-xl border border-red-500/20 px-3 py-2 opacity-70">
                        <span className="min-w-0">
                          <span className="font-mono text-sm text-white/70 break-all">{b.host_path}</span>
                          <span className="block text-[11px] text-red-200">{b.error}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="flex-1 min-w-[280px]">
                <FormField label="Or type a bundle path" description="Container path of the bundle folder, e.g. /host/media/usb/cortex-bundle-20260901-1200 (the exports dir and /host/media, /host/mnt, /host/run/media are allowed).">
                  <Input value={manualPath} onChange={(e) => setManualPath(e.target.value)} placeholder="/host/media/usb/cortex-bundle-…" aria-label="Bundle path" />
                </FormField>
              </div>
              <Button variant="cyan" onClick={() => { if (pathToScan) scan.mutate(pathToScan); }} disabled={!pathToScan || scan.isPending} aria-busy={scan.isPending}>
                {scan.isPending ? 'Scanning…' : 'Scan'}
              </Button>
            </div>
            {scan.isError && <div className="mt-3"><ErrorAlert title="Scan failed">{errMsg(scan.error)}</ErrorAlert></div>}
          </Card>

          {/* ---------------------------------------------------------- 2. Review */}
          {scanned && (
            <Card className="p-4 space-y-4">
              <StepHeader n={2} title="Review contents" hint={<>Bundle at <span className="font-mono">{scanned.host_path}</span>, created {relativeTime(scanned.bundle.created_at)}{scanned.bundle.source_host && <> on {scanned.bundle.source_host}</>}{scanned.bundle.cortex_version && <> with Cortex {scanned.bundle.cortex_version}</>}.{scanned.bundle.notes && <> Notes: <em>{scanned.bundle.notes}</em></>}</>} />

              <section className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider font-bold text-white/50">Images</div>
                {scanned.images.length === 0 ? <EmptyState>This bundle contains no images.</EmptyState> : (
                  <Table>
                    <thead>
                      <tr>
                        <th className="w-8"><input type="checkbox" aria-label="Select all images" className="accent-cyan-400" checked={imageSel.length === scanned.images.length} onChange={(e) => setImageSel(e.target.checked ? scanned.images.map((i) => i.ref) : [])} /></th>
                        <th>Image</th><th>Role</th><th>Size</th><th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanned.images.map((i) => (
                        <tr key={i.ref}>
                          <td><input type="checkbox" className="accent-cyan-400" aria-label={`Select ${i.ref}`} checked={imageSel.includes(i.ref)} disabled={!i.file_present} onChange={(e) => setImageSel((l) => toggleIn(l, i.ref, e.target.checked))} /></td>
                          <td className="font-mono text-[12px] break-all">{i.ref}</td>
                          <td className="text-[11px] text-white/60">{i.role}</td>
                          <td className="text-[12px]">{formatBytes(i.tar_bytes ?? i.file_bytes)}</td>
                          <td>
                            {i.already_loaded ? <Badge variant="success">already loaded</Badge> : !i.file_present ? <Badge variant="error">file missing</Badge> : <Badge variant="info">will load</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </section>

              <section className="space-y-2">
                <div className="text-[10px] uppercase tracking-wider font-bold text-white/50">Models</div>
                {scanned.models.length === 0 ? <EmptyState>This bundle contains no models.</EmptyState> : (
                  <Table>
                    <thead>
                      <tr>
                        <th className="w-8"><input type="checkbox" aria-label="Select all models" className="accent-cyan-400" checked={okModels.length > 0 && modelSel.length === okModels.length} onChange={(e) => setModelSel(e.target.checked ? okModels.map((m) => m.served_model_name) : [])} /></th>
                        <th>Served name</th><th>Engine</th><th>Engine image</th><th>Files</th><th>Engine image available</th><th>Registered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanned.models.map((m) => {
                        if (!isScanModelOk(m)) {
                          return (
                            <tr key={m.served_model_name} className="opacity-70">
                              <td><input type="checkbox" disabled aria-label={`Select ${m.served_model_name}`} /></td>
                              <td className="font-mono text-[12px]">{m.served_model_name}</td>
                              <td colSpan={5} className="text-[11px] text-red-200">{m.error}</td>
                            </tr>
                          );
                        }
                        const imgAvailable = m.engine_image_loaded || (m.engine_image_in_bundle && !!m.engine_image && imageSel.includes(m.engine_image));
                        const files = m.files_present_on_host ? { text: 'already on host', v: 'success' as const }
                          : m.files_in_bundle ? { text: `in bundle · ${formatBytes(m.size_bytes)}`, v: 'info' as const }
                          : m.mode === 'online' ? { text: 'online (downloads from HF)', v: 'warning' as const }
                          : { text: 'missing', v: 'error' as const };
                        return (
                          <tr key={m.served_model_name}>
                            <td><input type="checkbox" className="accent-cyan-400" aria-label={`Select ${m.served_model_name}`} checked={modelSel.includes(m.served_model_name)} onChange={(e) => setModelSel((l) => toggleIn(l, m.served_model_name, e.target.checked))} /></td>
                            <td className="font-mono text-[12px]">{m.served_model_name}{m.name && m.name !== m.served_model_name && <span className="block text-[10px] text-white/50 font-sans">{m.name}</span>}</td>
                            <td className="text-[11px] text-white/70">{m.engine_type ?? '—'}</td>
                            <td className="font-mono text-[11px] break-all">{m.engine_image ?? '—'}</td>
                            <td><Badge variant={files.v}>{files.text}</Badge></td>
                            <td><Badge variant={imgAvailable ? 'success' : 'warning'}>{imgAvailable ? 'yes' : 'no'}</Badge></td>
                            <td>
                              {m.already_registered
                                ? <Badge variant="warning" title={`existing model id ${m.existing_model_id ?? '?'}`}>conflict → {conflict}</Badge>
                                : <Badge variant="success">new</Badge>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )}
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <FormField label="If a model is already registered" description={CONFLICT_STRATEGIES.find((c) => c.value === conflict)?.help}>
                  <Select value={conflict} onChange={(e) => setConflict(e.target.value as ConflictStrategy)} aria-label="Conflict strategy">
                    {CONFLICT_STRATEGIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </Select>
                </FormField>
                <div className="space-y-2">
                  <Toggle checked={copyFiles} onChange={setCopyFiles} label="Copy model files into the models directory" help="Off: register the models only (their files must already be on this host)." />
                  <Toggle checked={verify} onChange={setVerify} label="Verify checksums first" help="Reads every file in the bundle once and compares it with checksums.sha256. Safe but slow for big bundles (tens of GB take minutes)." />
                </div>
              </section>

              <section className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <Stat label="Model files to copy" value={formatBytes(bytesToCopy)} tone={modelsDirShort ? 'bad' : 'default'} />
                <Stat label="Models dir free" value={formatBytes(scanned.models_dir_free_bytes)} tone={modelsDirShort ? 'bad' : 'ok'} />
                <Stat label="Images to load" value={formatBytes(bytesToLoad)} tone={dockerShort ? 'bad' : 'default'} />
                <Stat label="Docker free" value={scanned.docker_free_bytes == null ? 'unknown' : formatBytes(scanned.docker_free_bytes)} tone={dockerShort ? 'bad' : scanned.docker_free_bytes == null ? 'warn' : 'ok'} />
              </section>

              {modelsDirShort && <ErrorAlert title="Not enough space in the models directory">Free {formatBytes(scanned.models_dir_free_bytes)}, needed {formatBytes(bytesToCopy)}. Deselect models or free space.</ErrorAlert>}
              {dockerShort && <InfoBox variant="warning" title="Docker may run out of space">Loading the selected images needs about {formatBytes(bytesToLoad)} but /var/lib/docker has {formatBytes(scanned.docker_free_bytes)} free. Run <code>docker image prune</code> or deselect images.</InfoBox>}
              {needsWritableModelsDir && (
                <ErrorAlert title="Models directory is not writable by the gateway">
                  Model files cannot be copied. Fix the permissions on the host (the exact command is shown when you start the import) or turn off &quot;Copy model files&quot;.
                </ErrorAlert>
              )}
              {conflict === 'error' && conflicts.length > 0 && (
                <ErrorAlert title="Conflicts">{conflicts.map((m) => m.served_model_name).join(', ')} already registered — choose Rename, Skip or Replace.</ErrorAlert>
              )}
              {selectedModels.some((m) => !m.engine_image_loaded && !(m.engine_image_in_bundle && !!m.engine_image && imageSel.includes(m.engine_image))) && (
                <InfoBox variant="warning" title="Engine image missing">
                  Some selected models need an engine image that is neither loaded on this host nor selected from the bundle; they will import but cannot start until the image is available.
                </InfoBox>
              )}
              {scanned.db_dump && (
                <InfoBox variant="indigo" title="This bundle also contains a database dump">
                  It is not restored by the import. Use <strong>Advanced: restore database from bundle</strong> below if you want it.
                </InfoBox>
              )}

              {startError && <ErrorAlert title="Import could not start">{startError}</ErrorAlert>}
              <div className="flex items-center justify-end gap-3 pt-1">
                <span className="text-[11px] text-white/50">{selectedImages.length} image{selectedImages.length === 1 ? '' : 's'} · {selectedModels.length} model{selectedModels.length === 1 ? '' : 's'} selected</span>
                <Button variant="cyan" onClick={doStart} disabled={blocked} aria-busy={start.isPending}>{start.isPending ? 'Starting…' : 'Start import'}</Button>
              </div>
            </Card>
          )}
        </>
      )}

      <DatabaseRestore ctl={ctl} bundlePath={scanned?.path ?? null} open={!!scanned?.db_dump} />
    </div>
  );
}

function ImportResults({ r }: { r: { images: { ref: string; status: 'present' | 'loaded' | 'missing_file'; tags?: string[] }[]; models: { served_model_name: string; status: 'created' | 'skipped' | 'replaced' | 'skipped_running'; model_id: number }[]; db_dump_available: boolean } }) {
  const imgBadge = { present: 'success', loaded: 'success', missing_file: 'error' } as const;
  const imgText = { present: 'already present', loaded: 'loaded', missing_file: 'file missing' } as const;
  const mBadge = { created: 'success', replaced: 'info', skipped: 'warning', skipped_running: 'warning' } as const;
  const mText = { created: 'created', replaced: 'replaced', skipped: 'skipped (already registered)', skipped_running: 'skipped (running)' } as const;
  return (
    <div className="space-y-2 text-[12px]">
      {r.images.length > 0 && (
        <ul className="space-y-0.5">
          {r.images.map((i) => (
            <li key={i.ref} className="flex flex-wrap items-center gap-2"><span className="font-mono">{i.ref}</span><Badge variant={imgBadge[i.status]}>{imgText[i.status]}</Badge></li>
          ))}
        </ul>
      )}
      {r.models.length > 0 && (
        <ul className="space-y-0.5">
          {r.models.map((m) => (
            <li key={`${m.served_model_name}-${m.model_id}`} className="flex flex-wrap items-center gap-2">
              <span className="font-mono">{m.served_model_name}</span>
              <Badge variant={mBadge[m.status]}>{mText[m.status]}</Badge>
              <span className="text-white/60">model id {m.model_id}</span>
            </li>
          ))}
        </ul>
      )}
      {r.images.length === 0 && r.models.length === 0 && <div>Nothing was imported.</div>}
      {r.db_dump_available && <div className="text-white/70">The bundle also contains a database dump — see <strong>Advanced: restore database from bundle</strong> below.</div>}
      <div className="text-white/70">Imported models are stopped; start them from the Models page.</div>
    </div>
  );
}

/** Destructive, kept separate from the import: restores db/cortex.sql of a bundle over the live database. */
function DatabaseRestore({ ctl, bundlePath, open }: { ctl: JobController; bundlePath: string | null; open: boolean }) {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const [expanded, setExpanded] = React.useState(open);
  const [path, setPath] = React.useState(bundlePath ?? '');
  const [backupFirst, setBackupFirst] = React.useState(true);
  const [dropExisting, setDropExisting] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const [startError, setStartError] = React.useState<string | null>(null);

  React.useEffect(() => { if (open) setExpanded(true); }, [open]);
  React.useEffect(() => { if (bundlePath) { setPath(bundlePath); check.reset(); } /* eslint-disable-line react-hooks/exhaustive-deps */ }, [bundlePath]);

  const check = useMutation<DbDumpInfo, ApiError, string>({ mutationFn: (p) => fetchDbDumpInfo(p) });
  const restore = useMutation({
    mutationFn: () => startDbRestore({ output_dir: path.trim(), backup_first: backupFirst, drop_existing: dropExisting }),
    onSuccess: (job) => {
      setConfirm(false);
      setStartError(null);
      ctl.claimJob(job.id);
      qc.setQueryData(QK.status, job);
      qc.invalidateQueries({ queryKey: QK.status });
      addToast({ title: 'Database restore started', kind: 'success' });
    },
    onError: (e: unknown) => setStartError(errMsg(e)),
  });

  const myJob = ctl.job && ctl.job.id === ctl.claimedJobId && ctl.job.job_type === 'db_restore' ? ctl.job : null;
  const info = check.data ?? null;

  return (
    <Card className="p-4 border-amber-500/20">
      <button type="button" className="w-full flex items-center justify-between gap-3 text-left" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <div>
          <div className="text-sm font-bold uppercase tracking-wider text-amber-200">Advanced: restore database from bundle</div>
          <div className="text-[11px] text-white/50 mt-0.5">Replaces users, API keys, organisations and model registrations on this host with the dump in <code>db/cortex.sql</code>. Destructive.</div>
        </div>
        <span className="text-white/50 text-xs">{expanded ? 'Hide' : 'Show'}</span>
      </button>
      {expanded && (
        <div className="mt-4 space-y-3">
          {myJob ? (
            <JobProgress job={myJob} onCancel={ctl.cancel} cancelling={ctl.cancelling} onDismiss={() => { ctl.releaseJob(); qc.invalidateQueries(); }} dismissLabel="Close">
              <InfoBox variant="emerald" title="Database restored">
                Reload the page; if your session was replaced by the dump, log in again with the credentials from the source host.
              </InfoBox>
            </JobProgress>
          ) : (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[280px]">
                  <FormField label="Bundle folder (container path)" description="The folder that contains db/cortex.sql.">
                    <Input value={path} onChange={(e) => { setPath(e.target.value); check.reset(); }} placeholder="/host/media/usb/cortex-bundle-…" aria-label="Bundle folder for database restore" />
                  </FormField>
                </div>
                <Button onClick={() => check.mutate(path.trim())} disabled={!path.trim() || check.isPending}>{check.isPending ? 'Checking…' : 'Check dump'}</Button>
              </div>
              {check.isError && <ErrorAlert title="Could not check the dump">{errMsg(check.error)}</ErrorAlert>}
              {info && !info.exists && <ErrorAlert>No <code>db/cortex.sql</code> found in that folder.</ErrorAlert>}
              {info?.exists && (
                <InfoBox variant="blue">
                  Found <code>{info.path}</code> — {formatBytes(info.size_bytes)}{info.modified_at && <>, written {relativeTime(info.modified_at)}</>}.
                </InfoBox>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                <Toggle checked={backupFirst} onChange={setBackupFirst} label="Back up the current database first" help="Recommended. A pg_dump of the live database is written next to the gateway's exports before anything is changed." />
                <Toggle checked={dropExisting} onChange={setDropExisting} label="Drop existing tables before restoring" help="Clean restore: every current table is dropped first. Leave off to layer the dump over the existing data." />
              </div>
              {startError && <ErrorAlert title="Restore could not start">{startError}</ErrorAlert>}
              <div className="flex justify-end">
                <Button variant="danger" onClick={() => setConfirm(true)} disabled={!info?.exists || ctl.busy || restore.isPending}>Restore database…</Button>
              </div>
              <ConfirmDialog
                open={confirm}
                danger
                title="Restore the database?"
                confirmLabel="Yes, restore"
                pending={restore.isPending}
                pendingLabel="Starting…"
                error={startError}
                onClose={() => setConfirm(false)}
                onConfirm={() => restore.mutate()}
                description={
                  <ul className="list-disc pl-5 space-y-1">
                    <li>The live database is replaced with <code>{path.trim()}/db/cortex.sql</code>: users, API keys, organisations and model registrations from the source host.</li>
                    <li>{dropExisting ? 'All existing tables are DROPPED first.' : 'Existing tables are kept and the dump is applied over them.'}</li>
                    <li>{backupFirst ? 'A backup of the current database is taken first.' : 'No backup is taken — this cannot be undone.'}</li>
                    <li>You may have to log in again afterwards.</li>
                  </ul>
                }
              />
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export default ImportWizard;

import React from 'react';
import { z } from 'zod';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import apiFetch, { ApiError } from '../../../src/lib/api-clients';
import { ModelItem, ModelListSchema } from '../../../src/lib/validators';

// ---------------------------------------------------------------------------
// Zod schemas for /admin/bundles (+ the database-restore endpoints it reuses)
// ---------------------------------------------------------------------------

const nStr = () => z.string().nullable().optional();
const nNum = () => z.number().nullable().optional();

export const BundleSummarySchema = z.union([
  z.object({ path: z.string(), host_path: z.string(), error: z.string() }),
  z.object({
    path: z.string(),
    host_path: z.string(),
    name: z.string(),
    created_at: nStr(),
    source_host: nStr(),
    cortex_version: nStr(),
    images: z.number(),
    models: z.number(),
    program: z.boolean(),
    db_dump: z.boolean(),
    size_bytes: nNum(),
  }),
]);
export type BundleSummary = z.infer<typeof BundleSummarySchema>;
export type BundleOk = Extract<BundleSummary, { name: string }>;
export function isBundleOk(b: BundleSummary): b is BundleOk {
  return !('error' in b);
}

export const LocationChildSchema = z.object({
  path: z.string(),
  host_path: z.string(),
  writable: z.boolean(),
  free_bytes: z.number(),
  bundles: z.array(BundleSummarySchema),
});
export const LocationSchema = LocationChildSchema.extend({
  exists: z.boolean(),
  children: z.array(LocationChildSchema),
});
export const LocationsResponseSchema = z.object({ locations: z.array(LocationSchema) });
export type LocationChild = z.infer<typeof LocationChildSchema>;
export type Location = z.infer<typeof LocationSchema>;

export const ImageRoleSchema = z.enum(['engine', 'infra', 'program', 'deps']);
export type ImageRole = z.infer<typeof ImageRoleSchema>;
export const ImageOptionSchema = z.object({
  ref: z.string(),
  role: ImageRoleSchema,
  sources: z.array(z.string()),
  cached: z.boolean(),
  size_bytes: nNum(),
});
export type ImageOption = z.infer<typeof ImageOptionSchema>;
export const ImagesResponseSchema = z.object({ images: z.array(ImageOptionSchema) });

export type ExportRequest = {
  destination: string;
  name?: string;
  image_refs: string[];
  include_infra_images: boolean;
  include_program_images: boolean;
  model_ids: number[];
  include_model_files: boolean;
  include_db_dump: boolean;
  pull_missing: boolean;
  notes?: string;
};

export const PlanImageSchema = z.object({ ref: z.string(), role: z.string(), cached: z.boolean(), size_bytes: nNum() });
export const PlanModelSchema = z.object({
  id: z.number(),
  name: z.string(),
  served_model_name: z.string(),
  engine_type: z.string(),
  engine_image: z.string(),
  local_path: nStr(),
  files_present: z.boolean(),
  size_bytes: nNum(),
});
export const ExportPlanSchema = z.object({
  destination: z.string(),
  destination_host: z.string(),
  bundle_name: z.string(),
  images: z.array(PlanImageSchema),
  models: z.array(PlanModelSchema),
  db_dump: z.boolean(),
  estimated_bytes: z.number(),
  free_bytes: z.number(),
  sufficient: z.boolean(),
  missing_images: z.array(z.string()),
  pull_missing: z.boolean(),
  warnings: z.array(z.string()),
});
export type ExportPlan = z.infer<typeof ExportPlanSchema>;

export const JobStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatusSchema>;
export const JobSchema = z.object({
  id: z.string(),
  status: JobStatusSchema,
  started_at: z.number(),
  finished_at: nNum(),
  step: z.string().nullable().optional().transform((v) => v ?? ''),
  progress: z.number().nullable().optional().transform((v) => v ?? 0),
  logs: z.array(z.string()).nullable().optional().transform((v) => v ?? []),
  output_dir: z.string().nullable().optional().transform((v) => v ?? ''),
  artifacts: z.record(z.unknown()).nullable().optional(),
  error: nStr(),
  job_type: z.string(),
  cancelled: z.boolean().nullable().optional().transform((v) => v ?? false),
  estimated_size_bytes: z.number().nullable().optional().transform((v) => v ?? 0),
  bytes_written: z.number().nullable().optional().transform((v) => v ?? 0),
  eta_seconds: nNum(),
});
export type Job = z.infer<typeof JobSchema>;
export const JobStatusResponseSchema = z.object({ job: JobSchema.nullable() });

export const ExportArtifactsSchema = z.object({
  bundle_dir: z.string(),
  bundle_host_dir: z.string(),
  images: z.number(),
  models: z.number(),
  size_bytes: z.number(),
});
export type ExportArtifacts = z.infer<typeof ExportArtifactsSchema>;

export const ImportArtifactsSchema = z.object({
  images: z.array(z.object({ ref: z.string(), status: z.enum(['present', 'loaded', 'missing_file']), tags: z.array(z.string()).optional() })),
  models: z.array(z.object({ served_model_name: z.string(), status: z.enum(['created', 'skipped', 'replaced', 'skipped_running']), model_id: z.number() })),
  db_dump_available: z.boolean(),
});
export type ImportArtifacts = z.infer<typeof ImportArtifactsSchema>;

export const ScanImageSchema = z.object({
  ref: z.string(),
  role: z.string().nullable().optional().transform((v) => v ?? 'engine'),
  file: z.string().nullable().optional(),
  size_bytes: nNum(),
  tar_bytes: nNum(),
  sha256: nStr(),
  file_present: z.boolean(),
  file_bytes: z.number(),
  already_loaded: z.boolean(),
  local_id: nStr(),
});
export type ScanImage = z.infer<typeof ScanImageSchema>;
export const ScanModelSchema = z.union([
  z.object({ served_model_name: z.string(), error: z.string() }),
  z.object({
    served_model_name: z.string(),
    name: nStr(),
    engine_type: nStr(),
    engine_image: nStr(),
    local_path: nStr(),
    mode: nStr(),
    files_in_bundle: z.boolean(),
    file_count: z.number(),
    size_bytes: z.number(),
    files_present_on_host: z.boolean(),
    already_registered: z.boolean(),
    existing_model_id: nNum(),
    engine_image_loaded: z.boolean(),
    engine_image_in_bundle: z.boolean(),
  }),
]);
export type ScanModel = z.infer<typeof ScanModelSchema>;
export type ScanModelOk = Extract<ScanModel, { files_in_bundle: boolean }>;
export function isScanModelOk(m: ScanModel): m is ScanModelOk {
  return !('error' in m);
}
export const ScanResultSchema = z.object({
  path: z.string(),
  host_path: z.string(),
  bundle: z.object({
    schema_version: z.number().optional(),
    kind: z.string().optional(),
    created_at: nStr(),
    cortex_version: nStr(),
    source_host: nStr(),
    notes: nStr(),
    engine_defaults: z.record(z.string()).nullable().optional(),
    size_bytes: nNum(),
  }),
  images: z.array(ScanImageSchema),
  models: z.array(ScanModelSchema),
  db_dump: z.boolean(),
  models_dir_writable: z.boolean(),
  models_dir_free_bytes: z.number(),
  docker_free_bytes: nNum(),
  estimated_bytes_needed: z.number(),
  checksums: z.object({
    verified: z.boolean().optional(),
    ok: z.number().optional(),
    bad: z.array(z.string()).optional(),
    missing: z.array(z.string()).optional(),
    reason: z.string().optional(),
  }).passthrough(),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

export const ConflictStrategySchema = z.enum(['rename', 'skip', 'replace', 'error']);
export type ConflictStrategy = z.infer<typeof ConflictStrategySchema>;
export const CONFLICT_STRATEGIES: { value: ConflictStrategy; label: string; help: string }[] = [
  { value: 'rename', label: 'Rename', help: 'Register the model under a new served name (e.g. "llama-2") and keep the existing one.' },
  { value: 'skip', label: 'Skip', help: 'Leave models that are already registered untouched.' },
  { value: 'replace', label: 'Replace', help: 'Overwrite the existing model configuration (running models are left alone).' },
  { value: 'error', label: 'Stop on conflict', help: 'Refuse to import if any model in the bundle is already registered.' },
];

export type ImportRequest = {
  path: string;
  load_images: boolean;
  image_refs: string[] | null;
  import_models: boolean;
  served_model_names: string[] | null;
  copy_files: boolean;
  conflict: ConflictStrategy;
  verify_checksums: boolean;
};

export const DbDumpInfoSchema = z.object({
  exists: z.boolean(),
  path: z.string().optional(),
  size_bytes: nNum(),
  modified_at: nStr(),
  error: nStr(),
});
export type DbDumpInfo = z.infer<typeof DbDumpInfoSchema>;

export type DbRestoreRequest = { output_dir: string; backup_first: boolean; drop_existing: boolean };

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Decimal units (1 GB = 1e9 bytes), matching the sizes the gateway logs. */
export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 0) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} KB`;
  return `${Math.round(n)} B`;
}

/** Accepts ISO strings or epoch seconds/milliseconds. */
export function toMillis(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function relativeTime(v: string | number | null | undefined, now: number = Date.now()): string {
  const t = toMillis(v);
  if (t == null) return '—';
  const diff = Math.round((now - t) / 1000);
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? 'ago' : 'from now';
  if (abs < 45) return 'just now';
  if (abs < 3600) return `${Math.round(abs / 60)} min ${suffix}`;
  if (abs < 86400) return `${Math.round(abs / 3600)} h ${suffix}`;
  if (abs < 30 * 86400) {
    const d = Math.round(abs / 86400);
    return `${d} day${d === 1 ? '' : 's'} ${suffix}`;
  }
  return new Date(t).toLocaleDateString();
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function errMsg(e: unknown): string {
  const a = e as Partial<ApiError> | undefined;
  if (a && typeof a.message === 'string' && a.message) return a.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

export const JOB_TYPE_LABELS: Record<string, string> = {
  bundle_export: 'Export',
  bundle_import: 'Import',
  db_restore: 'Database restore',
};
export function jobTypeLabel(t: string): string {
  return JOB_TYPE_LABELS[t] ?? t;
}
export function isJobActive(job: Job | null | undefined): boolean {
  return !!job && (job.status === 'running' || job.status === 'pending');
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function fetchLocations(): Promise<Location[]> {
  return LocationsResponseSchema.parse(await apiFetch<unknown>('/admin/bundles/locations')).locations;
}
export async function fetchImages(): Promise<ImageOption[]> {
  return ImagesResponseSchema.parse(await apiFetch<unknown>('/admin/bundles/images')).images;
}
export async function fetchModels(): Promise<ModelItem[]> {
  return ModelListSchema.parse(await apiFetch<unknown>('/admin/models'));
}
export async function fetchPlan(req: ExportRequest): Promise<ExportPlan> {
  return ExportPlanSchema.parse(await apiFetch<unknown>('/admin/bundles/plan', { method: 'POST', body: JSON.stringify(req) }));
}
export async function startExport(req: ExportRequest): Promise<Job> {
  return JobSchema.parse(await apiFetch<unknown>('/admin/bundles/export', { method: 'POST', body: JSON.stringify(req) }));
}
export async function scanBundle(path: string, verify = false): Promise<ScanResult> {
  const q = new URLSearchParams({ path, verify: verify ? 'true' : 'false' });
  return ScanResultSchema.parse(await apiFetch<unknown>(`/admin/bundles/scan?${q.toString()}`));
}
export async function startImport(req: ImportRequest): Promise<Job> {
  return JobSchema.parse(await apiFetch<unknown>('/admin/bundles/import', { method: 'POST', body: JSON.stringify(req) }));
}
export async function fetchJobStatus(): Promise<Job | null> {
  return JobStatusResponseSchema.parse(await apiFetch<unknown>('/admin/bundles/status')).job;
}
export async function cancelJob(): Promise<void> {
  await apiFetch<unknown>('/admin/bundles/cancel', { method: 'POST' });
}
export async function fetchDbDumpInfo(outputDir: string): Promise<DbDumpInfo> {
  const q = new URLSearchParams({ output_dir: outputDir });
  return DbDumpInfoSchema.parse(await apiFetch<unknown>(`/admin/deployment/database-dump?${q.toString()}`));
}
export async function startDbRestore(req: DbRestoreRequest): Promise<Job> {
  return JobSchema.parse(await apiFetch<unknown>('/admin/deployment/restore-database', { method: 'POST', body: JSON.stringify(req) }));
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const QK = {
  locations: ['bundles', 'locations'] as const,
  images: ['bundles', 'images'] as const,
  models: ['bundles', 'models'] as const,
  status: ['bundles', 'status'] as const,
};

export function useLocations() {
  return useQuery<Location[], ApiError>({ queryKey: QK.locations, queryFn: fetchLocations, staleTime: 15_000 });
}
export function useBundleImages() {
  return useQuery<ImageOption[], ApiError>({ queryKey: QK.images, queryFn: fetchImages, staleTime: 30_000 });
}
export function useExportableModels() {
  return useQuery<ModelItem[], ApiError>({
    queryKey: QK.models,
    queryFn: async () => (await fetchModels()).filter((m) => !m.archived),
    staleTime: 15_000,
  });
}
export function useExportPlan(req: ExportRequest | null) {
  return useQuery<ExportPlan, ApiError>({
    queryKey: ['bundles', 'plan', req],
    queryFn: () => fetchPlan(req as ExportRequest),
    enabled: req != null,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 5_000,
  });
}
/** Polls the shared job store: fast while a job runs, slow otherwise (so jobs started elsewhere still appear). */
export function useJobStatus() {
  return useQuery<Job | null, ApiError>({
    queryKey: QK.status,
    queryFn: fetchJobStatus,
    refetchInterval: (query) => (isJobActive(query.state.data) ? 1500 : 15_000),
    // keep polling when the tab is not focused: admins start a job and switch to another window
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
}

/** Debounce any serialisable value; used to throttle live /plan requests while the admin clicks around. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  const key = JSON.stringify(value);
  React.useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ms]);
  return v;
}

/** Shared job state handed from the page to both wizards (only one job runs at a time). */
export type JobController = {
  job: Job | null;
  /** True while any job is pending/running — starting another one is blocked. */
  busy: boolean;
  /** Job id started from this page (so the wizard that started it renders its progress step). */
  claimedJobId: string | null;
  claimJob: (id: string) => void;
  releaseJob: () => void;
  cancel: () => void;
  cancelling: boolean;
};

export type LocationOption = {
  path: string;
  host_path: string;
  writable: boolean;
  free_bytes: number;
  /** Why the location cannot be used (shown disabled). */
  reason?: string;
  /** Mount points are indented under their root. */
  depth: 0 | 1;
  bundles: BundleSummary[];
};

/** Flatten roots + their mount points into one radio-list-friendly array. */
export function flattenLocations(locations: Location[] | undefined): LocationOption[] {
  const out: LocationOption[] = [];
  for (const root of locations ?? []) {
    if (!root.exists) {
      out.push({ path: root.path, host_path: root.host_path, writable: false, free_bytes: 0, depth: 0, bundles: [],
        reason: 'Not mounted (the directory does not exist inside the gateway container)' });
      continue;
    }
    out.push({ path: root.path, host_path: root.host_path, writable: root.writable, free_bytes: root.free_bytes, depth: 0, bundles: root.bundles,
      reason: root.writable ? undefined : 'Not writable by the gateway (uid 1000)' });
    for (const c of root.children) {
      out.push({ path: c.path, host_path: c.host_path, writable: c.writable, free_bytes: c.free_bytes, depth: 1, bundles: c.bundles,
        reason: c.writable ? undefined : 'Not writable by the gateway (uid 1000) — mount read-write or chown the directory' });
    }
  }
  return out;
}

import { describe, expect, it } from 'vitest';
import {
  BundleSummarySchema, ExportPlanSchema, ImportArtifactsSchema, JobSchema, JobStatusResponseSchema, LocationsResponseSchema, ScanResultSchema,
  flattenLocations, formatBytes, formatDuration, isBundleOk, isJobActive, isScanModelOk, relativeTime, toMillis,
} from './api';

describe('formatBytes', () => {
  it('uses GB with two decimals from 1e9 up', () => {
    expect(formatBytes(1e9)).toBe('1.00 GB');
    expect(formatBytes(12_345_678_901)).toBe('12.35 GB');
  });
  it('falls back to smaller units and a dash', () => {
    expect(formatBytes(1_500_000)).toBe('1.5 MB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(12)).toBe('12 B');
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(undefined)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-09-01T12:00:00Z');
  it('handles ISO strings and epoch seconds', () => {
    expect(relativeTime('2026-09-01T11:59:50Z', now)).toBe('just now');
    expect(relativeTime('2026-09-01T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2026-09-01T09:00:00Z', now)).toBe('3 h ago');
    expect(relativeTime('2026-08-30T12:00:00Z', now)).toBe('2 days ago');
    expect(relativeTime(now / 1000 - 120, now)).toBe('2 min ago');
  });
  it('returns a dash for missing/invalid input', () => {
    expect(relativeTime(null, now)).toBe('—');
    expect(relativeTime('not a date', now)).toBe('—');
    expect(toMillis('')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(42)).toBe('42s');
    expect(formatDuration(125)).toBe('2m 5s');
    expect(formatDuration(3720)).toBe('1h 2m');
    expect(formatDuration(null)).toBe('—');
  });
});

describe('JobSchema', () => {
  it('fills the optional fields the gateway may leave null', () => {
    const job = JobSchema.parse({ id: 'bundle_export-1', status: 'running', started_at: 1_756_700_000, job_type: 'bundle_export', logs: null, artifacts: null, step: null });
    expect(job.logs).toEqual([]);
    expect(job.step).toBe('');
    expect(job.progress).toBe(0);
    expect(job.bytes_written).toBe(0);
    expect(isJobActive(job)).toBe(true);
    expect(JobStatusResponseSchema.parse({ job: null }).job).toBeNull();
  });
  it('rejects unknown statuses', () => {
    expect(() => JobSchema.parse({ id: 'x', status: 'exploded', started_at: 1, job_type: 'bundle_export' })).toThrow();
  });
});

describe('locations', () => {
  const payload = {
    locations: [
      {
        path: '/var/cortex/exports', host_path: '/var/cortex/exports', exists: true, writable: true, free_bytes: 5e10,
        bundles: [{ path: '/var/cortex/exports/b1', host_path: '/var/cortex/exports/b1', name: 'b1', created_at: '2026-09-01T10:00:00Z', source_host: 'lab', cortex_version: '1.2', images: 2, models: 1, program: false, db_dump: true, size_bytes: 3e9 }],
        children: [],
      },
      {
        path: '/host/media', host_path: '/media', exists: true, writable: false, free_bytes: 0, bundles: [],
        children: [{ path: '/host/media/usb', host_path: '/media/usb', writable: true, free_bytes: 1e11, bundles: [{ path: '/host/media/usb/bad', host_path: '/media/usb/bad', error: 'unreadable bundle.json' }] }],
      },
      { path: '/host/mnt', host_path: '/mnt', exists: false, writable: false, free_bytes: 0, bundles: [], children: [] },
    ],
  };
  it('parses roots, mount points and broken bundles', () => {
    const parsed = LocationsResponseSchema.parse(payload);
    const usb = parsed.locations[1]?.children[0];
    expect(usb?.host_path).toBe('/media/usb');
    const broken = usb?.bundles[0];
    expect(broken && isBundleOk(broken)).toBe(false);
    const good = parsed.locations[0]?.bundles[0];
    expect(good && isBundleOk(good) && good.db_dump).toBe(true);
    expect(BundleSummarySchema.safeParse({ path: '/x', host_path: '/x' }).success).toBe(false);
  });
  it('flattens into a radio list with disabled reasons', () => {
    const opts = flattenLocations(LocationsResponseSchema.parse(payload).locations);
    expect(opts.map((o) => [o.host_path, o.writable, o.depth])).toEqual([
      ['/var/cortex/exports', true, 0],
      ['/media', false, 0],
      ['/media/usb', true, 1],
      ['/mnt', false, 0],
    ]);
    expect(opts[1]?.reason).toMatch(/not writable/i);
    expect(opts[3]?.reason).toMatch(/not mounted/i);
    expect(flattenLocations(undefined)).toEqual([]);
  });
});

describe('plan / scan / artifacts schemas', () => {
  it('parses an export plan', () => {
    const plan = ExportPlanSchema.parse({
      destination: '/host/media/usb', destination_host: '/media/usb', bundle_name: 'cortex-bundle-1',
      images: [{ ref: 'vllm/vllm-openai:v0.28.1', role: 'engine', cached: false, size_bytes: null }],
      models: [{ id: 3, name: 'Llama', served_model_name: 'llama', engine_type: 'vllm', engine_image: 'vllm/vllm-openai:v0.28.1', local_path: null, files_present: false, size_bytes: null }],
      db_dump: false, estimated_bytes: 0, free_bytes: 1e11, sufficient: true, missing_images: ['vllm/vllm-openai:v0.28.1'], pull_missing: true, warnings: ['1 image(s) not cached locally'],
    });
    expect(plan.missing_images).toHaveLength(1);
  });
  it('parses a scan with a broken model manifest', () => {
    const scan = ScanResultSchema.parse({
      path: '/host/media/usb/b', host_path: '/media/usb/b',
      bundle: { schema_version: 1, kind: 'cortex-bundle', created_at: '2026-09-01T10:00:00Z', cortex_version: '1.2', source_host: 'lab', notes: '', engine_defaults: { vllm: 'a', llamacpp: 'b' }, size_bytes: 10 },
      images: [{ ref: 'a:1', role: 'engine', file: 'images/a__1.tar', size_bytes: 1, tar_bytes: 2, sha256: 'x', id: 'sha256:abc', digests: [], file_present: true, file_bytes: 2, already_loaded: false, local_id: null }],
      models: [
        { served_model_name: 'ok', name: 'ok', engine_type: 'vllm', engine_image: 'a:1', local_path: 'ok', mode: 'offline', files_in_bundle: true, file_count: 2, size_bytes: 5, files_present_on_host: false, already_registered: true, existing_model_id: 7, engine_image_loaded: false, engine_image_in_bundle: true },
        { served_model_name: 'bad', error: 'bad manifest' },
      ],
      db_dump: true, models_dir_writable: false, models_dir_free_bytes: 1, docker_free_bytes: null, estimated_bytes_needed: 7, checksums: {},
    });
    expect(scan.models.filter(isScanModelOk)).toHaveLength(1);
    expect(scan.docker_free_bytes).toBeNull();
  });
  it('parses import artifacts', () => {
    const a = ImportArtifactsSchema.parse({ images: [{ ref: 'a:1', status: 'loaded', tags: ['a:1'] }], models: [{ served_model_name: 'ok-2', status: 'created', model_id: 9 }], db_dump_available: true });
    expect(a.models[0]?.model_id).toBe(9);
    expect(ImportArtifactsSchema.safeParse({ images: [], models: [{ served_model_name: 'x', status: 'vanished', model_id: 1 }], db_dump_available: false }).success).toBe(false);
  });
});

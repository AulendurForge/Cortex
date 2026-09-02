'use client';

import { useQuery } from '@tanstack/react-query';
import apiFetch from '../lib/api-clients';
import { GpuInfo, GpuInfoListSchema } from '../lib/validators';

export const GPUS_QUERY_KEY = ['system', 'gpus'] as const;

/**
 * GPU inventory from GET /admin/system/gpus, shared by every component that
 * needs it (one query, one cache entry).  Resolves to [] when discovery is
 * unavailable so callers can fall back to manual slots.
 */
export function useGpus(options: { enabled?: boolean } = {}) {
  const q = useQuery({
    queryKey: GPUS_QUERY_KEY,
    queryFn: async (): Promise<GpuInfo[]> => {
      const raw: unknown = await apiFetch('/admin/system/gpus');
      const parsed = GpuInfoListSchema.safeParse(raw);
      return parsed.success ? parsed.data : [];
    },
    staleTime: 30_000,
    enabled: options.enabled ?? true,
  });
  const gpus = q.data ?? [];
  return { gpus, gpuCount: gpus.length, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
}

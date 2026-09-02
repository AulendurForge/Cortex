'use client';

import { useQuery } from '@tanstack/react-query';
import apiFetch, { ApiError } from '../lib/api-clients';
import type { InspectResult } from '../components/models/modelForm/inspectTypes';

export const BASE_DIR_QUERY_KEY = ['models', 'base-dir'] as const;
export const LOCAL_FOLDERS_QUERY_KEY = ['models', 'local-folders'] as const;
export const inspectFolderQueryKey = (folder: string) => ['models', 'inspect-folder', folder] as const;

/** The fixed models directory (CORTEX_MODELS_DIR); read-only in the UI. */
export function useBaseDir(enabled = true) {
  return useQuery({
    queryKey: BASE_DIR_QUERY_KEY,
    queryFn: async (): Promise<string> => {
      const r = await apiFetch<{ base_dir?: string }>('/admin/models/base-dir');
      return r?.base_dir || '';
    },
    staleTime: 5 * 60_000,
    enabled,
  });
}

/** Sub-folders / files under the models directory. */
export function useLocalFolders(enabled = true) {
  return useQuery({
    queryKey: LOCAL_FOLDERS_QUERY_KEY,
    queryFn: async (): Promise<string[]> => {
      const r: unknown = await apiFetch('/admin/models/local-folders');
      return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : [];
    },
    staleTime: 30_000,
    enabled,
  });
}

/** Inspect one folder: formats, GGUF groups, tokenizer files, engine recommendation. */
export function useInspectFolder(folder: string) {
  return useQuery<InspectResult, ApiError>({
    queryKey: inspectFolderQueryKey(folder),
    queryFn: async (): Promise<InspectResult> => {
      const q = new URLSearchParams({ folder });
      return await apiFetch<InspectResult>(`/admin/models/inspect-folder?${q.toString()}`);
    },
    enabled: !!folder,
    staleTime: 60_000,
    retry: false,
  });
}

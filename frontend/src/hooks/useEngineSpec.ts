'use client';

import { useQuery } from '@tanstack/react-query';
import apiFetch from '../lib/api-clients';
import { EngineSpec, STATIC_ENGINE_SPEC } from '../lib/engine-spec';
import { EngineSpecSchema } from '../lib/validators';

export const ENGINE_SPEC_QUERY_KEY = ['engines', 'spec'] as const;

/**
 * The declarative engine spec from GET /admin/engines/spec.  While loading or
 * when the gateway is unreachable the bundled static copy is used so the form
 * still renders; `isFallback` tells the UI which one it has.
 */
export function useEngineSpec(): { spec: EngineSpec; isFallback: boolean; isLoading: boolean; error: unknown } {
  const q = useQuery({
    queryKey: ENGINE_SPEC_QUERY_KEY,
    queryFn: async (): Promise<EngineSpec> => {
      const raw: unknown = await apiFetch('/admin/engines/spec');
      const parsed = EngineSpecSchema.parse(raw);
      return {
        groups: parsed.groups,
        fields: parsed.fields.map((f) => ({ ...f, form: f.form as EngineSpec['fields'][number]['form'] })),
        images: parsed.images as EngineSpec['images'],
        policies: parsed.policies as EngineSpec['policies'],
      };
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  return { spec: q.data ?? STATIC_ENGINE_SPEC, isFallback: !q.data, isLoading: q.isLoading, error: q.error };
}

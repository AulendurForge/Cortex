/**
 * Types and helpers for the declarative engine spec served by
 * GET /admin/engines/spec (single source of truth: backend/src/engines/spec.py).
 */
import { STATIC_ENGINE_SPEC } from './engine-spec.static';

export type EngineType = 'vllm' | 'llamacpp';
export type SpecEngine = EngineType | 'both';
export type SpecKind = 'int' | 'float' | 'str' | 'bool' | 'json';
export type SpecForm =
  | 'value' | 'switch' | 'negatable' | 'no_only' | 'onoff' | 'csv' | 'json' | 'custom' | 'env' | 'internal';

export type FieldSpec = {
  name: string;
  engine: SpecEngine;
  kind: SpecKind;
  form?: SpecForm;
  flag?: string | Partial<Record<EngineType, string>> | null;
  env?: string | null;
  label?: string;
  help?: string;
  group?: string;
  default?: unknown;
  choices?: string[] | null;
  min?: number | null;
  max?: number | null;
  path?: boolean;
  emit_if?: string | null;
  requires?: Record<string, unknown>;
  order?: number;
};

export type EngineSpec = {
  groups: Array<{ key: string; label: string }>;
  fields: FieldSpec[];
  images: Partial<Record<EngineType, string>>;
  policies: { gguf_engine?: EngineType } & Record<string, unknown>;
};

export { STATIC_ENGINE_SPEC };

export function appliesTo(f: FieldSpec, engine: EngineType): boolean {
  return f.engine === 'both' || f.engine === engine;
}

export function fieldsFor(spec: EngineSpec, engine: EngineType): FieldSpec[] {
  return spec.fields
    .filter((f) => appliesTo(f, engine))
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/** The CLI flag a field emits for the given engine, if any. */
export function flagFor(f: FieldSpec, engine: EngineType): string | null {
  if (!f.flag) return null;
  if (typeof f.flag === 'string') return f.flag;
  return f.flag[engine] ?? null;
}

/** Field names that belong only to the *other* engine and must not be submitted. */
export function otherEngineOnlyFields(spec: EngineSpec, engine: EngineType): Set<string> {
  const other: EngineType = engine === 'vllm' ? 'llamacpp' : 'vllm';
  const mine = new Set(spec.fields.filter((f) => appliesTo(f, engine)).map((f) => f.name));
  const out = new Set<string>();
  for (const f of spec.fields) {
    if (f.engine === other && !mine.has(f.name)) out.add(f.name);
  }
  return out;
}

/** Map of CLI flag -> field name for every form-managed flag of an engine. */
export function managedFlags(spec: EngineSpec, engine: EngineType): Map<string, FieldSpec> {
  const out = new Map<string, FieldSpec>();
  for (const f of fieldsFor(spec, engine)) {
    const fl = flagFor(f, engine);
    if (fl && f.form !== 'internal' && f.form !== 'env') {
      out.set(fl, f);
      if (f.form === 'negatable' || f.form === 'no_only') out.set(fl.replace(/^--/, '--no-'), f);
    }
  }
  return out;
}

/** Map of env var name -> field name for env-backed fields. */
export function managedEnvVars(spec: EngineSpec, engine: EngineType): Map<string, FieldSpec> {
  const out = new Map<string, FieldSpec>();
  for (const f of fieldsFor(spec, engine)) {
    if (f.form === 'env' && f.env) out.set(f.env, f);
  }
  return out;
}

export function groupLabel(spec: EngineSpec, key: string): string {
  return spec.groups.find((g) => g.key === key)?.label ?? key;
}

/** Short llama.cpp aliases accepted in custom args (mirrors LLAMACPP_FLAG_ALIASES in spec.py). */
export const LLAMACPP_FLAG_ALIASES: Record<string, string> = {
  '-c': '--ctx-size', '-ngl': '--n-gpu-layers', '--gpu-layers': '--n-gpu-layers', '-b': '--batch-size',
  '-ub': '--ubatch-size', '-t': '--threads', '-np': '--parallel', '-ts': '--tensor-split', '-sm': '--split-mode',
  '-mg': '--main-gpu', '-fa': '--flash-attn', '-ctk': '--cache-type-k', '-ctv': '--cache-type-v', '-lm': '--load-mode',
  '-md': '--model-draft', '-a': '--alias', '-n': '--n-predict', '-kvu': '--kv-unified', '-cb': '--cont-batching',
  '-nocb': '--no-cont-batching', '-ot': '--override-tensor', '-ncmoe': '--n-cpu-moe', '-mm': '--mmproj',
  '-sp': '--special', '-v': '--verbose', '-lv': '--verbosity', '-s': '--seed', '-m': '--model',
};

/** Canonical long form of a flag (resolves llama.cpp short aliases). */
export function canonicalFlag(flag: string, engine: EngineType): string {
  const t = flag.trim();
  if (engine === 'llamacpp' && LLAMACPP_FLAG_ALIASES[t]) return LLAMACPP_FLAG_ALIASES[t] as string;
  return t;
}

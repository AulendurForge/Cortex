/**
 * Pure helpers for the custom startup args / env editor (Plane B).
 * No React here so the rules can be unit-tested and reused by validateFormValues.
 */
import { EngineSpec, EngineType, canonicalFlag, flagFor, managedEnvVars, managedFlags } from '../../lib/engine-spec';

export type CustomArgType = 'string' | 'int' | 'float' | 'bool' | 'flag' | 'string_list';

export type CustomArg = {
  flag: string;
  type: CustomArgType;
  value: unknown;
};

export type CustomEnvVar = { key: string; value: string };

export type ArgIssue = {
  index: number;
  severity: 'error' | 'warning';
  kind: 'duplicate' | 'collision' | 'forbidden' | 'format' | 'protected_env' | 'env_collision';
  message: string;
};

/** Flags Cortex owns (networking, identity, model path); the backend rejects them too. */
export const FORBIDDEN_FLAGS: ReadonlyArray<string> = [
  '--host', '--port', '--api-key', '--model', '-m', '--served-model-name', '--alias', '-a', '--root-path',
];
const FORBIDDEN_PREFIXES: ReadonlyArray<string> = ['--ssl-'];

/** Environment variables managed by Cortex. */
export const PROTECTED_ENV: ReadonlyArray<string> = ['CUDA_VISIBLE_DEVICES', 'NVIDIA_VISIBLE_DEVICES', 'HF_HUB_OFFLINE', 'HF_TOKEN', 'HUGGING_FACE_HUB_TOKEN'];
const PROTECTED_ENV_PREFIXES: ReadonlyArray<string> = ['NCCL_'];

const ARG_TYPES: ReadonlyArray<CustomArgType> = ['string', 'int', 'float', 'bool', 'flag', 'string_list'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Parse engine_startup_args_json defensively; a bad stored value yields []. */
export function parseCustomArgs(json: string | null | undefined): CustomArg[] {
  if (!json || !json.trim()) return [];
  try {
    const data: unknown = JSON.parse(json);
    if (!Array.isArray(data)) return [];
    const out: CustomArg[] = [];
    for (const item of data) {
      if (!isRecord(item) || typeof item.flag !== 'string') continue;
      const type = ARG_TYPES.includes(item.type as CustomArgType) ? (item.type as CustomArgType) : 'string';
      out.push({ flag: item.flag, type, value: item.value });
    }
    return out;
  } catch {
    return [];
  }
}

/** Parse engine_startup_env_json defensively; a bad stored value yields []. */
export function parseCustomEnv(json: string | null | undefined): CustomEnvVar[] {
  if (!json || !json.trim()) return [];
  try {
    const data: unknown = JSON.parse(json);
    if (!Array.isArray(data)) return [];
    return data
      .filter((e): e is Record<string, unknown> => isRecord(e) && typeof e.key === 'string')
      .map((e) => ({ key: e.key as string, value: e.value === undefined || e.value === null ? '' : String(e.value) }));
  } catch {
    return [];
  }
}

export function serializeCustomArgs(args: CustomArg[]): string {
  return JSON.stringify(args);
}

export function serializeCustomEnv(env: CustomEnvVar[]): string {
  return JSON.stringify(env);
}

/** Split a "one value per line" textarea into a string list (no quoting rules needed). */
export function parseListValue(text: string): string[] {
  return text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

export function isForbiddenFlag(flag: string, engine: EngineType): boolean {
  const c = canonicalFlag(flag, engine);
  return FORBIDDEN_FLAGS.includes(c) || FORBIDDEN_FLAGS.includes(flag.trim()) || FORBIDDEN_PREFIXES.some((p) => c.startsWith(p));
}

export function isProtectedEnv(key: string): boolean {
  const k = key.trim();
  return PROTECTED_ENV.includes(k) || PROTECTED_ENV_PREFIXES.some((p) => k.startsWith(p));
}

/** How the arg will appear on the command line (bool false is rendered as --no-<flag>). */
export function renderArg(arg: CustomArg): string {
  const flag = arg.flag.trim();
  switch (arg.type) {
    case 'flag':
      return flag;
    case 'bool':
      return arg.value === false || arg.value === 'false' ? flag.replace(/^--/, '--no-') : flag;
    case 'string_list':
      return `${flag} ${(Array.isArray(arg.value) ? arg.value : []).map(String).join(' ')}`.trim();
    default:
      return `${flag} ${arg.value === undefined || arg.value === null ? '' : String(arg.value)}`.trim();
  }
}

/**
 * Validate a list of custom args against the engine and the spec:
 * duplicates (error), forbidden flags (error), collisions with a form-managed
 * flag (warning naming the form field), and bad flag format (error).
 */
export function analyzeCustomArgs(args: CustomArg[], engine: EngineType, spec: EngineSpec): ArgIssue[] {
  const issues: ArgIssue[] = [];
  const managed = managedFlags(spec, engine);
  const seen = new Map<string, number>();
  args.forEach((arg, index) => {
    const raw = arg.flag.trim();
    if (!raw.startsWith('-')) {
      issues.push({ index, severity: 'error', kind: 'format', message: `"${raw || '(empty)'}" must start with -- or -` });
      return;
    }
    const canon = canonicalFlag(raw, engine);
    if (isForbiddenFlag(raw, engine)) {
      issues.push({ index, severity: 'error', kind: 'forbidden', message: `${raw} is managed by Cortex and cannot be overridden` });
    }
    const first = seen.get(canon);
    if (first !== undefined) {
      issues.push({ index, severity: 'error', kind: 'duplicate', message: `${raw} is already set (row ${first + 1})` });
    } else {
      seen.set(canon, index);
    }
    const field = managed.get(canon);
    if (field) {
      issues.push({
        index,
        severity: 'warning',
        kind: 'collision',
        message: `${raw} is already managed by the "${field.label || field.name}" form field; the custom value overrides it`,
      });
    }
  });
  return issues;
}

/** Validate env vars: duplicates, protected names, and collisions with env-backed form fields. */
export function analyzeCustomEnv(env: CustomEnvVar[], engine: EngineType, spec: EngineSpec): ArgIssue[] {
  const issues: ArgIssue[] = [];
  const managed = managedEnvVars(spec, engine);
  const seen = new Map<string, number>();
  env.forEach((e, index) => {
    const key = e.key.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      issues.push({ index, severity: 'error', kind: 'format', message: `"${key || '(empty)'}" is not a valid environment variable name` });
      return;
    }
    if (isProtectedEnv(key)) {
      issues.push({ index, severity: 'error', kind: 'protected_env', message: `${key} is managed by Cortex` });
    }
    const first = seen.get(key);
    if (first !== undefined) issues.push({ index, severity: 'error', kind: 'duplicate', message: `${key} is already set (row ${first + 1})` });
    else seen.set(key, index);
    const field = managed.get(key);
    if (field) {
      issues.push({ index, severity: 'warning', kind: 'env_collision', message: `${key} is also set by the "${field.label || field.name}" form field` });
    }
  });
  return issues;
}

type CustomPreset = {
  id: string;
  engine: EngineType;
  label: string;
  description: string;
  args: CustomArg[];
  env: CustomEnvVar[];
};

export const CUSTOM_PRESETS: ReadonlyArray<CustomPreset> = [
  {
    id: 'vllm-nemotron',
    engine: 'vllm',
    label: 'vLLM: Nemotron (Mamba hybrid)',
    description: 'Trust remote code and use a float16 Mamba SSM cache, as required by NVIDIA Nemotron hybrid models.',
    args: [
      { flag: '--trust-remote-code', type: 'flag', value: true },
      { flag: '--mamba-ssm-cache-dtype', type: 'string', value: 'float16' },
    ],
    env: [],
  },
  {
    id: 'vllm-flashinfer-moe-fp8',
    engine: 'vllm',
    label: 'vLLM: FlashInfer MoE FP8 kernels',
    description: 'Enable the FlashInfer fused MoE FP8 kernels (Hopper/Blackwell) for FP8 MoE checkpoints.',
    args: [],
    env: [{ key: 'VLLM_USE_FLASHINFER_MOE_FP8', value: '1' }],
  },
  {
    id: 'llamacpp-cpu-moe',
    engine: 'llamacpp',
    label: 'llama.cpp: keep MoE experts on CPU',
    description: 'Offload MoE expert layers to system RAM (--n-cpu-moe) so a large MoE model fits alongside attention on the GPU.',
    args: [{ flag: '--n-cpu-moe', type: 'int', value: 999 }],
    env: [],
  },
  {
    id: 'llamacpp-long-context',
    engine: 'llamacpp',
    label: 'llama.cpp: long context',
    description: 'Unified KV cache shared across slots plus prompt cache reuse for long, repetitive prompts.',
    args: [
      { flag: '--kv-unified', type: 'flag', value: true },
      { flag: '--cache-reuse', type: 'int', value: 256 },
    ],
    env: [],
  },
];

/** Merge a preset into the current lists, replacing args/env that use the same flag/key. */
export function applyPreset(
  preset: CustomPreset,
  args: CustomArg[],
  env: CustomEnvVar[],
  engine: EngineType,
): { args: CustomArg[]; env: CustomEnvVar[] } {
  const presetFlags = new Set(preset.args.map((a) => canonicalFlag(a.flag, engine)));
  const presetKeys = new Set(preset.env.map((e) => e.key));
  return {
    args: [...args.filter((a) => !presetFlags.has(canonicalFlag(a.flag, engine))), ...preset.args],
    env: [...env.filter((e) => !presetKeys.has(e.key)), ...preset.env],
  };
}

/** The spec field (if any) a custom flag would shadow, for the collision hint in the editor. */
export function managedFieldForFlag(flag: string, engine: EngineType, spec: EngineSpec): string | null {
  const canon = canonicalFlag(flag, engine);
  for (const f of spec.fields) {
    const fl = flagFor(f, engine);
    if (fl && (fl === canon || fl.replace(/^--/, '--no-') === canon) && f.form !== 'internal') return f.label || f.name;
  }
  return null;
}

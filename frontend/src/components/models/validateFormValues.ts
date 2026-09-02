/**
 * Pure pre-submit validation for the model form.  Mirrors the invariants the
 * backend enforces (GGUF -> llama.cpp, TP x PP vs GPUs, ...) so the admin sees
 * them inline before a dry run or a POST.
 */
import { EngineSpec, STATIC_ENGINE_SPEC, appliesTo } from '../../lib/engine-spec';
import { CustomArg, CustomEnvVar, analyzeCustomArgs, analyzeCustomEnv } from './customArgs';
import { ModelFormValues, jsonFieldNames } from './modelFormValues';

export type Issue = {
  severity: 'error' | 'warning';
  field?: string;
  message: string;
  fix?: string;
};

type ValidationContext = {
  /** 'add' checks source fields; 'configure' assumes identity is immutable. */
  mode: 'add' | 'configure';
  gpuCount?: number;
  spec?: EngineSpec | null;
  customArgs?: CustomArg[];
  customEnv?: CustomEnvVar[];
  /** Folder inspection state from the Model step (add mode only). */
  source?: {
    useGguf: boolean;
    ggufFile?: string;
    hasSafetensors?: boolean;
    hasMultipartGguf?: boolean;
  };
};

const UNQUANTIZED_CACHE = new Set(['', 'f16', 'f32', 'bf16']);

function isJsonObjectOrArray(text: string): boolean {
  try {
    const v: unknown = JSON.parse(text);
    return !!v && typeof v === 'object';
  } catch {
    return false;
  }
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function validateFormValues(values: ModelFormValues, ctx: ValidationContext): Issue[] {
  const issues: Issue[] = [];
  const spec = ctx.spec ?? STATIC_ENGINE_SPEC;
  const engine = values.engine_type;
  const gpus = values.selected_gpus ?? [];
  const localPath = (values.local_path || '').trim();
  const isGgufPath = /\.gguf$/i.test(localPath) || !!ctx.source?.useGguf;

  // --- engine / mode / path presence ---
  if (!engine) {
    issues.push({ severity: 'error', field: 'engine_type', message: 'Choose an inference engine.' });
    return issues;
  }
  if (ctx.mode === 'add') {
    if (values.mode === 'online' && !(values.repo_id || '').trim()) {
      issues.push({ severity: 'error', field: 'repo_id', message: 'Enter a Hugging Face repo id for online mode.' });
    }
    if (values.mode === 'offline' && !localPath) {
      issues.push({ severity: 'error', field: 'local_path', message: 'Select a model folder for offline mode.' });
    }
    if (engine === 'llamacpp' && values.mode === 'online') {
      issues.push({ severity: 'error', field: 'mode', message: 'llama.cpp serves local GGUF files only; switch to offline mode.' });
    }
    if (ctx.source?.useGguf && !ctx.source.ggufFile && !/\.gguf$/i.test(localPath)) {
      issues.push({ severity: 'error', field: 'local_path', message: 'Pick a GGUF quantization (file) to serve from this folder.' });
    }
  }
  if (!(values.name || '').trim()) issues.push({ severity: 'error', field: 'name', message: 'Display name is required.' });
  if (!(values.served_model_name || '').trim()) {
    issues.push({ severity: 'error', field: 'served_model_name', message: 'Served model name is required.' });
  } else if (!/^[A-Za-z0-9][A-Za-z0-9._\-:/]*$/.test(values.served_model_name.trim())) {
    issues.push({ severity: 'error', field: 'served_model_name', message: 'Served model name may only contain letters, digits, ".", "_", "-", ":" and "/".' });
  }

  // --- GGUF policy: always llama.cpp ---
  if (engine === 'vllm' && isGgufPath) {
    issues.push({
      severity: 'error',
      field: 'engine_type',
      message: 'GGUF files are served by llama.cpp. vLLM cannot load this model (gguf_requires_llamacpp).',
      fix: ctx.source?.hasSafetensors ? 'Switch to llama.cpp, or pick the SafeTensors weights in this folder for vLLM.' : 'Switch the engine to llama.cpp.',
    });
  }
  if (engine === 'llamacpp' && ctx.mode === 'add' && localPath && !isGgufPath) {
    issues.push({ severity: 'error', field: 'local_path', message: 'llama.cpp needs a .gguf file. Select a GGUF quantization in this folder.' });
  }

  // --- placement ---
  if (engine === 'vllm') {
    const cpu = values.device === 'cpu';
    if (gpus.length === 0 && !cpu) {
      issues.push({ severity: 'error', field: 'selected_gpus', message: 'Select at least one GPU or set the device to CPU.' });
    }
    if (cpu && gpus.length > 0) {
      issues.push({ severity: 'warning', field: 'device', message: 'Device is CPU; the selected GPUs will not be used.' });
    }
    const tp = num(values.tp_size) ?? 1;
    const pp = num(values.pipeline_parallel_size) ?? 1;
    const dp = num(values.data_parallel_size) ?? 1;
    const need = tp * pp * dp;
    if (!cpu && gpus.length > 0 && need !== gpus.length) {
      issues.push({
        severity: 'error',
        field: 'tp_size',
        message: `Tensor parallel ${tp} × pipeline parallel ${pp}${dp > 1 ? ` × data parallel ${dp}` : ''} = ${need} GPUs, but ${gpus.length} selected.`,
        fix: `Set tensor parallel size to ${Math.max(1, Math.floor(gpus.length / (pp * dp)))} or select ${need} GPUs.`,
      });
    }
    if (ctx.gpuCount !== undefined && ctx.gpuCount > 0 && gpus.some((g) => g >= ctx.gpuCount!)) {
      issues.push({ severity: 'warning', field: 'selected_gpus', message: `GPU index above the ${ctx.gpuCount} detected GPU(s).` });
    }
  } else {
    const ngl = num(values.ngl);
    if (gpus.length === 0) {
      issues.push({
        severity: ngl !== undefined && ngl > 0 ? 'error' : 'warning',
        field: 'selected_gpus',
        message: ngl !== undefined && ngl > 0
          ? `GPU layers is ${ngl} but no GPU is selected.`
          : 'No GPU selected: llama.cpp will run on the CPU only.',
      });
    }
    if (ngl === 0 && gpus.length > 0) {
      issues.push({ severity: 'warning', field: 'ngl', message: 'GPU layers is 0, so the selected GPUs will hold no layers.' });
    }
    const split = (values.tensor_split || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (split.length > 0 && gpus.length > 0 && split.length !== gpus.length) {
      issues.push({ severity: 'warning', field: 'tensor_split', message: `Tensor split has ${split.length} entries for ${gpus.length} selected GPU(s).` });
    }
    // quantized V cache needs flash attention
    const ctv = (values.cache_type_v || '').toLowerCase();
    if (!UNQUANTIZED_CACHE.has(ctv)) {
      if (values.flash_attn === 'off') {
        issues.push({ severity: 'error', field: 'cache_type_v', message: `A quantized V cache (${ctv}) requires flash attention, which is set to off.`, fix: 'Set flash attention to auto or on, or use f16 for the V cache.' });
      } else if (!values.flash_attn || values.flash_attn === 'auto') {
        issues.push({ severity: 'warning', field: 'cache_type_v', message: `A quantized V cache (${ctv}) only works when flash attention is available; llama.cpp will fail to start if auto resolves to off.` });
      }
    }
    const ctxSize = num(values.context_size);
    const slots = num(values.parallel_slots);
    if (ctxSize && slots && slots > 1 && !values.kv_unified && ctxSize % slots !== 0) {
      issues.push({ severity: 'warning', field: 'context_size', message: `Context size ${ctxSize} is not divisible by ${slots} slots; each slot gets ${Math.floor(ctxSize / slots)} tokens.` });
    }
    if (values.draft_model_path && values.spec_type && values.spec_type.startsWith('ngram')) {
      issues.push({ severity: 'warning', field: 'spec_type', message: 'An n-gram speculative type ignores the draft model.' });
    }
  }

  // --- spec-driven range / choice checks ---
  for (const f of spec.fields) {
    if (!appliesTo(f, engine) || f.form === 'internal') continue;
    const v = (values as Record<string, unknown>)[f.name];
    if (v === undefined || v === null || v === '') continue;
    if ((f.kind === 'int' || f.kind === 'float') && typeof v === 'number') {
      if (f.min !== undefined && f.min !== null && v < f.min) issues.push({ severity: 'error', field: f.name, message: `${f.label || f.name} must be at least ${f.min}.` });
      if (f.max !== undefined && f.max !== null && v > f.max) issues.push({ severity: 'error', field: f.name, message: `${f.label || f.name} must be at most ${f.max}.` });
      if (f.kind === 'int' && !Number.isInteger(v)) issues.push({ severity: 'error', field: f.name, message: `${f.label || f.name} must be a whole number.` });
    }
    if (f.choices && f.choices.length > 0 && typeof v === 'string' && !f.choices.includes(v)) {
      issues.push({ severity: 'error', field: f.name, message: `${f.label || f.name}: "${v}" is not one of ${f.choices.join(', ')}.` });
    }
  }

  // --- JSON fields ---
  for (const name of jsonFieldNames(spec)) {
    const v = (values as Record<string, unknown>)[name];
    if (typeof v === 'string' && v.trim() && !isJsonObjectOrArray(v)) {
      issues.push({ severity: 'error', field: name, message: `${name} must be a valid JSON object or array.` });
    }
  }
  if (values.custom_request_json && values.custom_request_json.trim()) {
    let ok = false;
    try {
      const parsed: unknown = JSON.parse(values.custom_request_json);
      ok = !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
    } catch { ok = false; }
    if (!ok) issues.push({ severity: 'error', field: 'custom_request_json', message: 'Custom request JSON must be a JSON object.' });
  }

  // --- custom args / env ---
  if (ctx.customArgs) {
    for (const i of analyzeCustomArgs(ctx.customArgs, engine, spec)) {
      issues.push({ severity: i.severity, field: 'engine_startup_args_json', message: `Custom arg ${i.index + 1}: ${i.message}` });
    }
  }
  if (ctx.customEnv) {
    for (const i of analyzeCustomEnv(ctx.customEnv, engine, spec)) {
      issues.push({ severity: i.severity, field: 'engine_startup_env_json', message: `Custom env ${i.index + 1}: ${i.message}` });
    }
  }

  return issues;
}

export function hasErrors(issues: Issue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

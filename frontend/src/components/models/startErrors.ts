import type { ApiError } from '../../lib/api-clients';

export type FriendlyError = { title: string; description: string };

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.substring(0, n)}…` : s;
}

/** Turn a start / create failure into an actionable toast. */
export function describeStartError(e: unknown): FriendlyError {
  const err = e as Partial<ApiError> | undefined;
  const raw = (err && typeof err.message === 'string' && err.message) || String(e) || 'Unknown error';
  const rid = err?.request_id ? ` (request ${err.request_id})` : '';
  const lower = raw.toLowerCase();

  if (lower.includes('gguf_requires_llamacpp')) {
    return { title: 'GGUF files are served by llama.cpp', description: 'Re-add this model with the llama.cpp engine.' + rid };
  }
  if (lower.includes('nvidia-container-cli') || (lower.includes('unsatisfied condition') && lower.includes('cuda')) || (lower.includes('cuda') && (lower.includes('driver') || lower.includes('version')))) {
    const cudaMatch = raw.match(/cuda[>=]*\s*([\d.]+)/i);
    const cudaVersion = cudaMatch ? cudaMatch[1] : 'the required version';
    return { title: 'NVIDIA driver incompatible', description: `The engine image needs CUDA ${cudaVersion}+ but the host driver is older. Update the driver and reboot (docs/operations/UPDATE_NVIDIA_DRIVERS.md).${rid}` };
  }
  if (lower.includes('model_path_invalid') || lower.includes('path not found') || lower.includes('model path not found')) {
    return { title: 'Model path invalid', description: truncate(raw.replace(/^model_path_invalid:\s*/i, '').split('\n')[0] ?? raw, 200) + rid };
  }
  if (lower.includes('image') && (lower.includes('not found') || lower.includes('pull') || lower.includes('not cached'))) {
    return { title: 'Engine image unavailable', description: truncate(raw, 200) + ' Pre-load the image or check the registry.' + rid };
  }
  if (lower.includes('start_failed')) {
    return { title: 'Model startup failed', description: truncate(raw.replace(/^start_failed:\s*/i, '').split('\n')[0] ?? raw, 200) + " Check 'Logs' for details." + rid };
  }
  if (lower.includes('already exists')) {
    return { title: 'Name already in use', description: truncate(raw, 200) + rid };
  }
  return { title: 'Request failed', description: truncate(raw, 200) + rid };
}

/**
 * GGUF compatibility matrix (Gap #11): which engines support which model architectures.
 * Pure data + lookup helpers; the badge components live in ArchitectureCompatibility.tsx.
 */

export type SupportLevel = 'full' | 'partial' | 'experimental' | 'none' | 'unknown';

export interface ArchCompatibility {
  vllm: SupportLevel;
  llamacpp: SupportLevel;
  notes?: string;
}

/**
 * Compatibility matrix for model architectures
 * Based on vLLM supported models and llama.cpp model support
 */
export const ARCHITECTURE_COMPATIBILITY: Record<string, ArchCompatibility> = {
  // LLaMA family
  'llama': { vllm: 'full', llamacpp: 'full' },
  'llama2': { vllm: 'full', llamacpp: 'full' },
  'llama3': { vllm: 'full', llamacpp: 'full' },
  'codellama': { vllm: 'full', llamacpp: 'full' },
  
  // Mistral family
  'mistral': { vllm: 'full', llamacpp: 'full' },
  'mixtral': { vllm: 'full', llamacpp: 'full', notes: 'MoE architecture' },
  
  // Qwen family
  'qwen': { vllm: 'full', llamacpp: 'full' },
  'qwen2': { vllm: 'full', llamacpp: 'full' },
  'qwen2vl': { vllm: 'full', llamacpp: 'partial', notes: 'Vision features limited in llama.cpp' },
  
  // Google/DeepMind
  'gemma': { vllm: 'full', llamacpp: 'full' },
  'gemma2': { vllm: 'full', llamacpp: 'full' },
  
  // Microsoft
  'phi': { vllm: 'full', llamacpp: 'full' },
  'phi2': { vllm: 'full', llamacpp: 'full' },
  'phi3': { vllm: 'full', llamacpp: 'full' },
  'phi4': { vllm: 'full', llamacpp: 'full' },
  
  // Stability AI
  'stablelm': { vllm: 'full', llamacpp: 'full' },
  'starcoder': { vllm: 'full', llamacpp: 'full' },
  'starcoder2': { vllm: 'full', llamacpp: 'full' },
  
  // Other popular
  'falcon': { vllm: 'full', llamacpp: 'full' },
  'mpt': { vllm: 'full', llamacpp: 'full' },
  'bloom': { vllm: 'full', llamacpp: 'full' },
  'opt': { vllm: 'full', llamacpp: 'partial' },
  'gpt2': { vllm: 'full', llamacpp: 'full' },
  'gptneox': { vllm: 'full', llamacpp: 'full' },
  'gptj': { vllm: 'full', llamacpp: 'full' },
  'baichuan': { vllm: 'full', llamacpp: 'full' },
  'yi': { vllm: 'full', llamacpp: 'full' },
  'deepseek': { vllm: 'full', llamacpp: 'full' },
  'deepseekv2': { vllm: 'full', llamacpp: 'full' },
  'internlm': { vllm: 'full', llamacpp: 'full' },
  'internlm2': { vllm: 'full', llamacpp: 'full' },
  'chatglm': { vllm: 'partial', llamacpp: 'full', notes: 'vLLM support may vary by version' },
  'glm4': { vllm: 'full', llamacpp: 'full' },
  
  // Architectures with limited support
  'mamba': { vllm: 'experimental', llamacpp: 'full', notes: 'State-space model' },
  'mamba2': { vllm: 'experimental', llamacpp: 'full', notes: 'State-space model' },
  'rwkv': { vllm: 'none', llamacpp: 'partial', notes: 'RNN architecture' },
  'rwkv4': { vllm: 'none', llamacpp: 'partial', notes: 'RNN architecture' },
  'rwkv5': { vllm: 'none', llamacpp: 'partial', notes: 'RNN architecture' },
  
  // GPT-OSS / Harmony (Custom)
  'harmony': { vllm: 'none', llamacpp: 'full', notes: 'GPT-OSS custom architecture - llama.cpp only' },
  'gptoss': { vllm: 'none', llamacpp: 'full', notes: 'GPT-OSS custom architecture - llama.cpp only' },
  
  // Multimodal (limited GGUF support generally)
  'llava': { vllm: 'full', llamacpp: 'full', notes: 'Vision-language model' },
  'llava-next': { vllm: 'full', llamacpp: 'partial', notes: 'Vision features may vary' },
  'bakllava': { vllm: 'full', llamacpp: 'full' },
  'minicpm-v': { vllm: 'full', llamacpp: 'partial' },
  'fuyu': { vllm: 'partial', llamacpp: 'none' },
  'paligemma': { vllm: 'full', llamacpp: 'partial' },
  'pixtral': { vllm: 'full', llamacpp: 'none' },
  
  // Embedding models
  'bert': { vllm: 'none', llamacpp: 'full', notes: 'Embedding model only' },
  'nomic-bert': { vllm: 'none', llamacpp: 'full', notes: 'Embedding model' },
  'jina': { vllm: 'none', llamacpp: 'partial', notes: 'Embedding model' },
};

/**
 * Normalize architecture name for lookup
 */
export function normalizeArchName(arch: string | null | undefined): string {
  if (!arch) return '';
  
  // Lowercase and remove common suffixes/prefixes
  let normalized = arch.toLowerCase()
    .replace(/^(microsoft|meta|google|alibaba|01-ai|stability|bigscience|nomic-ai|jinaai|mistralai)[-_/]?/i, '')
    .replace(/[-_.]?for[-_.]?(causal|sequence|token|masked)[-_.]?(lm|classification|generation)?$/i, '')
    .replace(/[-_.]?(instruct|chat|base|hf|gguf)$/i, '')
    .replace(/[-_]v?\d+(\.\d+)?$/i, '')  // Remove version numbers
    .replace(/[-_]/g, '')
    .trim();
  
  // Handle specific mappings
  const mappings: Record<string, string> = {
    'llamaforcausallm': 'llama',
    'llama2': 'llama',
    'llama3': 'llama',
    'codellamaforcausallm': 'codellama',
    'mistralforcausallm': 'mistral',
    'mixtralformoe': 'mixtral',
    'qwen2forcausallm': 'qwen2',
    'gemmaforcausallm': 'gemma',
    'gemma2forcausallm': 'gemma2',
    'phi3forcausallm': 'phi3',
    'phiforcausallm': 'phi',
    'stablelmforcausallm': 'stablelm',
    'starcodermoeforcausallm': 'starcoder2',
    'gpt2lmhead': 'gpt2',
    'gptneoxforcausallm': 'gptneox',
    'gptjforcausallm': 'gptj',
    'falconforcausallm': 'falcon',
    'mptforcausallm': 'mpt',
    'bloomforcausallm': 'bloom',
    'internlm2forcausallm': 'internlm2',
    'chatglmforcondgen': 'chatglm',
    'glm4forcausallm': 'glm4',
    'deepseekv2forcausallm': 'deepseekv2',
    'mambaformcausallm': 'mamba',
    'rwkv4forcausallm': 'rwkv4',
    'llavaforcondgen': 'llava',
    'llavanextforcondgen': 'llava-next',
    // GPT-OSS / Harmony
    'gptoss': 'harmony',
    'gptoss120b': 'harmony',
    'gptoss20b': 'harmony',
  };
  
  return mappings[normalized] || normalized;
}

/**
 * Get compatibility info for an architecture
 */
export function getArchCompatibility(arch: string | null | undefined): ArchCompatibility {
  const normalized = normalizeArchName(arch);
  return ARCHITECTURE_COMPATIBILITY[normalized] || { vllm: 'unknown', llamacpp: 'unknown' };
}

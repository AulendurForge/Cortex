/** Shared types for GET /admin/models/inspect-folder (declared once, used by every form component). */

interface EngineOption {
  engine: 'vllm' | 'llamacpp';
  format: 'safetensors' | 'gguf';
  label: string;
  description: string;
  is_recommended: boolean;
  requires_merge?: boolean;
}

export interface EngineRecommendation {
  recommended: 'vllm' | 'llamacpp' | 'either' | string;
  reason: string;
  has_multipart_gguf: boolean;
  has_safetensors: boolean;
  has_gguf: boolean;
  vllm_gguf_compatible: boolean;
  options: EngineOption[];
}

export interface GGUFValidationSummary {
  total_files: number;
  valid_files: number;
  invalid_files: number;
  warnings: string[];
  errors: string[];
}

export interface GGUFMetadata {
  architecture: string | null;
  model_name: string | null;
  context_length: number | null;
  embedding_length: number | null;
  block_count: number | null;
  attention_head_count: number | null;
  attention_head_count_kv: number | null;
  vocab_size: number | null;
  file_type: number | null;
  quantization_version: number | null;
  file_type_name: string | null;
}

export interface GGUFGroup {
  quant_type: string;
  display_name: string;
  files: string[];
  full_paths: string[];
  is_multipart: boolean;
  expected_parts: number | null;
  actual_parts: number;
  total_size_mb: number;
  status: string;
  can_use: boolean;
  warning: string | null;
  is_recommended: boolean;
  metadata?: GGUFMetadata | null;
}

export interface SafeTensorInfo {
  files: string[];
  total_size_gb: number;
  file_count: number;
  architecture: string | null;
  model_type: string | null;
  vocab_size: number | null;
  max_position_embeddings: number | null;
  torch_dtype: string | null;
  tie_word_embeddings: boolean | null;
}

export interface InspectResult {
  has_safetensors: boolean;
  safetensor_info?: SafeTensorInfo | null;
  gguf_files: string[];
  gguf_groups: GGUFGroup[];
  tokenizer_files: string[];
  config_files: string[];
  warnings: string[];
  params_b?: number | null;
  hidden_size?: number | null;
  num_hidden_layers?: number | null;
  num_attention_heads?: number | null;
  engine_recommendation?: EngineRecommendation | null;
  gguf_validation?: GGUFValidationSummary | null;
}

export function hasGguf(inspect: InspectResult | null | undefined): boolean {
  if (!inspect) return false;
  return (inspect.gguf_files || []).length > 0 || (inspect.gguf_groups || []).length > 0;
}

/** True when the folder holds GGUF weights and nothing vLLM could load. */
export function isGgufOnly(inspect: InspectResult | null | undefined): boolean {
  return !!inspect && hasGguf(inspect) && !inspect.has_safetensors;
}

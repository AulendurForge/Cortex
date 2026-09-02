/**
 * Chat client for the playground: running-model discovery, model constraints and SSE streaming
 * of /v1/chat/completions. Non-streaming calls go through the shared `apiFetch`; the stream is a
 * raw fetch because it must read the response body incrementally.
 */

import apiFetch, { getGatewayBaseUrl, safeUuid } from './api-clients';

// ============================================================================
// Types
// ============================================================================

export type ChatUsage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
export type ChatTimings = { predicted_per_second?: number; prompt_per_second?: number; predicted_ms?: number; prompt_ms?: number };

export type ChatStreamChunk =
  | { type: 'content'; content: string }
  | { type: 'usage'; usage: ChatUsage; timings?: ChatTimings }
  | { type: 'done' };

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamChatOptions {
  signal?: AbortSignal;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  onFirstToken?: () => void;
}

export interface ModelConstraints {
  served_model_name: string;
  engine_type: string;
  task: string;
  context_size: number | null;
  max_model_len: number | null;
  max_tokens_default: number;
  request_defaults: Record<string, unknown> | null;
  supports_streaming: boolean;
  supports_system_prompt: boolean;
}

export interface RunningModel {
  served_model_name: string;
  task: string;
  engine_type: string;
  state: string;
}

// ============================================================================
// Errors
// ============================================================================

export class ChatError extends Error {
  constructor(message: string, public status: number, public code?: string, public requestId?: string) {
    super(message);
    this.name = 'ChatError';
  }
}

/** Standard gateway envelope: {error: {code, message}, request_id} (engines may also send {error: {message, code}}). */
function parseErrorBody(body: unknown, status: number, fallback: string): ChatError {
  const b = body as { error?: { message?: string; code?: string | number } | string; detail?: string; message?: string; request_id?: string } | null;
  const err = b?.error;
  const message = (typeof err === 'object' && err?.message) || (typeof err === 'string' ? err : undefined) || b?.detail || b?.message || fallback;
  const code = typeof err === 'object' && err?.code != null ? String(err.code) : undefined;
  return new ChatError(message, status, code, b?.request_id);
}

// ============================================================================
// API functions
// ============================================================================

/** Models a user can chat with right now (embedding models are excluded server-side). */
export async function fetchRunningModels(): Promise<RunningModel[]> {
  return apiFetch<RunningModel[]>('/v1/models/running');
}

export async function fetchModelConstraints(modelName: string): Promise<ModelConstraints> {
  return apiFetch<ModelConstraints>(`/v1/models/${encodeURIComponent(modelName)}/constraints`);
}

/**
 * Stream a chat completion. Yields content deltas, then one `usage` chunk (when the engine
 * reports it; llama.cpp also attaches `timings`), then a single `done`.
 */
export async function* streamChat(
  model: string,
  messages: ChatMessage[],
  options: StreamChatOptions = {},
): AsyncGenerator<ChatStreamChunk> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    max_tokens: options.maxTokens ?? 512,
    stream_options: { include_usage: true },
  };
  if (options.temperature != null) body.temperature = options.temperature;
  if (options.topP != null) body.top_p = options.topP;

  const response = await fetch(`${getGatewayBaseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-request-id': safeUuid() },
    credentials: 'include',
    signal: options.signal,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let parsed: unknown = null;
    try { parsed = await response.json(); } catch { /* not JSON */ }
    throw parseErrorBody(parsed, response.status, response.statusText || 'Request failed');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ChatError('No response body', 500);

  const decoder = new TextDecoder();
  let buffer = '';
  let firstTokenSeen = false;
  let usageSent = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith(':') || !line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          yield { type: 'done' };
          return;
        }
        let parsed: { choices?: Array<{ delta?: { content?: string } }>; usage?: ChatUsage; timings?: ChatTimings; error?: unknown };
        try { parsed = JSON.parse(data); } catch { continue; }
        if (parsed.error) throw parseErrorBody(parsed, 500, 'Engine error');
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          if (!firstTokenSeen) { firstTokenSeen = true; options.onFirstToken?.(); }
          yield { type: 'content', content };
        }
        if (parsed.usage && !usageSent) {
          usageSent = true;
          yield { type: 'usage', usage: parsed.usage, timings: parsed.timings };
        }
      }
    }
    // stream ended without [DONE]
    yield { type: 'done' };
  } finally {
    reader.releaseLock();
  }
}

// ============================================================================
// Token estimation (UI feedback only; ~4 chars per token)
// ============================================================================

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateContextUsage(messages: ChatMessage[]): number {
  let tokens = 0;
  for (const msg of messages) tokens += 4 + estimateTokens(msg.content);
  return tokens;
}

/**
 * Chat session persistence (server-side, user-scoped). Every call goes through the shared
 * `apiFetch`, so failures surface as errors with the gateway's request id instead of being
 * swallowed into empty lists.
 */

import apiFetch from './api-clients';
import type { ChatMessage } from '../hooks/useChat';
import type { ModelConstraints } from './chat-client';

export interface ChatSessionSummary {
  id: string;
  title: string;
  model_name: string;
  engine_type: string;
  message_count: number;
  created_at: number;
  updated_at: number;
}

export interface ChatSessionDetail {
  id: string;
  title: string;
  model_name: string;
  engine_type: string;
  constraints: ModelConstraints | null;
  messages: ChatMessageAPI[];
  created_at: number;
  updated_at: number;
}

export interface ChatMessageAPI {
  id?: number;
  role: string;
  content: string;
  metrics?: Record<string, unknown>;
  timestamp?: number;
}

export function listChatSessions(): Promise<ChatSessionSummary[]> {
  return apiFetch<ChatSessionSummary[]>('/v1/chat/sessions');
}

/** The engine is resolved server-side from the model; `engineType` is only a hint. */
export function createChatSession(modelName: string, engineType?: string, constraints: ModelConstraints | null = null): Promise<ChatSessionDetail> {
  return apiFetch<ChatSessionDetail>('/v1/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({ model_name: modelName, engine_type: engineType ?? 'vllm', constraints }),
  });
}

export function getChatSession(sessionId: string): Promise<ChatSessionDetail> {
  return apiFetch<ChatSessionDetail>(`/v1/chat/sessions/${encodeURIComponent(sessionId)}`);
}

export function addChatMessage(sessionId: string, role: string, content: string, metrics?: Record<string, unknown>): Promise<ChatMessageAPI> {
  return apiFetch<ChatMessageAPI>(`/v1/chat/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ role, content, metrics }),
  });
}

export function deleteChatSession(sessionId: string): Promise<unknown> {
  return apiFetch(`/v1/chat/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

export function clearAllChatSessions(): Promise<unknown> {
  return apiFetch('/v1/chat/sessions', { method: 'DELETE' });
}

export function apiMessageToHookMessage(msg: ChatMessageAPI, index: number): ChatMessage {
  return {
    id: msg.id?.toString() ?? `msg-${index}`,
    role: msg.role as ChatMessage['role'],
    content: msg.content,
    timestamp: msg.timestamp ?? Date.now(),
    metrics: msg.metrics as ChatMessage['metrics'],
    status: 'done',
  };
}

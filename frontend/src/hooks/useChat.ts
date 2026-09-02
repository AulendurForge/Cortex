/**
 * useChat - chat state, streaming and per-message metrics for the playground.
 */

import { useState, useCallback, useRef } from 'react';
import { streamChat, ChatMessage as ApiChatMessage, ChatError, StreamChatOptions } from '../lib/chat-client';
import { safeUuid } from '../lib/api-clients';

export type MessageStatus = 'done' | 'streaming' | 'cancelled' | 'failed';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metrics?: MessageMetrics;
  /** streaming: reply in progress; cancelled: user stopped it; failed: the request errored (user turn not answered). */
  status?: MessageStatus;
  /** Set on a failed request's error text (kept on the user turn). */
  error?: string;
}

export interface MessageMetrics {
  tokensPerSec?: number;
  ttftMs?: number;
  completionTokens?: number;
  promptTokens?: number;
  latencyMs?: number;
}

export interface ChatMetrics {
  tokensPerSec: number;
  ttftMs: number | null;
}

interface UseChatOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  onError?: (error: string) => void;
}

/** Turns worth sending to the model / persisting: no failed, cancelled or empty ones. */
export function conversationHistory(messages: ChatMessage[]): ApiChatMessage[] {
  return messages
    .filter((m) => m.status !== 'failed' && m.status !== 'cancelled' && m.status !== 'streaming' && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));
}

export function isPersistable(m: ChatMessage): boolean {
  return m.status !== 'failed' && m.status !== 'cancelled' && m.status !== 'streaming' && m.content.trim().length > 0;
}

/** tokens/s from real counts when available: completion tokens over the generation time (after the first token). */
export function computeTokensPerSec(completionTokens: number | undefined, firstTokenAt: number, endAt: number, chunkCount: number, startAt: number, reported?: number): number {
  if (reported && reported > 0) return reported;
  const genSeconds = firstTokenAt > 0 ? (endAt - firstTokenAt) / 1000 : (endAt - startAt) / 1000;
  const tokens = completionTokens ?? chunkCount;
  return genSeconds > 0.05 ? tokens / genSeconds : tokens;
}

export function useChat(options: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMetrics, setCurrentMetrics] = useState<ChatMetrics>({ tokensPerSec: 0, ttftMs: null });

  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const run = useCallback(async (userMessage: ChatMessage, history: ApiChatMessage[]) => {
    const assistantId = safeUuid();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now(), status: 'streaming' }]);
    abortRef.current = new AbortController();
    const m = { startTime: Date.now(), firstTokenTime: 0, chunkCount: 0 };
    setCurrentMetrics({ tokensPerSec: 0, ttftMs: null });
    let accumulated = '';
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
    let reportedTps: number | undefined;

    const streamOptions: StreamChatOptions = {
      signal: abortRef.current.signal,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      onFirstToken: () => {
        m.firstTokenTime = Date.now();
        setCurrentMetrics((prev) => ({ ...prev, ttftMs: m.firstTokenTime - m.startTime }));
      },
    };
    try {
      for await (const chunk of streamChat(options.model, [...history, { role: 'user', content: userMessage.content }], streamOptions)) {
        if (chunk.type === 'content') {
          accumulated += chunk.content;
          m.chunkCount++;
          const gen = (Date.now() - (m.firstTokenTime || m.startTime)) / 1000;
          setCurrentMetrics((prev) => ({ ...prev, tokensPerSec: gen > 0.05 ? m.chunkCount / gen : 0 }));
          setMessages((prev) => prev.map((x) => (x.id === assistantId ? { ...x, content: accumulated } : x)));
        } else if (chunk.type === 'usage') {
          usage = chunk.usage;
          reportedTps = chunk.timings?.predicted_per_second;
        } else if (chunk.type === 'done') {
          const end = Date.now();
          const metrics: MessageMetrics = {
            tokensPerSec: computeTokensPerSec(usage?.completion_tokens, m.firstTokenTime, end, m.chunkCount, m.startTime, reportedTps),
            ttftMs: m.firstTokenTime ? m.firstTokenTime - m.startTime : undefined,
            completionTokens: usage?.completion_tokens ?? m.chunkCount,
            promptTokens: usage?.prompt_tokens,
            latencyMs: end - m.startTime,
          };
          setCurrentMetrics({ tokensPerSec: metrics.tokensPerSec ?? 0, ttftMs: metrics.ttftMs ?? null });
          setMessages((prev) => prev.map((x) => (x.id === assistantId ? { ...x, content: accumulated, status: 'done', metrics } : x)));
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // user stopped the reply: keep what arrived, but never replay it to the model
        setMessages((prev) => prev.map((x) => (x.id === assistantId ? { ...x, content: accumulated, status: 'cancelled' } : x)));
      } else {
        const msg = err instanceof ChatError ? `${err.message}${err.code ? ` (${err.code})` : ''}` : (err as Error).message || 'Unexpected error';
        setError(msg);
        options.onError?.(msg);
        // drop the empty reply and mark the question as not answered so it can be retried
        setMessages((prev) => prev.filter((x) => x.id !== assistantId).map((x) => (x.id === userMessage.id ? { ...x, status: 'failed', error: msg } : x)));
      }
    } finally {
      streamingRef.current = false;
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [options]);

  const sendMessage = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text || streamingRef.current || !options.model) return;
    streamingRef.current = true;
    setIsStreaming(true);
    setError(null);
    const history = conversationHistory(messagesRef.current);
    const userMessage: ChatMessage = { id: safeUuid(), role: 'user', content: text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMessage]);
    await run(userMessage, history);
  }, [options.model, run]);

  /** Resend the last failed user turn. */
  const retryLast = useCallback(async () => {
    if (streamingRef.current) return;
    const failed = [...messagesRef.current].reverse().find((x) => x.role === 'user' && x.status === 'failed');
    if (!failed) return;
    streamingRef.current = true;
    setIsStreaming(true);
    setError(null);
    const history = conversationHistory(messagesRef.current.filter((x) => x.id !== failed.id));
    const retried: ChatMessage = { ...failed, status: undefined, error: undefined, timestamp: Date.now() };
    setMessages((prev) => prev.map((x) => (x.id === failed.id ? retried : x)));
    await run(retried, history);
  }, [run]);

  const stopStreaming = useCallback(() => { abortRef.current?.abort(); }, []);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setCurrentMetrics({ tokensPerSec: 0, ttftMs: null });
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { messages, isStreaming, error, currentMetrics, sendMessage, retryLast, stopStreaming, clearChat, clearError, setMessages };
}

export default useChat;

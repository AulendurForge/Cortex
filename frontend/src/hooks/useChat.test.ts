import { describe, it, expect } from 'vitest';
import { conversationHistory, isPersistable, computeTokensPerSec, type ChatMessage } from './useChat';
import { chatCapable } from '../components/chat/ModelSelector';
import { formatRelativeTime } from '../components/chat/ChatSidebar';

const msg = (over: Partial<ChatMessage>): ChatMessage => ({ id: over.id ?? 'x', role: 'user', content: 'hi', timestamp: 0, ...over });

describe('conversationHistory', () => {
  it('drops failed, cancelled, streaming and empty turns', () => {
    const msgs = [
      msg({ id: '1', role: 'user', content: 'q1' }),
      msg({ id: '2', role: 'assistant', content: 'a1', status: 'done' }),
      msg({ id: '3', role: 'user', content: 'q2', status: 'failed' }),
      msg({ id: '4', role: 'assistant', content: 'partial', status: 'cancelled' }),
      msg({ id: '5', role: 'assistant', content: '', status: 'done' }),
      msg({ id: '6', role: 'assistant', content: 'streaming…', status: 'streaming' }),
    ];
    expect(conversationHistory(msgs)).toEqual([{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }]);
    expect(msgs.filter(isPersistable).map((m) => m.id)).toEqual(['1', '2']);
  });
});

describe('computeTokensPerSec', () => {
  it('prefers the engine-reported rate, then real counts over generation time', () => {
    expect(computeTokensPerSec(10, 1000, 2000, 3, 0, 224.8)).toBe(224.8);
    expect(computeTokensPerSec(50, 1000, 3000, 7, 0)).toBe(25);     // 50 tokens in 2 s after first token
    expect(computeTokensPerSec(undefined, 1000, 3000, 7, 0)).toBe(3.5); // falls back to chunk count
  });
});

describe('chatCapable', () => {
  it('excludes embedding models', () => {
    const out = chatCapable([
      { served_model_name: 'chat', task: 'generate', engine_type: 'vllm', state: 'running' },
      { served_model_name: 'emb', task: 'embed', engine_type: 'llamacpp', state: 'running' },
    ]);
    expect(out.map((m) => m.served_model_name)).toEqual(['chat']);
  });
});

describe('formatRelativeTime', () => {
  it('formats recent times', () => {
    const now = 10_000_000;
    expect(formatRelativeTime(now - 10_000, now)).toBe('just now');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
  });
});

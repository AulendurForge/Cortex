/**
 * Chat Playground: talk to a running model with streaming replies, live metrics and
 * server-side (per-user) conversation history.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Card, InfoBox, Button } from '@/components/UI';
import { ChatInput, ChatSidebar, MessageList, ModelSelector, PerformanceMetrics } from '@/components/chat';
import { useChat, isPersistable } from '@/hooks/useChat';
import { fetchModelConstraints, fetchRunningModels, estimateContextUsage } from '@/lib/chat-client';
import { listChatSessions, createChatSession, getChatSession, addChatMessage, apiMessageToHookMessage } from '@/lib/chat-api';
import { useToast } from '@/providers/ToastProvider';
import { errMsg } from '@/lib/errors';


export default function ChatPage() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  // ids of messages already persisted for the current session
  const savedIdsRef = useRef<Set<string>>(new Set());
  const submittingRef = useRef(false);

  const sessionsQuery = useQuery({ queryKey: ['chat-sessions'], queryFn: listChatSessions, staleTime: 5_000 });
  const runningQuery = useQuery({ queryKey: ['running-models'], queryFn: fetchRunningModels, staleTime: 5_000, refetchInterval: 10_000 });
  const constraintsQuery = useQuery({
    queryKey: ['model-constraints', selectedModel],
    queryFn: () => fetchModelConstraints(selectedModel),
    enabled: !!selectedModel,
    staleTime: 30_000,
    retry: false,
  });
  const constraints = constraintsQuery.data ?? null;
  const modelIsRunning = !!selectedModel && (runningQuery.data ?? []).some((m) => m.served_model_name === selectedModel);

  const chat = useChat({
    model: selectedModel,
    maxTokens: constraints?.max_tokens_default ?? 512,
  });
  const { messages, isStreaming, error, currentMetrics, sendMessage, retryLast, stopStreaming, clearChat, clearError, setMessages } = chat;
  const isModelLocked = messages.length > 0;

  // Persist finished turns once, in order; a failed save is reported and retried on the next change.
  useEffect(() => {
    if (!currentChatId || isStreaming) return;
    const pending = messages.filter((m) => isPersistable(m) && !savedIdsRef.current.has(m.id));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const msg of pending) {
        if (cancelled) return;
        try {
          await addChatMessage(currentChatId, msg.role, msg.content, msg.metrics as Record<string, unknown> | undefined);
          savedIdsRef.current.add(msg.id);
        } catch (e) {
          addToast({ title: 'Could not save this conversation', description: errMsg(e), kind: 'error' });
          return;
        }
      }
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    })();
    return () => { cancelled = true; };
  }, [messages, currentChatId, isStreaming, queryClient, addToast]);

  const resetTo = useCallback((chatId: string | null, model: string) => {
    stopStreaming();
    clearChat();
    setCurrentChatId(chatId);
    setSelectedModel(model);
    savedIdsRef.current = new Set();
  }, [clearChat, stopStreaming]);

  const handleNewChat = useCallback(() => resetTo(null, ''), [resetTo]);

  const handleSelectChat = useCallback(async (chatId: string) => {
    try {
      const session = await getChatSession(chatId);
      resetTo(chatId, session.model_name);
      const hookMessages = session.messages.map((m, i) => apiMessageToHookMessage(m, i));
      setMessages(hookMessages);
      savedIdsRef.current = new Set(hookMessages.map((m) => m.id));
    } catch (e) {
      addToast({ title: 'Could not open this chat', description: errMsg(e), kind: 'error' });
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    }
  }, [resetTo, setMessages, addToast, queryClient]);

  const handleModelChange = useCallback((modelName: string) => {
    if (isModelLocked) return;
    clearError();
    setSelectedModel(modelName);
  }, [isModelLocked, clearError]);

  // The session row is created on the first message (never on mere model selection).
  const handleSendMessage = useCallback(async (content: string) => {
    if (!selectedModel || submittingRef.current || isStreaming) return;
    submittingRef.current = true;
    try {
      let chatId = currentChatId;
      if (!chatId) {
        const s = await createChatSession(selectedModel, constraints?.engine_type, constraints);
        chatId = s.id;
        setCurrentChatId(chatId);
        savedIdsRef.current = new Set();
        queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      }
      await sendMessage(content);
    } catch (e) {
      addToast({ title: 'Could not start the conversation', description: errMsg(e), kind: 'error' });
    } finally {
      submittingRef.current = false;
    }
  }, [selectedModel, currentChatId, constraints, sendMessage, addToast, queryClient, isStreaming]);

  const handleRefreshSessions = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    if (currentChatId) {
      try { await getChatSession(currentChatId); } catch { handleNewChat(); }
    }
  }, [currentChatId, handleNewChat, queryClient]);

  const contextUsed = estimateContextUsage(messages.filter(isPersistable).map((m) => ({ role: m.role, content: m.content })));
  const contextLimit = constraints?.context_size || constraints?.max_model_len || undefined;
  const sessions = (sessionsQuery.data ?? []).map((s) => ({
    id: s.id, title: s.title, modelName: s.model_name, engineType: s.engine_type, messageCount: s.message_count, createdAt: s.created_at, updatedAt: s.updated_at,
  }));
  const inputDisabled = !selectedModel || !modelIsRunning;

  return (
    <div className="space-y-4">
      <PageHeader title="Chat Playground" subtitle="Talk to a running model. Sampling settings come from the model's request defaults." />

      <Card className="p-0 overflow-hidden">
        <div className="flex h-[calc(100vh-220px)] min-h-[500px]">
          <ChatSidebar
            sessions={sessions}
            currentChatId={currentChatId}
            onSelectChat={handleSelectChat}
            onNewChat={handleNewChat}
            onRefresh={handleRefreshSessions}
            busy={isStreaming}
            loadError={sessionsQuery.isError ? errMsg(sessionsQuery.error) : null}
          />

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-white/5 bg-black/10">
              <ModelSelector value={selectedModel} onChange={handleModelChange} disabled={isStreaming} locked={isModelLocked} models={runningQuery.data} isLoading={runningQuery.isLoading} error={runningQuery.isError ? errMsg(runningQuery.error) : null} />
              {messages.length > 0 && (
                <Button size="sm" onClick={handleNewChat} aria-label="Start a new chat">New chat</Button>
              )}
            </div>

            <PerformanceMetrics metrics={currentMetrics} isStreaming={isStreaming} />

            {error && (
              <div className="mx-4 mt-4">
                <InfoBox variant="error" role="alert">
                  <div className="flex items-center justify-between gap-3">
                    <span>{error}</span>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" onClick={retryLast} disabled={isStreaming}>Retry</Button>
                      <Button size="sm" onClick={clearError}>Dismiss</Button>
                    </div>
                  </div>
                </InfoBox>
              </div>
            )}
            {selectedModel && !modelIsRunning && !runningQuery.isLoading && (
              <div className="mx-4 mt-4">
                <InfoBox variant="warning" className="text-xs">
                  <strong>{selectedModel}</strong> is not running. Start it on the Models page to continue this conversation, or start a new chat with a running model.
                </InfoBox>
              </div>
            )}
            {constraintsQuery.isError && modelIsRunning && (
              <div className="mx-4 mt-4"><InfoBox variant="warning" className="text-xs">Context limits for this model are unavailable ({errMsg(constraintsQuery.error)}); the context meter is hidden.</InfoBox></div>
            )}
            {isModelLocked && (
              <div className="mx-4 mt-4">
                <InfoBox variant="blue" className="text-xs">This conversation is bound to <strong>{selectedModel}</strong>. Start a new chat to use a different model.</InfoBox>
              </div>
            )}

            <MessageList messages={messages} isStreaming={isStreaming} onRetry={retryLast} />

            <ChatInput
              onSend={handleSendMessage}
              onStop={stopStreaming}
              disabled={inputDisabled}
              isStreaming={isStreaming}
              placeholder={!selectedModel ? 'Select a model to start chatting' : !modelIsRunning ? 'This model is not running' : 'Type a message…'}
              contextUsed={contextUsed}
              contextLimit={contextLimit}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

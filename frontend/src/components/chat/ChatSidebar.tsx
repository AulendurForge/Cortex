/**
 * ChatSidebar - conversation list with new/delete/clear.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { deleteChatSession, clearAllChatSessions } from '../../lib/chat-api';
import { useToast } from '../../providers/ToastProvider';
import { Button } from '../UI';
import { cn } from '../../lib/cn';

interface ChatSessionSummary {
  id: string;
  title: string;
  modelName: string;
  engineType: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface ChatSidebarProps {
  sessions: ChatSessionSummary[];
  currentChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onRefresh: () => void;
  /** True while a reply is streaming: switching or deleting would lose the in-flight turn. */
  busy?: boolean;
  loadError?: string | null;
}

export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function ChatSidebar({ sessions, currentChatId, onSelectChat, onNewChat, onRefresh, busy = false, loadError = null }: ChatSidebarProps) {
  const { addToast } = useToast();
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const handleDelete = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    try {
      await deleteChatSession(chatId);
      onRefresh();
    } catch (err) {
      addToast({ title: 'Could not delete chat', description: (err as { message?: string })?.message, kind: 'error' });
    }
  };

  const handleClearAll = async () => {
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      timer.current = window.setTimeout(() => setConfirmClearAll(false), 3000);
      return;
    }
    try {
      await clearAllChatSessions();
      onRefresh();
    } catch (err) {
      addToast({ title: 'Could not clear chats', description: (err as { message?: string })?.message, kind: 'error' });
    } finally {
      setConfirmClearAll(false);
    }
  };

  return (
    <nav className="w-64 flex flex-col bg-white/[0.02] border-r border-white/5" aria-label="Conversations">
      <div className="p-4 border-b border-white/5">
        <Button onClick={onNewChat} variant="cyan" size="sm" className="w-full justify-center gap-2" disabled={busy} title={busy ? 'Wait for the current reply to finish' : undefined}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          New chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loadError ? (
          <div className="text-center py-8 text-red-300 text-xs px-2" role="alert">Could not load conversations: {loadError}</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-8 text-white/50 text-sm">No conversations yet</div>
        ) : (
          <ul className="space-y-1">
            {sessions.map((session) => {
              const active = currentChatId === session.id;
              return (
                <li key={session.id} className={cn('group relative rounded-xl transition-all duration-200', active ? 'bg-teal-500/10 border border-teal-500/20' : 'hover:bg-white/5 border border-transparent')}>
                  <button
                    type="button"
                    onClick={() => onSelectChat(session.id)}
                    disabled={busy && !active}
                    aria-current={active ? 'true' : undefined}
                    className="w-full text-left p-3 pr-9 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 disabled:opacity-50"
                  >
                    <div className="text-sm font-medium text-white/80 truncate">{session.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn('text-[9px] px-1.5 py-0.5 rounded', session.engineType === 'llamacpp' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400')}>
                        {session.engineType === 'llamacpp' ? 'llama.cpp' : 'vLLM'}
                      </span>
                      <span className="text-[10px] text-white/50">{formatRelativeTime(session.updatedAt)}</span>
                    </div>
                    <div className="text-[10px] text-white/40 mt-1 truncate">{session.messageCount} message{session.messageCount === 1 ? '' : 's'} · {session.modelName}</div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, session.id)}
                    disabled={busy}
                    aria-label={`Delete chat ${session.title}`}
                    className="absolute top-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-red-500/20 text-white/50 hover:text-red-400 transition-all disabled:opacity-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {sessions.length > 0 && (
        <div className="p-3 border-t border-white/5">
          <button
            type="button"
            onClick={handleClearAll}
            disabled={busy}
            className={cn('w-full text-[11px] py-2 rounded-lg transition-colors disabled:opacity-50', confirmClearAll ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30' : 'text-white/50 hover:text-white/80 hover:bg-white/5')}
          >
            {confirmClearAll ? 'Click again to delete every chat' : 'Clear all chats'}
          </button>
        </div>
      )}
    </nav>
  );
}

export default ChatSidebar;

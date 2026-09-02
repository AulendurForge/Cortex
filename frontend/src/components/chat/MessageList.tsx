/**
 * MessageList - Displays chat messages with user/assistant styling.
 */

'use client';

import { useRef, useEffect } from 'react';
import Image from 'next/image';
import { ChatMessage } from '../../hooks/useChat';
import { MessageContent } from './MessageContent';
import { cn } from '../../lib/cn';
import CortexLogo from '../../assets/cortex logo white.PNG';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onRetry?: () => void;
}

function formatMetrics(metrics: ChatMessage['metrics']): string {
  if (!metrics) return '';
  const parts: string[] = [];
  if (metrics.tokensPerSec) {
    parts.push(`${metrics.tokensPerSec.toFixed(1)} tok/s`);
  }
  if (metrics.ttftMs) {
    parts.push(`TTFT: ${metrics.ttftMs}ms`);
  }
  if (metrics.completionTokens) {
    parts.push(`${metrics.completionTokens} tokens`);
  }
  return parts.join(' · ');
}

export function MessageList({ messages, isStreaming, onRetry }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Follow the stream only while the user is already at the bottom; never fight a manual scroll-up.
  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };
  useEffect(() => {
    if (stickToBottom.current) endRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/20 border border-teal-500/20 flex items-center justify-center p-3">
            <Image 
              src={CortexLogo} 
              alt="Cortex" 
              width={40} 
              height={40}
              className="opacity-70"
            />
          </div>
          <h3 className="text-lg font-semibold text-white/80 mb-2">Start a Conversation</h3>
          <p className="text-sm text-white/40">
            Select a model above and type a message to begin chatting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4 space-y-4" role="log" aria-live="polite" aria-busy={isStreaming}>
      {messages.map((message) => {
        const isUser = message.role === 'user';
        const showStreaming = message.status === 'streaming';
        const failed = message.status === 'failed';
        const cancelled = message.status === 'cancelled';
        
        return (
          <div
            key={message.id}
            className={cn(
              'flex gap-3',
              isUser ? 'justify-end' : 'justify-start'
            )}
          >
            {/* Avatar for assistant - Cortex logo */}
            {!isUser && (
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500/30 to-cyan-500/30 border border-teal-500/20 flex items-center justify-center p-1.5">
                <Image 
                  src={CortexLogo} 
                  alt="Cortex" 
                  width={20} 
                  height={20}
                  className="opacity-80"
                />
              </div>
            )}
            
            {/* Message bubble */}
            <div
              className={cn(
                'max-w-[80%] rounded-2xl px-4 py-3',
                isUser
                  ? cn('bg-teal-500/20 border border-teal-500/20 text-white', failed && 'border-red-500/40')
                  : cn('bg-white/5 border border-white/5 text-white/90', cancelled && 'border-amber-500/30')
              )}
            >
              {isUser ? (
                <>
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  {failed && (
                    <div className="mt-2 pt-2 border-t border-red-500/20 text-[11px] text-red-300 flex items-center justify-between gap-3">
                      <span>Not answered{message.error ? `: ${message.error}` : ''}</span>
                      {onRetry && <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:text-red-200">Retry</button>}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <MessageContent content={message.content || (showStreaming ? '' : '(empty reply)')} isStreaming={showStreaming} />
                  {cancelled && <div className="mt-2 text-[10px] text-amber-300/90 font-mono">stopped by you · not sent back to the model</div>}
                </>
              )}
              
              {/* Metrics for assistant messages */}
              {!isUser && message.metrics && !showStreaming && (
                <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-white/30 font-mono">
                  {formatMetrics(message.metrics)}
                </div>
              )}
            </div>
            
            {/* Avatar for user */}
            {isUser && (
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-indigo-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            )}
          </div>
        );
      })}
      
      {/* Scroll anchor */}
      <div ref={endRef} />
    </div>
  );
}

export default MessageList;


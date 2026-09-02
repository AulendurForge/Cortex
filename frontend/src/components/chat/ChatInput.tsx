/**
 * ChatInput - Message input area with send button and context tracking.
 */

'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Button } from '../UI';
import { estimateTokens } from '../../lib/chat-client';
import { cn } from '../../lib/cn';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  placeholder?: string;
  contextUsed?: number;
  contextLimit?: number;
}

export function ChatInput({
  onSend,
  onStop,
  disabled,
  isStreaming,
  placeholder = 'Type a message...',
  contextUsed = 0,
  contextLimit,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  const estimatedTokens = estimateTokens(value);
  const totalContext = contextUsed + estimatedTokens;
  const isOverLimit = contextLimit ? totalContext > contextLimit : false;

  const handleSend = () => {
    if (!value.trim() || disabled || isStreaming || isOverLimit) return;
    onSend(value.trim());
    setValue('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-white/5 p-4 bg-black/20">
      {/* Context usage bar */}
      {contextLimit != null && contextLimit > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
            <span>Context used (estimate)</span>
            <span className={cn(isOverLimit && 'text-red-400')}>
              ~{totalContext.toLocaleString()} / {contextLimit.toLocaleString()} tokens
            </span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300 rounded-full',
                isOverLimit 
                  ? 'bg-red-500' 
                  : totalContext / contextLimit > 0.8 
                    ? 'bg-amber-500' 
                    : 'bg-teal-500'
              )}
              style={{ width: `${Math.min(100, (totalContext / contextLimit) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            aria-label="Message"
            rows={1}
            className={cn(
              'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl',
              'text-sm text-white placeholder-white/30',
              'resize-none overflow-hidden',
              'focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'transition-all duration-200'
            )}
          />
          
          {/* Token count indicator */}
          {value && (
            <div className="absolute right-3 bottom-3 text-[10px] text-white/30 font-mono">
              ~{estimatedTokens} tokens
            </div>
          )}
        </div>

        {/* Send/Stop button */}
        {isStreaming ? (
          <Button
            onClick={onStop}
            variant="danger"
            size="sm"
            className="self-end px-4 py-3"
            aria-label="Stop generating"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </Button>
        ) : (
          <Button
            onClick={handleSend}
            disabled={!value.trim() || disabled || isOverLimit}
            variant="cyan"
            size="sm"
            className="self-end px-4 py-3"
            aria-label="Send message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </Button>
        )}
      </div>

      {/* Keyboard hint */}
      <div className="mt-2 text-[10px] text-white/20 text-center">
        Press <kbd className="px-1 py-0.5 bg-white/10 rounded text-white/40">Enter</kbd> to send, 
        <kbd className="px-1 py-0.5 bg-white/10 rounded text-white/40 ml-1">Shift+Enter</kbd> for new line
      </div>
    </div>
  );
}

export default ChatInput;


/**
 * MessageContent - Renders markdown content with syntax highlighting.
 * 
 * Uses react-markdown for markdown parsing and react-syntax-highlighter
 * for code block highlighting.
 */

'use client';

import ReactMarkdown from 'react-markdown';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';

// Only the languages models commonly emit; the full Prism bundle is several hundred KB.
for (const [name, lang] of Object.entries({ python, py: python, bash, sh: bash, shell: bash, javascript, js: javascript, typescript, ts: typescript, json, yaml, yml: yaml, markdown, md: markdown, sql })) {
  SyntaxHighlighter.registerLanguage(name, lang);
}
import { useState } from 'react';
import { safeCopyToClipboard } from '../../lib/clipboard';

interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (await safeCopyToClipboard(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors text-white/60 hover:text-white focus-visible:opacity-100"
      aria-label={copied ? 'Copied' : 'Copy code'}
      title="Copy code"
    >
      {copied ? (
        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

export function MessageContent({ content, isStreaming }: MessageContentProps) {
  return (
    <div className="prose prose-invert prose-sm max-w-none">
      <ReactMarkdown
        components={{
          // Code blocks with syntax highlighting
          // react-markdown v9+ has no `inline` flag: fenced blocks are the multi-line ones or those
          // with a language class; everything else is inline code.
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const codeString = String(children).replace(/\n$/, '');
            const isBlock = Boolean(match) || codeString.includes('\n');
            
            if (!isBlock) {
              return (
                <code 
                  className="bg-white/10 px-1.5 py-0.5 rounded text-sm font-mono text-teal-300" 
                  {...props}
                >
                  {children}
                </code>
              );
            }
            
            // Code block
            return (
              <div className="relative group my-3 not-prose">
                <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-10">
                  <CopyButton text={codeString} />
                </div>
                <div className="absolute left-3 top-2 text-[10px] text-white/30 font-mono uppercase">
                  {language}
                </div>
                <SyntaxHighlighter
                  style={oneDark}
                  language={language}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: '0.75rem',
                    fontSize: '0.8125rem',
                    padding: '2rem 1rem 1rem 1rem',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  {codeString}
                </SyntaxHighlighter>
              </div>
            );
          },
          // Paragraphs
          p({ children }) {
            return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>;
          },
          // Lists
          ul({ children }) {
            return <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          // Headings
          h1({ children }) {
            return <h1 className="text-xl font-bold mb-3 mt-4 first:mt-0">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h3>;
          },
          // Links
          a({ href, children }) {
            return (
              <a 
                href={href} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-teal-400 hover:text-teal-300 underline underline-offset-2"
              >
                {children}
              </a>
            );
          },
          // Model output must not load third-party images (tracking pixels); show the alt text instead
          img({ alt }) {
            return <span className="text-white/50 italic">[image{alt ? `: ${alt}` : ''}]</span>;
          },
          // Blockquotes
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-white/20 pl-4 my-3 text-white/70 italic">
                {children}
              </blockquote>
            );
          },
          // Horizontal rule
          hr() {
            return <hr className="border-white/10 my-4" />;
          },
          // Strong/bold
          strong({ children }) {
            return <strong className="font-bold text-white">{children}</strong>;
          },
          // Emphasis/italic
          em({ children }) {
            return <em className="italic text-white/90">{children}</em>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
      
      {/* Streaming cursor */}
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-teal-400 animate-pulse ml-0.5 align-middle" />
      )}
    </div>
  );
}

export default MessageContent;


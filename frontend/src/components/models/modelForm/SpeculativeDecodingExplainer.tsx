'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@/components/Modal';
import { cn } from '@/lib/cn';
import {
  SPECULATIVE_DECODING_SECTIONS,
  SPECULATIVE_DECODING_SUBTITLE,
  SPECULATIVE_DECODING_TITLE,
  type ExplainerBlock,
  type ExplainerItem,
} from './speculativeDecodingContent';

interface SpeculativeDecodingExplainerProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Renders `**bold**` runs of a prose string as <strong>. */
function inline(text: string): React.ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i} className="text-white">{part}</strong> : part));
}

const CALLOUT_TONE = {
  purple: 'bg-purple-500/10 border-purple-500/20 text-purple-300',
  amber: 'bg-amber-500/10 border-amber-500/20 text-amber-200/80',
  blue: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
} as const;

function Item({ item, index, style }: { item: ExplainerItem; index: number; style: 'numbered' | 'bullets' | 'cards' }) {
  const body = (
    <div className="flex-1 min-w-0">
      {item.title && (
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-white">{item.icon && style !== 'numbered' ? `${item.icon} ` : ''}{item.title}</span>
          {item.badge && <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded whitespace-nowrap">{item.badge}</span>}
        </div>
      )}
      <p className="text-white/60 text-sm mt-1">{inline(item.text)}</p>
      {item.code && <code className="block mt-2 p-2 bg-black/30 rounded text-purple-300 text-xs">{item.code}</code>}
      {item.tips && (
        <ul className="mt-3 space-y-1">
          {item.tips.map((tip) => (
            <li key={tip} className="flex items-start gap-2 text-xs text-white/50"><span className="text-purple-400">•</span><span>{tip}</span></li>
          ))}
        </ul>
      )}
    </div>
  );
  if (style === 'numbered') {
    return (
      <li className="flex gap-4 p-3 bg-white/5 rounded-lg border border-white/10">
        <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold text-sm flex-shrink-0">{index + 1}</div>
        {body}
      </li>
    );
  }
  return <li className={cn('p-4 bg-white/5 border border-white/10 rounded-xl', style === 'cards' && 'hover:border-purple-500/30 transition-colors')}>{body}</li>;
}

function Block({ block }: { block: ExplainerBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return <p className="text-white/70 leading-relaxed">{inline(block.text)}</p>;
    case 'callout':
      return (
        <div className={cn('p-4 border rounded-xl text-sm', CALLOUT_TONE[block.tone])}>
          {block.title && <div className="font-medium mb-2">{block.title}</div>}
          <p className="text-white/70">{inline(block.text)}</p>
        </div>
      );
    case 'list':
      return (
        <ol className={cn(block.style === 'cards' ? 'grid grid-cols-1 md:grid-cols-2 gap-4' : 'space-y-3')}>
          {block.items.map((item, i) => <Item key={item.title ?? i} item={item} index={i} style={block.style} />)}
        </ol>
      );
    case 'code':
      return (
        <div className="bg-[#0d1117] border border-white/10 rounded-xl p-4 font-mono text-sm overflow-x-auto">
          {block.comment && <div className="text-white/50 mb-2">{block.comment}</div>}
          <pre className="text-white/80 leading-relaxed whitespace-pre">{block.lines.join('\n')}</pre>
          {block.caption && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="text-white/50 text-xs">{block.caption}</div>
              {block.footer && <div className="text-purple-300 mt-1">{block.footer}</div>}
            </div>
          )}
        </div>
      );
    case 'table':
      return (
        <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20 rounded-xl p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-white/10">
              {block.rows.map(([label, value]) => (
                <tr key={label}><td className="py-2 text-white/50 pr-4">{label}</td><td className="py-2 text-white/80">{value}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/**
 * Explainer dialog for speculative decoding. Content lives in speculativeDecodingContent.ts;
 * the shared Modal provides role=dialog, the focus trap and Escape. It is portalled to
 * document.body so it escapes the workflow modal's overflow/backdrop-filter containing block.
 */
export function SpeculativeDecodingExplainer({ isOpen, onClose }: SpeculativeDecodingExplainerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  if (!mounted || !isOpen) return null;

  return createPortal(
    <Modal open={isOpen} onClose={onClose} title={SPECULATIVE_DECODING_TITLE}>
      <div role="document" tabIndex={0} className="space-y-6 focus:outline-none">
        <p className="text-sm text-purple-300/70 -mt-1">🚀 {SPECULATIVE_DECODING_SUBTITLE}</p>
        {SPECULATIVE_DECODING_SECTIONS.map((section) => (
          <section key={section.title} className="space-y-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2"><span aria-hidden>{section.icon}</span>{section.title}</h3>
            {section.blocks.map((block, i) => <Block key={i} block={block} />)}
          </section>
        ))}
        <div className="border-t border-white/10 pt-4 flex justify-end">
          <button type="button" onClick={onClose} className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors font-medium">Got it!</button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

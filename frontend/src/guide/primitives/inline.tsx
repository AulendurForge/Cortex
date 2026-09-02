'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useInterpolate } from './FactsContext';

/**
 * Tiny inline-markdown renderer: **bold**, `code`, [text](href) and "\n" line breaks. Input is
 * plain text — nothing is ever parsed as HTML, so content can quote `<` and `&` freely.
 */

type Token =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string; href: string }
  | { t: 'br' };

const INLINE_RE = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\n)/g;

export function tokenize(md: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of md.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ t: 'text', v: md.slice(last, idx) });
    if (m[2] !== undefined) out.push({ t: 'bold', v: m[2] });
    else if (m[4] !== undefined) out.push({ t: 'code', v: m[4] });
    else if (m[6] !== undefined && m[7] !== undefined) out.push({ t: 'link', v: m[6], href: m[7] });
    else out.push({ t: 'br' });
    last = idx + m[0].length;
  }
  if (last < md.length) out.push({ t: 'text', v: md.slice(last) });
  return out;
}

export function isInternalHref(href: string): boolean {
  return href.startsWith('/') || href.startsWith('#') || href.startsWith('?');
}

/**
 * Next's soft navigation does not emit `hashchange` for a hash-only change, so in-guide links
 * that target a sub-tab anchor dispatch one themselves (the Getting Started page listens).
 */
export function announceHash(href: string) {
  if (typeof window === 'undefined' || !href.includes('#')) return;
  const newURL = new URL(href, window.location.origin).href;
  window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: window.location.href, newURL }));
}

const UNSAFE_HREF = /^\s*(javascript|data|vbscript):/i;

export function GuideLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const cls = cn('text-cyan-300 hover:text-cyan-200 underline underline-offset-2 break-words', className);
  if (UNSAFE_HREF.test(href)) return <>{children}</>;
  if (isInternalHref(href)) {
    return <Link href={href} className={cls} onClick={() => announceHash(href)}>{children}</Link>;
  }
  return <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{children}</a>;
}

export function InlineCode({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.95em] text-cyan-300 bg-black/30 px-1 py-px rounded break-all">{children}</code>;
}

/** Render already-interpolated inline markdown to React nodes. */
export function renderInline(md: string): ReactNode[] {
  return tokenize(md).map((tok, i) => {
    switch (tok.t) {
      case 'text': return tok.v;
      case 'bold': return <strong key={i} className="font-semibold text-white">{tok.v}</strong>;
      case 'code': return <InlineCode key={i}>{tok.v}</InlineCode>;
      case 'link': return <GuideLink key={i} href={tok.href}>{tok.v}</GuideLink>;
      case 'br': return <br key={i} />;
    }
  });
}

/** Inline markdown with the facts in scope interpolated; returns a fragment, not a block. */
export function Inline({ md }: { md: string }) {
  const interpolate = useInterpolate();
  return <>{renderInline(interpolate(md))}</>;
}

export function Paragraph({ md, className }: { md: string; className?: string }) {
  return (
    <p className={cn('text-[13px] text-white/75 leading-relaxed max-w-3xl', className)}>
      <Inline md={md} />
    </p>
  );
}

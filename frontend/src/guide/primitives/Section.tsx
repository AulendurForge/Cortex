'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Paragraph } from './inline';

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const HEADING_CLASS: Record<2 | 3, string> = {
  2: 'text-sm font-bold uppercase tracking-wider text-cyan-300 scroll-mt-24',
  3: 'text-[13px] font-bold text-white scroll-mt-24',
};

export function Heading({ level, text, id, className }: { level: 2 | 3; text: string; id?: string; className?: string }) {
  const Tag = level === 2 ? 'h2' : 'h3';
  return <Tag id={id ?? slugify(text)} className={cn(HEADING_CLASS[level], className)}>{text}</Tag>;
}

/** A guide section: `<section id>` with a real `<h2 id>` so `#anchors` work. */
export function Section({ id, title, intro, children, className }: { id: string; title: string; intro?: string; children?: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn('space-y-3 scroll-mt-24', className)}>
      <Heading level={2} text={title} id={`${id}-title`} />
      {intro ? <Paragraph md={intro} /> : null}
      {children}
    </section>
  );
}

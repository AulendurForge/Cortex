'use client';

import { Card } from '@/components/UI';
import type { CardItem, LinkCardItem } from '../types';
import { Inline, GuideLink, isInternalHref, announceHash } from './inline';
import Link from 'next/link';

export function Cards({ items }: { items: CardItem[] }) {
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 list-none m-0 p-0">
      {items.map((item, i) => (
        <li key={i}>
          <Card className="p-4 bg-white/[0.02] border-white/5 h-full space-y-1.5">
            {item.icon ? <div className="text-2xl" aria-hidden="true">{item.icon}</div> : null}
            <div className="text-[12px] font-bold text-white uppercase tracking-wider">{item.title}</div>
            <div className="text-[12px] text-white/70 leading-relaxed"><Inline md={item.md} /></div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** Cards that are links (in-app pages or external docs); the whole card is the link target. */
export function LinkCards({ items }: { items: LinkCardItem[] }) {
  return (
    <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 list-none m-0 p-0">
      {items.map((item, i) => {
        const inner = (
          <>
            <div className="text-[12px] font-bold text-cyan-300 uppercase tracking-wider">{item.title}</div>
            <div className="text-[11px] text-white/65 leading-relaxed mt-0.5"><Inline md={item.md} /></div>
            {item.label ? <div className="text-[10px] text-white/55 mt-2 font-semibold">{item.label} <span aria-hidden="true">→</span></div> : null}
          </>
        );
        const cls = 'block h-full p-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-cyan-500/30 hover:bg-white/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60';
        return (
          <li key={i}>
            {isInternalHref(item.href)
              ? <Link href={item.href} className={cls} onClick={() => announceHash(item.href)}>{inner}</Link>
              : <a href={item.href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a>}
          </li>
        );
      })}
    </ul>
  );
}

export { GuideLink };

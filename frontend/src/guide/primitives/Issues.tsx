'use client';

import { Card } from '@/components/UI';
import type { IssueItem } from '../types';
import { Inline } from './inline';
import { slugify } from './Section';

/** Troubleshooting entries: symptom, likely causes, solutions. */
export function Issues({ items }: { items: IssueItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((it, i) => {
        const id = `issue-${slugify(it.title)}`;
        return (
          <Card key={i} className="p-4 border-l-4 border-l-amber-500/60 bg-white/[0.02] space-y-3">
            <h3 id={id} className="text-[12px] font-bold uppercase tracking-wider text-amber-200 scroll-mt-24">{it.title}</h3>
            <div className={`grid grid-cols-1 gap-4 ${it.symptoms?.length ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
              {it.symptoms?.length ? (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Symptoms</div>
                  <ul className="space-y-1 text-[12px] text-white/70 list-disc pl-4">
                    {it.symptoms.map((s, k) => <li key={k}><Inline md={s} /></li>)}
                  </ul>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Likely causes</div>
                <ul className="space-y-1 text-[12px] text-white/70 list-disc pl-4">
                  {it.causes.map((c, k) => <li key={k}><Inline md={c} /></li>)}
                </ul>
              </div>
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Solutions</div>
                <ul className="space-y-1 text-[12px] text-white/75 list-disc pl-4">
                  {it.solutions.map((s, k) => <li key={k}><Inline md={s} /></li>)}
                </ul>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

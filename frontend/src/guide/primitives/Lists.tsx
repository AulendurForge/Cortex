'use client';

import { Inline } from './inline';

export function List({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const cls = 'text-[12px] text-white/75 leading-relaxed space-y-1 pl-5 max-w-3xl';
  const rows = items.map((md, i) => <li key={i}><Inline md={md} /></li>);
  return ordered ? <ol className={`${cls} list-decimal`}>{rows}</ol> : <ul className={`${cls} list-disc`}>{rows}</ul>;
}

/** Items that read as "done when true"; the check mark is decorative. */
export function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-[12px] text-white/75 leading-relaxed max-w-3xl list-none m-0 p-0">
      {items.map((md, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="text-emerald-400 mt-px" aria-hidden="true">✓</span>
          <span className="min-w-0"><Inline md={md} /></span>
        </li>
      ))}
    </ul>
  );
}

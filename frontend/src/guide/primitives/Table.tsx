'use client';

import { Inline } from './inline';

/** Scrollable data table with a caption (visually hidden unless given) and column scopes. */
export function Table({ columns, rows, caption }: { columns: string[]; rows: string[][]; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/20">
      <table className="w-full text-[12px] text-left border-collapse">
        <caption className={caption ? 'text-[11px] text-white/60 text-left px-3 py-2 caption-top' : 'sr-only'}>{caption ?? 'Table'}</caption>
        <thead>
          <tr className="bg-white/5">
            {columns.map((c, i) => (
              <th key={i} scope="col" className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white/60 whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="text-white/75">
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-white/5 align-top">
              {row.map((cell, c) => (
                <td key={c} className="px-3 py-2 leading-relaxed"><Inline md={cell} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

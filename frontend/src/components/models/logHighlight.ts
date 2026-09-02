/** Pure text helpers for the log viewer: severity filtering, search matches and highlight span merging. */

export const LOG_SEVERITIES = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const;
export type LogSeverity = (typeof LOG_SEVERITIES)[number];

export type TextRange = { start: number; end: number };
export type SeveritySpan = TextRange & { sev: LogSeverity };
export type HighlightSpan = TextRange & { type: 'match' | 'active' | 'sev'; sev?: LogSeverity; key: string };

const SEV_RE = /\b(ERROR|WARN|INFO|DEBUG)\b/;

/** Keep only the lines whose severity token is in `activeSev` (all lines when the set is empty). */
export function filterBySeverity(text: string, activeSev: ReadonlySet<string>): string {
  if (!activeSev.size) return text;
  return text
    .split(/\r?\n/)
    .filter((l) => {
      const sev = (l.match(SEV_RE) || [])[1];
      return sev ? activeSev.has(sev) : false;
    })
    .join('\n');
}

/** Find every occurrence of `query` (literal unless `useRegex`); an invalid regex yields no matches. */
export function findMatches(text: string, query: string, caseSensitive: boolean, useRegex: boolean): TextRange[] {
  if (!query) return [];
  try {
    const flags = caseSensitive ? 'g' : 'gi';
    const pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(pattern, flags);
    const out: TextRange[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      out.push({ start: m.index, end: m.index + (m[0]?.length || 0) });
      if (m.index === re.lastIndex) re.lastIndex++; // avoid zero-length loops
    }
    return out;
  } catch {
    return [];
  }
}

/** Positions of every severity token, used to colour them. */
export function findSeveritySpans(text: string): SeveritySpan[] {
  const out: SeveritySpan[] = [];
  const re = new RegExp(SEV_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ start: m.index, end: m.index + m[0].length, sev: m[1] as LogSeverity });
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

const PRIORITY: Record<HighlightSpan['type'], number> = { active: 3, match: 2, sev: 1 };

/**
 * Merge search matches and severity spans into a sorted, non-overlapping list.
 * Overlaps are resolved by priority (active > match > sev): the higher-priority span is kept
 * whole and the lower-priority one is trimmed around it. Returns [] when there is nothing to
 * highlight so callers can render the plain text.
 */
export function mergeHighlightSpans(matches: TextRange[], activeMatch: number, sevSpans: SeveritySpan[]): HighlightSpan[] {
  const spans: HighlightSpan[] = [];
  matches.forEach((m, i) => spans.push({ start: m.start, end: m.end, type: i === activeMatch ? 'active' : 'match', key: `m-${i}` }));
  sevSpans.forEach((s, i) => spans.push({ start: s.start, end: s.end, type: 'sev', sev: s.sev, key: `s-${i}` }));
  if (!spans.length) return [];
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: HighlightSpan[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (!last || s.start >= last.end) { merged.push(s); continue; }
    if (PRIORITY[s.type] > PRIORITY[last.type]) {
      // cut last to s.start, then push s, then the remainder of last
      if (s.start > last.start) merged[merged.length - 1] = { ...last, end: s.start };
      else merged.pop();
      merged.push(s);
      if (s.end < last.end) merged.push({ ...last, start: s.end });
    } else if (s.end > last.end) {
      // keep last; insert the remainder of s after it
      merged.push({ ...s, start: last.end });
    }
  }
  return merged;
}

export function severityClass(sev?: string): string {
  return sev === 'ERROR' ? 'text-red-300' : sev === 'WARN' ? 'text-amber-300' : sev === 'INFO' ? 'text-sky-300' : sev === 'DEBUG' ? 'text-slate-300' : '';
}

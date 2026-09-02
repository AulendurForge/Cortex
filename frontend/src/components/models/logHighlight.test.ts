import { describe, expect, it } from 'vitest';
import { filterBySeverity, findMatches, findSeveritySpans, mergeHighlightSpans } from './logHighlight';

describe('findMatches', () => {
  it('treats the query literally (regex specials escaped) and ignores case by default', () => {
    const text = 'a.b A.B axb';
    expect(findMatches(text, 'a.b', false, false)).toEqual([{ start: 0, end: 3 }, { start: 4, end: 7 }]);
    expect(findMatches(text, 'a.b', true, false)).toEqual([{ start: 0, end: 3 }]);
    expect(findMatches(text, 'a.b', false, true)).toHaveLength(3);
    expect(findMatches(text, '(', false, true)).toEqual([]); // invalid regex -> no matches, no throw
    expect(findMatches(text, '', false, false)).toEqual([]);
  });
});

describe('filterBySeverity / findSeveritySpans', () => {
  it('keeps only lines of the active severities and locates severity tokens', () => {
    const text = 'INFO boot\nERROR bad thing\nplain line\nWARN careful';
    expect(filterBySeverity(text, new Set())).toBe(text);
    expect(filterBySeverity(text, new Set(['ERROR', 'WARN']))).toBe('ERROR bad thing\nWARN careful');
    expect(findSeveritySpans('x ERROR y INFO')).toEqual([
      { start: 2, end: 7, sev: 'ERROR' },
      { start: 10, end: 14, sev: 'INFO' },
    ]);
  });
});

describe('mergeHighlightSpans', () => {
  it('resolves overlaps by priority (active > match > sev) and trims the loser', () => {
    // severity token "ERROR" at 0..5, search match "RRO" at 1..4 (active), plain match at 8..10
    const merged = mergeHighlightSpans([{ start: 1, end: 4 }, { start: 8, end: 10 }], 0, [{ start: 0, end: 5, sev: 'ERROR' }]);
    expect(merged.map((s) => [s.start, s.end, s.type])).toEqual([
      [0, 1, 'sev'],
      [1, 4, 'active'],
      [4, 5, 'sev'],
      [8, 10, 'match'],
    ]);
    // a lower-priority span starting inside a higher one only contributes its remainder
    const tail = mergeHighlightSpans([{ start: 0, end: 4 }], -1, [{ start: 2, end: 6, sev: 'WARN' }]);
    expect(tail.map((s) => [s.start, s.end, s.type])).toEqual([[0, 4, 'match'], [4, 6, 'sev']]);
    expect(mergeHighlightSpans([], 0, [])).toEqual([]);
  });
});

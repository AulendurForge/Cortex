/**
 * Guardrails for the in-app guide: it must not drift from the code again.
 * Runs against the section sources (the TSX tabs here and the content-as-data tabs in
 * src/guide/content); repo-level checks (Makefile targets, pinned image tags) are skipped when
 * the files are not reachable (e.g. inside the frontend container).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FORBIDDEN_PHRASES as FORBIDDEN } from '@/guide/forbidden';

const GUIDE_DIRS = [resolve(__dirname, 'sections'), resolve(__dirname, '..', '..', '..', 'src', 'guide', 'content')];
const REPO = resolve(__dirname, '..', '..', '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(p) && !p.endsWith('.test.ts') ? [p] : [];
  });
}
const files = GUIDE_DIRS.filter(existsSync).flatMap(walk).map((p) => ({ path: p, text: readFileSync(p, 'utf8') }));

describe('guide content', () => {
  it('contains no known-stale statements', () => {
    const hits: string[] = [];
    for (const f of files) for (const [re, why] of FORBIDDEN) if (re.test(f.text)) hits.push(`${f.path}: ${why} (${re})`);
    expect(hits).toEqual([]);
  });

  it('only references make targets that exist', () => {
    const mk = join(REPO, 'Makefile');
    if (!existsSync(mk)) return;
    const targets = new Set([...readFileSync(mk, 'utf8').matchAll(/^([a-zA-Z_-]+):/gm)].map((m) => m[1]));
    const bad: string[] = [];
    for (const f of files) for (const m of f.text.matchAll(/\bmake ([a-z][a-z0-9_-]+)/g)) if (!targets.has(m[1]!)) bad.push(`${f.path}: make ${m[1]}`);
    expect(bad).toEqual([]);
  });

  it('quotes the pinned engine images only', () => {
    const ve = join(REPO, 'versions.env');
    if (!existsSync(ve)) return;
    const pins = Object.fromEntries([...readFileSync(ve, 'utf8').matchAll(/^([A-Z_]+)=(.+)$/gm)].map((m) => [m[1], m[2]]));
    const bad: string[] = [];
    for (const f of files) {
      for (const m of f.text.matchAll(/vllm\/vllm-openai:[\w.-]+/g)) if (m[0] !== pins.VLLM_IMAGE && !m[0].endsWith('-cu129')) bad.push(`${f.path}: ${m[0]}`);
      for (const m of f.text.matchAll(/ghcr\.io\/ggml-org\/llama\.cpp:[\w.-]+/g)) if (m[0] !== pins.LLAMACPP_IMAGE) bad.push(`${f.path}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });
});

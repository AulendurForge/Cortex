/**
 * Data-level guardrails for the content-as-data guide tabs: every `make <target>` exists in the
 * repo Makefile (skipped when the Makefile is not readable, e.g. inside the frontend container),
 * every quoted engine image is the pinned one, no block repeats a known-false statement, custom
 * block ids are unique per tab and section ids are unique.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ALL_GUIDE_TABS } from './index';
import { FORBIDDEN_PHRASES } from '../forbidden';
import { DEFAULT_FACTS, interpolate } from '../interpolate';
import type { Block, GuideTab } from '../types';

const REPO = resolve(__dirname, '..', '..', '..', '..');

/** Every string a block can show, interpolated with the defaults so tokens are real values. */
function blockStrings(b: Block): string[] {
  switch (b.kind) {
    case 'p': return [b.md];
    case 'h': return [b.text];
    case 'steps': return b.items.flatMap((s) => [s.title, s.md ?? '', s.code ?? '']);
    case 'code': return [b.text, b.label ?? ''];
    case 'callout': return [b.md, b.title ?? ''];
    case 'list': case 'checklist': return b.items;
    case 'table': return [...b.columns, ...b.rows.flat(), b.caption ?? ''];
    case 'cards': return b.items.flatMap((c) => [c.title, c.md]);
    case 'link-cards': return b.items.flatMap((c) => [c.title, c.md, c.href, c.label ?? '']);
    case 'issues': return b.items.flatMap((c) => [c.title, ...(c.symptoms ?? []), ...c.causes, ...c.solutions]);
    case 'custom': return [];
  }
}

function codeStrings(b: Block): string[] {
  switch (b.kind) {
    case 'code': return [b.text];
    case 'steps': return b.items.flatMap((s) => (s.code ? [s.code] : []));
    default: return [];
  }
}

function tabBlocks(tab: GuideTab): Array<{ where: string; block: Block }> {
  const lead = (tab.lead ?? []).map((block, i) => ({ where: `${tab.id}/lead[${i}]`, block }));
  const rest = tab.sections.flatMap((s) => s.blocks.map((block, i) => ({ where: `${tab.id}/${s.id}[${i}]`, block })));
  return [...lead, ...rest];
}

const entries = ALL_GUIDE_TABS.flatMap((tab) => tabBlocks(tab).map((e) => ({ ...e, text: blockStrings(e.block).map((s) => interpolate(s, DEFAULT_FACTS)).join('\n'), code: codeStrings(e.block).join('\n') })));

describe('guide content (data)', () => {
  it('has at least the four ported tabs with sections', () => {
    expect(ALL_GUIDE_TABS.map((t) => t.id)).toEqual(expect.arrayContaining(['welcome', 'first-model', 'diagnostics', 'about-cortex', 'api-keys', 'about-usage', 'users-orgs', 'chat-playground', 'transfer']));
    for (const t of ALL_GUIDE_TABS) expect(t.sections.length).toBeGreaterThan(0);
  });

  it('contains no known-stale statements', () => {
    const hits: string[] = [];
    for (const e of entries) for (const [re, why] of FORBIDDEN_PHRASES) if (re.test(e.text)) hits.push(`${e.where}: ${why} (${re})`);
    expect(hits).toEqual([]);
  });

  it('only references make targets that exist', () => {
    const mk = join(REPO, 'Makefile');
    if (!existsSync(mk)) return;
    const targets = new Set([...readFileSync(mk, 'utf8').matchAll(/^([a-zA-Z_-]+):/gm)].map((m) => m[1]));
    const bad: string[] = [];
    for (const e of entries) {
      for (const m of `${e.code}\n${e.text}`.matchAll(/(?:^|`|\$ |\n)make ([a-z][a-z0-9_-]+)/gm)) if (!targets.has(m[1]!)) bad.push(`${e.where}: make ${m[1]}`);
    }
    expect(bad).toEqual([]);
  });

  it('quotes the pinned engine images only', () => {
    const ve = join(REPO, 'versions.env');
    const pins = existsSync(ve)
      ? Object.fromEntries([...readFileSync(ve, 'utf8').matchAll(/^([A-Z_]+)=(.+)$/gm)].map((m) => [m[1], m[2]]))
      : { VLLM_IMAGE: DEFAULT_FACTS.VLLM_IMAGE, LLAMACPP_IMAGE: DEFAULT_FACTS.LLAMACPP_IMAGE };
    // the compile-time fallbacks must match the pins too
    expect(DEFAULT_FACTS.VLLM_IMAGE).toBe(pins.VLLM_IMAGE);
    expect(DEFAULT_FACTS.LLAMACPP_IMAGE).toBe(pins.LLAMACPP_IMAGE);
    const bad: string[] = [];
    for (const e of entries) {
      for (const m of e.text.matchAll(/vllm\/vllm-openai:[\w.-]+/g)) if (m[0] !== pins.VLLM_IMAGE && !m[0].endsWith('-cu129')) bad.push(`${e.where}: ${m[0]}`);
      for (const m of e.text.matchAll(/ghcr\.io\/ggml-org\/llama\.cpp:[\w.-]+/g)) if (m[0] !== pins.LLAMACPP_IMAGE) bad.push(`${e.where}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });

  it('does not hardcode values that have tokens', () => {
    const bad: string[] = [];
    for (const e of entries) {
      const raw = blockStrings(e.block).join('\n');
      if (/\/var\/cortex\/models(?![\w-])/.test(raw) && !/inside the gateway/.test(raw)) bad.push(`${e.where}: hardcoded models dir`);
      if (/:8084\b/.test(raw)) bad.push(`${e.where}: hardcoded gateway port`);
      if (/\b192\.168\.\d+\.\d+\b/.test(raw)) bad.push(`${e.where}: hardcoded LAN address`);
    }
    expect(bad).toEqual([]);
  });

  it('has unique section ids and only known custom block ids', () => {
    const KNOWN_CUSTOM = new Set(['welcome-hero', 'host-ip-banner', 'tutorial-cta', 'model-picker', 'diagnostic-checks', 'models-cta', 'spec-flags:vllm', 'spec-flags:llamacpp']);
    const ids = ALL_GUIDE_TABS.flatMap((t) => t.sections.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
    const unknown = entries.filter((e) => e.block.kind === 'custom' && !KNOWN_CUSTOM.has((e.block as { id: string }).id)).map((e) => e.where);
    expect(unknown).toEqual([]);
  });

  it('uses only well-formed inline markdown links', () => {
    const bad: string[] = [];
    // page-supplied facts (e.g. {{MODEL_URL}}) are not in DEFAULT_FACTS and survive interpolation
    for (const e of entries) for (const m of e.text.matchAll(/\]\(([^)]*)\)/g)) if (!/^(https?:\/\/|\/|#|\{\{[A-Z_]+\}\})/.test(m[1] ?? '')) bad.push(`${e.where}: ${m[0]}`);
    expect(bad).toEqual([]);
  });
});

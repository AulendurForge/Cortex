/**
 * Manage Models guardrails beyond content.test.ts: the curated per-flag tips must name real spec
 * fields (the cards are generated from the spec, so a stale key would silently show nothing) and
 * carry no known-false statements; the sub-tab ids are what deep links and the page rely on.
 */
import { describe, it, expect } from 'vitest';
import { manageModels, SPEC_FLAG_TIPS } from './models';
import { FORBIDDEN_PHRASES } from '../forbidden';
import { STATIC_ENGINE_SPEC } from '../../lib/engine-spec';

describe('manage models content', () => {
  it('keeps the seven sub-tabs and their ids', () => {
    expect(manageModels.id).toBe('manage-models');
    expect(manageModels.tabs.map((t) => t.id)).toEqual(['overview', 'engines', 'adding', 'config', 'operations', 'recipes', 'troubleshooting']);
  });

  it('only has flag tips for fields that exist in the engine spec', () => {
    const names = new Set(STATIC_ENGINE_SPEC.fields.map((f) => f.name));
    const unknown = Object.keys(SPEC_FLAG_TIPS).filter((k) => !names.has(k));
    expect(unknown).toEqual([]);
  });

  it('has no known-stale statements in the flag tips', () => {
    const hits: string[] = [];
    for (const [name, tip] of Object.entries(SPEC_FLAG_TIPS)) for (const [re, why] of FORBIDDEN_PHRASES) if (re.test(tip)) hits.push(`${name}: ${why}`);
    expect(hits).toEqual([]);
  });

  it('renders the spec flag reference for both engines', () => {
    const ids = manageModels.tabs.flatMap((t) => t.sections.flatMap((s) => s.blocks)).filter((b) => b.kind === 'custom').map((b) => (b as { id: string }).id);
    expect(ids).toContain('spec-flags:vllm');
    expect(ids).toContain('spec-flags:llamacpp');
  });
});

/**
 * Guardrails for the in-app guide: it must not drift from the code again.
 * Runs against the section sources; repo-level checks (Makefile targets, pinned image tags) are
 * skipped when the files are not reachable (e.g. inside the frontend container).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const GUIDE_DIR = resolve(__dirname, 'sections');
const REPO = resolve(__dirname, '..', '..', '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
}
const files = walk(GUIDE_DIR).map((p) => ({ path: p, text: readFileSync(p, 'utf8') }));

const FORBIDDEN: Array<[RegExp, string]> = [
  [/admin\s*\/\s*admin/i, 'default admin/admin credentials no longer exist'],
  [/ctx_[a-z0-9_]{4,}/i, 'API keys have no ctx_ prefix'],
  [/192\.168\.1\.181/, 'hardcoded LAN address'],
  [/nvidia\/cuda:12\.0-base/, 'image tag does not exist'],
  [/BETA 0\.1/, 'stale version badge'],
  [/Deployment \(Beta\)/, 'page is called Transfer'],
  [/SHA-256 hashed|hashed \(SHA-256\)/i, 'keys are bcrypt hashed'],
  [/vLLM (cannot|can't|does not) (load|run) GPT-OSS/i, 'vLLM v0.28 runs gpt-oss'],
  [/circuit break/i, 'no circuit breaker feature is exposed to users'],
];

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

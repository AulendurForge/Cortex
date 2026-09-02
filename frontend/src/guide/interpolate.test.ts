import { describe, it, expect } from 'vitest';
import { DEFAULT_FACTS, GUIDE_TOKENS, factIsSet, factsFrom, interpolate, lanGatewayUrl, SystemAboutSchema } from './interpolate';

describe('interpolate', () => {
  it('replaces every documented token from the facts object', () => {
    const facts = Object.fromEntries(GUIDE_TOKENS.map((t) => [t, `<${t.toLowerCase()}>`])) as Record<(typeof GUIDE_TOKENS)[number], string>;
    const text = GUIDE_TOKENS.map((t) => `{{${t}}}`).join(' ');
    const out = interpolate(text, facts);
    for (const t of GUIDE_TOKENS) {
      expect(out).toContain(`<${t.toLowerCase()}>`);
      expect(out).not.toContain(`{{${t}}}`);
    }
  });

  it('falls back to DEFAULT_FACTS for tokens missing from the facts', () => {
    expect(interpolate('{{MODELS_DIR}} on {{GATEWAY_URL}}', {})).toBe(`${DEFAULT_FACTS.MODELS_DIR} on ${DEFAULT_FACTS.GATEWAY_URL}`);
    expect(interpolate('{{VLLM_IMAGE}}', { VLLM_IMAGE: '' })).toBe(DEFAULT_FACTS.VLLM_IMAGE);
  });

  it('leaves unknown tokens untouched and tolerates whitespace inside braces', () => {
    expect(interpolate('{{ VERSION }} {{NOPE}}', { VERSION: '9.9.9' })).toBe('9.9.9 {{NOPE}}');
  });

  it('accepts page-specific extra facts', () => {
    expect(interpolate('model={{MODEL_FOLDER}}', { MODEL_FOLDER: 'phi-2' })).toBe('model=phi-2');
    expect(factIsSet({ MODEL_GATED: 'yes' }, 'MODEL_GATED')).toBe(true);
    expect(factIsSet({ MODEL_GATED: '' }, 'MODEL_GATED')).toBe(false);
    expect(factIsSet({}, 'MODEL_GATED')).toBe(false);
  });

  it('rewrites a loopback gateway URL to the LAN host', () => {
    expect(lanGatewayUrl('http://localhost:8084', '192.168.1.52')).toBe('http://192.168.1.52:8084');
    expect(lanGatewayUrl('https://cortex.example.com', '192.168.1.52')).toBe('https://cortex.example.com');
    expect(lanGatewayUrl('http://localhost:8084', '')).toBe('http://localhost:8084');
  });

  it('derives facts from the gateway answer with browser fallbacks', () => {
    const about = SystemAboutSchema.parse({
      version: '0.2.0', vllm_image: 'vllm/vllm-openai:v0.28.0', llamacpp_image: 'ghcr.io/ggml-org/llama.cpp:server-cuda-b10731',
      host_ip: null, gateway_port: 8084, frontend_port: 3001, models_dir: '/srv/models', hf_cache_dir: '/srv/hf', export_dir: '/srv/exports',
      offline_mode: false, dev_allow_all_keys: true, docs_url: 'https://docs.example/', repo_url: 'https://github.com/x/y',
    });
    const f = factsFrom(about, { gatewayBase: 'http://localhost:8084', hostIp: '10.0.0.5' });
    expect(f.HOST_IP).toBe('10.0.0.5');
    expect(f.GATEWAY_URL).toBe('http://10.0.0.5:8084');
    expect(f.MODELS_DIR).toBe('/srv/models');
    expect(f.FRONTEND_PORT).toBe('3001');
    expect(f.DOCS_URL).toBe('https://docs.example/');

    const none = factsFrom(undefined, { gatewayBase: '', hostIp: '' });
    expect(none).toEqual(DEFAULT_FACTS);
  });

  it('prefers the gateway-reported version unless it is "dev"', () => {
    const base = { vllm_image: 'a', llamacpp_image: 'b', host_ip: null, gateway_port: 1, frontend_port: 2, models_dir: '', hf_cache_dir: '', export_dir: '', offline_mode: false, dev_allow_all_keys: false, docs_url: '', repo_url: '' };
    expect(factsFrom({ ...base, version: '1.2.3' }, { gatewayBase: '', hostIp: '' }).VERSION).toBe('1.2.3');
    expect(factsFrom({ ...base, version: 'dev' }, { gatewayBase: '', hostIp: '' }).VERSION).toBe(DEFAULT_FACTS.VERSION);
  });
});

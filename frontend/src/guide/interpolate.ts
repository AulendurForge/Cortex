'use client';

/**
 * {{TOKEN}} interpolation for guide content, and the hook that loads the facts from the gateway
 * (`GET /admin/system/about`). Unknown tokens are left untouched so a typo is visible in the UI.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch, getGatewayBaseUrl } from '@/lib/api-clients';
import { useHostIP } from '@/hooks/useHostIP';

export const GUIDE_TOKENS = [
  'GATEWAY_URL',
  'GATEWAY_PORT',
  'HOST_IP',
  'MODELS_DIR',
  'HF_CACHE_DIR',
  'EXPORT_DIR',
  'VLLM_IMAGE',
  'LLAMACPP_IMAGE',
  'VERSION',
  'FRONTEND_PORT',
  'DOCS_URL',
  'REPO_URL',
] as const;

export type GuideToken = (typeof GUIDE_TOKENS)[number];
export type GuideFacts = Record<GuideToken, string>;
/** Facts plus any page-specific extras (e.g. the tutorial's selected model). */
export type Facts = GuideFacts & Record<string, string>;

/** Compile-time fallbacks: what the guide says before (or without) the gateway answering. */
export const DEFAULT_FACTS: GuideFacts = {
  GATEWAY_URL: 'http://YOUR_HOST_IP:8084',
  GATEWAY_PORT: '8084',
  HOST_IP: 'YOUR_HOST_IP',
  MODELS_DIR: '/var/cortex/models',
  HF_CACHE_DIR: '/var/cortex/hf-cache',
  EXPORT_DIR: '/var/cortex/exports',
  VLLM_IMAGE: 'vllm/vllm-openai:v0.28.0',
  LLAMACPP_IMAGE: 'ghcr.io/ggml-org/llama.cpp:server-cuda-b10731',
  VERSION: process.env.NEXT_PUBLIC_CORTEX_VERSION ?? '0.2.0',
  FRONTEND_PORT: '3001',
  DOCS_URL: 'https://aulendurforge.github.io/Cortex/',
  REPO_URL: 'https://github.com/AulendurForge/Cortex',
};

const TOKEN_RE = /\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g;

/**
 * Replace every `{{TOKEN}}` in `text`. Known tokens missing from `facts` (or empty) fall back to
 * DEFAULT_FACTS; tokens that are neither known nor supplied are left as written.
 */
export function interpolate(text: string, facts: Partial<Facts> = {}): string {
  return text.replace(TOKEN_RE, (whole, key: string) => {
    const given = facts[key];
    if (typeof given === 'string' && given !== '') return given;
    const fallback = (DEFAULT_FACTS as Record<string, string>)[key];
    return typeof fallback === 'string' ? fallback : whole;
  });
}

/** Facts referenced by a `when:` guard: non-empty string means "on". */
export function factIsSet(facts: Partial<Facts>, key: string): boolean {
  const v = facts[key];
  return typeof v === 'string' && v !== '';
}

export const SystemAboutSchema = z.object({
  version: z.string(),
  vllm_image: z.string(),
  llamacpp_image: z.string(),
  host_ip: z.string().nullable().optional(),
  gateway_port: z.number().int(),
  frontend_port: z.number().int(),
  models_dir: z.string(),
  hf_cache_dir: z.string(),
  export_dir: z.string(),
  offline_mode: z.boolean(),
  dev_allow_all_keys: z.boolean(),
  docs_url: z.string(),
  repo_url: z.string(),
});
export type SystemAbout = z.infer<typeof SystemAboutSchema>;

export async function fetchSystemAbout(): Promise<SystemAbout> {
  return SystemAboutSchema.parse(await apiFetch<unknown>('/admin/system/about'));
}

/** Rewrite a loopback gateway URL to the LAN address so copied commands work from other machines. */
export function lanGatewayUrl(base: string, hostIp: string): string {
  if (!hostIp || hostIp === 'localhost' || hostIp === '127.0.0.1') return base;
  try {
    const u = new URL(base);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      u.hostname = hostIp;
      return u.toString().replace(/\/$/, '');
    }
  } catch { /* not a URL: keep as is */ }
  return base;
}

/** Facts derived from a gateway answer plus what the browser already knows. */
export function factsFrom(about: SystemAbout | undefined, browser: { gatewayBase: string; hostIp: string }): GuideFacts {
  const hostIp = about?.host_ip || browser.hostIp || DEFAULT_FACTS.HOST_IP;
  const gatewayUrl = browser.gatewayBase ? lanGatewayUrl(browser.gatewayBase, hostIp) : `http://${hostIp}:${about?.gateway_port ?? DEFAULT_FACTS.GATEWAY_PORT}`;
  return {
    GATEWAY_URL: gatewayUrl,
    GATEWAY_PORT: about ? String(about.gateway_port) : DEFAULT_FACTS.GATEWAY_PORT,
    HOST_IP: hostIp,
    MODELS_DIR: about?.models_dir || DEFAULT_FACTS.MODELS_DIR,
    HF_CACHE_DIR: about?.hf_cache_dir || DEFAULT_FACTS.HF_CACHE_DIR,
    EXPORT_DIR: about?.export_dir || DEFAULT_FACTS.EXPORT_DIR,
    VLLM_IMAGE: about?.vllm_image || DEFAULT_FACTS.VLLM_IMAGE,
    LLAMACPP_IMAGE: about?.llamacpp_image || DEFAULT_FACTS.LLAMACPP_IMAGE,
    VERSION: about?.version && about.version !== 'dev' ? about.version : DEFAULT_FACTS.VERSION,
    FRONTEND_PORT: about ? String(about.frontend_port) : DEFAULT_FACTS.FRONTEND_PORT,
    DOCS_URL: about?.docs_url || DEFAULT_FACTS.DOCS_URL,
    REPO_URL: about?.repo_url || DEFAULT_FACTS.REPO_URL,
  };
}

/**
 * The facts the guide quotes. Renders with sensible fallbacks immediately (gateway URL from
 * getGatewayBaseUrl(), host from useHostIP()) and refines once /admin/system/about answers.
 */
export function useGuideFacts(): GuideFacts {
  const hostIp = useHostIP();
  const [gatewayBase, setGatewayBase] = useState('');
  useEffect(() => { setGatewayBase(getGatewayBaseUrl()); }, []);
  const { data } = useQuery({ queryKey: ['system', 'about'], queryFn: fetchSystemAbout, staleTime: 5 * 60_000 });
  return useMemo(() => factsFrom(data, { gatewayBase, hostIp }), [data, gatewayBase, hostIp]);
}

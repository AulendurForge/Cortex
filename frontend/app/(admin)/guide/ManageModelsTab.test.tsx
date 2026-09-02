/**
 * Smoke test for the Manage Models tab: every sub-tab mounts through GuideRenderer without an
 * unregistered custom block, and the Configuration sub-tab renders the flag reference from the
 * engine spec for both engines.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import ManageModelsTab from './ManageModelsTab';
import { manageModels } from '@/guide/content';
import { STATIC_ENGINE_SPEC, fieldsFor } from '@/lib/engine-spec';
import { ToastProvider } from '@/providers/ToastProvider';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('tab=manage-models'),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/hooks/useEngineSpec', () => ({
  useEngineSpec: () => ({ spec: STATIC_ENGINE_SPEC, isFallback: false, isLoading: false, error: null }),
}));
vi.mock('@/guide/interpolate', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/guide/interpolate')>();
  return { ...mod, useGuideFacts: () => mod.DEFAULT_FACTS };
});

afterEach(cleanup);

const mount = () => render(<ToastProvider><ManageModelsTab /></ToastProvider>);

describe('ManageModelsTab', () => {
  it('renders every sub-tab with its own h1 and no unregistered custom blocks', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount();
    for (const tab of manageModels.tabs) {
      fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab.label) }));
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(tab.title);
      expect(screen.getByRole('tabpanel')).toHaveAttribute('id', `panel-${tab.id}`);
    }
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('[guide]'))).toEqual([]);
    warn.mockRestore();
  });

  it('generates the configuration flag reference from the engine spec', () => {
    mount();
    fireEvent.click(screen.getByRole('tab', { name: /Configuration/ }));
    const vllm = fieldsFor(STATIC_ENGINE_SPEC, 'vllm').filter((f) => f.form !== 'internal');
    const llama = fieldsFor(STATIC_ENGINE_SPEC, 'llamacpp').filter((f) => f.form !== 'internal');
    expect(screen.getByText(`${vllm.length} vLLM settings from the engine spec.`)).toBeInTheDocument();
    expect(screen.getByText(`${llama.length} llama.cpp settings from the engine spec.`)).toBeInTheDocument();
    expect(screen.getByText('--max-model-len')).toBeInTheDocument();
    expect(screen.getByText('--ctx-size')).toBeInTheDocument();
    // a curated tip is attached to its spec field
    expect(screen.getByText(/Lower values enable CPU\+GPU hybrid inference/)).toBeInTheDocument();
  });

  it('follows a #hash deep link to a sub-tab', () => {
    window.location.hash = '#troubleshooting';
    mount();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Troubleshooting');
    window.location.hash = '';
  });
});

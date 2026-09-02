import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Paragraph, renderInline, tokenize } from './inline';
import { FactsProvider } from './FactsContext';
import { DEFAULT_FACTS } from '../interpolate';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

describe('Paragraph inline markdown', () => {
  it('renders bold, code and links', () => {
    const { container } = render(<Paragraph md="Use **Start** then `make up` and read the [docs](https://example.com/x)." />);
    const strong = container.querySelector('strong');
    expect(strong?.textContent).toBe('Start');
    expect(container.querySelector('code')?.textContent).toBe('make up');
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.com/x');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(container.textContent).toBe('Use Start then make up and read the docs.');
  });

  it('renders in-app links without target=_blank', () => {
    render(<Paragraph md="Open the [Health page](/health)." />);
    const link = screen.getByRole('link', { name: 'Health page' });
    expect(link).toHaveAttribute('href', '/health');
    expect(link).not.toHaveAttribute('target');
  });

  it('never injects HTML', () => {
    const { container } = render(<Paragraph md={'<img src=x onerror=alert(1)> **<b>bold</b>** `<script>` [x](javascript:alert(1))'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('strong')?.textContent).toBe('<b>bold</b>');
    expect(container.querySelector('code')?.textContent).toBe('<script>');
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('x');
  });

  it('turns newlines into line breaks and interpolates facts in scope', () => {
    const { container } = render(
      <FactsProvider value={{ ...DEFAULT_FACTS, MODELS_DIR: '/srv/models' }}>
        <Paragraph md={'line one\nline two `{{MODELS_DIR}}`'} />
      </FactsProvider>
    );
    expect(container.querySelectorAll('br')).toHaveLength(1);
    expect(container.querySelector('code')?.textContent).toBe('/srv/models');
  });

  it('tokenizes plain text with no markup as a single text run', () => {
    expect(tokenize('plain text')).toEqual([{ t: 'text', v: 'plain text' }]);
    expect(renderInline('plain')).toEqual(['plain']);
  });
});

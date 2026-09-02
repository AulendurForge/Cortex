'use client';

import { type ReactNode, useMemo } from 'react';
import type { Block, GuideTab } from './types';
import { factIsSet, useGuideFacts, type Facts } from './interpolate';
import { FactsProvider, useFacts, useInterpolate, Section, Heading, Paragraph, Steps, CodeBlock, Callout, Table, List, Checklist, Cards, LinkCards, Issues, Attribution } from './primitives';

/** Interactive widgets a tab page supplies for `{ kind: 'custom', id }` blocks. */
export type CustomBlocks = Record<string, ReactNode>;

export function RenderBlock({ block, customBlocks }: { block: Block; customBlocks?: CustomBlocks }) {
  const facts = useFacts();
  const interpolate = useInterpolate();
  switch (block.kind) {
    case 'p': return <Paragraph md={block.md} />;
    case 'h': return <Heading level={block.level} text={interpolate(block.text)} id={block.id} />;
    case 'steps': return <Steps items={block.items.filter((s) => !s.when || factIsSet(facts, s.when))} />;
    case 'code': return <CodeBlock text={block.text} lang={block.lang} label={block.label ? interpolate(block.label) : undefined} copy={block.copy} />;
    case 'callout': return <Callout variant={block.variant} title={block.title ? interpolate(block.title) : undefined} md={block.md} />;
    case 'list': return <List items={block.items} ordered={block.ordered} />;
    case 'table': return <Table columns={block.columns.map(interpolate)} rows={block.rows} caption={block.caption ? interpolate(block.caption) : undefined} />;
    case 'checklist': return <Checklist items={block.items} />;
    case 'cards': return <Cards items={block.items.map((c) => ({ ...c, title: interpolate(c.title) }))} />;
    case 'link-cards': return <LinkCards items={block.items.map((c) => ({ ...c, title: interpolate(c.title), href: interpolate(c.href) }))} />;
    case 'issues': return <Issues items={block.items.map((c) => ({ ...c, title: interpolate(c.title) }))} />;
    case 'custom': {
      const node = customBlocks?.[block.id];
      if (node === undefined && process.env.NODE_ENV !== 'production') console.warn(`[guide] no custom block registered for id "${block.id}"`);
      return <>{node ?? null}</>;
    }
  }
}

export function RenderBlocks({ blocks, customBlocks }: { blocks: Block[]; customBlocks?: CustomBlocks }) {
  const facts = useFacts();
  return (
    <>
      {blocks.filter((b) => !b.when || factIsSet(facts, b.when)).map((b, i) => <RenderBlock key={i} block={b} customBlocks={customBlocks} />)}
    </>
  );
}

/**
 * Renders one GuideTab: the tab's `<h1>`, intro, lead blocks, `<section>`s with `<h2>` headings and
 * the attribution footer. Facts come from the gateway (useGuideFacts) merged with `facts` extras.
 */
export function GuideRenderer({ tab, customBlocks, facts: extra }: { tab: GuideTab; customBlocks?: CustomBlocks; facts?: Record<string, string> }) {
  const base = useGuideFacts();
  const facts = useMemo<Facts>(() => ({ ...base, ...(extra ?? {}) }), [base, extra]);
  const titleId = `guide-${tab.id}-title`;
  return (
    <FactsProvider value={facts}>
      <article className="space-y-6" aria-labelledby={titleId}>
        <header className="space-y-2">
          <h1 id={titleId} className="text-2xl font-black tracking-tight text-white uppercase italic">{tab.title}</h1>
          {tab.intro ? <Paragraph md={tab.intro} className="text-sm text-white/70" /> : null}
        </header>
        {tab.lead?.length ? <div className="space-y-4"><RenderBlocks blocks={tab.lead} customBlocks={customBlocks} /></div> : null}
        {tab.sections.map((s) => (
          <Section key={s.id} id={s.id} title={s.title} intro={s.intro}>
            <RenderBlocks blocks={s.blocks} customBlocks={customBlocks} />
          </Section>
        ))}
        {tab.attribution !== undefined ? <Attribution label={tab.attribution || undefined} /> : null}
      </article>
    </FactsProvider>
  );
}

export default GuideRenderer;

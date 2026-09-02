/**
 * Guide content as data. A tab is a list of sections, a section a list of blocks; the small
 * primitive set in ./primitives renders them. Every string marked `Md` is *inline* markdown
 * (**bold**, `code`, [text](href), and "\n" for a line break — nothing else, no HTML) and every
 * string may carry {{TOKENS}} that ./interpolate replaces with facts from the gateway.
 */

/** Inline markdown: **bold**, `code`, [text](href), "\n" line breaks. */
export type Md = string;

export type StepItem = {
  title: string;
  md?: Md;
  /** A command or snippet shown under the step with its own copy button. */
  code?: string;
  /** Same semantics as Block.when: the step is skipped (and not numbered) unless the fact is set. */
  when?: string;
};

export type CardItem = { title: string; md: Md; icon?: string };
export type LinkCardItem = { title: string; md: Md; href: string; label?: string };
/** Troubleshooting entry; `symptoms` (optional) is shown as a third column before the causes. */
export type IssueItem = { title: string; symptoms?: Md[]; causes: Md[]; solutions: Md[] };

export type CalloutVariant = 'info' | 'warning' | 'success' | 'error';

type BlockBase = {
  /**
   * Optional fact key: the block is rendered only when that fact interpolates to a non-empty
   * string (e.g. `when: 'MODEL_GATED'` for a step that only applies to gated models).
   */
  when?: string;
};

export type Block = BlockBase &
  (
    | { kind: 'p'; md: Md }
    | { kind: 'h'; level: 2 | 3; text: string; id?: string }
    | { kind: 'steps'; items: StepItem[] }
    | { kind: 'code'; lang?: string; text: string; label?: string; copy?: boolean }
    | { kind: 'callout'; variant: CalloutVariant; title?: string; md: Md }
    | { kind: 'list'; items: Md[]; ordered?: boolean }
    | { kind: 'table'; columns: string[]; rows: string[][]; caption?: string }
    | { kind: 'checklist'; items: Md[] }
    | { kind: 'cards'; items: CardItem[] }
    | { kind: 'link-cards'; items: LinkCardItem[] }
    /** Troubleshooting entries: a title with "likely causes" and "solutions" columns. */
    | { kind: 'issues'; items: IssueItem[] }
    /** Escape hatch for interactive widgets; the tab page maps the id to a React node. */
    | { kind: 'custom'; id: string }
  );

export type BlockKind = Block['kind'];

export type GuideSection = {
  /** Anchor id: the section renders as `<section id>` with an `<h2 id>` heading. */
  id: string;
  title: string;
  intro?: Md;
  blocks: Block[];
};

export type GuideTab = {
  id: string;
  /** Rendered as the tab's single `<h1>`. */
  title: string;
  intro?: Md;
  /** Blocks rendered between the header and the first section (hero cards, banners). */
  lead?: Block[];
  sections: GuideSection[];
  /** Label for the "<label> • Aulendur Labs" footer ('' for the plain footer); omit for none. */
  attribution?: string;
};

/** A tab made of sub-tabs (Getting Started): the page renders the sub-tab switcher itself. */
export type GuideTabGroup = {
  id: string;
  title: string;
  intro?: Md;
  tabs: Array<GuideTab & { label: string; icon?: string }>;
};

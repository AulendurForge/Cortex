'use client';

import React from 'react';
import { ArchitectureCompatibilityBadge } from './ArchitectureCompatibility';
import type { GGUFMetadata } from './inspectTypes';

type Badge = { label: string; value: string; title: string; color: keyof typeof COLOR_CLASSES };

// Static class map so Tailwind's JIT can see every variant.
const COLOR_CLASSES = {
  purple: 'bg-purple-500/10 border-purple-500/20 text-purple-300',
  cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300',
  blue: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
  indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300',
  violet: 'bg-violet-500/10 border-violet-500/20 text-violet-300',
  teal: 'bg-teal-500/10 border-teal-500/20 text-teal-300',
} as const;

function buildBadges(m: GGUFMetadata): Badge[] {
  const badges: Badge[] = [];
  if (m.architecture) {
    badges.push({ label: 'Arch', value: m.architecture, title: 'Model architecture', color: 'purple' });
  }
  if (m.context_length) {
    badges.push({ label: 'Ctx', value: `${Math.round(m.context_length / 1024)}K`, title: `Context length: ${m.context_length.toLocaleString()} tokens`, color: 'cyan' });
  }
  if (m.block_count) {
    badges.push({ label: 'Layers', value: `${m.block_count}`, title: 'Number of transformer blocks/layers', color: 'blue' });
  }
  if (m.embedding_length) {
    badges.push({ label: 'Hidden', value: m.embedding_length.toLocaleString(), title: `Hidden size (embedding dimension): ${m.embedding_length}`, color: 'indigo' });
  }
  if (m.attention_head_count) {
    const gqa = m.attention_head_count_kv && m.attention_head_count_kv !== m.attention_head_count;
    badges.push({
      label: 'Heads',
      value: gqa ? `${m.attention_head_count}/${m.attention_head_count_kv}` : `${m.attention_head_count}`,
      title: gqa ? `Attention heads: ${m.attention_head_count} Q / ${m.attention_head_count_kv} KV (GQA)` : `Attention heads: ${m.attention_head_count}`,
      color: 'violet',
    });
  }
  if (m.vocab_size) {
    badges.push({ label: 'Vocab', value: `${Math.round(m.vocab_size / 1000)}K`, title: `Vocabulary size: ${m.vocab_size.toLocaleString()} tokens`, color: 'teal' });
  }
  return badges;
}

/** Compact GGUF header metadata (architecture, context, layers, ...) plus the engine compatibility badge. */
export function MetadataBadges({ metadata }: { metadata: GGUFMetadata | null | undefined }) {
  if (!metadata) return null;
  const badges = buildBadges(metadata);
  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {badges.map((badge) => (
        <span
          key={badge.label}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-medium rounded border ${COLOR_CLASSES[badge.color]}`}
          title={badge.title}
        >
          <span className="opacity-60">{badge.label}:</span>
          <span>{badge.value}</span>
        </span>
      ))}
      {metadata.architecture && <ArchitectureCompatibilityBadge architecture={metadata.architecture} />}
    </div>
  );
}

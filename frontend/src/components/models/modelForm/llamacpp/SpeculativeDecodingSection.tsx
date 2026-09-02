'use client';

import React, { useState } from 'react';
import { NumberField } from '../../../NumberField';
import { Collapsible, FieldShell, SelectField, TextField } from '../fields';
import { SpeculativeDecodingExplainer } from '../SpeculativeDecodingExplainer';
import { EngineSectionProps, choicesOf, defaultOf } from '../sectionProps';

/** Fields rendered here (excluded from the generic spec section). */
export const LLAMACPP_SPEC_FIELDS: ReadonlyArray<string> = [
  'draft_model_path', 'spec_type', 'draft_n', 'spec_draft_n_min', 'draft_p_min', 'spec_draft_ngl',
];

/**
 * llama.cpp speculative decoding: draft model, speculation type and the
 * --spec-draft-* tuning flags.
 */
export function SpeculativeDecodingSection({ values, onChange, spec }: EngineSectionProps) {
  const [showExplainer, setShowExplainer] = useState(false);
  const active = !!values.draft_model_path || (!!values.spec_type && values.spec_type !== 'none');
  const ngram = !!values.spec_type && values.spec_type.startsWith('ngram');

  return (
    <Collapsible title="Speculative decoding" icon="⚡" color="purple" defaultOpen={active}>
      <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg">
        <div className="flex items-start justify-between mb-3 gap-3">
          <p className="text-xs text-white/60 flex-1">
            A small draft model (or an n-gram predictor) proposes tokens that the main model verifies in one pass,
            raising tokens/s for predictable text.
          </p>
          <button
            type="button"
            onClick={() => setShowExplainer(true)}
            className="px-3 py-1.5 text-xs bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 rounded-lg whitespace-nowrap"
          >
            🤔 What is this?
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <TextField
            label="Draft model (GGUF)"
            value={values.draft_model_path}
            onChange={(v) => onChange('draft_model_path', v)}
            placeholder="draft-folder/model-Q8_0.gguf"
            className="md:col-span-2"
            mono
            help="Path relative to the models directory (mapped to /models/... in the container)."
            tooltip="--model-draft. Same tokenizer/family as the main model, 4-10x smaller; Q8_0 keeps drafts accurate."
          />
          <SelectField
            label="Speculative type"
            value={values.spec_type}
            onChange={(v) => onChange('spec_type', v)}
            options={choicesOf(spec, 'spec_type', ['none', 'draft-simple', 'draft-eagle3', 'draft-mtp', 'ngram-simple', 'ngram-map-k', 'ngram-mod', 'ngram-cache'])}
            help={ngram ? 'n-gram types need no draft model.' : 'draft-* types use the draft model above.'}
            tooltip="--spec-type. Leave unset to let llama.cpp pick draft-simple when a draft model is given."
          />
          <FieldShell label="Draft tokens (max)" tooltip="--spec-draft-n-max. Tokens proposed per step; 3-16 typical.">
            <NumberField integer min={1} max={64} value={values.draft_n} onChange={(v) => onChange('draft_n', v)} placeholder={`engine default (${String(defaultOf(spec, 'draft_n') ?? 3)})`} aria-label="Draft tokens max" />
          </FieldShell>
          <FieldShell label="Draft tokens (min)" tooltip="--spec-draft-n-min. Lower bound when the draft is confident.">
            <NumberField integer min={0} max={64} value={values.spec_draft_n_min} onChange={(v) => onChange('spec_draft_n_min', v)} placeholder="engine default" aria-label="Draft tokens min" />
          </FieldShell>
          <FieldShell label="Draft acceptance p_min" tooltip="--spec-draft-p-min. Minimum draft probability to keep proposing; lower = more aggressive.">
            <NumberField min={0} max={1} step={0.05} value={values.draft_p_min} onChange={(v) => onChange('draft_p_min', v)} placeholder="engine default" aria-label="Draft acceptance p_min" />
          </FieldShell>
          <FieldShell label="Draft model GPU layers" tooltip="--spec-draft-ngl. Offload the draft model too; empty = auto.">
            <NumberField integer min={0} max={999} value={values.spec_draft_ngl} onChange={(v) => onChange('spec_draft_ngl', v)} placeholder="engine default (auto)" aria-label="Draft model GPU layers" />
          </FieldShell>
        </div>

        {active && (
          <div className="mt-3 p-2 bg-purple-500/10 border border-purple-500/30 rounded text-xs text-white/70">
            <span className="font-medium text-purple-200">Speculative decoding enabled</span>
            {values.draft_model_path && <> · draft <code className="text-purple-300">{values.draft_model_path}</code></>}
            {values.spec_type && <> · type {values.spec_type}</>}
            {values.draft_n !== undefined && <> · up to {values.draft_n} tokens</>}
          </div>
        )}
      </div>
      <SpeculativeDecodingExplainer isOpen={showExplainer} onClose={() => setShowExplainer(false)} />
    </Collapsible>
  );
}

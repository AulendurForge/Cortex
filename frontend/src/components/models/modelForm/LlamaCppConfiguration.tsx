'use client';

import React from 'react';
import { EngineSpec } from '../../../lib/engine-spec';
import type { GpuInfo } from '../../../lib/validators';
import { FormFieldName, ModelFormValues } from '../modelFormValues';
import { SpecFieldsSection } from './SpecFieldsSection';
import { LlamaCppCoreSection, LLAMACPP_CORE_FIELDS } from './llamacpp/LlamaCppCoreSection';
import { SpeculativeDecodingSection, LLAMACPP_SPEC_FIELDS } from './llamacpp/SpeculativeDecodingSection';

/** Every llama.cpp field with a curated editor; the rest come from the spec. */
export const LLAMACPP_CURATED_FIELDS: ReadonlySet<string> = new Set([...LLAMACPP_CORE_FIELDS, ...LLAMACPP_SPEC_FIELDS]);

interface LlamaCppConfigurationProps {
  values: ModelFormValues;
  onChange: (field: FormFieldName, value: unknown) => void;
  spec: EngineSpec;
  gpus: GpuInfo[];
  gpuCount: number;
}

/**
 * llama.cpp configuration: curated core + speculative sections, followed by a
 * generic section for every remaining spec field (MoE offload, chat template
 * kwargs, reasoning, pooling/rerank, multimodal projector, logging, ...).
 */
export function LlamaCppConfiguration({ values, onChange, spec, gpus, gpuCount }: LlamaCppConfigurationProps) {
  if (values.engine_type !== 'llamacpp') return null;
  const props = { values, onChange, spec, gpus, gpuCount };
  return (
    <>
      <LlamaCppCoreSection {...props} />
      <SpeculativeDecodingSection {...props} />
      <SpecFieldsSection
        spec={spec}
        engine="llamacpp"
        values={values}
        onChange={onChange}
        exclude={LLAMACPP_CURATED_FIELDS}
        title="More llama.cpp options (from the engine spec)"
      />
    </>
  );
}

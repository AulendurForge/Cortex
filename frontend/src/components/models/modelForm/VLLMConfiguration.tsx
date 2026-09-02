'use client';

import React from 'react';
import { EngineSpec } from '../../../lib/engine-spec';
import type { GpuInfo } from '../../../lib/validators';
import { FormFieldName, ModelFormValues } from '../modelFormValues';
import { SpecFieldsSection } from './SpecFieldsSection';
import { VLLMCoreSection, VLLM_CORE_FIELDS } from './vllm/VLLMCoreSection';
import { VLLMTuningSection, VLLM_TUNING_FIELDS } from './vllm/VLLMTuningSection';

/** Rendered by the source step (Model Selection / Source panel), not here. */
const SOURCE_FIELDS: ReadonlyArray<string> = ['tokenizer', 'hf_config_path'];

/** Every vLLM field with a curated editor; the rest come from the spec. */
export const VLLM_CURATED_FIELDS: ReadonlySet<string> = new Set([...VLLM_CORE_FIELDS, ...VLLM_TUNING_FIELDS, ...SOURCE_FIELDS]);

interface VLLMConfigurationProps {
  values: ModelFormValues;
  onChange: (field: FormFieldName, value: unknown) => void;
  spec: EngineSpec;
  gpus: GpuInfo[];
  gpuCount: number;
}

/**
 * vLLM configuration: curated core + tuning sections, followed by a generic
 * section that exposes every remaining spec field (LoRA, speculative config,
 * parsers, structured outputs, multimodal limits, ...).
 */
export function VLLMConfiguration({ values, onChange, spec, gpus, gpuCount }: VLLMConfigurationProps) {
  if (values.engine_type !== 'vllm') return null;
  const props = { values, onChange, spec, gpus, gpuCount };
  return (
    <>
      <VLLMCoreSection {...props} />
      <VLLMTuningSection {...props} />
      <SpecFieldsSection
        spec={spec}
        engine="vllm"
        values={values}
        onChange={onChange}
        exclude={VLLM_CURATED_FIELDS}
        title="More vLLM options (from the engine spec)"
      />
    </>
  );
}

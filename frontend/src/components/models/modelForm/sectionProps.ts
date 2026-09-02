import { EngineSpec } from '../../../lib/engine-spec';
import type { GpuInfo } from '../../../lib/validators';
import { FormFieldName, ModelFormValues } from '../modelFormValues';

/** Props shared by every engine configuration section. */
export type EngineSectionProps = {
  values: ModelFormValues;
  onChange: (field: FormFieldName, value: unknown) => void;
  spec: EngineSpec;
  gpus: GpuInfo[];
  gpuCount: number;
};

/** Choices for a spec field by name, with a static fallback when the spec lacks it. */
export function choicesOf(spec: EngineSpec, name: string, fallback: ReadonlyArray<string> = []): string[] {
  const f = spec.fields.find((x) => x.name === name);
  return f?.choices && f.choices.length > 0 ? f.choices : [...fallback];
}

/** Documented engine default for a spec field by name. */
export function defaultOf(spec: EngineSpec, name: string): unknown {
  return spec.fields.find((x) => x.name === name)?.default;
}

export function primaryGpu(gpus: GpuInfo[]): GpuInfo | undefined {
  return gpus.length > 0 ? gpus[0] : undefined;
}

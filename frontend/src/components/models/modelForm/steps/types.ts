import type { EngineSpec, EngineType } from '../../../../lib/engine-spec';
import type { GpuInfo } from '../../../../lib/validators';
import type { CustomArg, CustomEnvVar } from '../../customArgs';
import type { FormFieldName, ModelFormValues } from '../../modelFormValues';
import type { Issue } from '../../validateFormValues';
import type { InspectResult } from '../inspectTypes';

type StepType = 'engine' | 'source' | 'model' | 'core' | 'startup' | 'request' | 'summary';

export interface StepConfig {
  type: StepType;
  title: string;
  color: string;
  gemColor: string;
}

/** GGUF choice made in the Model step (add mode only). */
export type SourceState = {
  useGguf: boolean;
  selectedGguf: string;
  selectedGgufGroup: string;
};

/** Everything a step needs, owned by the ModelWorkflowForm shell. */
export interface WorkflowCtx {
  values: ModelFormValues;
  set: (field: FormFieldName, value: unknown) => void;
  setMany: (patch: Partial<ModelFormValues>) => void;
  spec: EngineSpec;
  specIsFallback: boolean;
  gpus: GpuInfo[];
  gpuCount: number;
  modeLocked: boolean;
  modelId?: number;
  // source (add mode)
  baseDir: string;
  folders: string[];
  foldersLoading: boolean;
  refreshFolders: () => void;
  inspect: InspectResult | null;
  inspectLoading: boolean;
  inspectError: string | null;
  source: SourceState;
  setSource: (patch: Partial<SourceState>) => void;
  onFolderSelect: (folder: string) => void;
  switchEngine: (engine: EngineType) => void;
  ggufOnly: boolean;
  showMergeHelp: () => void;
  // startup
  customArgs: CustomArg[];
  customEnv: CustomEnvVar[];
  setCustomArgs: (args: CustomArg[]) => void;
  setCustomEnv: (env: CustomEnvVar[]) => void;
  // summary
  assembled: ModelFormValues;
  issues: Issue[];
  submitLabel: string;
  submitPending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  acknowledgeDryRun: boolean;
  setAcknowledgeDryRun: (v: boolean) => void;
  dryRunValid: boolean | null;
  setDryRunValid: (v: boolean | null) => void;
}

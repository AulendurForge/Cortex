'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PrimaryButton } from '../UI';
import { EngineType } from '../../lib/engine-spec';
import { useEngineSpec } from '../../hooks/useEngineSpec';
import { useGpus } from '../../hooks/useGpus';
import { useBaseDir, useInspectFolder, useLocalFolders } from '../../hooks/useModelSource';
import { RequestDefaultsSection } from './modelForm/RequestDefaultsSection';
import { MergeInstructionsModal } from './modelForm/MergeInstructionsModal';
import { isGgufOnly, hasGguf } from './modelForm/inspectTypes';
import { WorkflowStepColumn } from './modelForm/steps/WorkflowStepColumn';
import { EngineStep } from './modelForm/steps/EngineStep';
import { ModelStep } from './modelForm/steps/ModelStep';
import { CoreStep } from './modelForm/steps/CoreStep';
import { StartupStep } from './modelForm/steps/StartupStep';
import { SummaryStep } from './modelForm/steps/SummaryStep';
import { SourcePanel } from './modelForm/steps/SourcePanel';
import type { SourceState, StepConfig, WorkflowCtx } from './modelForm/steps/types';
import { parseCustomArgs, parseCustomEnv, serializeCustomArgs, serializeCustomEnv } from './customArgs';
import { FormFieldName, ModelFormValues, buildInitialValues, toSubmitPayload } from './modelFormValues';
import { hasErrors, validateFormValues } from './validateFormValues';

const ADD_STEPS: StepConfig[] = [
  { type: 'engine', title: 'Engine & Mode', color: 'blue', gemColor: '#3b82f6' },
  { type: 'model', title: 'Model Selection', color: 'emerald', gemColor: '#10b981' },
  { type: 'core', title: 'Core Settings', color: 'amber', gemColor: '#f59e0b' },
  { type: 'startup', title: 'Startup Config', color: 'red', gemColor: '#ef4444' },
  { type: 'request', title: 'Request Defaults', color: 'purple', gemColor: '#a855f7' },
  { type: 'summary', title: 'Summary & Launch', color: 'cyan', gemColor: '#06b6d4' },
];

const CONFIG_STEPS: StepConfig[] = [
  { type: 'source', title: 'Source & Engine', color: 'blue', gemColor: '#3b82f6' },
  { type: 'core', title: 'Core Settings', color: 'amber', gemColor: '#f59e0b' },
  { type: 'startup', title: 'Startup Config', color: 'red', gemColor: '#ef4444' },
  { type: 'request', title: 'Request Defaults', color: 'purple', gemColor: '#a855f7' },
  { type: 'summary', title: 'Summary & Save', color: 'cyan', gemColor: '#06b6d4' },
];

const EMPTY_SOURCE: SourceState = { useGguf: false, selectedGguf: '', selectedGgufGroup: '' };

export interface ModelWorkflowFormProps {
  /** Receives the request body (create body or PATCH body) assembled by toSubmitPayload. */
  onSubmit: (body: Record<string, unknown>) => void;
  onCancel: () => void;
  defaults?: Partial<ModelFormValues>;
  submitLabel?: string;
  submitPending?: boolean;
  modeLocked?: boolean;
  modelId?: number;
}

/**
 * Add / Configure workflow shell: owns the form state, the folder inspection
 * and engine steering, local validation, and the step navigation.  Each step
 * body lives in modelForm/steps/*.
 */
export function ModelWorkflowForm({ onSubmit, onCancel, defaults, submitLabel, submitPending = false, modeLocked = false, modelId }: ModelWorkflowFormProps) {
  const steps = modeLocked ? CONFIG_STEPS : ADD_STEPS;
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [values, setValues] = useState<ModelFormValues>(() => buildInitialValues(defaults, { configure: modeLocked }));
  const [source, setSourceState] = useState<SourceState>(EMPTY_SOURCE);
  const [showMergeHelp, setShowMergeHelp] = useState(false);
  const [acknowledgeDryRun, setAcknowledgeDryRun] = useState(false);
  const [dryRunValid, setDryRunValid] = useState<boolean | null>(null);

  const { spec, isFallback: specIsFallback } = useEngineSpec();
  const { gpus, gpuCount } = useGpus();
  const offline = values.mode === 'offline';
  const baseDirQ = useBaseDir(offline || modeLocked);
  const foldersQ = useLocalFolders(!modeLocked && offline);
  const inspectQ = useInspectFolder(!modeLocked && offline ? (values.local_path || '') : '');
  const inspect = inspectQ.data ?? null;
  const ggufOnly = isGgufOnly(inspect);

  const set = useCallback((k: FormFieldName, v: unknown) => setValues((prev) => ({ ...prev, [k]: v })), []);
  const setMany = useCallback((patch: Partial<ModelFormValues>) => setValues((prev) => ({ ...prev, ...patch })), []);
  const setSource = useCallback((patch: Partial<SourceState>) => {
    setSourceState((prev) => ({ ...prev, ...patch }));
    // GGUF is always served by llama.cpp: choosing GGUF steers the engine.
    if (patch.useGguf) setValues((prev) => (prev.engine_type === 'vllm' ? { ...prev, engine_type: 'llamacpp', mode: 'offline' } : prev));
  }, []);

  // Reset acknowledgement whenever the configuration changes.
  useEffect(() => { setAcknowledgeDryRun(false); }, [values]);

  // Apply inspection results: default format, recommended quant group, engine steering.
  useEffect(() => {
    if (!inspect) return;
    const onlyGguf = isGgufOnly(inspect);
    const recommended = inspect.gguf_groups.find((g) => g.is_recommended) ?? inspect.gguf_groups.find((g) => g.can_use);
    setSourceState({
      useGguf: onlyGguf,
      selectedGgufGroup: onlyGguf && recommended ? recommended.quant_type : '',
      selectedGguf: onlyGguf && recommended ? (recommended.files[0] || '') : (onlyGguf && inspect.gguf_files.length === 1 ? inspect.gguf_files[0] || '' : ''),
    });
    if (onlyGguf) setValues((prev) => (prev.engine_type === 'llamacpp' ? prev : { ...prev, engine_type: 'llamacpp', mode: 'offline' }));
  }, [inspect]);

  const switchEngine = useCallback((engine: EngineType) => {
    if (engine === 'vllm' && ggufOnly) return; // policy: GGUF-only folders stay on llama.cpp
    setValues((prev) => ({ ...prev, engine_type: engine, mode: engine === 'llamacpp' ? 'offline' : prev.mode }));
    if (engine === 'vllm') setSourceState((prev) => ({ ...prev, useGguf: false }));
    if (engine === 'llamacpp' && inspect && hasGguf(inspect)) setSourceState((prev) => ({ ...prev, useGguf: true }));
  }, [ggufOnly, inspect]);

  const onFolderSelect = useCallback((folder: string) => {
    setSourceState(EMPTY_SOURCE);
    setValues((prev) => ({ ...prev, local_path: folder, name: prev.name || folder, served_model_name: prev.served_model_name || folder.toLowerCase().replace(/[^a-z0-9\-_.]/g, '-') }));
  }, []);

  const customArgs = useMemo(() => parseCustomArgs(values.engine_startup_args_json), [values.engine_startup_args_json]);
  const customEnv = useMemo(() => parseCustomEnv(values.engine_startup_env_json), [values.engine_startup_env_json]);

  /** Values as they will be submitted: folder + chosen GGUF file for llama.cpp. */
  const assembled = useMemo<ModelFormValues>(() => {
    const next = { ...values };
    if (!modeLocked && offline && source.useGguf && inspect) {
      let file = source.selectedGguf;
      if (source.selectedGgufGroup) {
        const group = inspect.gguf_groups.find((g) => g.quant_type === source.selectedGgufGroup);
        if (group) file = group.files[0] || file;
      }
      if (file && !/\.gguf$/i.test(next.local_path || '')) next.local_path = `${next.local_path}/${file}`;
    }
    return next;
  }, [values, modeLocked, offline, source, inspect]);

  const issues = useMemo(() => validateFormValues(assembled, {
    mode: modeLocked ? 'configure' : 'add',
    gpuCount,
    spec,
    customArgs,
    customEnv,
    source: !modeLocked && offline ? {
      useGguf: source.useGguf,
      ggufFile: /\.gguf$/i.test(assembled.local_path || '') ? assembled.local_path : undefined,
      hasSafetensors: inspect?.has_safetensors,
      hasMultipartGguf: inspect?.engine_recommendation?.has_multipart_gguf,
    } : undefined,
  }), [assembled, modeLocked, gpuCount, spec, customArgs, customEnv, offline, source, inspect]);

  const canSubmit = !hasErrors(issues) && (dryRunValid !== false || acknowledgeDryRun) && !submitPending;

  const canNavigateTo = (idx: number) => {
    const step = steps[idx];
    if (!step) return false;
    if (modeLocked) return true;
    const hasSource = values.mode === 'online' ? !!values.repo_id : !!values.local_path;
    if (step.type === 'model') return !!values.engine_type;
    if (step.type === 'core') return !!values.engine_type && hasSource;
    if (step.type === 'startup' || step.type === 'request' || step.type === 'summary') return !!values.engine_type && hasSource && !!values.name && !!values.served_model_name;
    return true;
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(toSubmitPayload(assembled, { configure: modeLocked, spec }));
  };

  const ctx: WorkflowCtx = {
    values, set, setMany, spec, specIsFallback, gpus, gpuCount, modeLocked, modelId,
    baseDir: baseDirQ.data ?? '',
    folders: foldersQ.data ?? [],
    foldersLoading: foldersQ.isFetching,
    refreshFolders: () => { void foldersQ.refetch(); },
    inspect,
    inspectLoading: inspectQ.isFetching,
    inspectError: inspectQ.isError ? (inspectQ.error?.message || 'Could not inspect this folder') : null,
    source, setSource, onFolderSelect, switchEngine, ggufOnly,
    showMergeHelp: () => setShowMergeHelp(true),
    customArgs, customEnv,
    setCustomArgs: (a) => set('engine_startup_args_json', serializeCustomArgs(a)),
    setCustomEnv: (e) => set('engine_startup_env_json', serializeCustomEnv(e)),
    assembled, issues,
    submitLabel: submitLabel || (modeLocked ? 'Save & Apply' : 'Launch Model'),
    submitPending, onCancel, onSubmit: handleSubmit, canSubmit,
    acknowledgeDryRun, setAcknowledgeDryRun, dryRunValid, setDryRunValid,
  };

  const nextBlocked = activeStepIdx < steps.length - 1 && !canNavigateTo(activeStepIdx + 1);

  return (
    <div className="flex h-full min-h-[600px]">
      <div className="flex flex-1 overflow-hidden h-full" role="tablist" aria-label="Model workflow steps">
        {steps.map((step, idx) => {
          const isActive = activeStepIdx === idx;
          const isLast = idx === steps.length - 1;
          return (
            <WorkflowStepColumn
              key={step.type}
              step={step}
              idx={idx}
              isActive={isActive}
              isPast={activeStepIdx > idx}
              isDisabled={!canNavigateTo(idx)}
              onSelect={() => setActiveStepIdx(idx)}
              header={isLast ? (
                <PrimaryButton type="button" size="sm" className="px-8 shadow-lg shadow-indigo-500/20" onClick={handleSubmit} disabled={!canSubmit} aria-busy={submitPending}>
                  {ctx.submitLabel}
                </PrimaryButton>
              ) : (
                <div className="flex items-center gap-2">
                  {nextBlocked && <span className="text-[10px] text-amber-200/80">Complete the required fields to continue</span>}
                  <PrimaryButton type="button" size="sm" className="shadow-lg shadow-indigo-500/20" onClick={() => setActiveStepIdx(idx + 1)} disabled={nextBlocked}>
                    Next: {steps[idx + 1]?.title} →
                  </PrimaryButton>
                </div>
              )}
            >
              {step.type === 'engine' && <EngineStep ctx={ctx} />}
              {step.type === 'source' && <SourcePanel ctx={ctx} />}
              {step.type === 'model' && <ModelStep ctx={ctx} />}
              {step.type === 'core' && <CoreStep ctx={ctx} />}
              {step.type === 'startup' && <StartupStep ctx={ctx} />}
              {step.type === 'request' && <div className="space-y-4 h-full"><RequestDefaultsSection values={values} onChange={set} /></div>}
              {step.type === 'summary' && <SummaryStep ctx={ctx} />}
            </WorkflowStepColumn>
          );
        })}
      </div>
      <MergeInstructionsModal open={showMergeHelp} onClose={() => setShowMergeHelp(false)} />
    </div>
  );
}

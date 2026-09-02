'use client';

import React, { useMemo, useState } from 'react';
import { Button, PrimaryButton } from '../../UI';
import { EngineSpec, EngineType, canonicalFlag } from '../../../lib/engine-spec';
import { cn } from '../../../lib/cn';
import {
  ArgIssue, CUSTOM_PRESETS, CustomArg, CustomArgType, CustomEnvVar, FORBIDDEN_FLAGS,
  analyzeCustomArgs, applyPreset, isForbiddenFlag, managedFieldForFlag, parseListValue, renderArg,
} from '../customArgs';
import { CustomEnvEditor } from './CustomEnvEditor';

interface CustomArgsEditorProps {
  args: CustomArg[];
  envVars: CustomEnvVar[];
  onArgsChange: (args: CustomArg[]) => void;
  onEnvVarsChange: (envVars: CustomEnvVar[]) => void;
  engineType: EngineType;
  spec: EngineSpec;
}

type Draft = { index: number; flag: string; type: CustomArgType; value: string };

export function IssueList({ issues }: { issues: ArgIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {issues.map((i, n) => (
        <li key={n} className={cn('text-[10px]', i.severity === 'error' ? 'text-red-300' : 'text-amber-300')} data-testid={`arg-issue-${i.kind}`}>
          {i.severity === 'error' ? '✗' : '⚠'} {i.message}
        </li>
      ))}
    </ul>
  );
}

/**
 * Custom startup arguments and environment variables (Plane B) with
 * duplicate / forbidden / collision detection, presets and a bool-false
 * convention (`--no-<flag>`).
 */
export function CustomArgsEditor({ args, envVars, onArgsChange, onEnvVarsChange, engineType, spec }: CustomArgsEditorProps) {
  const [activeTab, setActiveTab] = useState<'args' | 'env'>('args');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const issues = useMemo(() => analyzeCustomArgs(args, engineType, spec), [args, engineType, spec]);
  const issuesByRow = useMemo(() => {
    const m = new Map<number, ArgIssue[]>();
    for (const i of issues) m.set(i.index, [...(m.get(i.index) ?? []), i]);
    return m;
  }, [issues]);
  const presets = CUSTOM_PRESETS.filter((p) => p.engine === engineType);
  const draftCollision = draft && draft.flag.trim().startsWith('-') ? managedFieldForFlag(draft.flag, engineType, spec) : null;

  const startEdit = (index: number) => {
    const arg = args[index];
    if (!arg) return;
    let value = '';
    if (arg.type === 'string_list' && Array.isArray(arg.value)) value = arg.value.map(String).join('\n');
    else if (arg.type === 'bool') value = arg.value === false || arg.value === 'false' ? 'false' : 'true';
    else if (arg.type !== 'flag') value = arg.value === undefined || arg.value === null ? '' : String(arg.value);
    setDraft({ index, flag: arg.flag, type: arg.type, value });
    setDraftError(null);
  };

  const saveDraft = () => {
    if (!draft) return;
    const flag = draft.flag.trim();
    if (!flag) return setDraftError('Flag name is required.');
    if (!flag.startsWith('-')) return setDraftError('Flag must start with -- or -.');
    if (isForbiddenFlag(flag, engineType)) return setDraftError(`${flag} is managed by Cortex and cannot be overridden.`);
    const canon = canonicalFlag(flag, engineType);
    const dup = args.findIndex((a, i) => i !== draft.index && canonicalFlag(a.flag, engineType) === canon);
    if (dup >= 0) return setDraftError(`${flag} is already set (row ${dup + 1}). Edit that row instead.`);

    let value: unknown = draft.value;
    if (draft.type === 'flag') value = true;
    else if (draft.type === 'bool') value = draft.value !== 'false';
    else if (draft.type === 'int') {
      value = parseInt(draft.value, 10);
      if (!Number.isFinite(value as number)) return setDraftError('Enter a whole number.');
    } else if (draft.type === 'float') {
      value = parseFloat(draft.value);
      if (!Number.isFinite(value as number)) return setDraftError('Enter a number.');
    } else if (draft.type === 'string_list') {
      value = parseListValue(draft.value);
      if ((value as string[]).length === 0) return setDraftError('Enter at least one value (one per line).');
    }
    const next: CustomArg = { flag, type: draft.type, value };
    if (draft.index === -1) onArgsChange([...args, next]);
    else onArgsChange(args.map((a, i) => (i === draft.index ? next : a)));
    setDraft(null);
    setDraftError(null);
  };

  const tabBtn = (key: 'args' | 'env', label: string) => (
    <button type="button" role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)} className={cn('px-3 py-2 text-sm transition-colors', activeTab === key ? 'text-cyan-300 border-b-2 border-cyan-500' : 'text-white/60 hover:text-white/80')}>
      {label}
    </button>
  );

  return (
    <div className="md:col-span-2 space-y-4">
      <div className="text-sm font-medium text-cyan-300 flex items-center gap-2 mb-2">⚙️ Custom Startup Configuration (Advanced)</div>
      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded text-xs text-white/80">
        Add engine flags and environment variables that the form does not cover. They are applied at <strong>container start</strong>:
        saving a running model restarts it. Custom flags are appended after the form-managed ones and win on conflict.
      </div>

      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-white/50">Presets:</span>
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.description}
              onClick={() => { const r = applyPreset(p, args, envVars, engineType); onArgsChange(r.args); onEnvVarsChange(r.env); }}
              className="px-2 py-1 rounded border border-purple-500/30 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-3 border-b border-white/10" role="tablist">
        {tabBtn('args', `Arguments (${args.length})`)}
        {tabBtn('env', `Environment Variables (${envVars.length})`)}
      </div>

      {activeTab === 'args' && (
        <>
          {args.length > 0 && (
            <div className="space-y-2 mb-3" data-testid="custom-args-list">
              {args.map((arg, index) => {
                const rowIssues = issuesByRow.get(index) ?? [];
                const hasErr = rowIssues.some((i) => i.severity === 'error');
                return (
                  <div key={`${arg.flag}-${index}`} className={cn('p-2 bg-white/5 border rounded', hasErr ? 'border-red-500/40' : rowIssues.length ? 'border-amber-500/40' : 'border-white/10')}>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs text-cyan-300 font-mono break-all">{renderArg(arg)}</code>
                      <span className="text-[10px] text-white/50 uppercase">{arg.type}</span>
                      <button type="button" onClick={() => startEdit(index)} className="text-xs px-2 py-0.5 bg-blue-500/20 border border-blue-500/40 rounded hover:bg-blue-500/30">Edit</button>
                      <button type="button" onClick={() => onArgsChange(args.filter((_, i) => i !== index))} className="text-xs px-2 py-0.5 bg-red-500/20 border border-red-500/40 rounded hover:bg-red-500/30" aria-label={`Delete ${arg.flag}`}>Delete</button>
                    </div>
                    <IssueList issues={rowIssues} />
                  </div>
                );
              })}
            </div>
          )}

          {draft ? (
            <div className="space-y-3 p-3 bg-white/10 border border-white/20 rounded">
              <div className="text-sm font-medium text-white/90">{draft.index === -1 ? 'Add Custom Argument' : 'Edit Argument'}</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-sm">Flag <span className="text-red-400">*</span>
                  <input className="input mt-1 font-mono text-xs" placeholder="--enable-lora" value={draft.flag} onChange={(e) => { setDraft({ ...draft, flag: e.target.value }); setDraftError(null); }} aria-label="Flag" />
                  <p className="text-[10px] text-white/50 mt-1">Must start with -- or -.</p>
                  {draftCollision && <p className="text-[10px] text-amber-300 mt-1">Also managed by the &quot;{draftCollision}&quot; form field; this value will override it.</p>}
                </label>
                <label className="text-sm">Type
                  <select className="input mt-1" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as CustomArgType })} aria-label="Type">
                    <option value="string">String</option>
                    <option value="int">Integer</option>
                    <option value="float">Float</option>
                    <option value="bool">Boolean (false → --no-flag)</option>
                    <option value="flag">Flag (presence only)</option>
                    <option value="string_list">List (one value per line)</option>
                  </select>
                </label>
                <label className="text-sm">Value
                  {draft.type === 'string_list' ? (
                    <textarea className="input mt-1 font-mono text-xs min-h-[70px]" placeholder={'value-one\nvalue-two'} value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} aria-label="Value" />
                  ) : draft.type === 'bool' ? (
                    <select className="input mt-1" value={draft.value === 'false' ? 'false' : 'true'} onChange={(e) => setDraft({ ...draft, value: e.target.value })} aria-label="Value">
                      <option value="true">true → {draft.flag || '--flag'}</option>
                      <option value="false">false → {(draft.flag || '--flag').replace(/^--/, '--no-')}</option>
                    </select>
                  ) : (
                    <input className="input mt-1" placeholder={draft.type === 'flag' ? 'N/A (presence only)' : 'value'} value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} disabled={draft.type === 'flag'} aria-label="Value" />
                  )}
                  <p className="text-[10px] text-white/50 mt-1">
                    {draft.type === 'string_list' && 'One value per line; no quoting needed, each line becomes a separate argument.'}
                    {draft.type === 'flag' && 'No value: the flag is passed as-is.'}
                    {draft.type === 'bool' && 'false is passed as the --no- form; omit the row to leave the engine default.'}
                  </p>
                </label>
              </div>
              {draftError && <div className="text-xs text-red-300" role="alert">{draftError}</div>}
              <div className="flex items-center gap-2">
                <Button type="button" onClick={() => { setDraft(null); setDraftError(null); }}>Cancel</Button>
                <PrimaryButton type="button" onClick={saveDraft}>{draft.index === -1 ? 'Add Argument' : 'Save Changes'}</PrimaryButton>
              </div>
            </div>
          ) : (
            <Button type="button" onClick={() => { setDraft({ index: -1, flag: '', type: 'string', value: '' }); setDraftError(null); }}>+ Add Custom Argument</Button>
          )}

          <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-white/70">
            <div className="font-medium text-amber-200 mb-1">Reserved flags</div>
            Managed by Cortex and rejected here and by the gateway: {FORBIDDEN_FLAGS.map((f) => <code key={f} className="mr-1">{f}</code>)}<code>--ssl-*</code>.
            Sampling flags such as <code>--temperature</code> belong in Request Defaults.
          </div>
        </>
      )}

      {activeTab === 'env' && <CustomEnvEditor envVars={envVars} onEnvVarsChange={onEnvVarsChange} engineType={engineType} spec={spec} />}
    </div>
  );
}

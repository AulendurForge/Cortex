'use client';

import React from 'react';
import { EngineSpec, EngineType, FieldSpec, fieldsFor, flagFor, groupLabel } from '../../../lib/engine-spec';
import { NumberField } from '../../NumberField';
import { ModelFormValues, FormFieldName } from '../modelFormValues';
import { BoolField, Collapsible, EngineDefaultMark, FieldShell, JsonTextarea, SelectField, TextField } from './fields';

/** Groups that are rendered by dedicated editors, never by the generic section. */
const HIDDEN_GROUPS = new Set(['custom', 'request']);

type SpecFieldsSectionProps = {
  spec: EngineSpec;
  engine: EngineType;
  values: ModelFormValues;
  onChange: (field: FormFieldName, value: unknown) => void;
  /** Fields already rendered by curated sections. */
  exclude?: ReadonlySet<string> | ReadonlyArray<string>;
  /** Only render these groups (default: every group with at least one field). */
  groups?: ReadonlyArray<string>;
  title?: string;
  defaultOpen?: boolean;
};

function helpWithFlag(f: FieldSpec, engine: EngineType): string | undefined {
  const flag = f.form === 'env' ? (f.env ? `env ${f.env}` : undefined) : flagFor(f, engine) ?? undefined;
  const parts = [f.help, flag ? `(${flag})` : undefined].filter(Boolean);
  return parts.length ? parts.join(' ') : undefined;
}

/** One input for one spec field, chosen from its kind / form / choices. */
function SpecFieldInput({
  field: f,
  engine,
  value,
  onChange,
}: {
  field: FieldSpec;
  engine: EngineType;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = f.label || f.name;
  const help = helpWithFlag(f, engine);
  const defaultPlaceholder = f.default !== undefined && f.default !== null ? `engine default: ${String(f.default)}` : 'engine default';

  if (f.kind === 'bool') {
    const tri = f.form === 'negatable' || f.form === 'onoff' || f.form === 'no_only';
    return (
      <BoolField
        label={label}
        tri={tri}
        value={typeof value === 'boolean' ? value : undefined}
        onChange={(v) => onChange(v)}
        help={help}
        engineDefault={f.default}
      />
    );
  }
  if (f.choices && f.choices.length > 0) {
    return (
      <SelectField
        label={label}
        value={typeof value === 'string' ? value : undefined}
        onChange={(v) => onChange(v)}
        options={f.choices}
        help={help}
        engineDefault={f.default}
      />
    );
  }
  if (f.kind === 'int' || f.kind === 'float') {
    return (
      <FieldShell label={label} help={help} badge={<EngineDefaultMark value={value} engineDefault={f.default} />}>
        <NumberField
          value={typeof value === 'number' ? value : undefined}
          onChange={(v) => onChange(v)}
          min={f.min ?? undefined}
          max={f.max ?? undefined}
          integer={f.kind === 'int'}
          placeholder={defaultPlaceholder}
          aria-label={label}
        />
      </FieldShell>
    );
  }
  if (f.kind === 'json') {
    return (
      <JsonTextarea
        label={label}
        value={typeof value === 'string' ? value : undefined}
        onChange={(v) => onChange(v)}
        help={help}
        placeholder={'{ ... }'}
        className="md:col-span-3"
      />
    );
  }
  return (
    <TextField
      label={label}
      value={typeof value === 'string' ? value : undefined}
      onChange={(v) => onChange(v)}
      help={help}
      placeholder={f.path ? 'path relative to the models directory' : defaultPlaceholder}
      mono={!!f.path}
    />
  );
}

/**
 * Renders every spec field for an engine that the curated sections do not
 * already show, grouped under collapsible headers, so new backend fields are
 * reachable without a UI change.
 */
export function SpecFieldsSection({ spec, engine, values, onChange, exclude, groups, title, defaultOpen = false }: SpecFieldsSectionProps) {
  const excluded = React.useMemo(() => new Set(exclude ? Array.from(exclude) : []), [exclude]);
  const byGroup = React.useMemo(() => {
    const map = new Map<string, FieldSpec[]>();
    for (const f of fieldsFor(spec, engine)) {
      if (f.form === 'internal' || excluded.has(f.name)) continue;
      const g = f.group || 'advanced';
      if (HIDDEN_GROUPS.has(g)) continue;
      if (groups && !groups.includes(g)) continue;
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(f);
    }
    return map;
  }, [spec, engine, excluded, groups]);

  const order = spec.groups.map((g) => g.key);
  const keys = Array.from(byGroup.keys()).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (keys.length === 0) return null;

  return (
    <div className="md:col-span-2 space-y-1" data-testid="spec-fields-section">
      {title && <div className="text-xs font-semibold text-white/60 uppercase tracking-wider mt-3">{title}</div>}
      {keys.map((g) => {
        const fields = byGroup.get(g) ?? [];
        const setCount = fields.filter((f) => {
          const v = (values as Record<string, unknown>)[f.name];
          return v !== undefined && v !== null && v !== '';
        }).length;
        return (
          <Collapsible key={g} title={groupLabel(spec, g)} icon="▸" color="slate" defaultOpen={defaultOpen} count={setCount}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid={`spec-group-${g}`}>
              {fields.map((f) => (
                <SpecFieldInput
                  key={f.name}
                  field={f}
                  engine={engine}
                  value={(values as Record<string, unknown>)[f.name]}
                  onChange={(v) => onChange(f.name as FormFieldName, v)}
                />
              ))}
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}

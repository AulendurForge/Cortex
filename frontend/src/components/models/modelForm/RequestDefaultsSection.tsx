'use client';

import React from 'react';
import { Tooltip } from '../../Tooltip';
import { FormFieldName, ModelFormValues, SUGGESTED_SAMPLING } from '../modelFormValues';
import { NumberField } from '../../NumberField';

interface RequestDefaultsSectionProps {
  values: ModelFormValues;
  onChange: (field: FormFieldName, value: unknown) => void;
}

/**
 * Request Defaults Section (Plane C)
 * 
 * These parameters are applied at REQUEST TIME by the gateway, not at container startup.
 * Client-specified values always take precedence over these defaults.
 * 
 * See cortexSustainmentPlan.md for architectural details.
 */
export function RequestDefaultsSection({ values, onChange }: RequestDefaultsSectionProps) {
  if (!values.engine_type) return null;
  const customJsonError = (() => {
    const t = values.custom_request_json;
    if (!t || !t.trim()) return null;
    try {
      const v: unknown = JSON.parse(t);
      return v && typeof v === 'object' && !Array.isArray(v) ? null : 'Must be a JSON object';
    } catch (e) { return `Invalid JSON: ${(e as Error).message}`; }
  })();

  return (
    <div className="md:col-span-2 space-y-4">
      <div className="text-sm font-medium text-purple-300 flex items-center gap-2 mb-2">
        📊 Request Defaults (Sampling Parameters)
      </div>
      
      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded text-xs">
        <div className="font-medium text-blue-200 mb-1">ℹ️ What are Request Defaults?</div>
        <div className="text-white/80">
          These parameters are applied <strong>per-request</strong> by the gateway, NOT at container startup.
          Clients can override these values in their API calls. Use this to set sensible defaults for
          temperature, repetition control, etc.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-sm">
          Temperature
          <NumberField
            className="mt-1"
            min={0.0}
            max={2.0}
            step={0.1}
            placeholder={`engine default (suggested ${SUGGESTED_SAMPLING.temperature})`}
            value={values.temperature}
            onChange={(v) => onChange('temperature', v)}
          />
          <p className="text-[11px] text-white/50 mt-1">
            Sampling temperature. 0.0 = deterministic, 1.0 = balanced, 2.0 = very random. 
            <Tooltip text="Controls randomness in token selection. Applied per-request. Client can override." />
          </p>
        </label>

        <label className="text-sm">
          Top-P
          <NumberField
            className="mt-1"
            min={0.0}
            max={1.0}
            step={0.05}
            placeholder={`engine default (suggested ${SUGGESTED_SAMPLING.top_p})`}
            value={values.top_p}
            onChange={(v) => onChange('top_p', v)}
          />
          <p className="text-[11px] text-white/50 mt-1">
            Nucleus sampling threshold. 0.1 = conservative, 0.9 = balanced, 1.0 = all tokens. 
            <Tooltip text="Samples from tokens that make up this probability mass. Applied per-request." />
          </p>
        </label>

        <label className="text-sm">
          Top-K
          <NumberField
            className="mt-1"
            min={1}
            max={100}
            step={1}
            integer
            placeholder={`engine default (suggested ${SUGGESTED_SAMPLING.top_k})`}
            value={values.top_k}
            onChange={(v) => onChange('top_k', v)}
          />
          <p className="text-[11px] text-white/50 mt-1">
            Limit sampling to top K tokens. 1 = greedy, 40 = balanced, 100 = diverse. 
            <Tooltip text="Filters out low-probability tokens. Applied per-request." />
          </p>
        </label>

        <label className="text-sm">
          Repetition Penalty
          <NumberField
            className="mt-1"
            min={1.0}
            max={2.0}
            step={0.1}
            placeholder={`engine default (suggested ${SUGGESTED_SAMPLING.repetition_penalty})`}
            value={values.repetition_penalty}
            onChange={(v) => onChange('repetition_penalty', v)}
          />
          <p className="text-[11px] text-white/50 mt-1">
            Penalty for repeated tokens. 1.0 = no penalty, 1.2 = moderate penalty. 
            <Tooltip text="Higher values reduce repetition. Applied per-request. Gateway translates to engine-specific key." />
          </p>
        </label>

        <label className="text-sm">
          Frequency Penalty
          <NumberField
            className="mt-1"
            min={-2.0}
            max={2.0}
            step={0.1}
            placeholder={`engine default (suggested ${SUGGESTED_SAMPLING.frequency_penalty})`}
            value={values.frequency_penalty}
            onChange={(v) => onChange('frequency_penalty', v)}
          />
          <p className="text-[11px] text-white/50 mt-1">
            Penalty based on token frequency. 0.0 = no penalty, 0.5 = moderate penalty. 
            <Tooltip text="Reduces likelihood of frequently used tokens. Applied per-request." />
          </p>
        </label>

        <label className="text-sm">
          Presence Penalty
          <NumberField
            className="mt-1"
            min={-2.0}
            max={2.0}
            step={0.1}
            placeholder={`engine default (suggested ${SUGGESTED_SAMPLING.presence_penalty})`}
            value={values.presence_penalty}
            onChange={(v) => onChange('presence_penalty', v)}
          />
          <p className="text-[11px] text-white/50 mt-1">
            Penalty for tokens already present in context. 0.0 = no penalty, 0.5 = moderate penalty. 
            <Tooltip text="Encourages new topics and reduces repetition. Applied per-request." />
          </p>
        </label>
      </div>

      <div className="mt-3 p-2 bg-white/5 border border-white/10 rounded text-xs">
        <div className="font-medium text-white/80 mb-1">⚡ How this works:</div>
        <ul className="text-white/70 space-y-1 list-disc pl-4">
          <li>These are <strong>defaults</strong> - clients can override them in API requests</li>
          <li>Leave a field empty to send nothing and let the engine use its own default</li>
          <li>Gateway merges these into requests that don't specify values</li>
          <li>Gateway automatically translates parameter names for llama.cpp (e.g., "temperature" → "temp")</li>
          <li>Changes take effect immediately - no container restart needed!</li>
        </ul>
      </div>

      {/* Advanced: Custom Request Extensions */}
      <details className="mt-3 p-3 bg-cyan-500/10 border border-cyan-500/30 rounded border-l-2 border-l-cyan-500">
        <summary className="cursor-pointer text-sm font-medium text-cyan-300 mb-2 flex items-center gap-2">
          <span>⚙️</span> Advanced: Custom Request Extensions
        </summary>
        
        <div className="mt-3 text-xs text-white/80 mb-2">
          Add model-specific request parameters as JSON. These will be merged with every request.
          Use this for <code>vllm_xargs</code>, custom chat templates, or model-specific fields.
        </div>

        <label className="text-sm block">
          Custom Request JSON
          <textarea
            className="input mt-1 font-mono text-xs"
            rows={6}
            placeholder={`{
  "vllm_xargs": {
    "custom_param": "value"
  },
  "stop": ["###", "</s>"]
}`}
            value={values.custom_request_json || ''}
            onChange={(e) => onChange('custom_request_json', e.target.value)}
            aria-invalid={customJsonError !== null}
          />
          {customJsonError && <div className="text-[11px] text-red-300 mt-1" role="alert">{customJsonError}</div>}
          <p className="text-[11px] text-white/50 mt-1">
            Enter valid JSON. Gateway will merge these fields into all requests.
            <Tooltip text="Use this for vllm_xargs (model-specific SamplingParams), custom chat templates, or any model-specific request parameters. Must be valid JSON." />
          </p>
        </label>

        <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded text-xs">
          <div className="font-medium text-blue-200 mb-1">💡 Example Use Cases:</div>
          <ul className="text-white/70 space-y-1 list-disc pl-4">
            <li><strong>DeepSeek R1 reasoning</strong>: <code>{`{"vllm_xargs": {"min_thinking_tokens": 100}}`}</code></li>
            <li><strong>Custom stop sequences</strong>: <code>{`{"stop": ["</s>", "###"]}`}</code></li>
            <li><strong>Model-specific params</strong>: Any field your model's API accepts</li>
          </ul>
        </div>
      </details>
    </div>
  );
}


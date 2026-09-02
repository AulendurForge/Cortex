'use client';

import React from 'react';
import apiFetch from '../../lib/api-clients';
import { useToast } from '../../providers/ToastProvider';
import { safeCopyToClipboard } from '../../lib/clipboard';

type Diagnosis = {
  detected: boolean;
  title: string;
  message: string;
  fixes: string[];
  severity: 'error' | 'warning' | 'info';
  error_type: string;
};

type DiagnoseResponse = {
  logs?: string;
  diagnosis?: Diagnosis | null;
  summary?: unknown;
  state?: string;
  state_reason?: string | null;
};

interface DiagnosticBannerProps {
  modelId: number;
  modelState: string;
  stateReason?: string | null;
}

/**
 * Startup-failure diagnosis above the logs.  Re-runs whenever the model's
 * state changes (e.g. loading -> failed) and shows the backend's state_reason.
 */
export function DiagnosticBanner({ modelId, modelState, stateReason }: DiagnosticBannerProps) {
  const [diagnosis, setDiagnosis] = React.useState<Diagnosis | null>(null);
  const [reason, setReason] = React.useState<string | null>(stateReason ?? null);
  const [loading, setLoading] = React.useState(false);
  const { addToast } = useToast();

  React.useEffect(() => {
    let stop = false;
    setLoading(true);
    (async () => {
      try {
        const data = await apiFetch<DiagnoseResponse>(`/admin/models/${modelId}/logs?diagnose=true&tail=2000`);
        if (stop) return;
        setDiagnosis(data?.diagnosis && data.diagnosis.detected ? data.diagnosis : null);
        setReason(data?.state_reason ?? stateReason ?? null);
      } catch {
        if (!stop) setDiagnosis(null);
      } finally {
        if (!stop) setLoading(false);
      }
    })();
    return () => { stop = true; };
  }, [modelId, modelState, stateReason]);

  if (loading) {
    return <div className="mb-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded" role="status"><div className="text-sm text-blue-200">🔍 Analyzing container logs…</div></div>;
  }

  const reasonBlock = reason && modelState === 'failed' ? (
    <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-200" role="alert">
      <span className="font-semibold">Failed:</span> {reason}
    </div>
  ) : null;

  if (!diagnosis) return reasonBlock;

  const bgColor = diagnosis.severity === 'error' ? 'bg-red-500/10 border-red-500/30' : diagnosis.severity === 'warning' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-blue-500/10 border-blue-500/30';
  const textColor = diagnosis.severity === 'error' ? 'text-red-200' : diagnosis.severity === 'warning' ? 'text-amber-200' : 'text-blue-200';
  const icon = diagnosis.severity === 'error' ? '❌' : diagnosis.severity === 'warning' ? '⚠️' : 'ℹ️';

  const copyDiagnosis = async () => {
    const text = [
      `Diagnosis: ${diagnosis.title}`,
      `Severity: ${diagnosis.severity.toUpperCase()}`,
      `Error Type: ${diagnosis.error_type}`,
      reason ? `State reason: ${reason}` : '',
      '',
      'Message:',
      diagnosis.message,
      '',
      diagnosis.fixes?.length ? 'Suggested Fixes:' : '',
      diagnosis.fixes?.length ? diagnosis.fixes.map((fix, idx) => `${idx + 1}. ${fix}`).join('\n') : '',
    ].filter(Boolean).join('\n');
    const ok = await safeCopyToClipboard(text);
    addToast(ok ? { title: 'Diagnosis copied to clipboard', kind: 'success' } : { title: 'Failed to copy diagnosis', kind: 'error' });
  };

  return (
    <>
      {reasonBlock}
      <div className={`mb-3 p-4 ${bgColor} border rounded-lg`} role="alert">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>{icon}</span>
          <div className="flex-1">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className={`font-semibold text-lg ${textColor}`}>{diagnosis.title}</div>
              <button type="button" onClick={copyDiagnosis} className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 border border-white/20 rounded transition-colors text-white/80 hover:text-white" title="Copy diagnosis to clipboard">Copy</button>
            </div>
            <div className="text-sm text-white/80 mb-3">{diagnosis.message}</div>
            {diagnosis.fixes && diagnosis.fixes.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-white/90">💡 Suggested fixes</div>
                <ul className="list-disc pl-5 text-sm text-white/80 space-y-1">{diagnosis.fixes.map((fix) => <li key={fix}>{fix}</li>)}</ul>
              </div>
            )}
            <div className="mt-3 text-xs text-white/60">Error type: <span className="font-mono">{diagnosis.error_type}</span></div>
          </div>
        </div>
      </div>
    </>
  );
}

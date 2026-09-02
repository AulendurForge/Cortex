'use client';

import { Modal } from '../Modal';
import { Button, Badge, SectionTitle, InfoBox } from '../UI';
import { useToast } from '../../providers/ToastProvider';
import { cn } from '../../lib/cn';
import { safeCopyToClipboard } from '../../lib/clipboard';

export type TestResult = {
  success: boolean;
  test_type: 'chat' | 'embeddings';
  request: unknown;
  response: unknown;
  error: string | null;
  latency_ms: number;
  timestamp: number;
};

export function TestResultsModal({ 
  open, 
  onClose, 
  result,
  modelName
}: { 
  open: boolean; 
  onClose: () => void; 
  result: TestResult | null;
  modelName?: string;
}) {
  const { addToast } = useToast();
  
  if (!result) return null;
  const usage = (() => {
    const r = result.response as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } } | null | undefined;
    return r && typeof r === 'object' && r.usage && typeof r.usage === 'object' ? r.usage : null;
  })();
  
  const copyResults = async () => {
    const text = JSON.stringify(result, null, 2);
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      addToast({ title: 'Test results copied!', kind: 'success' });
    } else {
      addToast({ title: 'Copy failed', kind: 'error' });
    }
  };
  
  return (
    <Modal open={open} onClose={onClose} title={`Inference Test Diagnostic${modelName ? ` · ${modelName}` : ''}`}>
      <div className="space-y-4">
        {/* Success/Failure Header */}
        <CardTest result={result} />
        
        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-3">
          <MetricCard label="LATENCY" value={`${result.latency_ms}ms`} color="cyan" />
          <MetricCard label="INTERFACE" value={result.test_type} color="indigo" />
          <MetricCard label="ENDPOINT" value={result.success ? 'UP' : 'ERR'} color={result.success ? 'emerald' : 'amber'} />
        </div>

        {/* Request/Response Details */}
        <div className="space-y-3 pt-1">
          <SectionTitle variant="purple" className="text-[9px]">Transmission Payload</SectionTitle>
          <pre className="text-[10px] bg-black/40 rounded-xl p-3 overflow-x-auto border border-white/5 font-mono text-emerald-400/80 shadow-inner">
            <code>{JSON.stringify(result.request, null, 2)}</code>
          </pre>

          {!!result.response && (
            <>
              <SectionTitle variant="cyan" className="text-[9px]">Gateway Response</SectionTitle>
              <pre className="text-[10px] bg-black/40 rounded-xl p-3 overflow-x-auto max-h-48 overflow-y-auto border border-white/5 font-mono text-blue-300/80 shadow-inner custom-scrollbar">
                <code>{JSON.stringify(result.response, null, 2)}</code>
              </pre>
            </>
          )}
        </div>
        
        {/* Token Usage */}
        {usage && (
          <InfoBox variant="blue" title="Efficiency Metrics" className="text-[10px] p-2">
            <div className="flex gap-4">
              <div><span className="text-white/40 uppercase font-bold text-[8px] mr-1">Prompt:</span> <span className="font-mono text-white/90">{usage.prompt_tokens || 0}</span></div>
              <div><span className="text-white/40 uppercase font-bold text-[8px] mr-1">Gen:</span> <span className="font-mono text-white/90">{usage.completion_tokens || 0}</span></div>
              <div><span className="text-white/40 uppercase font-bold text-[8px] mr-1">Total:</span> <span className="font-mono text-indigo-300 font-bold">{usage.total_tokens || 0}</span></div>
            </div>
          </InfoBox>
        )}
        
        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
          <Button variant="default" size="sm" onClick={copyResults} className="px-4">
            📋 Copy JSON
          </Button>
          <Button variant="primary" size="sm" onClick={onClose} className="px-6">
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CardTest({ result }: { result: TestResult }) {
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-2xl border transition-all duration-500",
      result.success 
        ? 'bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.05)]' 
        : 'bg-red-500/5 border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.05)]'
    )}>
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-inner",
        result.success ? "bg-emerald-500/10" : "bg-red-500/10"
      )}>
        {result.success ? '✅' : '❌'}
      </div>
      <div className="flex-1">
        <div className={cn("font-black uppercase tracking-[0.2em] text-xs", result.success ? "text-emerald-400" : "text-red-400")}>
          {result.success ? 'Diagnostic Passed' : 'Inference Failure'}
        </div>
        <div className="text-[10px] text-white/50 mt-0.5 leading-relaxed italic">
          {result.success 
            ? `Verified healthy response in ${result.latency_ms}ms.` 
            : result.error || 'System timed out during synchronization.'
          }
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: 'cyan' | 'indigo' | 'emerald' | 'amber' }) {
  const colors = {
    cyan: 'text-cyan-400 bg-cyan-500/5 border-cyan-500/10',
    indigo: 'text-indigo-400 bg-indigo-500/5 border-indigo-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10',
    amber: 'text-amber-400 bg-amber-500/5 border-amber-500/10',
  };

  return (
    <div className={cn("p-3 rounded-2xl border flex flex-col items-center justify-center gap-1", colors[color])}>
      <div className="text-[8px] font-black uppercase tracking-widest opacity-50">{label}</div>
      <div className="text-xs font-mono font-bold uppercase">{value}</div>
    </div>
  );
}

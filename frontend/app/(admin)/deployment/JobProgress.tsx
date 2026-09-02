'use client';

import React from 'react';
import { Badge, BadgeVariant, Button, Card, InfoBox } from '../../../src/components/UI';
import { cn } from '../../../src/lib/cn';
import { Job, formatBytes, formatDuration, isJobActive, jobTypeLabel, relativeTime } from './api';

const STATUS_BADGE: Record<Job['status'], BadgeVariant> = {
  pending: 'info',
  running: 'info',
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
};

type Props = {
  job: Job;
  /** Shown while the job is running/pending. */
  onCancel?: () => void;
  cancelling?: boolean;
  /** Rendered below the panel once the job has completed successfully. */
  children?: React.ReactNode;
  /** Optional "done" action (e.g. "Start another export"), shown once the job has finished. */
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
};

export function JobProgress({ job, onCancel, cancelling = false, children, onDismiss, dismissLabel = 'Done', className }: Props) {
  const active = isJobActive(job);
  const pct = Math.max(0, Math.min(100, Math.round(job.progress * 100)));
  const logRef = React.useRef<HTMLPreElement | null>(null);
  const logCount = job.logs.length;

  React.useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logCount]);

  // Re-render once a second while the job runs so "Elapsed" ticks even when the polled job is unchanged
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  const elapsed = (job.finished_at ?? now / 1000) - job.started_at;
  const tail = job.logs.slice(-200);

  return (
    <Card className={cn('p-4 space-y-4', className)} role="region" aria-label={`${jobTypeLabel(job.job_type)} job progress`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold text-white/90">{jobTypeLabel(job.job_type)}</div>
          <Badge variant={STATUS_BADGE[job.status]}>{job.status}</Badge>
          {job.step && active && <span className="text-xs text-white/60">Step: <span className="text-white/90">{job.step}</span></span>}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-white/50">
          <span>Started {relativeTime(job.started_at)}</span>
          <span aria-hidden>•</span>
          <span>{active ? 'Elapsed' : 'Took'} {formatDuration(elapsed)}</span>
          {active && onCancel && (
            <Button variant="danger" size="sm" onClick={onCancel} disabled={cancelling} aria-busy={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </Button>
          )}
        </div>
      </div>

      <div>
        <div
          className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Job progress"
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              job.status === 'failed' ? 'bg-red-400' : job.status === 'cancelled' ? 'bg-amber-400' : job.status === 'completed' ? 'bg-emerald-400' : 'bg-cyan-400',
              active && 'animate-pulse'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/60">
          <span className="font-semibold text-white/80">{pct}%</span>
          <span>
            {formatBytes(job.bytes_written)}
            {job.estimated_size_bytes > 1 && <> of ~{formatBytes(job.estimated_size_bytes)}</>}
            {active && job.eta_seconds != null && <> · ETA {formatDuration(job.eta_seconds)}</>}
          </span>
        </div>
      </div>

      {job.status === 'failed' && (
        <InfoBox variant="error" title="Job failed" role="alert">
          <div className="break-words">{job.error || 'The job failed without an error message. See the log below.'}</div>
        </InfoBox>
      )}
      {job.status === 'cancelled' && (
        <InfoBox variant="warning" title="Job cancelled">
          The partially written bundle at <code className="text-amber-100">{job.output_dir}</code> was removed; nothing is left on the drive.
        </InfoBox>
      )}

      <div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-white/40 mb-1">Log</div>
        <pre
          ref={logRef}
          data-testid="job-log"
          className="max-h-64 overflow-auto rounded-xl bg-black/40 border border-white/10 p-3 text-[11px] leading-relaxed font-mono text-white/80 whitespace-pre-wrap break-words"
        >
          {tail.length === 0 ? <span className="text-white/30">Waiting for output…</span> : tail.join('\n')}
        </pre>
      </div>

      {job.status === 'completed' && children}

      {!active && onDismiss && (
        <div className="flex justify-end">
          <Button variant="default" size="sm" onClick={onDismiss}>{dismissLabel}</Button>
        </div>
      )}
    </Card>
  );
}

export default JobProgress;

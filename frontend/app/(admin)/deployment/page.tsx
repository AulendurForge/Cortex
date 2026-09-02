'use client';

import React, { Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { InfoBox, PageHeader } from '@/components/UI';
import { Tabs } from '@/components/Tabs';
import { useToast } from '@/providers/ToastProvider';
import { JobController, QK, cancelJob, errMsg, isJobActive, jobTypeLabel, relativeTime, useJobStatus } from './api';
import { ExportWizard } from './ExportWizard';
import { ImportWizard } from './ImportWizard';
import { JobProgress } from './JobProgress';

const OWNER_TAB: Record<string, 'export' | 'import'> = {
  bundle_export: 'export',
  bundle_import: 'import',
  db_restore: 'import',
};

export default function TransferPage() {
  return (
    <section className="space-y-4">
      <PageHeader
        title="Transfer"
        subtitle="Move engine images, models and the Cortex program to another host on a USB drive — no network needed on the other side."
      />
      <Suspense fallback={<div className="text-center py-12 text-white/20 uppercase font-bold tracking-widest text-xs">Loading…</div>}>
        <TransferBody />
      </Suspense>
    </section>
  );
}

function TransferBody() {
  const qc = useQueryClient();
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  const activeTab = searchParams?.get('tab') === 'import' ? 'import' : 'export';
  const status = useJobStatus();
  const [claimedJobId, setClaimedJobId] = React.useState<string | null>(null);

  const cancel = useMutation({
    mutationFn: cancelJob,
    onSuccess: () => { qc.invalidateQueries({ queryKey: QK.status }); addToast({ title: 'Cancel requested', description: 'The job stops after the current file.', kind: 'info' }); },
    onError: (e: unknown) => addToast({ title: 'Could not cancel', description: errMsg(e), kind: 'error' }),
  });

  const job = status.data ?? null;
  const ctl: JobController = React.useMemo(() => ({
    job,
    busy: isJobActive(job),
    claimedJobId,
    claimJob: (id: string) => setClaimedJobId(id),
    releaseJob: () => setClaimedJobId(null),
    cancel: () => cancel.mutate(),
    cancelling: cancel.isPending,
  }), [job, claimedJobId, cancel]);

  // A running job that no wizard on the active tab is showing (page reload, other tab, started from the CLI).
  const owner = job ? OWNER_TAB[job.job_type] : undefined;
  const showAtTop = !!job && isJobActive(job) && (job.id !== claimedJobId || owner !== activeTab);

  return (
    <div className="space-y-4">
      {status.isError && (
        <InfoBox variant="error" title="Cannot read the job status" role="alert">
          {errMsg(status.error)} — the gateway may be restarting; the page keeps retrying.
        </InfoBox>
      )}
      {showAtTop && job && (
        <div className="space-y-2">
          <InfoBox variant="warning" title={`A ${jobTypeLabel(job.job_type).toLowerCase()} job is running`}>
            Started {relativeTime(job.started_at)}. New exports and imports are blocked until it finishes or you cancel it.
          </InfoBox>
          <JobProgress job={job} onCancel={ctl.cancel} cancelling={ctl.cancelling} />
        </div>
      )}
      <Tabs
        defaultId="export"
        tabs={[
          { id: 'export', label: '📤 Export', content: <ExportWizard ctl={ctl} /> },
          { id: 'import', label: '📥 Import', content: <ImportWizard ctl={ctl} /> },
        ]}
      />
    </div>
  );
}

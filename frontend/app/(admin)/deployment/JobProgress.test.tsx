import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { JobProgress } from './JobProgress';
import type { Job } from './api';

const base: Job = {
  id: 'bundle_export-1',
  status: 'running',
  started_at: Date.now() / 1000 - 30,
  finished_at: null,
  step: 'images',
  progress: 0.42,
  logs: ['[10:00:00] image vllm/vllm-openai:v0.28.1', '[10:00:05] pulling …'],
  output_dir: '/host/media/usb/cortex-bundle-1',
  artifacts: null,
  error: null,
  job_type: 'bundle_export',
  cancelled: false,
  estimated_size_bytes: 10e9,
  bytes_written: 4.2e9,
  eta_seconds: 90,
};

describe('JobProgress', () => {
  it('shows progress, step, bytes, ETA and the log tail, and cancels', () => {
    const onCancel = vi.fn();
    render(<JobProgress job={base} onCancel={onCancel} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('images')).toBeInTheDocument();
    expect(screen.getByText(/4\.20 GB of ~10\.00 GB/)).toBeInTheDocument();
    expect(screen.getByText(/ETA 1m 30s/)).toBeInTheDocument();
    expect(screen.getByTestId('job-log')).toHaveTextContent('pulling …');
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('renders the success panel and dismiss action only when completed', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<JobProgress job={base} onDismiss={onDismiss} dismissLabel="Start another"><div>Bundle written</div></JobProgress>);
    expect(screen.queryByText('Bundle written')).not.toBeInTheDocument();
    expect(screen.queryByText('Start another')).not.toBeInTheDocument();
    rerender(<JobProgress job={{ ...base, status: 'completed', progress: 1, finished_at: base.started_at + 60 }} onDismiss={onDismiss} dismissLabel="Start another"><div>Bundle written</div></JobProgress>);
    expect(screen.getByText('Bundle written')).toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Start another'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('surfaces the error message of a failed job', () => {
    render(<JobProgress job={{ ...base, status: 'failed', error: 'not enough free space at /media/usb' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('not enough free space at /media/usb');
  });
});

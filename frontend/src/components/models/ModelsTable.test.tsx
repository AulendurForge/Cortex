import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ModelsListError, ModelsTable, StateBadge } from './ModelsTable';
import { ToastProvider } from '../../providers/ToastProvider';
import type { ModelItem } from '../../lib/validators';

const actions = {
  onLogs: vi.fn(), onRecipe: vi.fn(), onTest: vi.fn(), onStart: vi.fn(), onStop: vi.fn(), onConfig: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn(),
};
const pending = { startingId: null, stoppingId: null, testingId: null };

describe('ModelsListError', () => {
  it('shows the API message, code and request id, and retries', () => {
    const onRetry = vi.fn();
    render(<ModelsListError error={{ code: 502, message: 'upstream_unavailable', request_id: 'req-123' }} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load models');
    expect(screen.getByRole('alert')).toHaveTextContent('upstream_unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 502');
    expect(screen.getByRole('alert')).toHaveTextContent('req-123');
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('falls back to Error.message for schema errors', () => {
    render(<ModelsListError error={new Error('Invalid literal value')} onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid literal value');
  });
});

describe('ModelsTable', () => {
  const model: ModelItem = {
    id: 1, name: 'Llama', served_model_name: 'llama', task: 'generate', engine_type: 'vllm', state: 'failed',
    state_reason: 'CUDA out of memory', archived: false, selected_gpus: [0, 1], tp_size: 2, dtype: 'bfloat16',
  } as ModelItem;

  it('shows the state reason for failed models', () => {
    render(<ToastProvider><ModelsTable models={[model]} isAdmin actions={actions} pending={pending} isLoading={false} /></ToastProvider>);
    expect(screen.getByText('FAILED')).toHaveAttribute('title', 'CUDA out of memory');
    expect(screen.getByLabelText('Why did it fail?')).toBeInTheDocument();
  });

  it('distinguishes loading from empty', () => {
    const { rerender } = render(<ToastProvider><ModelsTable models={[]} isAdmin actions={actions} pending={pending} isLoading /></ToastProvider>);
    expect(screen.getByText(/Loading models/)).toBeInTheDocument();
    rerender(<ToastProvider><ModelsTable models={[]} isAdmin actions={actions} pending={pending} isLoading={false} /></ToastProvider>);
    expect(screen.getByText(/Zero Active Deployments/)).toBeInTheDocument();
  });

  it('disables Start while a start is pending', () => {
    render(<ToastProvider><ModelsTable models={[{ ...model, state: 'stopped' }]} isAdmin actions={actions} pending={{ ...pending, startingId: 1 }} isLoading={false} /></ToastProvider>);
    expect(screen.getByLabelText('Start Llama')).toBeDisabled();
  });

  it('renders StateBadge without a tooltip when there is no reason', () => {
    render(<StateBadge state="running" />);
    expect(screen.getByText('RUNNING')).toBeInTheDocument();
    expect(screen.queryByLabelText('Why did it fail?')).not.toBeInTheDocument();
  });
});

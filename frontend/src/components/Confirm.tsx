'use client';

import { ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './UI';

type Props = {
  open: boolean;
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** While true both buttons are disabled and the confirm label shows progress. */
  pending?: boolean;
  pendingLabel?: string;
  /** Inline error from the last attempt (kept visible so the admin can retry). */
  error?: string | null;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  title = 'Confirm Action',
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  pending = false,
  pendingLabel = 'Working…',
  error,
  danger = false,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal open={open} onClose={() => { if (!pending) onClose(); }} title={title}>
      <div className="space-y-6">
        {description && (
          <div className="text-white/70 text-sm leading-relaxed bg-white/5 p-4 rounded-2xl border border-white/5">
            {description}
          </div>
        )}
        {error && (
          <div role="alert" className="text-xs text-red-200 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="default" onClick={onClose} className="px-6" disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            className="px-8 shadow-lg shadow-indigo-500/20"
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

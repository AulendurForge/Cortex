'use client';

import React, { ReactNode, useEffect, useId, useRef } from 'react';
import { cn } from '../lib/cn';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}

/**
 * Accessible modal: role="dialog" + aria-modal, focus moves into the dialog
 * on open and returns to the opener on close, Tab is trapped inside, and
 * Escape (or the backdrop) closes it.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  variant = 'center',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  variant?: 'center' | 'fullscreen' | 'workflow';
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const panel = panelRef.current;
    // Focus the first focusable element (skip the close button when there is content to reach).
    const focusables = panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    (focusables[1] ?? focusables[0] ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openerRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const header = (cls: string, titleCls: string, dot?: boolean) => (
    <div className={cls}>
      <div className="flex items-center gap-3">
        {dot && <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_rgba(34,211,238,0.5)]" aria-hidden />}
        <div id={titleId} className={titleCls}>{title}</div>
      </div>
      <button
        type="button"
        className="p-1.5 hover:bg-white/10 rounded-xl transition-colors text-white/40 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/60"
        onClick={onClose}
        aria-label="Close"
      >
        <CloseIcon />
      </button>
    </div>
  );

  const panelProps = {
    ref: panelRef,
    role: 'dialog' as const,
    'aria-modal': true as const,
    'aria-labelledby': title ? titleId : undefined,
    tabIndex: -1,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={onClose} aria-hidden />

      {variant === 'fullscreen' ? (
        <div {...panelProps} className="relative w-full h-full glass rounded-3xl shadow-2xl text-white overflow-hidden flex flex-col border border-white/10 animate-in zoom-in-95 duration-300 outline-none">
          {header('px-4 py-3 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0', 'text-sm font-bold uppercase tracking-widest text-white/90')}
          <div className="flex-1 overflow-auto p-4 custom-scrollbar">{children}</div>
        </div>
      ) : variant === 'workflow' ? (
        <div {...panelProps} className="relative glass rounded-[2rem] shadow-2xl max-w-6xl w-full text-white min-h-[70vh] h-[85vh] max-h-[900px] overflow-hidden flex flex-col border border-white/10 animate-in zoom-in-95 duration-300 outline-none">
          {header('px-6 py-3.5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0', 'text-sm font-black uppercase tracking-[0.2em] text-white/90 italic', true)}
          <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
        </div>
      ) : (
        <div {...panelProps} className={cn('relative glass rounded-2xl shadow-2xl max-w-2xl w-full mx-2 text-white max-h-[92vh] overflow-hidden flex flex-col border border-white/10 animate-in zoom-in-95 duration-300 outline-none')}>
          {header('px-4 py-3 border-b border-white/5 bg-white/[0.02] flex items-center justify-between shrink-0', 'text-sm font-bold uppercase tracking-widest text-white/90')}
          <div className="flex-1 overflow-auto p-4 custom-scrollbar">{children}</div>
        </div>
      )}
    </div>
  );
}

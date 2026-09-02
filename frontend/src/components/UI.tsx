'use client';

import { ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Button({ 
  children, 
  className = '', 
  variant = 'default',
  size = 'default',
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'default' | 'primary' | 'cyan' | 'purple' | 'danger';
  size?: 'default' | 'sm';
}) {
  const variants = {
    default: 'btn',
    primary: 'btn btn-primary',
    cyan: 'btn btn-cyan',
    purple: 'btn btn-purple',
    danger: 'btn btn-danger',
  };
  
  const sizes = {
    default: '',
    sm: 'btn-sm',
  };

  return (
    <button 
      className={cn(variants[variant], sizes[size], className)} 
      {...props}
    >
      {children}
    </button>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: 'default' | 'sm' }) {
  return <Button variant="primary" {...props} />;
}

export function Card({ children, className = '', variant = 'default', onClick, ...props }: { children: ReactNode; className?: string; variant?: 'default' | 'purple' | 'blue' | 'cyan'; onClick?: () => void } & React.HTMLAttributes<HTMLDivElement>) {
  const variants = {
    default: '',
    purple: 'bg-gemstone-purple',
    blue: 'bg-gemstone-blue',
    cyan: 'bg-gemstone-cyan',
  };
  return <div className={cn('card', variants[variant], className)} onClick={onClick} {...props}>{children}</div>;
}

export function Table({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 glass">
      <table className={cn('table', className)}>{children}</table>
    </div>
  );
}

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export function Badge({ children, className = '', variant = 'default', ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  const variants: Record<BadgeVariant, string> = {
    default: 'bg-white/10 text-white/90 border-white/10',
    success: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
    warning: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
    error: 'bg-red-500/20 text-red-200 border-red-400/30',
    info: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/30',
  };
  return (
    <span className={cn('text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border uppercase', variants[variant], className)} {...props}>
      {children}
    </span>
  );
}

export function H1({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h1 className={cn('text-2xl font-bold tracking-tight text-white/90', className)}>{children}</h1>;
}

export function H2({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-lg font-semibold text-white/80 tracking-tight', className)}>{children}</h2>;
}

export function PageHeader({ title, subtitle, actions, className = '' }: { title: ReactNode; subtitle?: string; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 mb-4', className)}>
      <div>
        <H1 className="m-0">{title}</H1>
        {subtitle && <p className="text-sm text-white/50 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">{actions}</div>
    </div>
  );
}

export function ThresholdBadge({ level }: { level: 'ok' | 'warn' | 'crit' }) {
  const cls = 
    level === 'crit' ? 'bg-red-500/20 text-red-200 border-red-400/30' : 
    level === 'warn' ? 'bg-amber-500/20 text-amber-200 border-amber-400/30' : 
    'bg-emerald-500/20 text-emerald-200 border-emerald-400/30';
  
  return <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wider', cls)}>{level.toUpperCase()}</span>;
}

/* New Gemstone Components */

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn('input', className)} {...props} />;
}

export function TextArea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('input min-h-[100px]', className)} {...props} />;
}

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { 
  selectSize?: 'default' | 'sm';
};

export function Select({ className = '', children, selectSize = 'default', ...props }: SelectProps) {
  const sizes = {
    default: '',
    sm: 'py-1.5 px-3 text-sm',
  };
  return (
    <select className={cn('input appearance-none', sizes[selectSize], className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ children, className = '', ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('block text-sm font-medium text-white/70 mb-1.5', className)} {...props}>
      {children}
    </label>
  );
}

export type SectionTitleVariant = 'purple' | 'cyan' | 'blue' | 'emerald' | 'amber' | 'red' | 'indigo';

export function SectionTitle({ children, variant = 'purple', className = '' }: { children: ReactNode; variant?: SectionTitleVariant; className?: string }) {
  const base = 'text-sm font-semibold flex items-center gap-2 mb-2 tracking-wide uppercase';
  const variants: Record<SectionTitleVariant, string> = {
    purple: 'section-title-purple',
    cyan: 'section-title-cyan',
    blue: 'section-title-blue',
    emerald: `${base} text-emerald-300`,
    amber: `${base} text-amber-300`,
    red: `${base} text-red-300`,
    indigo: `${base} text-indigo-300`,
  };
  return (
    <div className={cn(variants[variant], className)}>
      {children}
    </div>
  );
}

export type InfoBoxVariant = 'blue' | 'purple' | 'cyan' | 'error' | 'warning' | 'emerald' | 'amber' | 'red' | 'indigo';

export function InfoBox({ children, variant = 'blue', title, className = '', role }: { children: ReactNode; variant?: InfoBoxVariant; title?: string; className?: string; role?: string }) {
  const variants: Record<InfoBoxVariant, string> = {
    blue: 'info-box-blue',
    purple: 'info-box-purple',
    cyan: 'info-box-cyan',
    error: 'bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm',
    warning: 'bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm',
    emerald: 'p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm leading-relaxed',
    amber: 'p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm leading-relaxed',
    red: 'p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm leading-relaxed',
    indigo: 'p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl text-sm leading-relaxed',
  };

  const iconColors: Record<InfoBoxVariant, string> = {
    blue: 'text-blue-300',
    purple: 'text-purple-300',
    cyan: 'text-cyan-300',
    error: 'text-red-300',
    warning: 'text-amber-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
    indigo: 'text-indigo-300',
  };

  const icons: Record<InfoBoxVariant, string> = {
    blue: 'ℹ️',
    purple: '📊',
    cyan: '⚡',
    error: '❌',
    warning: '⚠️',
    emerald: '✅',
    amber: '⚠️',
    red: '❌',
    indigo: '💡',
  };

  return (
    <div className={cn(variants[variant], className)} role={role}>
      {title && <div className={cn('font-semibold mb-1 flex items-center gap-2', iconColors[variant])}>
        {icons[variant]} {title}
      </div>}
      <div className={cn('text-white/80', (variant === 'error' || variant === 'red') && 'text-red-200', (variant === 'warning' || variant === 'amber') && 'text-amber-200')}>
        {children}
      </div>
    </div>
  );
}

export function FormField({ label, children, description, className = '' }: { label?: string; children: ReactNode; description?: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <Label>{label}</Label>}
      {children}
      {description && <div className="text-[11px] text-white/40 px-1">{description}</div>}
    </div>
  );
}

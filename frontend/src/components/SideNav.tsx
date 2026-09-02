'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../providers/ToastProvider';
import { useUser } from '../providers/UserProvider';
import apiFetch from '../lib/api-clients';
import { useHostIP } from '../hooks/useHostIP';
import { cn } from '../lib/cn';
import CortexLogo from '../assets/cortex logo white.PNG';

type NavColor = 'indigo' | 'emerald' | 'amber' | 'cyan' | 'teal' | 'purple' | 'blue' | 'rose' | 'white';
type NavItem = { href: string; label: string; color: NavColor };

const ACCENT: Record<NavColor, string> = {
  indigo: 'bg-indigo-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', cyan: 'bg-cyan-500', teal: 'bg-teal-500',
  purple: 'bg-purple-500', blue: 'bg-blue-500', rose: 'bg-rose-500', white: 'bg-white/40',
};

/** Exact match or a sub-path: `/models` matches `/models/3` but not `/models-archive`. */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const PLATFORM: NavItem[] = [
  { href: '/models', label: 'Models', color: 'indigo' },
  { href: '/health', label: 'Health', color: 'emerald' },
  { href: '/usage', label: 'Usage', color: 'amber' },
];
const CHAT: NavItem[] = [{ href: '/chat', label: 'Playground', color: 'teal' }];
const ADMIN: NavItem[] = [
  { href: '/orgs', label: 'Orgs & Programs', color: 'purple' },
  { href: '/users', label: 'Users', color: 'blue' },
  { href: '/keys', label: 'All API Keys', color: 'cyan' },
  { href: '/system', label: 'System Monitor', color: 'rose' },
  { href: '/deployment', label: 'Transfer', color: 'amber' },
];
const DOCS: NavItem[] = [{ href: '/guide', label: 'Guide', color: 'white' }];

function NavGroup({ title, items, pathname, onNavigate }: { title: string; items: NavItem[]; pathname: string | null; onNavigate?: () => void }) {
  return (
    <div>
      <div className="px-3 text-[10px] uppercase tracking-[0.2em] text-white/50 mb-3 font-bold">{title}</div>
      <div className="flex flex-col gap-1">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn('group flex items-center px-4 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60',
                active ? 'bg-white/10 text-white shadow-lg shadow-black/20' : 'text-white/60 hover:text-white hover:bg-white/5')}
            >
              {active && <span className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-full', ACCENT[item.color])} aria-hidden />}
              <span className="relative z-10 font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function NavBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, setUser } = useUser();
  const { addToast } = useToast();
  const router = useRouter();
  const hostIP = useHostIP();
  const isAdmin = user?.role === 'admin';
  // one "keys" entry per role so only one link is ever highlighted for /keys
  const platform = isAdmin ? PLATFORM : [...PLATFORM, { href: '/keys', label: 'My API Keys', color: 'cyan' as const }];

  const onLogout = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch { /* the cookie may already be gone */ }
    try { localStorage.removeItem('cortex_user_name'); localStorage.removeItem('cortex_user_role'); } catch { /* ignore */ }
    setUser(null);
    addToast({ title: 'Signed out', kind: 'success' });
    router.push('/login');
  };

  return (
    <>
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-4 px-2">
          <Image src={CortexLogo} alt="" width={48} height={48} className="relative rounded-full" priority />
          <span className="font-bold tracking-tighter text-2xl bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">CORTEX</span>
        </div>

        {hostIP && (
          <div className="mx-2 p-3 bg-emerald-500/5 rounded-2xl border border-emerald-500/20">
            <div className="text-[9px] uppercase tracking-[0.2em] text-emerald-400/80 mb-1.5 font-bold">Reached via</div>
            <div className="text-sm font-mono text-emerald-400 font-semibold flex items-center gap-2 break-all">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" aria-hidden />
              {hostIP}
            </div>
          </div>
        )}

        <nav className="flex flex-col gap-6 text-sm" aria-label="Main">
          <NavGroup title="Platform" items={platform} pathname={pathname} onNavigate={onNavigate} />
          <NavGroup title="Chat" items={CHAT} pathname={pathname} onNavigate={onNavigate} />
          {isAdmin && <NavGroup title="Administration" items={ADMIN} pathname={pathname} onNavigate={onNavigate} />}
          <NavGroup title="Documentation" items={DOCS} pathname={pathname} onNavigate={onNavigate} />
        </nav>
      </div>

      <div className="mt-auto pt-8 flex flex-col gap-4">
        {user && (
          <div className="mx-2 p-4 glass border border-white/10 rounded-2xl bg-white/[0.03]">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 mb-2 font-bold">Account</div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/40 to-purple-500/40 border border-white/20 flex items-center justify-center text-xs font-bold" aria-hidden>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white truncate leading-none mb-1">{user.name}</div>
                <div className="text-[10px] text-white/60 truncate uppercase tracking-wider">{user.role}</div>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <button type="button" onClick={onLogout} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-red-400 hover:bg-red-500/5 transition-all duration-200 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign out
          </button>
          <div className="px-4 py-2 text-[10px] text-white/50 font-bold uppercase tracking-[0.1em]">
            <span className="text-white/40">Developed by </span>
            <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white hover:underline transition-colors">Aulendur Labs</a>
          </div>
        </div>
      </div>
    </>
  );
}

export function SideNav() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex md:flex-col justify-between p-6 w-[240px] glass rounded-3xl sticky top-6 h-[calc(100vh-3rem)] overflow-auto shadow-2xl border-white/10">
        <NavBody />
      </aside>

      {/* Mobile header + drawer */}
      <div className="md:hidden flex items-center justify-between glass rounded-2xl px-4 py-3 border-white/10">
        <div className="flex items-center gap-2">
          <Image src={CortexLogo} alt="" width={28} height={28} className="rounded-full" />
          <span className="font-bold tracking-tighter text-lg">CORTEX</span>
        </div>
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="mobile-nav" aria-label="Open navigation" className="p-2 rounded-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
        </button>
      </div>
      {open && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} aria-hidden />
          <div id="mobile-nav" ref={panelRef} role="dialog" aria-modal="true" aria-label="Navigation" className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] glass border-r border-white/10 p-6 overflow-auto flex flex-col justify-between">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="self-end -mt-2 mb-2 p-1.5 rounded-lg hover:bg-white/10">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
            <NavBody onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

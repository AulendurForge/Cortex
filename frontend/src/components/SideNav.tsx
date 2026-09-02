'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useToast } from '../providers/ToastProvider';
import { useUser } from '../providers/UserProvider';
import apiFetch from '../lib/api-clients';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { cn } from '../lib/cn';

type NavItem = { href: string; label: string };

export function SideNav() {
  const pathname = usePathname();
  const { addToast } = useToast();
  const { user, setUser } = useUser();
  const router = useRouter();
  const [hostIP, setHostIP] = useState<string>('');

  // Detect host IP from environment variable or browser location
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Use environment variable if available, otherwise fall back to browser hostname
      const envHostIP = process.env.NEXT_PUBLIC_HOST_IP;
      if (envHostIP && envHostIP !== 'localhost') {
        setHostIP(envHostIP);
      } else {
        setHostIP(window.location.hostname);
      }
    }
  }, []);

  const onLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    (async () => {
      try {
        await apiFetch('/auth/logout', { method: 'POST' });
      } catch {}
      try {
        localStorage.removeItem('cortex_user_name');
        localStorage.removeItem('cortex_user_role');
      } catch {}
      setUser(null);
      addToast({ title: 'Logged out', kind: 'success' });
      router.push('/login');
    })();
  };
  return (
    <aside className="hidden md:flex md:flex-col justify-between p-6 w-[240px] glass rounded-3xl sticky top-6 h-[calc(100vh-3rem)] overflow-auto shadow-2xl border-white/10">
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-4 px-2">
          <div className="relative group">
            <Image 
              src={require('../assets/cortex logo white.PNG')} 
              alt="CORTEX" 
              width={48} 
              height={48} 
              className="relative rounded-full"
            />
          </div>
          <span className="font-bold tracking-tighter text-2xl bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">CORTEX</span>
        </div>
        
        {/* Host IP Display */}
        {hostIP && (
          <div className="mx-2 p-3 bg-emerald-500/5 rounded-2xl border border-emerald-500/20 group hover:bg-emerald-500/10 transition-colors duration-300">
            <div className="text-[9px] uppercase tracking-[0.2em] text-emerald-500/60 mb-1.5 font-bold">
              System IP
            </div>
            <div className="text-sm font-mono text-emerald-400 font-semibold flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {hostIP}
            </div>
          </div>
        )}

        <nav className="flex flex-col gap-6 text-sm">
          {/* Platform */}
          <div>
            <div className="px-3 text-[10px] uppercase tracking-[0.2em] text-white/40 mb-3 font-bold">Platform</div>
            <div className="flex flex-col gap-1">
              {[
                { href: '/models', label: 'Models', color: 'indigo' },
                { href: '/health', label: 'Health', color: 'emerald' },
                { href: '/usage', label: 'Usage', color: 'amber' },
                { href: '/keys', label: 'My API Keys', color: 'cyan' },
              ].map((item) => {
                const active = pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center px-4 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden',
                      active 
                        ? 'bg-white/10 text-white shadow-lg shadow-black/20' 
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    )}
                  >
                    {active && (
                      <div className={cn(
                        "absolute left-0 top-0 bottom-0 w-1 rounded-full",
                        item.color === 'indigo' ? "bg-indigo-500" :
                        item.color === 'emerald' ? "bg-emerald-500" :
                        item.color === 'amber' ? "bg-amber-500" :
                        "bg-cyan-500"
                      )} />
                    )}
                    <span className="relative z-10 font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Chat */}
          <div>
            <div className="px-3 text-[10px] uppercase tracking-[0.2em] text-white/40 mb-3 font-bold">Chat</div>
            <div className="flex flex-col gap-1">
              {[
                { href: '/chat', label: 'Playground', color: 'teal' },
              ].map((item) => {
                const active = pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center px-4 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden',
                      active 
                        ? 'bg-white/10 text-white shadow-lg shadow-black/20' 
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    )}
                  >
                    {active && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-teal-500" />
                    )}
                    <span className="relative z-10 font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Administration */}
          {user?.role === 'admin' && (
            <div>
              <div className="px-3 text-[10px] uppercase tracking-[0.2em] text-white/40 mb-3 font-bold">Administration</div>
              <div className="flex flex-col gap-1">
                {[
                  { href: '/orgs', label: 'Orgs & Programs', color: 'purple' },
                  { href: '/users', label: 'Users', color: 'blue' },
                  { href: '/keys', label: 'All API Keys', color: 'cyan' },
                  { href: '/system', label: 'System Monitor', color: 'rose' },
                  { href: '/deployment', label: 'Transfer', color: 'amber' },
                ].map((item) => {
                  const active = pathname?.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group flex items-center px-4 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden',
                        active 
                          ? 'bg-white/10 text-white shadow-lg shadow-black/20' 
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      )}>
                      {active && (
                        <div className={cn(
                          "absolute left-0 top-0 bottom-0 w-1 rounded-full",
                          item.color === 'purple' ? "bg-purple-500" :
                          item.color === 'blue' ? "bg-blue-500" :
                          item.color === 'cyan' ? "bg-cyan-500" :
                          item.color === 'amber' ? "bg-amber-500" :
                          "bg-rose-500"
                        )} />
                      )}
                      <span className="relative z-10 font-medium">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Documentation */}
          <div>
            <div className="px-3 text-[10px] uppercase tracking-[0.2em] text-white/40 mb-3 font-bold">Documentation</div>
            <div className="flex flex-col gap-1">
              {[{ href: '/guide', label: 'Guide' }].map((item) => {
                const active = pathname?.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center px-4 py-2.5 rounded-xl transition-all duration-300 relative overflow-hidden',
                      active 
                        ? 'bg-white/10 text-white shadow-lg shadow-black/20' 
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    )}>
                    {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/40 rounded-full" />}
                    <span className="relative z-10 font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      </div>

      <div className="mt-auto pt-8 flex flex-col gap-4">
        {user && (
          <div className="mx-2 p-4 glass border border-white/10 rounded-2xl bg-white/[0.03]">
            <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-2 font-bold">Account</div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/40 to-purple-500/40 border border-white/20 flex items-center justify-center text-xs font-bold">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white truncate leading-none mb-1">{user.name}</div>
                <div className="text-[10px] text-white/50 truncate uppercase tracking-wider">{user.role}</div>
              </div>
            </div>
          </div>
        )}
        
        <div className="flex flex-col gap-2">
          <a href="#" onClick={onLogout} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white/60 hover:text-red-400 hover:bg-red-500/5 transition-all duration-200">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout
          </a>
          
          <div className="px-4 py-2">
            <div className="flex flex-col gap-1 text-[9px] text-white/30 font-bold uppercase tracking-[0.1em]">
              <span className="text-white/20">Developed by</span>
              <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white/70 hover:underline transition-colors">Aulendur Labs</a>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}



'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SideNav } from '@/components/SideNav';
import { useUser } from '@/providers/UserProvider';

function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { status } = useUser();

  useEffect(() => {
    if (status !== 'anonymous') return;
    const qs = search?.toString();
    const next = encodeURIComponent(`${pathname ?? '/'}${qs ? `?${qs}` : ''}`);
    router.replace(`/login?next=${next}`);
  }, [status, router, pathname, search]);

  // Gate the admin tree until the session probe answers: children must not fire their own
  // queries (and 401) before we know whether there is a session at all.
  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/60 text-sm" role="status" aria-live="polite">
        {status === 'checking' ? 'Checking session…' : 'Redirecting to sign-in…'}
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-7xl grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        <SideNav />
        <main className="space-y-4 min-w-0">{children}</main>
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary for static prerendering
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white/60 text-sm">Checking session…</div>}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

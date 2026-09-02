'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/providers/UserProvider';

export default function Home() {
  const router = useRouter();
  const { status } = useUser();
  useEffect(() => {
    if (status === 'authenticated') router.replace('/guide');
    else if (status === 'anonymous') router.replace('/login');
  }, [status, router]);
  return <main className="p-6 text-white/70 text-sm" role="status">Loading…</main>;
}

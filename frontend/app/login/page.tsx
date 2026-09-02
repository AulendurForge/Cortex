'use client';

import { Suspense, useId, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import apiFetch, { getGatewayBaseUrl } from '@/lib/api-clients';
import { useUser, toUser } from '@/providers/UserProvider';
import { Card, Button, Input, Label } from '@/components/UI';
import CortexLogo from '@/assets/cortex logo white.PNG';
import { safeNext } from './helpers';

type LoginResponse = { user?: { username?: string; role?: string } };
type ApiErr = { code?: unknown; message?: string };

function describeLoginError(e: unknown): string {
  const err = e as ApiErr | null;
  const code = typeof err?.code === 'number' ? err.code : undefined;
  if (code === 401) return 'Invalid username or password.';
  if (code === 403 && err?.message === 'account_disabled') return 'This account is disabled. Ask an administrator to re-enable it.';
  if (code) return `The gateway returned ${code}: ${err?.message ?? 'error'}.`;
  return `Cannot reach the Cortex gateway at ${getGatewayBaseUrl()}. Check that the gateway is running and that its port is reachable from this machine.`;
}

function LoginForm() {
  const { addToast } = useToast();
  const router = useRouter();
  const search = useSearchParams();
  const { setUser } = useUser();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { user: useId(), pass: useId(), err: useId() };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const form = new FormData(e.currentTarget);
    const body = { username: String(form.get('username') ?? '').trim(), password: String(form.get('password') ?? '') };
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) });
      const user = toUser(res?.user ?? { username: body.username }) ?? { name: body.username, role: 'user' as const };
      try { localStorage.setItem('cortex_user_name', user.name); } catch { /* ignore */ }
      setUser(user);
      addToast({ title: `Signed in as ${user.name}`, kind: 'success' });
      router.push(safeNext(search?.get('next')));
    } catch (err) {
      setError(describeLoginError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 mb-6 shadow-inner">
      <form onSubmit={onSubmit} className="space-y-5" aria-describedby={error ? ids.err : undefined}>
        <div className="space-y-1.5">
          <Label htmlFor={ids.user} className="text-[10px] uppercase font-bold tracking-widest text-white/60">Username</Label>
          <Input id={ids.user} name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={error ? true : undefined}
            className="bg-black/20 h-11 px-4 border-white/10 focus:border-indigo-500/50" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.pass} className="text-[10px] uppercase font-bold tracking-widest text-white/60">Password</Label>
          <div className="relative">
            <Input id={ids.pass} name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" aria-invalid={error ? true : undefined}
              className="bg-black/20 h-11 px-4 pr-11 border-white/10 focus:border-indigo-500/50" required />
            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 rounded">
              {showPassword ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              )}
            </button>
          </div>
        </div>
        {error && (
          <div id={ids.err} role="alert" className="text-xs text-red-200 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>
        )}
        <Button variant="cyan" className="w-full h-11 text-sm font-bold uppercase tracking-widest mt-2 shadow-lg shadow-cyan-500/10" type="submit" loading={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-cortex-gradient overflow-hidden relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" aria-hidden />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" aria-hidden />

      <Card className="w-full max-w-[440px] p-8 glass border-white/10 shadow-2xl relative z-10">
        <div className="flex flex-col items-center mb-8">
          <Image src={CortexLogo} alt="" width={80} height={80} className="relative mb-6" priority />
          <h1 className="text-3xl font-black tracking-tighter text-white mb-2 uppercase italic">Cortex</h1>
          <p className="text-white/60 text-xs font-bold uppercase tracking-[0.2em] text-center max-w-[280px]">Inference gateway admin</p>
        </div>

        <Suspense fallback={<div className="text-center text-white/50 text-xs py-8">Loading…</div>}>
          <LoginForm />
        </Suspense>

        <div className="space-y-6">
          <p className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-[11px] text-amber-200/80 leading-relaxed text-center font-medium">
            Access is restricted to authorized users. Administrators set credentials with <code className="font-mono">make setup-admin</code>.
          </p>
          <div className="flex flex-col items-center gap-2">
            <div className="h-px w-12 bg-white/10" aria-hidden />
            <div className="text-[10px] text-white/50 font-bold uppercase tracking-[0.3em]">
              Developed by <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="text-white/70 hover:text-white hover:underline transition-colors">Aulendur Labs</a>
            </div>
          </div>
        </div>
      </Card>
    </main>
  );
}

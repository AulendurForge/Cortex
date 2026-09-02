'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useToast } from '../../src/providers/ToastProvider';
import apiFetch, { getGatewayBaseUrl } from '../../src/lib/api-clients';
import { useRouter } from 'next/navigation';
import { useUser } from '../../src/providers/UserProvider';
import { Card, Button, Input, Label, SectionTitle } from '../../src/components/UI';
import { cn } from '../../src/lib/cn';

export default function LoginPage() {
  const { addToast } = useToast();
  const router = useRouter();
  const { setUser } = useUser();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    const form = new FormData(e.currentTarget);
    const body = { username: String(form.get('username') || ''), password: String(form.get('password') || '') };
    setSubmitting(true);
    try {
      const res: any = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(body) });
      const username = res?.user?.username || body.username;
      const roleRaw = String(res?.user?.role || '').toLowerCase();
      const role = roleRaw === 'admin' ? 'admin' : 'user';
      // Persist dev user locally so SideNav can show immediately even if cookie is strict in dev
      try {
        localStorage.setItem('cortex_user_name', username);
        localStorage.setItem('cortex_user_role', role);
      } catch {}
      setUser({ name: username, role: role as any });
      addToast({ title: 'Welcome back!', kind: 'success' });
      router.push('/guide?tab=getting-started');
    } catch (e: any) {
      // apiFetch throws {code, message} for HTTP errors and a TypeError when the
      // gateway cannot be reached at all (firewall, wrong host, CORS rejection).
      const code = typeof e?.code === 'number' ? e.code : undefined;
      if (code === 401) {
        addToast({ title: 'Authentication failed', description: 'Invalid username or password', kind: 'error' });
      } else if (code) {
        addToast({ title: 'Authentication failed', description: `Gateway returned ${code}: ${e?.message || 'error'}`, kind: 'error' });
      } else {
        addToast({
          title: 'Cannot reach the Cortex gateway',
          description: `No response from ${getGatewayBaseUrl()}. Check that port 8084 is reachable from this machine (firewall) and that the gateway is running.`,
          kind: 'error',
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-cortex-gradient overflow-hidden relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none" />

      <Card className="w-full max-w-[440px] p-8 glass border-white/10 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-700">
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-6">
            <Image 
              src={require('../../src/assets/cortex logo white.PNG')} 
              alt="CORTEX" 
              width={80} 
              height={80} 
              className="relative"
            />
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-white mb-2 uppercase italic">Cortex</h1>
          <p className="text-white/40 text-xs font-bold uppercase tracking-[0.2em] text-center max-w-[280px]">
            Inference Control Gateway
          </p>
        </div>

        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 mb-6 shadow-inner">
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold tracking-widest text-white/40">System Username</Label>
              <Input 
                name="username" 
                type="text" 
                placeholder="administrator" 
                className="bg-black/20 h-11 px-4 border-white/10 focus:border-indigo-500/50" 
                required 
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold tracking-widest text-white/40">Access Password</Label>
              <div className="relative">
                <Input 
                  name="password" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••••••" 
                  className="bg-black/20 h-11 px-4 pr-11 border-white/10 focus:border-indigo-500/50" 
                  required 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                      <line x1="1" y1="1" x2="23" y2="23"></line>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <Button 
              variant="cyan" 
              className="w-full h-11 text-sm font-bold uppercase tracking-widest mt-4 shadow-lg shadow-cyan-500/10" 
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Signing in…' : 'Initialize Session'}
            </Button>
          </form>
        </div>

        <div className="space-y-6">
          <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
            <p className="text-[10px] text-amber-200/60 leading-relaxed text-center font-medium">
              Access is restricted to authorized personnel. Contact your system administrator for credentials.
            </p>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="h-px w-12 bg-white/10" />
            <div className="text-[9px] text-white/20 font-bold uppercase tracking-[0.3em]">
              Developed by <a href="https://www.aulendur.com" target="_blank" rel="noopener noreferrer" className="hover:text-white/40 hover:underline transition-colors">Aulendur Labs</a>
            </div>
          </div>
        </div>
      </Card>
    </main>
  );
}



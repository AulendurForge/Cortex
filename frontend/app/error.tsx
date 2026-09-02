'use client';

import { Card, Button } from '@/components/UI';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-cortex-gradient">
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-red-500/10 rounded-full blur-[100px]" />
      
      <Card className="max-w-md w-full p-8 glass border-red-500/20 shadow-2xl relative z-10">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 border border-red-500/20">
            <span className="text-3xl">⚠️</span>
          </div>
          
          <h2 className="text-2xl font-bold tracking-tight text-white mb-2">Critical Exception</h2>
          <p className="text-white/50 text-sm mb-6">
            The application encountered an unexpected error during execution.
          </p>

          <div className="w-full bg-black/40 rounded-2xl p-4 border border-white/5 mb-8 text-left">
            <div className="text-[10px] uppercase font-bold text-red-400/60 tracking-widest mb-2">Error Details</div>
            <p className="text-xs font-mono text-red-200/80 break-all leading-relaxed">
              {error?.message || 'Unknown runtime error'}
            </p>
            {error?.digest && (
              <div className="mt-3 pt-3 border-t border-white/5 text-[10px] font-mono text-white/30">
                DIGEST: {error.digest}
              </div>
            )}
          </div>

          <div className="flex flex-col w-full gap-3">
            <Button variant="danger" className="w-full h-11" onClick={() => reset()}>
              Attempt Recovery
            </Button>
            <Button variant="default" className="w-full h-11" onClick={() => window.location.href = '/'}>
              Return to Dashboard
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}



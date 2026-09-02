'use client';

import { useEffect } from 'react';
import { Card, Button } from '@/components/UI';

/**
 * Error boundary for every admin route.  A bad stored value or a schema
 * mismatch no longer white-screens the whole app; the admin sees the message
 * and can retry or go back to the models list.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface in the console for support; the UI shows a friendly version.
    console.error('Admin route error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center py-16">
      <Card className="max-w-lg w-full p-6 border-red-500/20" role="alert">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>⚠️</span>
          <div className="flex-1 space-y-3">
            <h2 className="text-lg font-bold text-white">Something went wrong on this page</h2>
            <p className="text-sm text-white/60">
              {error?.message || 'An unexpected error occurred while rendering this view.'}
            </p>
            {error?.digest && <p className="text-[10px] font-mono text-white/30">digest: {error.digest}</p>}
            <div className="flex gap-2 pt-1">
              <Button variant="primary" size="sm" onClick={reset}>Try again</Button>
              <Button size="sm" onClick={() => { window.location.href = '/models'; }}>Back to models</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

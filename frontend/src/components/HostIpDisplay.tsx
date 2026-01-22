'use client';

import { useState, useEffect } from 'react';
import { useToast } from '../providers/ToastProvider';
import { Button, Card, Badge } from './UI';
import { cn } from '../lib/cn';
import { safeCopyToClipboard } from '../lib/clipboard';

/**
 * Reusable component to display and copy the host IP address
 */
export function HostIpDisplay({ 
  variant = 'inline', 
  showCopy = true,
  className = '' 
}: { 
  variant?: 'inline' | 'card' | 'banner';
  showCopy?: boolean;
  className?: string;
}) {
  const [hostIP, setHostIP] = useState<string>('');
  const { addToast } = useToast();

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

  const copyToClipboard = async (text: string, label: string) => {
    const ok = await safeCopyToClipboard(text);
    if (ok) {
      addToast({ title: `${label} copied!`, kind: 'success' });
    } else {
      addToast({ title: 'Copy failed', kind: 'error' });
    }
  };

  if (!hostIP) return null;

  if (variant === 'banner') {
    return (
      <Card className={cn("p-6 bg-emerald-500/5 border-emerald-500/20 relative overflow-hidden group", className)}>
        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
          <svg className="w-24 h-24 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-4">
            <div>
              <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 mb-2">Host Network Mode</Badge>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Cortex API Endpoints</h3>
            </div>
            
            <div className="flex flex-wrap gap-6">
              <div className="space-y-1">
                <div className="text-[9px] uppercase font-bold text-white/30 tracking-[0.2em]">LAN / External</div>
                <div className="flex items-center gap-2">
                  <code className="text-lg font-mono text-emerald-400 font-black tracking-tight">{hostIP}:8084</code>
                  {showCopy && (
                    <button onClick={() => copyToClipboard(`http://${hostIP}:8084/v1`, 'LAN URL')} className="p-1 hover:bg-emerald-500/10 rounded-md transition-colors text-emerald-500/50 hover:text-emerald-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[9px] uppercase font-bold text-white/30 tracking-[0.2em]">Docker Containers</div>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono text-cyan-400 font-bold tracking-tight">host.docker.internal:8084</code>
                  {showCopy && (
                    <button onClick={() => copyToClipboard('http://host.docker.internal:8084/v1', 'Docker URL')} className="p-1 hover:bg-cyan-500/10 rounded-md transition-colors text-cyan-500/50 hover:text-cyan-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-[9px] uppercase font-bold text-white/30 tracking-[0.2em]">Admin UI Port</div>
                <code className="text-lg font-mono text-purple-400 font-black tracking-tight">3001</code>
              </div>
            </div>
          </div>

          {showCopy && (
            <div className="flex flex-col gap-2">
              <Button 
                variant="default" 
                size="sm"
                className="font-bold uppercase tracking-widest text-[9px] bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-300"
                onClick={() => copyToClipboard(`http://${hostIP}:8084/v1`, 'API Base URL')}
              >
                Copy API Base URL
              </Button>
              <Button 
                variant="default" 
                size="sm"
                className="font-bold uppercase tracking-widest text-[9px] bg-cyan-500/5 border-cyan-500/20 hover:bg-cyan-500/10 hover:text-cyan-300"
                onClick={() => copyToClipboard('http://host.docker.internal:8084/v1', 'Docker URL')}
              >
                Copy Docker URL
              </Button>
            </div>
          )}
        </div>
        
        {/* Docker tip */}
        <div className="mt-4 pt-4 border-t border-white/5 text-[10px] text-white/40">
          <span className="text-cyan-400">💡 Docker containers:</span> Add{' '}
          <code className="bg-black/30 px-1 rounded text-cyan-300">extra_hosts: [&quot;host.docker.internal:host-gateway&quot;]</code>{' '}
          to your docker-compose for connectivity.
        </div>
      </Card>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`flex flex-col items-center py-3 px-2 bg-white/5 rounded-lg border border-white/10 ${className}`}>
        <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">
          Cortex is running on IP:
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm font-mono text-emerald-400 font-medium">
            {hostIP}
          </div>
          {showCopy && (
            <button 
              onClick={copyIP}
              className="text-emerald-400 hover:text-emerald-300 transition-colors"
              title="Copy IP address"
              aria-label="Copy IP"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }

  // inline variant
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <code className="font-mono text-emerald-400 font-medium">{hostIP}</code>
      {showCopy && (
        <button 
          onClick={copyIP}
          className="text-emerald-400 hover:text-emerald-300 transition-colors"
          title="Copy IP address"
          aria-label="Copy IP"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      )}
    </span>
  );
}

/**
 * Hook to get the host IP programmatically
 */
export function useHostIP(): string {
  const [hostIP, setHostIP] = useState<string>('');

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

  return hostIP;
}


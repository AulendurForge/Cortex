'use client';

import { useEffect, useState } from 'react';

/**
 * The address this UI is being reached through. NEXT_PUBLIC_HOST_IP is baked in at build time
 * (dev stack), otherwise the browser's hostname is what other machines on the LAN can use too.
 */
export function resolveHostIP(hostname: string, envHostIP?: string): string {
  if (envHostIP && envHostIP !== 'localhost' && envHostIP !== '127.0.0.1') return envHostIP;
  return hostname;
}

export function useHostIP(): string {
  const [hostIP, setHostIP] = useState<string>('');
  useEffect(() => {
    setHostIP(resolveHostIP(window.location.hostname, process.env.NEXT_PUBLIC_HOST_IP));
  }, []);
  return hostIP;
}

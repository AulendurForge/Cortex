import '../src/styles/globals.css';
import type { Metadata } from 'next';
import type React from 'react';
import Script from 'next/script';
import { AppProviders } from '@/providers/AppProviders';

export const metadata: Metadata = {
  title: { default: 'Cortex', template: 'Cortex | %s' },
  description: 'Cortex admin console: models, API keys, usage and health of your inference gateway.',
  // an admin console must never be indexed
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* gateway address decided at request time; must run before hydration */}
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
      </head>
      <body>
        <AppProviders>
          <div className="mesh-bg" aria-hidden>
            <div className="blob indigo" />
            <div className="blob green" />
            <div className="blob cyan" />
          </div>
          <div className="min-h-screen">{children}</div>
        </AppProviders>
      </body>
    </html>
  );
}
'use client';

import { Tabs } from '@/components/Tabs';
import { Suspense } from 'react';
import { GuideRenderer } from '@/guide/GuideRenderer';
import { aboutTab, apiKeysTab, usageTab, chatTab, transferTab, usersOrgsTab } from '@/guide/content';

import GettingStartedTab from './GettingStartedTab';
import ManageModelsTab from './ManageModelsTab';

/**
 * Guide tabs. Getting Started and About Cortex are content-as-data (src/guide/content) rendered
 * by GuideRenderer; the remaining tabs are still hand-written TSX and are ported the same way.
 * The page has no heading of its own: each tab renders the view's single <h1>.
 */
export default function GuidePage() {
  return (
    <section className="space-y-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/50 m-0">Documentation &amp; Guides</p>
      <Suspense fallback={<div className="text-center py-12 text-white/50 uppercase font-bold tracking-widest text-xs">Loading documentation…</div>}>
        <Tabs
          defaultId="getting-started"
          tabs={[
            { id: 'getting-started', label: '🚀 Getting Started', content: <GettingStartedTab /> },
            { id: 'manage-models', label: '🤖 Manage Models', content: <ManageModelsTab /> },
            { id: 'api-keys', label: '🔑 API Keys', content: <GuideRenderer tab={apiKeysTab} /> },
            { id: 'about-usage', label: '📊 Usage Analytics', content: <GuideRenderer tab={usageTab} /> },
            { id: 'manage-users-orgs', label: '👥 Users & Orgs', content: <GuideRenderer tab={usersOrgsTab} /> },
            { id: 'chat-playground', label: '💬 Chat', content: <GuideRenderer tab={chatTab} /> },
            { id: 'deployment-migration', label: '📦 Transfer', content: <GuideRenderer tab={transferTab} /> },
            { id: 'about-cortex', label: '🧠 About Cortex', content: <GuideRenderer tab={aboutTab} /> },
          ]}
        />
      </Suspense>
    </section>
  );
}

'use client';

import { Tabs } from '@/components/Tabs';
import { Suspense } from 'react';
import { GuideRenderer } from '@/guide/GuideRenderer';
import { aboutTab } from '@/guide/content';

import GettingStartedTab from './GettingStartedTab';
import ManageModels from './sections/ManageModels';
import ApiKeys from './sections/ApiKeys';
import AboutUsage from './sections/AboutUsage';
import ManageUsersOrgs from './sections/ManageUsersOrgs';
import ChatPlayground from './sections/ChatPlayground';
import DeploymentMigration from './sections/DeploymentMigration';

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
            { id: 'manage-models', label: '🤖 Manage Models', content: <ManageModels /> },
            { id: 'api-keys', label: '🔑 API Keys', content: <ApiKeys /> },
            { id: 'about-usage', label: '📊 Usage Analytics', content: <AboutUsage /> },
            { id: 'manage-users-orgs', label: '👥 Users & Orgs', content: <ManageUsersOrgs /> },
            { id: 'chat-playground', label: '💬 Chat', content: <ChatPlayground /> },
            { id: 'deployment-migration', label: '📦 Transfer', content: <DeploymentMigration /> },
            { id: 'about-cortex', label: '🧠 About Cortex', content: <GuideRenderer tab={aboutTab} /> },
          ]}
        />
      </Suspense>
    </section>
  );
}

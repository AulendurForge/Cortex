'use client';

import { PageHeader } from '../../../src/components/UI';
import { Tabs } from '../../../src/components/Tabs';
import { Suspense } from 'react';

import GettingStarted from './sections/GettingStarted';
import ManageModels from './sections/ManageModels';
import ApiKeys from './sections/ApiKeys';
import AboutUsage from './sections/AboutUsage';
import ManageUsersOrgs from './sections/ManageUsersOrgs';
import ChatPlayground from './sections/ChatPlayground';
import DeploymentMigration from './sections/DeploymentMigration';
import AboutCortex from './sections/AboutCortex';

export default function GuidePage() {
  return (
    <section className="space-y-6">
      <PageHeader title="Documentation & Guides" />
      <Suspense fallback={<div className="text-center py-12 text-white/20 uppercase font-bold tracking-widest text-xs">Loading documentation…</div>}>
        <Tabs
          defaultId="getting-started"
          tabs={[
            { id: 'getting-started', label: '🚀 Getting Started', content: <GettingStarted /> },
            { id: 'manage-models', label: '🤖 Manage Models', content: <ManageModels /> },
            { id: 'api-keys', label: '🔑 API Keys', content: <ApiKeys /> },
            { id: 'about-usage', label: '📊 Usage Analytics', content: <AboutUsage /> },
            { id: 'manage-users-orgs', label: '👥 Users & Orgs', content: <ManageUsersOrgs /> },
            { id: 'chat-playground', label: '💬 Chat', content: <ChatPlayground /> },
            { id: 'deployment-migration', label: '📦 Transfer', content: <DeploymentMigration /> },
            { id: 'about-cortex', label: '🧠 About Cortex', content: <AboutCortex /> },
          ]}
        />
      </Suspense>
    </section>
  );
}



'use client';

import Link from 'next/link';
import { Card, SectionTitle, InfoBox, Badge, Button } from '../../../../src/components/UI';
import { Attribution } from './Attribution';

export default function ManageUsersOrgs() {
  return (
    <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
      <header className="space-y-2 text-center md:text-left">
        <h1 className="text-2xl font-black tracking-tight text-white uppercase italic">Users &amp; Organizations</h1>
        <p className="text-white/60 text-sm leading-relaxed max-w-3xl">
          Accounts that can sign in to this console, the organizations and programs they belong to, and how API keys
          and usage are attributed to them. Managed on the <strong className="text-white">Users</strong> and{' '}
          <strong className="text-white">Organizations &amp; Programs</strong> pages (admins only).
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">Roles</Badge>
        <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/20">Organizations</Badge>
        <Badge className="bg-amber-500/10 text-amber-300 border-amber-500/20">Disable vs delete</Badge>
        <Badge className="bg-cyan-500/10 text-cyan-300 border-cyan-500/20">Self-service keys</Badge>
      </div>

      {/* Roles */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="blue" className="text-[10px]">Roles</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg space-y-2">
            <Badge className="bg-purple-500/10 text-purple-300 border-purple-500/20">Admin</Badge>
            <ul className="text-[11px] text-white/70 space-y-1.5">
              <li>Everything in the console: models, health, usage, transfer, system monitor.</li>
              <li>Creates, edits, disables and deletes users and organizations.</li>
              <li>Sees and revokes every API key (<strong className="text-white">All API Keys</strong>).</li>
            </ul>
          </div>
          <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg space-y-2">
            <Badge className="bg-blue-500/10 text-blue-300 border-blue-500/20">User</Badge>
            <ul className="text-[11px] text-white/70 space-y-1.5">
              <li>Signs in, uses the Chat Playground and reads the guide.</li>
              <li>Creates and revokes their own API keys (<strong className="text-white">My API Keys</strong>).</li>
              <li>No access to admin pages or other people&apos;s keys.</li>
            </ul>
          </div>
        </div>
        <p className="text-[11px] text-white/60 leading-relaxed">
          Create an account with <strong className="text-white">Create user</strong> on the Users page (username, password,
          role, optional organization). Edit changes the role, the status, the organization or the password. You cannot
          demote, disable or delete your own account, and the last active admin cannot be deleted.
        </p>
      </Card>

      {/* Organizations */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="purple" className="text-[10px]">Organizations &amp; programs</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <p className="text-[11px] text-white/70 leading-relaxed">
            An organization is a department, program or team (for example &quot;Unit Alpha&quot;). Each user belongs to at most
            one organization, chosen in the user&apos;s edit form; API keys can be assigned to a user and/or an organization
            when they are created. Usage records carry the key, user and organization, so the Usage page and its CSV export
            can be filtered per team or program.
          </p>
          <InfoBox variant="blue" className="text-[11px] p-3">
            Organizations do not grant permissions or quotas on their own; they exist for attribution and filtering.
          </InfoBox>
        </div>
      </Card>

      {/* Disable vs delete */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="amber" className="text-[10px]">Disable vs delete</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg space-y-1.5">
            <div className="text-[11px] font-bold text-amber-300">Disable (Status: disabled)</div>
            <p className="text-[11px] text-white/70 leading-relaxed">
              The account can no longer sign in and existing sessions stop working. Its API keys keep working until you
              revoke them. Reversible: set the status back to active.
            </p>
          </div>
          <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg space-y-1.5">
            <div className="text-[11px] font-bold text-red-300">Delete</div>
            <p className="text-[11px] text-white/70 leading-relaxed">
              Removes the account permanently after a confirmation. Revoke the person&apos;s keys first if access should end
              immediately, then delete.
            </p>
          </div>
        </div>
      </Card>

      {/* Self-service keys */}
      <Card className="p-5 bg-white/[0.02] border-white/5 space-y-4">
        <SectionTitle variant="cyan" className="text-[10px]">Self-service API keys</SectionTitle>
        <p className="text-[11px] text-white/70 leading-relaxed">
          Every signed-in user has a <strong className="text-white">My API Keys</strong> page that lists, creates and revokes
          their own keys (backed by <code className="text-cyan-300 bg-black/30 px-1 rounded">/admin/me/keys</code>). Keys
          created there are attributed to that user and their organization automatically. Admins see everyone&apos;s keys on{' '}
          <strong className="text-white">All API Keys</strong> and can revoke any of them.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/users"><Button variant="cyan" size="sm" className="text-[10px]">Open Users →</Button></Link>
          <Link href="/orgs"><Button variant="default" size="sm" className="text-[10px]">Open Organizations &amp; Programs →</Button></Link>
          <Link href="/guide?tab=api-keys"><Button variant="default" size="sm" className="text-[10px]">API key guide →</Button></Link>
        </div>
      </Card>

      <Attribution label="Cortex Users & Organizations Guide" />
    </section>
  );
}

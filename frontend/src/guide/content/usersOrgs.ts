/**
 * Users & Organizations tab: roles, organizations and programs, disable vs delete, and the
 * self-service My API Keys page. Content only — keep facts here, not in TSX.
 */
import type { GuideTab } from '../types';

export const usersOrgsTab: GuideTab = {
  id: 'users-orgs',
  title: 'Users & Organizations',
  intro:
    'Accounts that can sign in to this console, the organizations and programs they belong to, and how API keys and usage are attributed to them. Managed on the **Users** and **Organizations & Programs** pages (admins only).',
  lead: [{ kind: 'p', md: '**Roles** · **Organizations** · **Disable vs delete** · **Self-service keys**' }],
  sections: [
    {
      id: 'users-roles',
      title: 'Roles',
      blocks: [
        {
          kind: 'cards',
          items: [
            { title: 'Admin', md: 'Everything in the console: models, health, usage, transfer, system monitor.\nCreates, edits, disables and deletes users and organizations.\nSees and revokes every API key (**All API Keys**).' },
            { title: 'User', md: 'Signs in, uses the Chat Playground and reads the guide.\nCreates and revokes their own API keys (**My API Keys**).\nNo access to admin pages or other people\'s keys.' },
          ],
        },
        { kind: 'p', md: 'Create an account with **Create user** on the Users page (username, password, role, optional organization). Edit changes the role, the status, the organization or the password. You cannot demote, disable or delete your own account, and the last active admin cannot be deleted.' },
      ],
    },
    {
      id: 'users-organizations',
      title: 'Organizations & programs',
      blocks: [
        { kind: 'p', md: 'An organization is a department, program or team (for example "Unit Alpha"). Each user belongs to at most one organization, chosen in the user\'s edit form; API keys can be assigned to a user and/or an organization when they are created. Usage records carry the key, user and organization, so the Usage page and its CSV export can be filtered per team or program.' },
        { kind: 'callout', variant: 'info', md: 'Organizations do not grant permissions or quotas on their own; they exist for attribution and filtering.' },
      ],
    },
    {
      id: 'users-disable-delete',
      title: 'Disable vs delete',
      blocks: [
        {
          kind: 'cards',
          items: [
            { title: 'Disable (Status: disabled)', md: 'The account can no longer sign in and existing sessions stop working. Its API keys keep working until you revoke them. Reversible: set the status back to active.' },
            { title: 'Delete', md: "Removes the account permanently after a confirmation. Revoke the person's keys first if access should end immediately, then delete." },
          ],
        },
      ],
    },
    {
      id: 'users-self-service-keys',
      title: 'Self-service API keys',
      blocks: [
        { kind: 'p', md: "Every signed-in user has a **My API Keys** page that lists, creates and revokes their own keys (backed by `/admin/me/keys`). Keys created there are attributed to that user and their organization automatically. Admins see everyone's keys on **All API Keys** and can revoke any of them." },
        {
          kind: 'link-cards',
          items: [
            { title: 'Users', md: 'Create, edit, disable and delete accounts', href: '/users', label: 'Open Users' },
            { title: 'Organizations & Programs', md: 'Teams and programs for attribution', href: '/orgs', label: 'Open Organizations' },
            { title: 'API Keys guide', md: 'Scopes, expiry and IP allowlists', href: '/guide?tab=api-keys', label: 'API key guide' },
          ],
        },
      ],
    },
  ],
  attribution: 'Cortex Users & Organizations Guide',
};

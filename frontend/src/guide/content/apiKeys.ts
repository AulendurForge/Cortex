/**
 * API Keys: scopes, creation, IP allowlists, self-service, lifecycle, Docker access, SDK snippets
 * and troubleshooting. Content only — the wording was audited against backend/src/auth.py
 * (`_ALL_SCOPES`, the 401/403 messages), backend/src/routes/openai.py (`insufficient_scope`) and
 * backend/src/crypto.py (40-character tokens, 8-character prefix). Gateway URL and port come
 * from the {{GATEWAY_URL}} / {{GATEWAY_PORT}} facts (../interpolate).
 */
import type { GuideTab } from '../types';

const COMPOSE_EXAMPLE = `services:
  your-app:
    image: your-app-image
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      OPENAI_API_BASE: "http://host.docker.internal:{{GATEWAY_PORT}}/v1"
      OPENAI_API_KEY: "<your 40-character key>"`;

const PYTHON_EXAMPLE = `from openai import OpenAI

client = OpenAI(
    base_url="{{GATEWAY_URL}}/v1",
    api_key="YOUR_API_KEY"  # 40 characters, shown once at creation
)

response = client.chat.completions.create(
    model="your-model-name",
    messages=[{"role": "user", "content": "Hello!"}]
)`;

const NODE_EXAMPLE = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: "{{GATEWAY_URL}}/v1",
  apiKey: "YOUR_API_KEY",  // 40 characters, shown once at creation
});

const response = await client.chat.completions
  .create({
    model: "your-model-name",
    messages: [{ role: "user", content: "Hello!" }],
  });`;

const CURL_EXAMPLE = `curl {{GATEWAY_URL}}/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "your-model", "messages": [{"role": "user", "content": "Hi"}]}'`;

export const apiKeysTab: GuideTab = {
  id: 'api-keys',
  title: 'API Key Management',
  intro:
    'Control access to your Cortex deployment with scoped API keys. This guide covers how to provision, monitor, and manage keys for users and applications—giving you fine-grained control over who can access your AI inference capabilities.',
  lead: [{ kind: 'p', md: '**Access Control** · **Scoped Permissions** · **Usage Tracking** · **IP Restrictions**' }],
  sections: [
    {
      id: 'keys-endpoint',
      title: 'Cortex API Endpoint',
      intro: 'Use this base URL when configuring your SDK or application (OpenAI compatible):',
      blocks: [
        { kind: 'code', text: '{{GATEWAY_URL}}/v1', label: 'Base URL' },
        {
          kind: 'table',
          caption: 'Frequently used endpoints',
          columns: ['Endpoint', 'URL'],
          rows: [
            ['Health Check', '`{{GATEWAY_URL}}/health`'],
            ['Models', '`{{GATEWAY_URL}}/v1/models`'],
            ['Chat', '`{{GATEWAY_URL}}/v1/chat/completions`'],
          ],
        },
      ],
    },
    {
      id: 'keys-overview',
      title: 'Overview',
      blocks: [
        { kind: 'p', md: "API keys are the primary authentication mechanism for Cortex's OpenAI-compatible API. Every request to `/v1/*` endpoints requires a Bearer API key, with two exceptions: a signed-in console session cookie is accepted too (that is how the Chat Playground calls `/v1`), and the dev stack sets `GATEWAY_DEV_ALLOW_ALL_KEYS=true`, which lets requests without any key through. As an administrator, you control who gets access and what they can do." },
        { kind: 'callout', variant: 'info', title: 'Key Principle', md: 'Each API key is hashed with bcrypt before storage. The full token is only shown **once** at creation. If lost, the key must be revoked and a new one issued.' },
        { kind: 'h', level: 3, text: 'Key Components' },
        {
          kind: 'cards',
          items: [
            { icon: '🔑', title: 'Prefix', md: '8-char identifier' },
            { icon: '🎯', title: 'Scopes', md: 'Permission set' },
            { icon: '📍', title: 'IP Allowlist', md: 'Network restriction' },
            { icon: '⏰', title: 'Expiration', md: 'Time-based access' },
          ],
        },
        { kind: 'h', level: 3, text: 'Authentication Flow' },
        { kind: 'p', md: '**1. Client Request** → **2. Bearer Token** → **3. Validate Key** → **4. Check Scopes** → **5. Process Request**' },
      ],
    },
    {
      id: 'keys-scopes',
      title: '1. Understanding Scopes',
      blocks: [
        { kind: 'p', md: 'Scopes define what operations a key can perform. By assigning only the necessary scopes, you follow the principle of **least privilege**—limiting potential damage if a key is compromised.' },
        {
          kind: 'table',
          caption: 'Available scopes',
          columns: ['Scope', 'Endpoint', 'Description'],
          rows: [
            ['`chat`', '`/v1/chat/completions`', 'Enables conversational AI interactions. Most common scope for chatbots and assistants.'],
            ['`completions`', '`/v1/completions`', 'Legacy text completion endpoint. Used for code generation and text continuation tasks.'],
            ['`embeddings`', '`/v1/embeddings`', 'Vector embeddings for semantic search and RAG pipelines. Does not generate text.'],
          ],
        },
        { kind: 'h', level: 3, text: 'Scope Recommendations' },
        {
          kind: 'table',
          caption: 'Which scopes to grant per use case',
          columns: ['Use case', 'Scopes', 'Note'],
          rows: [
            ['Chatbot Application', '`chat`', 'Only needs conversational endpoint'],
            ['RAG Pipeline', '`embeddings`, `chat`', 'Embed documents + generate answers'],
            ['Full Development', '`chat`, `completions`, `embeddings`', 'All capabilities for testing'],
            ['Embedding Service Only', '`embeddings`', 'Cannot generate any text'],
          ],
        },
      ],
    },
    {
      id: 'keys-create',
      title: '2. Creating API Keys',
      blocks: [
        { kind: 'p', md: 'Navigate to **Admin → All API Keys** to provision new keys. You can assign keys to specific users and organizations for usage tracking and accountability.' },
        { kind: 'h', level: 3, text: 'Steps to Create a Key' },
        {
          kind: 'steps',
          items: [
            { title: 'Click **New key** on the All API Keys page' },
            { title: 'Configure **Scopes**', md: 'Default: `chat,completions,embeddings`\nRestrict as needed for specific use cases' },
            { title: '**Optional:** Set IP Allowlist for network-level security' },
            { title: '**Optional:** Assign to a User and/or Organization' },
            { title: '**Optional:** Set an expiration date for temporary access' },
            { title: 'Click **Create key** and immediately copy the token' },
          ],
        },
        { kind: 'callout', variant: 'warning', title: 'Critical', md: 'The full API key is only displayed once. Copy it immediately and store it securely. You cannot retrieve it later—you can only revoke and create a new one.' },
        { kind: 'h', level: 3, text: 'Key Assignment Options' },
        {
          kind: 'cards',
          items: [
            { icon: '🖥️', title: 'System / Unassigned', md: 'Generic key not tied to any user. Use for service accounts or shared infrastructure.' },
            { icon: '👤', title: 'Assigned to User', md: 'Links usage tracking to a specific user account. Enables per-user analytics and accountability.' },
            { icon: '🏢', title: 'Assigned to Organization', md: 'Associates the key with an org for team-level usage tracking and billing separation.' },
          ],
        },
        { kind: 'h', level: 3, text: 'Token Format' },
        { kind: 'code', text: 'Ab3dE9fGhIjKlMnOpQrStUvWxYz0123456789AbC', label: 'Example token', copy: false },
        { kind: 'p', md: 'Keys are 40 random letters and digits with no prefix. The first 8 characters are the prefix shown in the keys table; the full token is shown only once, at creation.' },
      ],
    },
    {
      id: 'keys-ip-allowlist',
      title: '3. IP Allowlist Security',
      blocks: [
        { kind: 'p', md: 'Add an extra layer of security by restricting which IP addresses can use each key. Even if a key is compromised, attackers cannot use it from unauthorized networks.' },
        { kind: 'h', level: 3, text: 'Allowlist Format' },
        {
          kind: 'table',
          caption: 'Accepted allowlist entries',
          columns: ['Form', 'Example'],
          rows: [
            ['Single IP', '`10.0.0.100`'],
            ['Multiple', '`10.0.0.100, 10.0.0.50`'],
            ['CIDR Range', '`10.0.0.0/24`'],
          ],
        },
        { kind: 'callout', variant: 'info', title: 'Note', md: "Entries are comma-separated (exact IPs or CIDR ranges); the host's own IP is added automatically and invalid entries are rejected with 422. When using a reverse proxy (nginx, Traefik), ensure the proxy forwards the real client IP via `X-Forwarded-For` or `X-Real-IP` headers **and** list the proxy's address in `TRUSTED_PROXY_IPS` on the gateway. Those headers are ignored from any other peer, so a forged header cannot bypass an allowlist." },
        { kind: 'h', level: 3, text: 'Use Case Examples' },
        {
          kind: 'table',
          caption: 'Typical allowlists',
          columns: ['Scenario', 'Allowlist', 'Rationale'],
          rows: [
            ['Production Server Only', '`10.0.1.25`', 'Only your application server can call the API'],
            ['Development Team Subnet', '`10.10.0.0/24`', 'Allow all developer workstations on the dev VLAN'],
            ['Multi-Site Deployment', '`10.0.1.0/24, 172.16.0.0/16`', 'Multiple office networks with different IP ranges'],
            ['Empty (No Restriction)', '(none)', 'Key works from any IP—use with caution'],
          ],
        },
      ],
    },
    {
      id: 'keys-self-service',
      title: '4. User Self-Service',
      blocks: [
        { kind: 'p', md: 'Every signed-in user gets a **My API Keys** page. When users log into the console, they can create and manage their own API keys without admin intervention. This reduces your operational burden while maintaining security through automatic user attribution.' },
        { kind: 'h', level: 3, text: 'Self-Service Benefits' },
        { kind: 'checklist', items: ['Users can generate keys on-demand', 'Automatic user_id attribution for tracking', 'Users can revoke their own compromised keys', 'Reduces admin ticket volume'] },
        { kind: 'h', level: 3, text: 'Admin Controls' },
        { kind: 'list', items: ['View all keys across all users', 'Revoke any key if necessary', 'Filter keys by user, org, or prefix', 'Monitor usage per key/user/org'] },
        { kind: 'h', level: 3, text: 'API Endpoints' },
        {
          kind: 'table',
          caption: 'Key management endpoints',
          columns: ['Endpoint', 'Who', 'What'],
          rows: [
            ['`/admin/keys`', 'Admins', 'List, create and revoke any key (All API Keys)'],
            ['`/admin/me/keys`', 'Any signed-in user', 'List, create and revoke their own keys (My API Keys)'],
          ],
        },
      ],
    },
    {
      id: 'keys-usage-tracking',
      title: '5. Usage Tracking & Analytics',
      blocks: [
        { kind: 'p', md: 'Every API request is logged with the associated key, enabling detailed usage analytics. Navigate to **Admin → Usage** to view request history, token consumption, and latency metrics—filterable by key, user, or organization.' },
        { kind: 'h', level: 3, text: 'Tracked Metrics Per Request' },
        {
          kind: 'table',
          caption: 'Fields recorded for every request',
          columns: ['Metric', 'Meaning'],
          rows: [
            ['Key ID', 'Which key made the request'],
            ['User/Org', 'Attribution for billing'],
            ['Model', 'Which model was used'],
            ['Task Type', 'generate (chat & completions) or embed'],
            ['Token Counts', 'Prompt + completion tokens'],
            ['Latency', 'Response time in ms'],
            ['Status Code', 'Success (2xx) or errors'],
            ['Request ID', 'Unique trace identifier'],
          ],
        },
        {
          kind: 'cards',
          items: [
            { title: 'Filter by Key', md: "In the Usage page, use the Key filter dropdown to see all requests made with a specific API key. Useful for investigating suspicious activity or auditing a user's consumption." },
            { title: 'Last Used Timestamp', md: "The API Keys table shows when each key was last used. Keys that haven't been used in a long time may be candidates for revocation to reduce your attack surface." },
          ],
        },
        { kind: 'link-cards', items: [{ title: 'Usage', md: 'Request history, tokens and latency per key, user and organization', href: '/usage', label: 'Open Usage Analytics' }] },
      ],
    },
    {
      id: 'keys-lifecycle',
      title: '6. Key Lifecycle & Revocation',
      blocks: [
        { kind: 'h', level: 3, text: 'Key States' },
        {
          kind: 'table',
          caption: 'What each key state means',
          columns: ['State', 'Description'],
          rows: [
            ['**Active**', 'Key is valid and can be used for API requests'],
            ['**Expired**', 'Key passed its expiration date and is automatically rejected'],
            ['**Revoked**', "Key was revoked by an admin or its owner—cannot be re-enabled (tick 'show revoked' to list it)"],
          ],
        },
        { kind: 'h', level: 3, text: 'When to Revoke' },
        { kind: 'list', items: ['Key exposed in public repository or logs', 'User leaves the organization', 'Suspicious activity detected in usage logs', "Key hasn't been used in 90+ days (cleanup)", 'Project or integration is decommissioned'] },
        { kind: 'callout', variant: 'error', title: 'Revocation Is Permanent', md: 'Once a key is revoked, it cannot be re-enabled. Any application using the revoked key will immediately receive `401 Unauthorized` errors.' },
        { kind: 'h', level: 3, text: 'Revocation Checklist' },
        {
          kind: 'steps',
          items: [
            { title: 'Identify the key prefix in the API Keys table' },
            { title: "Click **Revoke** in the key's row" },
            { title: 'Confirm with **Revoke key** in the dialog' },
            { title: 'Notify affected users to update their integrations' },
            { title: 'Create a new key if access should continue' },
          ],
        },
        { kind: 'callout', variant: 'info', title: 'Pro Tip', md: 'Before revoking, check the Usage page to see which applications are actively using the key. Revocation without warning can cause service outages.' },
      ],
    },
    {
      id: 'keys-docker',
      title: '7. Connecting from Docker Containers',
      blocks: [
        { kind: 'p', md: 'Cortex gateway runs with **host network mode**, making it accessible from any Docker container or external application without special network configuration.' },
        { kind: 'h', level: 3, text: 'Access Methods' },
        {
          kind: 'table',
          caption: 'How to reach the gateway',
          columns: ['Method', 'URL', 'Note'],
          rows: [
            ['host.docker.internal', '`http://host.docker.internal:{{GATEWAY_PORT}}/v1`', 'Recommended for Docker containers (requires extra_hosts)'],
            ['Host LAN IP', '`{{GATEWAY_URL}}/v1`', 'Works from containers and LAN devices'],
            ['Localhost', '`http://localhost:{{GATEWAY_PORT}}/v1`', 'Same machine only'],
          ],
        },
        { kind: 'h', level: 3, text: 'Docker Compose Example' },
        { kind: 'code', lang: 'yaml', label: 'docker-compose.yml', text: COMPOSE_EXAMPLE, copy: true },
        { kind: 'callout', variant: 'info', title: 'Linux Firewall Note', md: 'If using UFW firewall on Linux, run `make setup-firewall` once to allow Docker container traffic to reach host services. This is a one-time setup.' },
      ],
    },
    {
      id: 'keys-sdk',
      title: '8. SDK & Client Integration',
      blocks: [
        { kind: 'p', md: 'Cortex is fully compatible with the **OpenAI SDK** and any OpenAI-compatible client (LangChain, LlamaIndex, etc.). Simply point the base URL to Cortex.' },
        { kind: 'code', lang: 'python', label: 'Python (openai-python)', text: PYTHON_EXAMPLE, copy: true },
        { kind: 'code', lang: 'typescript', label: 'Node.js / TypeScript (openai-node)', text: NODE_EXAMPLE, copy: true },
        { kind: 'code', lang: 'bash', label: 'cURL (testing)', text: CURL_EXAMPLE, copy: true },
      ],
    },
    {
      id: 'keys-best-practices',
      title: '9. Best Practices',
      blocks: [
        { kind: 'h', level: 3, text: 'Recommended' },
        {
          kind: 'checklist',
          items: [
            "Use **least-privilege scopes**—only grant what's needed",
            'Set **IP allowlists** for production applications',
            '**Assign keys to users** for accountability and tracking',
            'Set **expiration dates** for temporary/contractor access',
            '**Review usage regularly** for anomalies or inactive keys',
            'Store keys in **environment variables**, not in code',
            'Use **separate keys** per application/environment',
          ],
        },
        { kind: 'h', level: 3, text: 'Avoid' },
        {
          kind: 'list',
          items: [
            "Don't share a single key across multiple applications",
            "Don't commit API keys to Git repositories",
            "Don't expose keys in client-side JavaScript (browsers)",
            "Don't leave unused keys active indefinitely",
            "Don't use the same key for dev/staging/production",
            "Don't skip IP restrictions for production services",
          ],
        },
      ],
    },
    {
      id: 'keys-troubleshooting',
      title: '10. Troubleshooting',
      blocks: [
        {
          kind: 'cards',
          items: [
            { title: '401 Unauthorized — "Missing bearer token"', md: "Ensure the Authorization header is present and starts with 'Bearer '. Related 401 messages: 'Authorization header must be Bearer <key>' (malformed header), 'Invalid API key format' (shorter than 12 characters) and 'API key expired'." },
            { title: '401 Unauthorized — "Invalid API key"', md: "Verify the key prefix exists in the API Keys table and hasn't been revoked. Check for typos in the token. Remember: you can only see the full key once at creation." },
            { title: '403 Forbidden — "IP <client-ip> not allowed. Allowed IPs: …"', md: "Your client IP is not in the key's allowlist. Check the allowlist or remove IP restrictions if intentional. Behind a reverse proxy, add the proxy to `TRUSTED_PROXY_IPS` so the forwarded client IP is used." },
            { title: '403 Forbidden — "insufficient_scope"', md: "The key doesn't have the required scope for this endpoint. Chat endpoint needs 'chat' scope, embeddings needs 'embeddings' scope, etc. Create a new key with appropriate scopes." },
            { title: 'Key usage not appearing in analytics', md: 'Usage is recorded when the response—or the stream—finishes, so a long streamed answer shows up only after it ends. Refresh the Usage page or turn on Live. Records are queryable for 30 days. If the database is unreachable the request still succeeds but is not logged.' },
            { title: 'Key expired but user still needs access', md: "Expired keys cannot be extended. Create a new key with the same configuration and update the user's integration. Consider using longer expiration or no expiration for permanent access." },
            { title: 'Connection timeout from Docker container', md: "Ensure `extra_hosts` is configured with 'host.docker.internal:host-gateway'. On Linux with UFW firewall, run `make setup-firewall` from the Cortex directory to allow Docker container traffic." },
            { title: 'Cannot reach Cortex from external application', md: "Verify Cortex is running (`make status`). From Docker containers, use `host.docker.internal:{{GATEWAY_PORT}}` or the host's LAN IP. Test with: `curl {{GATEWAY_URL}}/health`" },
          ],
        },
      ],
    },
    {
      id: 'keys-quick-reference',
      title: 'Quick Reference',
      blocks: [
        {
          kind: 'table',
          caption: 'Available scopes',
          columns: ['Scope', 'Endpoint'],
          rows: [
            ['`chat`', '`/v1/chat/completions`'],
            ['`completions`', '`/v1/completions`'],
            ['`embeddings`', '`/v1/embeddings`'],
          ],
        },
        { kind: 'p', md: '**Key Token Format.** 40 random letters and digits\nPrefix: first 8 chars (shown in the table)\nNo `ctx_` prefix; shown once at creation' },
        { kind: 'link-cards', items: [{ title: 'API Keys', md: 'Create, assign and revoke keys', href: '/keys', label: 'Open API Keys Page' }] },
      ],
    },
  ],
  attribution: 'Cortex API Key Management Guide',
};

/**
 * Chat Playground tab: what the playground is for, how the interface works, the live metrics,
 * context tracking, chat history and troubleshooting. Content only — wording was audited against
 * the Chat page; keep facts here, not in TSX.
 */
import type { GuideTab } from '../types';

export const chatTab: GuideTab = {
  id: 'chat-playground',
  title: 'Chat Playground',
  intro:
    'Test and validate your running inference models interactively. The Chat Playground provides a simple interface to verify model behavior, measure performance, and experiment with prompts—all without writing any code.',
  lead: [{ kind: 'p', md: '**Model Testing** · **Performance Metrics** · **Chat History** · **Context Tracking**' }],
  sections: [
    {
      id: 'chat-what-is',
      title: 'What is the Chat Playground?',
      blocks: [
        { kind: 'p', md: 'The Chat Playground is your go-to tool for **validating that models are working correctly** after deployment. Think of it as a quick "sanity check" before connecting external applications to your inference endpoints.' },
        { kind: 'callout', variant: 'info', title: 'Key Use Cases', md: 'Verifying model responses, testing prompt formats, measuring generation speed, and troubleshooting model behavior.' },
        { kind: 'h', level: 3, text: 'At a Glance' },
        {
          kind: 'cards',
          items: [
            { icon: '💬', title: 'Interactive Chat', md: 'Real-time responses' },
            { icon: '📊', title: 'Live Metrics', md: 'tok/s and TTFT' },
            { icon: '💾', title: 'Auto-Save', md: 'Cross-device history' },
            { icon: '🎯', title: 'Context Tracking', md: 'Usage visualization' },
          ],
        },
      ],
    },
    {
      id: 'chat-getting-started',
      title: 'Getting Started',
      intro: 'Before using the Chat Playground, ensure you have at least one model running. The picker lists **running chat models**; embedding models are not offered.',
      blocks: [
        { kind: 'h', level: 3, text: 'Steps to Start Chatting' },
        {
          kind: 'steps',
          items: [
            { title: 'Navigate to Chat → Playground in the sidebar' },
            { title: 'Select a running model from the dropdown menu', md: 'Only models in the running state appear here (embedding models are excluded)' },
            { title: 'Type your message in the input field at the bottom' },
            { title: 'Press Enter or click the send button to submit' },
            { title: 'Watch the response stream in real-time with live performance metrics' },
          ],
        },
        { kind: 'h', level: 3, text: 'Prerequisites' },
        {
          kind: 'table',
          columns: ['Prerequisite', 'Required', 'Note'],
          rows: [
            ['**Running Model**', 'Yes', 'At least one model must be started and healthy'],
            ['**Logged In**', 'Yes', 'Chat history is saved per-user account'],
            ['API Keys', 'No', 'Not needed—Chat uses session auth'],
          ],
        },
        { kind: 'link-cards', items: [{ title: 'Models', md: 'Start a model before opening the playground', href: '/models', label: 'Manage Models' }] },
      ],
    },
    {
      id: 'chat-interface',
      title: 'Understanding the Interface',
      blocks: [
        { kind: 'h', level: 3, text: 'Left Sidebar' },
        {
          kind: 'list',
          items: [
            '**New Chat Button** — Start a fresh conversation with the current model (or select a new one)',
            '**Chat History** — Your previous conversations, sorted newest first. Click to resume any chat.',
            "**Delete Options** — Hover a chat and click the trash icon to delete it, or use 'Clear all chats' at the bottom",
          ],
        },
        { kind: 'h', level: 3, text: 'Main Chat Area' },
        {
          kind: 'list',
          items: [
            '**Model Selector** — Dropdown showing running models. Locked after first message to maintain context.',
            '**Message Thread** — Conversation display with Cortex logo for assistant, user icon for you',
            '**Performance Bar** — Shown while streaming: tokens per second and time to first token',
            "**Context Indicator** — Visual bar showing how much of the model's context window is used",
          ],
        },
      ],
    },
    {
      id: 'chat-metrics',
      title: 'Performance Metrics Explained',
      intro: "During streaming, you'll see live performance metrics. These help you understand how well your model and hardware are performing.",
      blocks: [
        {
          kind: 'cards',
          items: [
            { title: 'tok/s — Tokens per Second', md: 'How fast the model generates output. Higher is better.\n**Good range:** 15-100+ tok/s\nVaries by model size, GPU, and context length' },
            { title: 'TTFT — Time to First Token', md: 'How long until the first word appears after you send a message.\n**Good range:** 50-500ms\nAffected by prompt length and model load' },
            { title: 'Context — Context Used', md: "Estimated tokens in the conversation versus the model's limit, shown as the bar above the input.\n**Good range:** Under 80%\nTeal up to 80%, amber above 80%, red once the limit is exceeded" },
          ],
        },
        { kind: 'callout', variant: 'info', title: 'Pro Tip', md: 'If you notice slow tok/s, try reducing the context length in model settings or ensure no other heavy processes are using the GPU.' },
      ],
    },
    {
      id: 'chat-context-window',
      title: 'Managing Context Window',
      blocks: [
        { kind: 'p', md: 'Every model has a **context window limit**—the maximum number of tokens it can process in a single conversation. The Chat Playground tracks this for you.' },
        { kind: 'h', level: 3, text: 'What Happens at the Limit?' },
        {
          kind: 'list',
          items: [
            'The full conversation is sent on every turn—nothing is trimmed—so a request past the limit fails',
            'Every turn re-processes the whole history, so long chats get slower',
            'Start a **New Chat** to reset the context',
          ],
        },
        { kind: 'h', level: 3, text: 'Context Bar Colors' },
        {
          kind: 'table',
          columns: ['Fill', 'Color', 'Meaning'],
          rows: [
            ['**0-80%**', 'Teal', 'Plenty of room'],
            ['**80-100%**', 'Amber', 'Getting full'],
            ['**Over 100%**', 'Red', 'Over the limit'],
          ],
        },
        { kind: 'p', md: "When the bar turns red the next request exceeds the model's limit—start a new chat." },
      ],
    },
    {
      id: 'chat-history',
      title: 'Chat History & Persistence',
      blocks: [
        { kind: 'p', md: 'Your chat sessions are **automatically saved** to the server and tied to your user account. This means:' },
        {
          kind: 'checklist',
          items: [
            'Access your chats from any computer',
            'History persists across browser sessions',
            'Only you can see your conversations',
            'Administrators can see usage statistics (not content)',
          ],
        },
        { kind: 'h', level: 3, text: 'Managing History' },
        {
          kind: 'list',
          items: [
            '**Delete Single Chat** — Hover over a chat in the sidebar and click the trash icon',
            '**Clear All History** — Click "Clear all chats" at the bottom of the sidebar, then click it again within 3 seconds to confirm',
            '**Auto-Naming** — Chats are titled based on your first message',
          ],
        },
      ],
    },
    {
      id: 'chat-best-practices',
      title: 'Best Practices',
      blocks: [
        { kind: 'h', level: 3, text: 'Recommended' },
        {
          kind: 'checklist',
          items: [
            "Test models right after deployment to verify they're working",
            'Use specific prompts to test expected use cases',
            'Check performance metrics to establish baselines',
            'Start new chats when switching topics for cleaner context',
            'Compare different models with the same prompt',
          ],
        },
        { kind: 'h', level: 3, text: 'Keep in Mind' },
        {
          kind: 'list',
          items: [
            'Chat Playground is for testing—not production workloads',
            'Model selection locks after first message to preserve context',
            'Very long conversations may hit context limits',
            "There are no system-prompt or temperature controls; sampling comes from the model's request defaults",
            'A turn you stop or that fails stays in the transcript but is not sent back to the model; use Retry to resend the last prompt',
            'If model is reconfigured, existing chats may behave differently',
            "Usage is logged—admins can see you're using the playground",
          ],
        },
      ],
    },
    {
      id: 'chat-troubleshooting',
      title: 'Troubleshooting',
      blocks: [
        {
          kind: 'issues',
          items: [
            {
              title: 'No models appear in the dropdown',
              causes: ['No generate (chat) model is started'],
              solutions: ['Ensure you have at least one generate (chat) model started', 'Go to the [Models page](/models) and verify its state is running (green badge)'],
            },
            {
              title: "'Only embedding models are running'",
              causes: ['The picker excludes embedding models'],
              solutions: ['Start a generate (chat) model on the [Models page](/models)'],
            },
            {
              title: 'Response is very slow',
              causes: ['The model may be overloaded (tok/s below 5)'],
              solutions: ['Check the tok/s metric', 'Try stopping other models or reducing context length in model settings'],
            },
            {
              title: "Chat history doesn't appear",
              causes: ["You're not logged in—chat history is per user", 'The list could not be loaded (the sidebar shows the error)'],
              solutions: ["Ensure you're logged in", 'Reload the page'],
            },
            {
              title: 'Context bar is full but conversation is short',
              causes: ['The model may have a small context window'],
              solutions: ["Check the model's configuration", 'Start a new chat'],
            },
            {
              title: 'Cannot change model after starting chat',
              causes: ['This is intentional—it prevents context confusion'],
              solutions: ["Click 'New Chat' to select a different model"],
            },
          ],
        },
      ],
    },
    {
      id: 'chat-quick-reference',
      title: 'Quick Reference',
      blocks: [
        {
          kind: 'table',
          caption: 'Keyboard shortcuts',
          columns: ['Key', 'Action'],
          rows: [
            ['`Enter`', 'Send message'],
            ['`Shift+Enter`', 'New line'],
          ],
        },
        { kind: 'p', md: '**Performance goals.** tok/s: 15+ (good), 50+ (excellent). TTFT: under 500ms (good), under 200ms (excellent).' },
        { kind: 'link-cards', items: [{ title: 'Chat', md: 'Quick access to the playground', href: '/chat', label: 'Open Chat Playground' }] },
      ],
    },
  ],
  attribution: 'Cortex Chat Playground Guide',
};

/**
 * Statements the guide must never make again (they were found false in the frontend audit).
 * Shared by the source-level guardrail in app/(admin)/guide/guide-content.test.ts and the
 * data-level one in src/guide/content/content.test.ts.
 */
export const FORBIDDEN_PHRASES: Array<[RegExp, string]> = [
  [/admin\s*\/\s*admin/i, 'default admin/admin credentials no longer exist'],
  [/ctx_[a-z0-9_]{4,}/i, 'API keys have no ctx_ prefix'],
  [/192\.168\.1\.181/, 'hardcoded LAN address'],
  [/nvidia\/cuda:12\.0-base/, 'image tag does not exist'],
  [/BETA 0\.1/, 'stale version badge'],
  [/Deployment \(Beta\)/, 'page is called Transfer'],
  [/SHA-256 hashed|hashed \(SHA-256\)/i, 'keys are bcrypt hashed'],
  [/vLLM (cannot|can't|does not) (load|run) GPT-OSS/i, 'vLLM v0.28 runs gpt-oss'],
  [/circuit break/i, 'no circuit breaker feature is exposed to users'],
  [/ggerganov\/llama\.cpp/, 'llama.cpp moved to ggml-org'],
  [/Max Context\b/, 'the field is called "Max model length"'],
];

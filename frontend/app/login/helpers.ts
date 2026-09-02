/** Only same-origin paths are accepted as a post-login destination. */
export function safeNext(path: string | null | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/login')) return '/guide?tab=getting-started';
  return path;
}

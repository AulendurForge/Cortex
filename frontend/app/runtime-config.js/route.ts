/**
 * Runtime configuration for the browser bundle. Read at request time (never baked into the build)
 * so the same image works behind a TLS reverse proxy (CORTEX_GATEWAY_URL=/) or on a LAN host.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const gatewayUrl = (process.env.CORTEX_GATEWAY_URL ?? '').trim();
  const body = `window.__CORTEX_CONFIG__=${JSON.stringify({ gatewayUrl })};`;
  return new Response(body, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' } });
}

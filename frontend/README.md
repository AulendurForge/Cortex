# Frontend (Admin UI)

## Quickstart

```bash
cd frontend
npm install
# Points to the gateway default port 8084 (override as needed)
echo "NEXT_PUBLIC_GATEWAY_URL=http://localhost:8084" > .env.local
npm run dev # http://localhost:3001
```

If your gateway runs on a different port, change `NEXT_PUBLIC_GATEWAY_URL` accordingly.

# Cortex Admin UI (Next.js)

Next.js 14 (app router) admin console. `npm run dev` for hot reload, `npm run typecheck`, `npm run lint`, `npm test` (vitest).
Runtime gateway address: `/runtime-config.js` (env `CORTEX_GATEWAY_URL`), see `src/lib/api-clients.ts`.

See `plans/frontendPlan.md` for milestones and file structure.
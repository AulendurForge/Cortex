# Cortex admin UI.
#   dev  target: `next dev` with the source bind-mounted (docker.compose.dev.yaml)
#   prod target: `next build` + `next start` (docker.compose.prod.yaml)
ARG NODE_IMAGE=node:22-alpine

# ---------------------------------------------------------------------------
# deps: install once, shared by both targets
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# dev: hot reload (source is bind-mounted over /app by compose)
# ---------------------------------------------------------------------------
FROM deps AS dev
COPY . .
EXPOSE 3001
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# build: production bundle
# ---------------------------------------------------------------------------
FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# prod: minimal runtime, non-root
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS prod
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
# `output: 'standalone'` emits a minimal server with only the modules it needs
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD wget -qO- http://127.0.0.1:3001/runtime-config.js >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]

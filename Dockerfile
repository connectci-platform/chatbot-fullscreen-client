# syntax=docker/dockerfile:1

# Build-time API base URL, inlined into the client bundle by Next (NEXT_PUBLIC_*
# vars are baked in at build, not read at runtime). Must be ABSOLUTE: the
# LangGraph SDK builds request URLs with `new URL(apiUrl)`, which rejects a
# relative path. This points at the agent's /api/v1 mount on the deploy host —
# same origin as this client (Caddy fronts both), so the auth cookie still flows
# and there's no CORS; absolute only so new URL() works. Override for a deploy on
# a different host.
ARG NEXT_PUBLIC_API_URL=https://qa.access-ci.org/api/v1

# Assistant/graph id sent as `assistant_id` to the agent. This is a single-agent
# deployment, so the agent accepts and ignores the value — it only needs to be
# non-empty (the app shows a "not configured" screen otherwise). Baked in at
# build like the API URL above.
ARG NEXT_PUBLIC_ASSISTANT_ID=agent

FROM node:22-alpine AS base
RUN corepack enable

# ---- deps: install dependencies from the lockfile only ----
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build: compile the Next app ----
FROM base AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ARG NEXT_PUBLIC_ASSISTANT_ID
ENV NEXT_PUBLIC_ASSISTANT_ID=${NEXT_PUBLIC_ASSISTANT_ID}
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# public/ is optional (this repo doesn't have one); ensure it exists so the
# runner stage's COPY of it never fails regardless of whether it's present.
RUN mkdir -p public
RUN pnpm build

# ---- runner: minimal production image ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Standalone output includes a minimal server.js plus only the node_modules
# actually required at runtime — no package manager or dev deps in this stage.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]

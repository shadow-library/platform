# syntax=docker/dockerfile:1

# ── Stage 1: build the client + SSR bundle ──────────────────────────────────────
# Debian-based Bun (glibc) avoids musl edge cases with Rollup's native binaries.
FROM oven/bun:1.3.6 AS build
WORKDIR /app

# Install dependencies first so this layer is cached across source-only changes.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# `bun run build` runs `shadow build` (the repo's `vite build` — emits dist/client + dist/server).
COPY . .
RUN bun run build

# ── Stage 2: run the TanStack Start SSR server ──────────────────────────────────
# serve.ts (shadow web's `serve`) fronts hashed client assets from dist/client and full-document SSR from
# dist/server on PORT, with a backend-independent /healthz probe on HEALTH_PORT. Backend calls happen
# server-side through Start server functions against API_ORIGIN — there is no /api proxy here anymore, so
# the ingress must route /api/auth/* (the interactive login redirect) to novel-forge-server directly.
FROM oven/bun:1.3.6-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HEALTH_PORT=3001 \
    API_ORIGIN=http://novel-forge-server:8080

# The SSR bundle externalises its runtime deps, so ship node_modules from the build stage (identical base
# image and libc) instead of reinstalling.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json /app/serve.ts ./

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.HEALTH_PORT||3001)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["bun", "run", "serve.ts"]

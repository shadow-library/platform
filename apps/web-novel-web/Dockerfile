# syntax=docker/dockerfile:1

# ── Stage 1: build the client + SSR bundle + service worker ─────────────────────
# Debian-based Bun (glibc) avoids musl edge cases with Rollup's native binaries.
FROM oven/bun:1.3.6 AS build
WORKDIR /app

# Install dependencies first so this layer is cached across source-only changes.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# `bun run build:app` writes the PWA manifest, runs `vite build` (dist/client + dist/server), then emits
# the service worker to dist/client/sw.js. (`shadow build` wraps the same command; calling it directly
# keeps the image build free of git/husky hooks.)
COPY . .
RUN bun run build:app

# ── Stage 2: run the TanStack Start SSR server ──────────────────────────────────
# main.ts fronts everything on one origin via @shadow-library/web's `serve()`: hashed client assets
# (immutable cache + gzip), `/sw.js` with service-worker headers, `*.webmanifest`, and full-document SSR.
# A reverse proxy routes `/api` to webnovel-server and everything else here. The liveness probe listens
# on its own port (HEALTH_PORT) so health stays backend-independent.
FROM oven/bun:1.3.6-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HEALTH_PORT=3001 \
    SERVER_URL=http://webnovel-server:8080

# The SSR bundle externalises its runtime deps, so ship node_modules from the build stage (identical base
# image and libc) instead of reinstalling.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json /app/main.ts ./

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.HEALTH_PORT||3001)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["bun", "main.ts"]

# syntax=docker/dockerfile:1

# ── Stage 1: build the client + SSR bundle ──────────────────────────────────────
# Debian-based Bun (glibc) avoids musl edge cases with Rollup's native binaries.
FROM oven/bun:1.3.6 AS build
WORKDIR /app

# Install dependencies first so this layer is cached across source-only changes.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# `bun run build` runs `vite build` (emits dist/client + dist/server) then `tsc --noEmit` (type-check).
COPY . .
RUN bun run build

# ── Stage 2: run the TanStack Start SSR server ──────────────────────────────────
# The app is no longer static files behind nginx — it is a Bun server that renders every request. serve.ts
# fronts three things on one origin: /api → the backend (API_ORIGIN), hashed client assets from dist/client,
# and full-document SSR from dist/server. Put a TLS-terminating proxy in front of it if you need HTTPS.
FROM oven/bun:1.3.6-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    API_ORIGIN=http://novel-forge-server:8080

# The SSR bundle externalises its runtime deps, so ship node_modules from the build stage (identical base
# image and libc) instead of reinstalling.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json /app/serve.ts ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["bun", "run", "serve.ts"]

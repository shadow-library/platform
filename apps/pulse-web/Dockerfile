# syntax=docker/dockerfile:1
ARG BUN_VERSION=1.3.6

# ── Stage 1: build the static SPA ───────────────────────────────────────────────
# Debian-based Bun (glibc) avoids musl edge cases with Rollup's native binaries.
FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
# HUSKY=0 no-ops the prepare git-hook install, which would otherwise fail with no .git in the image.
ENV HUSKY=0
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# `bun run build` runs `shadow build` (the repo's `vite build`) → emits the static client to dist/.
RUN bun run build

# ── Stage 2: serve dist/ with a tiny Bun static server ──────────────────────────
# serve.ts serves the built assets on PORT with an index.html fallback for client-side routes, plus a
# backend-independent /healthz probe on HEALTH_PORT. The API is same-origin (/api) and routed to
# pulse-server by the ingress, so nothing is proxied here. Runs as the non-root `bun` user (uid 1000)
# on an unprivileged port — no root, no privileged bind.
FROM oven/bun:${BUN_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HEALTH_PORT=3001
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --chown=bun:bun serve.ts package.json ./
USER bun
EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.HEALTH_PORT||3001)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["bun", "run", "serve.ts"]

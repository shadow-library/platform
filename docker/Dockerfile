# syntax=docker/dockerfile:1
#
# Shared, parameterized Dockerfile for every apps/* workspace. Build context is the MONOREPO ROOT
# (not the app directory) — see docker/README.md for the exact `docker build` invocation per app.
#
# Why one Dockerfile instead of eight: every app builds the same way (bun install at the repo
# root, `bun scripts/build.ts 'packages/*'` for the shared packages, then
# `bun scripts/build.ts apps/${APP}`), and every app's runtime falls into exactly one of two shapes
# shared across the platform:
#   - backend  (identity-server, novel-forge-server, pulse-server, web-novel-server):
#     scripts/build.ts tree-shakes each entrypoint into a single self-contained Bun.build bundle —
#     the runtime image needs nothing but dist/, not even node_modules.
#   - ssr      (identity-web, novel-forge-web, pulse-web, web-novel-web): a TanStack Start server
#     whose SSR bundle externalizes its runtime deps — the runtime image needs dist/ + a
#     production-only node_modules + the app's own serve entry. (pulse-web converted from a
#     `runtime-spa` static build to this shape; the now-unused `runtime-spa` target was removed —
#     no app builds it.)
# ARG APP selects the workspace; `--target runtime-<type>` selects the runtime shape; ARG
# SSR_ENTRY (ssr only) selects the app's production entry filename (main.ts vs serve.ts). This is
# option (a) from the task's D6 choice: one parameterized Dockerfile beats eight per-app ones or
# three per-type templates, and beats "thin per-app Dockerfiles that FROM a shared base" too —
# Docker has no file-include mechanism, so a per-app Dockerfile would either duplicate these
# stages (the exact copy-paste this is meant to eliminate) or be a non-functional stub. The eight
# apps/*/Dockerfile files this replaces are deleted; docker/README.md documents the one build
# command per app instead.
#
# `apps/*/package.json` is copied for all eight apps (not just the target) even though only one
# app's full source is copied: `bun install --frozen-lockfile` validates the *lockfile* against
# every workspace `bun.lock` knows about (apps/*, packages/*, and the literal `e2e` entry in the
# root `workspaces` array), not just the ones physically present with full source — a manifest-only
# stub for every other workspace is enough to satisfy that check without shipping their source.

ARG BUN_VERSION=1.3.14

# ---------------------------------------------------------------------------------------------
# deps — every workspace manifest + a full (dev+prod) install. Cached until a manifest, the
# lockfile, or tsconfig.base.json changes. Debian-based `bun` (not `-slim`): packages/ui's
# component build runs Rollup + esbuild native binaries, which the slim (musl) image doesn't ship.
# ---------------------------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION} AS deps
ENV HUSKY=0
WORKDIR /workspace

# The backend build stamps dist/package.json's gitCommit via `git rev-parse HEAD` and degrades
# gracefully to "omit the field" when that *fails* — but .git isn't in this context (see the
# no-.git judgment call in docker/README.md), and scripts/utils/process.ts's run() re-throws
# instead of degrading when the git *binary itself* is missing (spawnSync ENOENT). The binary
# needs to exist so the graceful "no repo here" path is the one that actually runs.
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# tsconfig.web.json too: the four web apps extend it, so a vite build cannot resolve their `@/*`
# aliases without it — the extends chain fails to parse and every path alias silently goes unresolved.
COPY package.json bun.lock tsconfig.base.json tsconfig.web.json ./
COPY packages/app/package.json packages/app/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/class-schema/package.json packages/class-schema/package.json
COPY packages/common/package.json packages/common/package.json
COPY packages/fastify/package.json packages/fastify/package.json
COPY packages/modules/package.json packages/modules/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/web/package.json packages/web/package.json
COPY apps/identity-server/package.json apps/identity-server/package.json
COPY apps/identity-web/package.json apps/identity-web/package.json
COPY apps/novel-forge-server/package.json apps/novel-forge-server/package.json
COPY apps/novel-forge-web/package.json apps/novel-forge-web/package.json
COPY apps/pulse-server/package.json apps/pulse-server/package.json
COPY apps/pulse-web/package.json apps/pulse-web/package.json
COPY apps/web-novel-server/package.json apps/web-novel-server/package.json
COPY apps/web-novel-web/package.json apps/web-novel-web/package.json
COPY e2e/package.json e2e/package.json

RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------------------------
# build — full source for packages/* (every package, since a package build doesn't know its own
# consumers) and for the one target app; builds the app's `workspace:*` dependency closure first
# (`--deps`, the same invocation CI uses), then the app itself. Both run from the repo root:
# `scripts/` is root tooling invoked by path, and no workspace has a `build` script of its own.
# ---------------------------------------------------------------------------------------------
FROM deps AS build
ARG APP

# Every package builds here, not just apps/${APP}'s dependency closure: the ssr runtime stage below
# overlays a dist/ for all eight of them unconditionally, and building the closure alone leaves the
# ones this app doesn't depend on without a dist/ to copy. Building all of them also keeps this whole
# layer — install through package build — byte-identical, and therefore cache-shared, across all 8
# apps' image builds. It also runs before apps/${APP}'s source is copied in, since it consumes nothing
# under apps/: copying apps/${APP} first (as an earlier version of this Dockerfile did) put a
# per-app-varying layer ahead of the package build, invalidating it on every app source change even
# though the build doesn't depend on that source at all.
COPY scripts/ scripts/
COPY packages/ packages/
RUN bun scripts/build.ts 'packages/*'

COPY apps/${APP}/ apps/${APP}/
RUN bun scripts/build.ts apps/${APP}

# ---------------------------------------------------------------------------------------------
# prod-deps — ssr runtime only: a from-scratch, production-only, --ignore-scripts install (no
# devDependencies, no husky/postinstall), scoped to just the target app with `--filter`. Reuses
# the exact manifests `deps` already resolved (COPY --from=deps) instead of restating the same 18
# host paths again. A prod-only install can't be derived by re-running `bun install --production`
# on top of `deps`'s node_modules — bun's installer only ever adds what's missing, it doesn't
# prune already-installed devDependencies — so this has to be an independent stage, not `FROM
# deps`.
#
# `--filter "./apps/${APP}"` matters for image size, not just correctness: every workspace
# manifest is present (frozen-lockfile validation needs all of them — see `deps` above), and
# without `--filter` bun installs *every* workspace's production dependencies into the same
# hoisted node_modules/.bun store, not just the target app's — confirmed by an unfiltered install
# producing 860MB ssr images (this monorepo's backends alone pull in langchain/llamaindex/etc.).
# `--filter` scopes the resolved+installed graph to the target workspace plus the workspace
# packages it depends on (`workspace:*`, resolved transitively), cutting identity-web's install
# from 1257 packages / image bloat down to 504 packages.
# ---------------------------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS prod-deps
ENV HUSKY=0
WORKDIR /workspace

COPY --from=deps /workspace/package.json /workspace/bun.lock /workspace/tsconfig.base.json ./
COPY --from=deps /workspace/packages packages/
COPY --from=deps /workspace/apps apps/
COPY --from=deps /workspace/e2e e2e/

ARG APP
ARG SSR_ENTRY=main.ts
RUN bun install --frozen-lockfile --production --ignore-scripts --filter "./apps/${APP}"

# Overlay each package's build output onto its (manifest-only, so far) directory: the workspace
# symlinks bun install just created point at `packages/<name>` directly (not a copy in a registry
# cache), so the runtime image needs the real dist/ there, not just package.json.
COPY --from=build /workspace/packages/app/dist packages/app/dist
COPY --from=build /workspace/packages/auth/dist packages/auth/dist
COPY --from=build /workspace/packages/class-schema/dist packages/class-schema/dist
COPY --from=build /workspace/packages/common/dist packages/common/dist
COPY --from=build /workspace/packages/fastify/dist packages/fastify/dist
COPY --from=build /workspace/packages/modules/dist packages/modules/dist
COPY --from=build /workspace/packages/ui/dist packages/ui/dist
COPY --from=build /workspace/packages/web/dist packages/web/dist

COPY --from=build /workspace/apps/${APP}/dist apps/${APP}/dist
COPY --from=build /workspace/apps/${APP}/package.json apps/${APP}/package.json
# Renamed to a fixed name so every ssr app's runtime stage can use the same CMD regardless of
# whether the app's own production entry is called main.ts or serve.ts.
COPY --from=build /workspace/apps/${APP}/${SSR_ENTRY} apps/${APP}/entry.ts

# ---------------------------------------------------------------------------------------------
# runtime-backend — identity-server, novel-forge-server, pulse-server, web-novel-server.
# scripts/build.ts already produced a single tree-shaken bundle per entrypoint; nothing but dist/
# ships. ENTRYPOINT + a CMD default of main.js lets the same image run the worker
# (identity-server: `docker run <image> worker.js`) or migrations (`docker run <image>
# migrate.js`) by overriding CMD — no separate image per entrypoint.
# ---------------------------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS runtime-backend
ARG APP
ARG APP_VERSION=local
ENV APP_VERSION=${APP_VERSION} \
    NODE_ENV=production \
    SERVER_PORT=8080 \
    APP_PORT=8080 \
    APP_HOST=0.0.0.0 \
    HEALTH_HOST=0.0.0.0

USER bun
WORKDIR /app
COPY --from=build --chown=bun:bun /workspace/apps/${APP}/dist .

# Two independent host-binding defaults exist across the platform's backends, neither of them
# "the framework default" — each app's OWN bootstrap.ts picks one:
#   - identity-server, novel-forge-server, web-novel-server each register their own `server.host`
#     key (bootstrap.ts) with a default of 0.0.0.0, and pass it into FastifyModule.forRoot()
#     explicitly, overriding the framework's default. SERVER_PORT is a no-op knob for these three.
#   - pulse-server never registers `server.host` or passes an explicit host into
#     FastifyModule.forRoot(), so it falls through to @shadow-library/fastify's OWN default —
#     `app.host`, default 'localhost' — which resolved to the IPv6 loopback (`::1`) only inside
#     the container in the environment this was verified in, making the published port 8080
#     unreachable (connection reset) even though the process and health checks looked fine.
#     APP_HOST=0.0.0.0 fixes that; APP_PORT is the matching (currently no-op, since 8080 is
#     already `app.port`'s default) knob for the same fallback. Both are no-ops for the other
#     three backends, which never read `app.host`/`app.port`.
# 8081: the framework's dependency-free liveness/readiness pair (GET /health/live, /health/ready)
# from @shadow-library/modules' HttpCoreModule, enabled whenever NODE_ENV=production — its OWN
# default `health.host` is also 'localhost', hitting the identical IPv6-loopback problem;
# HEALTH_HOST=0.0.0.0 fixes that independently of the main port. Both fixes confirmed by a real
# boot-check (docker/README.md).
EXPOSE 8080 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.HEALTH_PORT||8081)+'/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["bun", "run"]
CMD ["main.js"]

# ---------------------------------------------------------------------------------------------
# runtime-ssr — identity-web, novel-forge-web, pulse-web, web-novel-web. Ships the production-only
# node_modules from prod-deps *with the monorepo's relative directory layout intact*
# (/workspace/node_modules + /workspace/packages/*/dist + /workspace/apps/<app>) rather than a
# flattened copy: bun's linker resolves workspace packages via relative symlinks four directories
# up (apps/<app>/node_modules/@shadow-library/x -> ../../../../packages/x) and resolves some
# transitive npm deps (observed: @shadow-library/common -> chokidar -> readdirp) through its own
# node_modules/.bun store rather than a literal nested symlink — a `cp -rL`-style flatten
# (dereference-and-copy into a clean node_modules/) silently drops that second kind of edge and
# the app crashes on boot with "Cannot find package 'readdirp'". Preserving the real tree, proven
# by booting identity-web from it locally, is what keeps that resolution working.
# ---------------------------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS runtime-ssr
ARG APP
ENV NODE_ENV=production \
    PORT=3000 \
    HEALTH_PORT=3001

WORKDIR /workspace
COPY --from=prod-deps --chown=bun:bun /workspace/node_modules node_modules/
COPY --from=prod-deps --chown=bun:bun /workspace/packages packages/
COPY --from=prod-deps --chown=bun:bun /workspace/apps/${APP} apps/${APP}/
USER bun
WORKDIR /workspace/apps/${APP}

EXPOSE 3000 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.HEALTH_PORT||3001)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["bun", "run", "entry.ts"]

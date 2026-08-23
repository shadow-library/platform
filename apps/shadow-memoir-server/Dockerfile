ARG BUN_VERSION=1.3.14

FROM oven/bun:${BUN_VERSION} AS deps
ENV HUSKY=0
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock tsconfig.base.json ./
COPY apps/tsconfig.server.json apps/tsconfig.web.json apps/
COPY packages/tsconfig.lib.json packages/tsconfig.build.json packages/
COPY types/ types/
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
COPY apps/shadow-memoir-server/package.json apps/shadow-memoir-server/package.json
COPY apps/shadow-memoir-web/package.json apps/shadow-memoir-web/package.json
COPY apps/web-novel-server/package.json apps/web-novel-server/package.json
COPY apps/web-novel-web/package.json apps/web-novel-web/package.json
COPY e2e/package.json e2e/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --filter ./apps/shadow-memoir-server --filter ./

FROM deps AS build
COPY scripts/ scripts/
COPY packages/app/ packages/app/
COPY packages/auth/ packages/auth/
COPY packages/class-schema/ packages/class-schema/
COPY packages/common/ packages/common/
COPY packages/fastify/ packages/fastify/
COPY packages/modules/ packages/modules/
RUN bun scripts/build.ts apps/shadow-memoir-server --deps
COPY apps/shadow-memoir-server/ apps/shadow-memoir-server/
RUN bun scripts/build.ts apps/shadow-memoir-server

FROM oven/bun:${BUN_VERSION}-slim AS runtime
ARG APP_VERSION=local
ENV APP_VERSION=${APP_VERSION} \
    NODE_ENV=production \
    SERVER_PORT=8080 \
    APP_PORT=8080 \
    APP_HOST=0.0.0.0 \
    HEALTH_HOST=0.0.0.0
USER bun
WORKDIR /app
COPY --from=build --chown=bun:bun /workspace/apps/shadow-memoir-server/dist .
EXPOSE 8080
ENTRYPOINT ["bun", "run"]
CMD ["main.js"]

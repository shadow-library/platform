ARG BUN_VERSION=1.3.14

FROM oven/bun:${BUN_VERSION} AS deps
ENV HUSKY=0
WORKDIR /workspace
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
COPY apps/web-novel-server/package.json apps/web-novel-server/package.json
COPY apps/web-novel-web/package.json apps/web-novel-web/package.json
COPY e2e/package.json e2e/package.json
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --filter ./apps/pulse-web --filter ./

FROM deps AS build
COPY scripts/ scripts/
COPY packages/common/ packages/common/
COPY packages/ui/ packages/ui/
COPY packages/web/ packages/web/
RUN bun scripts/build.ts apps/pulse-web --deps
COPY apps/pulse-web/ apps/pulse-web/
RUN bun scripts/build.ts apps/pulse-web

FROM oven/bun:${BUN_VERSION}-slim AS prod-deps
ENV HUSKY=0
WORKDIR /workspace
COPY --from=deps /workspace/package.json /workspace/bun.lock /workspace/tsconfig.base.json ./
COPY --from=deps /workspace/packages packages/
COPY --from=deps /workspace/apps apps/
COPY --from=deps /workspace/e2e e2e/
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --production --ignore-scripts --filter "./apps/pulse-web"
COPY --from=build /workspace/packages/common/dist packages/common/dist
COPY --from=build /workspace/packages/ui/dist packages/ui/dist
COPY --from=build /workspace/packages/web/dist packages/web/dist
COPY --from=build /workspace/apps/pulse-web/dist apps/pulse-web/dist
COPY --from=build /workspace/apps/pulse-web/package.json apps/pulse-web/package.json
COPY --from=build /workspace/apps/pulse-web/serve.ts apps/pulse-web/entry.ts

FROM oven/bun:${BUN_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HEALTH_PORT=3001
WORKDIR /workspace
COPY --from=prod-deps --chown=bun:bun /workspace/node_modules node_modules/
COPY --from=prod-deps --chown=bun:bun /workspace/packages/common packages/common/
COPY --from=prod-deps --chown=bun:bun /workspace/packages/ui packages/ui/
COPY --from=prod-deps --chown=bun:bun /workspace/packages/web packages/web/
COPY --from=prod-deps --chown=bun:bun /workspace/apps/pulse-web apps/pulse-web/
USER bun
WORKDIR /workspace/apps/pulse-web
EXPOSE 3000
CMD ["bun", "run", "entry.ts"]

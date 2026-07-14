# syntax=docker/dockerfile:1
ARG BUN_VERSION=1.3.6

FROM oven/bun:${BUN_VERSION}-slim AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
# Runtime ships prod deps because the SSR bundle externalizes them; --ignore-scripts skips the husky prepare hook.
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:${BUN_VERSION}-slim AS build
WORKDIR /app
# HUSKY=0 no-ops the prepare git-hook install, which would otherwise fail with no .git in the image.
ENV HUSKY=0
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:${BUN_VERSION}-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HEALTH_PORT=3001
# SERVER_URL (identity backend for the SSR server functions) must be supplied at run time.
COPY --from=prod-deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build     --chown=bun:bun /app/dist ./dist
COPY --chown=bun:bun package.json ./
COPY --chown=bun:bun main.ts ./main.ts
USER bun
EXPOSE 3000
CMD ["bun", "main.ts"]

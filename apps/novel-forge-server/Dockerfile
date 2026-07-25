# syntax=docker/dockerfile:1

# ---- Build stage ----------------------------------------------------------
# Compiles the self-contained bundle with `shadow build`; the toolchain stays in this stage only.
# The tag is version-pinned; CI pins the digest at build time via --build-arg BUN_IMAGE=oven/bun@sha256:...
ARG BUN_IMAGE=oven/bun:1.3-slim
FROM ${BUN_IMAGE} AS builder

# Skip husky git-hook setup during install; git is required by `shadow build` to stamp the commit.
ENV HUSKY=0
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Install dependencies first so the layer caches until a manifest changes. The vendored auth SDK is a
# `file:` dependency, so it must be in the build context before install resolves the lockfile.
COPY package.json bun.lock bunfig.toml ./
COPY vendor ./vendor
RUN bun install --frozen-lockfile

# Build the bundles: dist/main.js (server) and dist/migrate.js (migrations), plus the drizzle SQL
# assets under dist/generated/drizzle. safe.directory clears git's dubious-ownership guard for the
# copied tree so `shadow build` can read the commit hash.
COPY . .
RUN git config --global --add safe.directory /app && bun run build

# ---- Runtime stage --------------------------------------------------------
# Runs the prebuilt output; no compiler toolchain or node_modules ship in the image.
FROM ${BUN_IMAGE} AS runtime

# CI passes the release version through `--build-arg APP_VERSION=...`; it defaults to `local` for
# plain local builds and is surfaced to the runtime as APP_VERSION.
ARG APP_VERSION=local
ENV APP_VERSION=${APP_VERSION}
ENV SERVER_PORT=8080
ENV NODE_ENV=production

USER bun
WORKDIR /app

COPY --from=builder --chown=bun:bun /app/dist .

# Server on 8080; migrations run the same image with `migrate.js` (`docker run <image> migrate.js`),
# reusing this bundle's DATABASE_POSTGRES_URL contract.
EXPOSE 8080
ENTRYPOINT ["bun", "run"]
CMD ["main.js"]

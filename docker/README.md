# Building app images

One [`docker/Dockerfile`](./Dockerfile) builds all 8 `apps/*` workspaces. Build context is always
the **repository root** — not the app directory — because every app needs the root manifests,
`packages/*` (built first, dependency-ordered, mirroring CI's `bun run --filter './packages/*'
build`), and its own source. Run every command below from the repo root.

The per-app `apps/*/Dockerfile` files this replaced are gone; there is nothing to `cd` into.

Deployment, image tagging, registry pushes, and rollout are out of scope here — that's the
external devops system's job. This repo's job ends at "produces a deploy-ready image."

## Build commands

Backends (`--target runtime-backend`) carry no `node_modules` — `shadow build` bundles every
entrypoint into a single tree-shaken file. `APP_VERSION` is optional (defaults to `local`); pass
the release version at build time to stamp it into the image.

```sh
docker build -f docker/Dockerfile --target runtime-backend --build-arg APP=identity-server     --build-arg APP_VERSION=$(git rev-parse --short HEAD) -t platform/identity-server:local     .
docker build -f docker/Dockerfile --target runtime-backend --build-arg APP=novel-forge-server   --build-arg APP_VERSION=$(git rev-parse --short HEAD) -t platform/novel-forge-server:local   .
docker build -f docker/Dockerfile --target runtime-backend --build-arg APP=pulse-server         --build-arg APP_VERSION=$(git rev-parse --short HEAD) -t platform/pulse-server:local         .
docker build -f docker/Dockerfile --target runtime-backend --build-arg APP=web-novel-server     --build-arg APP_VERSION=$(git rev-parse --short HEAD) -t platform/web-novel-server:local     .
```

The same backend image runs its other entrypoints by overriding `CMD` — e.g. identity-server's
worker: `docker run platform/identity-server:local worker.js`; any backend's migration runner:
`docker run <image> migrate.js` (pulse-server: `migrate-db.js`).

SSR apps (`--target runtime-ssr`) need a production-only `node_modules` (`ARG SSR_ENTRY` selects
the app's production entry file — `main.ts` for identity-web and web-novel-web, `serve.ts` for
novel-forge-web):

```sh
docker build -f docker/Dockerfile --target runtime-ssr --build-arg APP=identity-web                                             -t platform/identity-web:local     .
docker build -f docker/Dockerfile --target runtime-ssr --build-arg APP=novel-forge-web --build-arg SSR_ENTRY=serve.ts           -t platform/novel-forge-web:local   .
docker build -f docker/Dockerfile --target runtime-ssr --build-arg APP=web-novel-web                                            -t platform/web-novel-web:local     .
```

pulse-web is a static SPA served by its own `serve.ts` (`--target runtime-spa`, no
`node_modules`):

```sh
docker build -f docker/Dockerfile --target runtime-spa --build-arg APP=pulse-web -t platform/pulse-web:local .
```

## Runtime contract

No image bakes in secrets or environment-specific URLs — everything below is supplied at
`docker run` time (`-e ...`), per the platform's `.env.example` files.

| App | Target | Ports (container) | Health check | Required runtime env (non-exhaustive — see the app's `.env.example`) |
| --- | --- | --- | --- | --- |
| identity-server | runtime-backend | 8080 (app), 8081 (health) | `GET :8081/health/live`, `:8081/health/ready` | `DATABASE_POSTGRES_URL`, `DATABASE_REDIS_URL`, `SECURITY_MASTER_ENCRYPTION_KEY` |
| novel-forge-server | runtime-backend | 8080, 8081 | `GET :8081/health/live`, `:8081/health/ready` | `DATABASE_POSTGRES_URL` |
| pulse-server | runtime-backend | 8080, 8081 | `GET :8081/health/live`, `:8081/health/ready` | `DATABASE_POSTGRES_URL` |
| web-novel-server | runtime-backend | 8080, 8081 | `GET :8081/health/live`, `:8081/health/ready`, also `GET :8080/health` | `DATABASE_POSTGRES_URL`, `AUTH_ISSUER`, `AUTH_APP_ID` |
| identity-web | runtime-ssr | 3000 (app), 3001 (health) | `GET :3001/healthz` | `SERVER_URL` (identity-server origin) |
| novel-forge-web | runtime-ssr | 3000, 3001 | `GET :3001/healthz` | `API_ORIGIN` (novel-forge-server origin); ingress must route `/api/auth/*` to novel-forge-server directly |
| web-novel-web | runtime-ssr | 3000, 3001 | `GET :3001/healthz` | `SERVER_URL` (web-novel-server origin); reverse proxy routes `/api` to web-novel-server |
| pulse-web | runtime-spa | 3000, 3001 | `GET :3001/healthz` | none — API is same-origin `/api`, routed to pulse-server by the ingress |

`SERVER_PORT` (backends' framework-level config key) and `PORT` are both set to `8080` in the
image so either naming convention a backend reads resolves the same value — the platform's
backends aren't fully consistent about which one they register (`server.port` → `SERVER_PORT`
env, but `web-novel-server`'s own `.env.example` documents it as `PORT`); setting both is a no-op
for whichever name a given backend doesn't use.

## Judgment calls

- **`.git` itself is not in the build context, but the `git` binary is still installed in
  `deps`.** `shadow build`'s backend bundler stamps `gitCommit` into `dist/package.json` only if
  `git rev-parse HEAD` succeeds, and degrades gracefully (field simply omitted) if that *fails* —
  but `scripts/src/utils/process.ts`'s `run()` re-throws instead of degrading when the `git`
  binary is missing entirely (`spawnSync` ENOENT), which crashed the very first build attempt here
  until `git` was added. So: no `.git` directory (smaller, hermetic context — `gitCommit` is
  omitted from `dist/package.json`), but `git` the binary stays, purely so that "no repo here"
  fails the *expected*, already-handled way. Pass `--build-arg APP_VERSION=<sha>` for release
  traceability instead — every backend already surfaces `APP_VERSION` this way.
- **`apps/*/Dockerfile` deleted, not converted to thin wrappers.** Docker has no "include another
  Dockerfile's stages" primitive; a per-app Dockerfile here would either duplicate the stages
  above (the copy-paste D6 asks to eliminate) or be a non-functional stub. One parameterized
  Dockerfile plus the commands documented above is the actual devops contract.

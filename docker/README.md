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
novel-forge-web and pulse-web):

```sh
docker build -f docker/Dockerfile --target runtime-ssr --build-arg APP=identity-web                                             -t platform/identity-web:local     .
docker build -f docker/Dockerfile --target runtime-ssr --build-arg APP=novel-forge-web --build-arg SSR_ENTRY=serve.ts           -t platform/novel-forge-web:local   .
docker build -f docker/Dockerfile --target runtime-ssr --build-arg APP=pulse-web       --build-arg SSR_ENTRY=serve.ts           -t platform/pulse-web:local         .
docker build -f docker/Dockerfile --target runtime-ssr --build-arg APP=web-novel-web                                            -t platform/web-novel-web:local     .
```

## Runtime contract

No image bakes in secrets or environment-specific URLs — everything below is supplied at
`docker run` time (`-e ...`), per the platform's `.env.example` files.

| App | Target | Ports (container) | Health check | Required runtime env (non-exhaustive — see the app's `.env.example`) |
| --- | --- | --- | --- | --- |
| identity-server | runtime-backend | 8080 (app), 8081 (health) | `GET :8081/health/live`, `:8081/health/ready` | `DATABASE_POSTGRES_URL`, `DATABASE_REDIS_URL`, `SECURITY_MASTER_ENCRYPTION_KEY` |
| novel-forge-server | runtime-backend | 8080, 8081 | `GET :8081/health/live`, `:8081/health/ready` | `DATABASE_POSTGRES_URL`; **hard boot requirement:** `AUTH_APP_ID` + one client credential (`AUTH_CLIENT_SECRET` or `AUTH_CLIENT_ASSERTION_PATH`) + a reachable `AUTH_ISSUER` — the SDK reads this app's registration back from that exact issuer at boot and the process exits in production without all three (`AUTH_APP_ID` is `isProdRequired`; the credential check throws unconditionally) |
| pulse-server | runtime-backend | 8080, 8081 | `GET :8081/health/live`, `:8081/health/ready` | `DATABASE_POSTGRES_URL` |
| web-novel-server | runtime-backend | 8080, 8081 | `GET :8081/health/live`, `:8081/health/ready`, also `GET :8080/health` | `DATABASE_POSTGRES_URL`, `AUTH_ISSUER`, `AUTH_APP_ID` |
| identity-web | runtime-ssr | 3000 (app), 3001 (health) | `GET :3001/healthz` | `SERVER_URL` (identity-server origin) |
| novel-forge-web | runtime-ssr | 3000, 3001 | `GET :3001/healthz` | `API_ORIGIN` (novel-forge-server origin); ingress must route `/api/auth/*` to novel-forge-server directly |
| pulse-web | runtime-ssr | 3000, 3001 | `GET :3001/healthz` | `API_ORIGIN` (pulse-server origin); ingress must route `/api/auth/*` to pulse-server directly |
| web-novel-web | runtime-ssr | 3000, 3001 | `GET :3001/healthz` | `SERVER_URL` (web-novel-server origin); reverse proxy routes `/api` to web-novel-server |

The platform's backends bind their main port through two different, mutually exclusive config
keys, and no backend reads a bare `PORT` at all (that env var is dead weight — some `.env.example`
files label it `PORT` in a comment, but the code registers `server.port`, not `PORT`, as the
actual key). `runtime-backend` sets both families so whichever one a given app reads resolves to
`8080`:

- `identity-server`, `novel-forge-server`, `web-novel-server` each register their own `server.host`
  / `server.port` (bootstrap.ts) and pass them into `FastifyModule.forRoot()` explicitly — env
  `SERVER_PORT` (`SERVER_HOST` isn't set; their own default is already `0.0.0.0`).
- `pulse-server` never overrides host/port, so it falls through to `@shadow-library/fastify`'s own
  `app.host` / `app.port` default — env `APP_HOST` / `APP_PORT`. `app.host` defaults to
  `'localhost'`, which resolved to the IPv6 loopback only, inside the container, in the
  environment this was verified in — unreachable through Docker's published port even though the
  process and its health checks were fine. `APP_HOST=0.0.0.0` fixes that; it and `APP_PORT` are
  no-ops for the other three backends, which never read either key.

`novel-forge-server`'s default local image storage (`STORAGE_LOCAL_DIR`, default `./images`,
i.e. `/app/images`) writes into the container's own filesystem at runtime — that's ephemeral (lost
whenever the container is replaced), not a permissions problem (`/app` is `bun`-owned in this
image, confirmed writable). Mount a volume at `/app/images` (or point `STORAGE_LOCAL_DIR`
elsewhere) for anything that needs to survive a restart.

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

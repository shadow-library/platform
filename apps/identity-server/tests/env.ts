/** Disable shared-IP rate limits that would couple otherwise unrelated specs. */
process.env.RATE_LIMIT_ENABLED ??= 'false';

process.env.AUTH_WORKLOAD_ISSUER ??= 'http://127.0.0.1:45123';
process.env.AUTH_WORKLOAD_JWKS_URI ??= 'http://127.0.0.1:45123/jwks';

/** Mock webhook receivers and upstream IdPs live on loopback/non-resolving hosts, so the SSRF guard runs in dev mode by default; the strict-path specs re-enable it per test. */
process.env.WEBHOOKS_ALLOW_INSECURE_TARGETS ??= 'true';

/** CI exercises audit-chain serialization with one connection; a wider pool changes that concurrency profile. */
process.env.DATABASE_POSTGRES_MAX_CONNECTIONS ??= '1';

/** Keep destructive test flushes isolated from the developer's default Redis database. */
process.env.DATABASE_REDIS_URL ??= 'redis://localhost:7080/15';

/**
 * Bun loads `.env`/`.env.test` into `process.env` before this preload ever runs, so a `??=` here
 * would be a no-op whenever a local `.env` already set the key — and `.env.example` ships
 * `APP_STAGE=dev`, which every local checkout is instructed to copy. Hard-assign instead: this
 * suite must deterministically be a production deployment (workload-identity-only ecosystem
 * clients, no bootstrap secret fallback) regardless of what a developer's own `.env` contains.
 * `apps/pulse-server/tests/env.ts` hard-pins the opposite value for the same reason.
 */
process.env.APP_STAGE = 'prod';

/**
 * A production deployment (see above) fails fast on an empty bootstrap admin password.
 * `tests/setup.ts` spawns the template-creation script, which runs this workspace's real bootstrap,
 * before any test runs — an unset password there would fail the whole suite, not just one spec.
 * `.env.example` ships this key present but empty, and Bun's own `.env` loading (see above) means an
 * empty string already sits in `process.env` before this file runs — `??=` treats that as "already
 * set" and never applies, so `||=` is required to treat an empty value as unset too.
 */
process.env.AUTH_BOOTSTRAP_ADMIN_PASSWORD ||= 'Test-Ci-Bootstrap-Admin-9!';

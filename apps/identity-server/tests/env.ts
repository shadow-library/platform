/**
 * Preloaded before any application module so these land before `bootstrap.ts` resolves config. The
 * authoritative pin for these keys is `.env.test` (Bun loads it ahead of `.env`, see the comment
 * there) — it shields the suite from a developer's local `.env` entirely. These `??=` guards are a
 * second line of defense only, for the case `.env.test` is missing (e.g. a fresh clone before it's
 * been recreated): they pin every load-bearing value the suite needs, so a fresh clone runs green
 * with no `.env.test` — what they cannot do is BEAT a conflicting `.env` (dotenv values are already
 * defined by the time `??=` runs), which is exactly the shielding `.env.test` adds.
 *
 * Rate limiting defaults off for the suite — budgets like `register/init: 5/h` would trip on the
 * shared inject IP across unrelated tests. The dedicated rate-limit spec re-enables it at runtime
 * through `RateLimiterService.enabled`.
 */
process.env.RATE_LIMIT_ENABLED ??= 'false';

/**
 * Workload identity (D-16): the suite trusts a mock in-process "cluster" OIDC issuer on a fixed
 * port; the workload-identity spec starts its JWKS server there and signs SA tokens against it.
 */
process.env.AUTH_WORKLOAD_ISSUER ??= 'http://127.0.0.1:45123';
process.env.AUTH_WORKLOAD_JWKS_URI ??= 'http://127.0.0.1:45123/jwks';

/**
 * One connection per pool: `TestEnvironment` boots one application (one pool) per spec file, and
 * the audit hash-chain's serialisation guarantee is exercised under a single-connection pool the
 * same way CI pins it. A wider pool both leaks headroom across ~58 spec files and changes the
 * concurrency profile the chain spec asserts on.
 */
process.env.DATABASE_POSTGRES_MAX_CONNECTIONS ??= '1';

/**
 * Dedicated logical Redis DB for the suite: keeps test keys out of a developer's default DB 0 and
 * makes the start-of-run flush in `tests/setup.ts` safe — flushing DB 15 must never touch real
 * local state, and the suite must never inherit stale keys from DB 0.
 */
process.env.DATABASE_REDIS_URL ??= 'redis://localhost:6379/15';

/** Disable shared-IP rate limits that would couple otherwise unrelated specs. */
process.env.RATE_LIMIT_ENABLED ??= 'false';

process.env.AUTH_WORKLOAD_ISSUER ??= 'http://127.0.0.1:45123';
process.env.AUTH_WORKLOAD_JWKS_URI ??= 'http://127.0.0.1:45123/jwks';

/** CI exercises audit-chain serialization with one connection; a wider pool changes that concurrency profile. */
process.env.DATABASE_POSTGRES_MAX_CONNECTIONS ??= '1';

/** Keep destructive test flushes isolated from the developer's default Redis database. */
process.env.DATABASE_REDIS_URL ??= 'redis://localhost:6379/15';

/**
 * Preloaded before any application module so these land before `bootstrap.ts` resolves config.
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

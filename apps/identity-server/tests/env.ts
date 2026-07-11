/**
 * Preloaded before any application module so these land before `bootstrap.ts` resolves config.
 * Rate limiting defaults off for the suite — budgets like `register/init: 5/h` would trip on the
 * shared inject IP across unrelated tests. The dedicated rate-limit spec re-enables it at runtime
 * through `RateLimiterService.enabled`.
 */
process.env.RATE_LIMIT_ENABLED ??= 'false';

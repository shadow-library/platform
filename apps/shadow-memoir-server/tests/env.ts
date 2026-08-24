/**
 * Preloaded before any application module so these land before `bootstrap.ts` resolves. The suite
 * needs the private health server bound to a fixed, non-default port (it's disabled by default outside
 * `NODE_ENV=production`) and an explicit dev stage to exercise the OpenAPI-in-dev acceptance path.
 *
 * `Bun.serve()` on an already-bound port doesn't throw — the first listener silently answers every
 * request — so a hardcoded port makes concurrent suites in different git worktrees cross-talk and
 * produce false failures. The port is derived from `process.cwd()` so each checkout gets its own,
 * unless `HEALTH_PORT` is already set (e.g. by CI) in which case that value wins.
 */
process.env.NODE_ENV = 'development';
process.env.HEALTH_ENABLED = 'true';
process.env.HEALTH_HOST = 'localhost';

if (!process.env.HEALTH_PORT) {
  let hash = 0;
  for (const char of process.cwd()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  process.env.HEALTH_PORT = String(18081 + (hash % 500));
}

export const HEALTH_PORT = process.env.HEALTH_PORT;

/** `AUTH_ISSUER` is set by `tests/setup.ts` (preloaded after this file) once the mock IdP's ephemeral port is known. */
process.env.AUTH_APP_ID = 'shadow-memoir';
process.env.AUTH_CLIENT_SECRET = 'shadow-memoir-test-secret';

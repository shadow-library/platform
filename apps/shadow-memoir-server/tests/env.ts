/**
 * Preloaded before any application module so these land before `bootstrap.ts` resolves. The suite
 * needs the private health server bound to a fixed, non-default port (it's disabled by default outside
 * `NODE_ENV=production`) and an explicit dev stage to exercise the OpenAPI-in-dev acceptance path.
 */
process.env.NODE_ENV = 'development';
process.env.HEALTH_ENABLED = 'true';
process.env.HEALTH_HOST = 'localhost';
process.env.HEALTH_PORT = '18081';

/** `AUTH_ISSUER` is set by `tests/setup.ts` (preloaded after this file) once the mock IdP's ephemeral port is known. */
process.env.AUTH_APP_ID = 'shadow-memoir';
process.env.AUTH_CLIENT_SECRET = 'shadow-memoir-test-secret';

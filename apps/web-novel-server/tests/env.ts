/**
 * Preloaded before any application module so these land before `bootstrap.ts` and the auth SDK's
 * config module resolve. Plain assignment (not `??=`) deliberately overrides the committed `.env`
 * dev defaults — the suite must never talk to a real identity deployment.
 *
 * Steady-state auth config is just this application's id at identity and one credential; audience,
 * redirect URIs and scopes are derived from the mock IdP's `GET /api/v1/apps/me` (see `test-idp.ts`,
 * which also points `AUTH_ISSUER` at the mock once its ephemeral port is known).
 */
process.env.AUTH_APP_ID = 'web-novel';
process.env.AUTH_CLIENT_SECRET = 'web-novel-test-secret';

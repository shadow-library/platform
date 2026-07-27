/**
 * Preloaded before any application module so these land before `bootstrap.ts` and the auth SDK's
 * config module resolve. Plain assignment (not `??=`) deliberately overrides the committed `.env`
 * dev defaults — the suite must never talk to a real identity deployment.
 */
process.env.AUTH_AUDIENCE = 'webnovel-server';
process.env.AUTH_CLIENT_ID = 'webnovel-server';
process.env.AUTH_CLIENT_SECRET = 'webnovel-test-secret';
process.env.SESSION_CLIENT_ID = 'webnovel-web';
process.env.SESSION_CLIENT_SECRET = 'webnovel-web-test-secret';
process.env.SESSION_REDIRECT_URI = 'http://localhost:8080/api/auth/callback';
process.env.SESSION_SECRET = 'webnovel-test-session-secret';

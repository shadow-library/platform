/** Per-IP baseline request budget. */
export const IP_GENERAL_BUCKET = 'ip-general';
export const GENERAL_LIMIT = 100;
export const GENERAL_WINDOW_SECONDS = 60;

/**
 * Per-client M2M budgets, which replace the IP budget once the caller is authenticated. Each route class has its own bucket, so a
 * burst of permission checks (a cold PDP cache after a deploy) cannot spend the budget that client's sign-ins need. Limits are config.
 */
export type M2MBudgetClass = 'session' | 'authz';
export const M2M_CLIENT_BUCKETS: Readonly<Record<M2MBudgetClass, string>> = { session: 'm2m-client', authz: 'm2m-client-authz' };
export const M2M_CLIENT_DEFAULT_LIMITS: Readonly<Record<M2MBudgetClass, number>> = { session: 600, authz: 1200 };
export const M2M_CLIENT_WINDOW_SECONDS = 60;

/** Per-(client, user) userinfo budget: a user token can spend only its own user's share, never the client's M2M budget nor its caller's pod address. */
export const USERINFO_SUBJECT_BUCKET = 'userinfo-subject';
export const USERINFO_SUBJECT_DEFAULT_LIMIT = 60;
export const USERINFO_SUBJECT_WINDOW_SECONDS = 60;

/** Per-(public client, source ip) budget for `/oauth2/token` grants — a public client's `client_id` is not a credential, so an unauthenticated flood must spend this budget, not the shared per-client one it would otherwise deny to that client's other callers. */
export const OAUTH_PUBLIC_CLIENT_BUCKET = 'oauth-public-client';
export const OAUTH_PUBLIC_CLIENT_LIMIT = 30;
export const OAUTH_PUBLIC_CLIENT_WINDOW_SECONDS = 60;

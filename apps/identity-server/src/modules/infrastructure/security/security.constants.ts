/** Per-IP baseline request budget. */
export const IP_GENERAL_BUCKET = 'ip-general';
export const GENERAL_LIMIT = 100;
export const GENERAL_WINDOW_SECONDS = 60;

/** Per-client M2M budget, which replaces the IP budget once the caller is authenticated. */
export const M2M_CLIENT_BUCKET = 'm2m-client';
export const M2M_CLIENT_LIMIT = 600;
export const M2M_CLIENT_WINDOW_SECONDS = 60;

/** Per-(public client, source ip) budget for `/oauth2/token` grants — a public client's `client_id` is not a credential, so an unauthenticated flood must spend this budget, not the shared per-client one it would otherwise deny to that client's other callers. */
export const OAUTH_PUBLIC_CLIENT_BUCKET = 'oauth-public-client';
export const OAUTH_PUBLIC_CLIENT_LIMIT = 30;
export const OAUTH_PUBLIC_CLIENT_WINDOW_SECONDS = 60;

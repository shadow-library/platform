export const APP_NAME = 'shadow-identity';

/** OIDC protocol scopes are always available; resource-server scopes must be registered and granted. */
export const OIDC_PROTOCOL_SCOPES = new Set(['openid', 'profile', 'email', 'offline_access', 'address', 'phone']);

/** The protocol scope that releases standard profile claims from `userinfo`. */
export const OIDC_PROFILE_SCOPE = 'profile';

/**
 * Idle lifetime of a per-entity cache version key, refreshed by every bump and every read. Grant sets and PDP decisions are re-cached under
 * the current version only when that version is read, so a key lapses only after nothing has consulted it for this long, when no cache
 * entry (grant sets live five minutes, SDK decisions fifteen by default) can still be keyed on it.
 */
export const CACHE_VERSION_TTL_SECONDS = 30 * 24 * 60 * 60;

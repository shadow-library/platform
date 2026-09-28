export const APP_NAME = 'shadow-identity';

/** OIDC protocol scopes are always available; resource-server scopes must be registered and granted. */
export const OIDC_PROTOCOL_SCOPES = new Set(['openid', 'profile', 'email', 'offline_access', 'address', 'phone']);

/** The protocol scope that releases standard profile claims from `userinfo`. */
export const OIDC_PROFILE_SCOPE = 'profile';

/**
 * Lifetime of a per-entity cache version key, refreshed on every bump. It must outlive anything cached under an older version (grant
 * sets for five minutes, SDK decisions for fifteen by default), so a key that lapses and restarts at zero can never revive a stale entry;
 * the SDK keeps the highest version it saw and simply stops caching that principal's older-numbered answers until it restarts.
 */
export const CACHE_VERSION_TTL_SECONDS = 30 * 24 * 60 * 60;

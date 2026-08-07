export const APP_NAME = 'shadow-identity';

/** OIDC protocol scopes are always available; resource-server scopes must be registered and granted. */
export const OIDC_PROTOCOL_SCOPES = new Set(['openid', 'profile', 'email', 'offline_access', 'address', 'phone']);

/** The protocol scope that releases standard profile claims from `userinfo`. */
export const OIDC_PROFILE_SCOPE = 'profile';

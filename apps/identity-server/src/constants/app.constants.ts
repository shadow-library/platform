/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const APP_NAME = 'shadow-identity';

/**
 * OIDC protocol scopes are never resource-server capabilities: they are always honoured for any
 * client without an explicit grant. Every other requested scope must be registered AND granted to
 * the client, so a client can never mint a token carrying a scope it was not authorised for.
 *
 * They own no `scopes` row and never will — a row belongs to an API resource, and these belong to
 * the protocol. That is exactly why they live here rather than in the database, and why the token
 * paths and discovery all have to read them from one place instead of restating the list.
 */
export const OIDC_PROTOCOL_SCOPES = new Set(['openid', 'profile', 'email', 'offline_access', 'address', 'phone']);

/** The claims each protocol scope releases from `userinfo`, per OIDC Core §5.4. */
export const OIDC_PROFILE_SCOPE = 'profile';

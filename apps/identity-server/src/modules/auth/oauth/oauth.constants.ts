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

/**
 * The audience a token carries when a request names no `resource`: identity's own API. Every place
 * that resolves an audience must agree on this, or a token minted for the default would fail the
 * audience check of a grant recorded against it.
 */
export const DEFAULT_AUDIENCE = 'shadow-identity';

/** RFC 8693 grant and token-type identifiers for delegated user context across applications (D-22). */
export const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
export const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

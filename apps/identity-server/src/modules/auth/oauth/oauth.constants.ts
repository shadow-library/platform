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

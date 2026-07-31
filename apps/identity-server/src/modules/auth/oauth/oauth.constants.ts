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

/**
 * An application exposes exactly one API resource and its identifier is derived, never configured
 * (D-21) — so a registration cannot drift from what its consumers were told to ask for.
 *
 * Identity's own platform API keeps the bare `shadow-identity` identifier: it is not an application
 * onboarding onto the platform but the platform itself, and every service token, guard and SDK
 * already names it. Renaming it would buy symmetry at the cost of reconfiguring every consumer.
 */
export const applicationAudience = (application: string): string => `api://${application}`;

/** The callback path every first-party relying party serves, derived from the application's origins. */
export const OAUTH_CALLBACK_PATH = '/api/auth/callback';

/** RFC 8693 grant and token-type identifiers for delegated user context across applications (D-22). */
export const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
export const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

/**
 * Importing packages with side effects
 */

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

/** Stateless signed reader-session cookie; identity owns the accounts, this app owns nothing but the cookie */
export const SESSION_COOKIE_NAME = 'wn_session';

/** Short-lived cookie carrying the in-flight OIDC login transaction (state, nonce, PKCE verifier) */
export const LOGIN_COOKIE_NAME = 'wn_login';

/** The login transaction must complete within this window */
export const LOGIN_TRANSACTION_TTL_S = 600;

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
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Absolute session lifetime, fixed at creation (D-10). */
export const SESSION_ABSOLUTE_TTL_MS = 180 * DAY;
/** Idle lifetime; a session unused for this long is expired even before its absolute deadline. */
export const SESSION_IDLE_TTL_MS = 30 * DAY;
/** `last_used_at` is refreshed at most this often to avoid a write on every request. */
export const SESSION_TOUCH_THROTTLE_MS = 5 * MINUTE;
/** Step-up elevation window for sensitive operations. */
export const SESSION_ELEVATION_TTL_MS = 10 * MINUTE;
/** Redis validation cache TTL; revocation invalidates entries explicitly for immediate effect. */
export const SESSION_CACHE_TTL_S = 60;

export const SESSION_COOKIE_NAME = '__Host-sid';
export const LOGGED_IN_COOKIE_NAME = 'isLoggedIn';

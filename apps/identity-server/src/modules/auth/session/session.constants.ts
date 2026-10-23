const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export const SESSION_ABSOLUTE_TTL_MS = 180 * DAY;
export const SESSION_IDLE_TTL_MS = 30 * DAY;
export const SESSION_TOUCH_THROTTLE_MS = 5 * MINUTE;
export const SESSION_ELEVATION_TTL_MS = 10 * MINUTE;
/** Validation-cache lifetime in seconds; revocation explicitly invalidates cached entries. */
export const SESSION_CACHE_TTL_S = 60;

export const SESSION_COOKIE_NAME = '__Host-sid';
export const LOGGED_IN_COOKIE_NAME = 'isLoggedIn';

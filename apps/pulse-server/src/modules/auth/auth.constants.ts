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
 * Where `@shadow-library/auth`'s first-party browser flow is mounted. Pulse pins it to the
 * unversioned `/api/auth/*` contract pulse-web is coded against, and the same value teaches the
 * default-deny `RouteGuardSentinel` which routes the SDK owns end-to-end (login, callback, logout,
 * session, step-up) — those carry no auth decorator yet are intentional public entry points.
 */
export const AUTH_ROUTES_BASE_PATH = '/api/auth';

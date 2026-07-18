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

/** Injection token under which `AuthModule.forRoot` provides the configured SDK auth client */
export const AUTH_CLIENT: unique symbol = Symbol('pulse:auth-client');

/** Route metadata key the auth decorators write and the guard middleware reads */
export const AUTH_ROUTE_METADATA = 'pulseAuth';

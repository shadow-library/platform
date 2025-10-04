/**
 * Importing npm packages
 */
import { Route } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

declare module '@shadow-library/app' {
  export interface RouteMetadata {
    authGuard?: AuthGuardOptions;
  }
}

export interface AuthGuardOptions {
  accessLevel: number;
}

/**
 * Declaring the constants
 */

export function AuthGuard(options: AuthGuardOptions) {
  return Route({ authGuard: options });
}

/**
 * Importing npm packages
 */
import { Handler } from '@shadow-library/app';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

declare module '@shadow-library/app' {
  export interface HandlerMetadata {
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
  return Handler({ authGuard: options });
}

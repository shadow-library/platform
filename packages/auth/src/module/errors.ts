/**
 * Importing npm packages
 */
import { ServerErrorCode } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class AuthGuardErrorCode extends ServerErrorCode {
  /** No valid bearer token accompanied the request */
  static readonly IAM_001 = AuthGuardErrorCode.unauthenticated('IAM_001', 'Authentication required');

  /** The authenticated principal may not perform this operation */
  static readonly IAM_002 = AuthGuardErrorCode.forbidden('IAM_002', 'Permission denied');

  /**
   * The route needs an elevated (AAL2) principal and this one is not elevated. Deliberately distinct
   * from `IAM_002`: unlike every other denial, this one is actionable — the caller is told to step up
   * rather than left guessing, which is what lets a non-browser client drive the cycle itself.
   */
  static readonly IAM_003 = AuthGuardErrorCode.forbidden('IAM_003', 'Step-up authentication required');
}

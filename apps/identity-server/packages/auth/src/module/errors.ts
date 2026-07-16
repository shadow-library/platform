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
}

/**
 * Importing npm packages
 */
import { ErrorType } from '@shadow-library/common';
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
  static readonly IAM_001 = new AuthGuardErrorCode('IAM_001', ErrorType.UNAUTHENTICATED, 'Authentication required');

  /** The authenticated principal may not perform this operation */
  static readonly IAM_002 = new AuthGuardErrorCode('IAM_002', ErrorType.UNAUTHORIZED, 'Permission denied');
}

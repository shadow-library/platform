/**
 * Importing npm packages
 */
import { ErrorCode } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The generic http error catalog. Keys create and throw `AppError`s directly (`ServerErrorCode.S002.throw()`);
 * consuming apps extend `ErrorCode` for their own catalogs.
 */

export class ServerErrorCode extends ErrorCode {
  /*!
   * List of all server related errors
   */

  /** An unexpected server error occurred while processing the request */
  static readonly S001 = new ServerErrorCode('S001', 'An unexpected server error occurred while processing the request');
  /** The requested endpoint does not exist */
  static readonly S002 = ServerErrorCode.notFound('S002', 'The requested endpoint does not exist');
  /** The provided input data is invalid or does not meet validation requirements */
  static readonly S003 = ServerErrorCode.validation('S003', 'The provided input data is invalid or does not meet validation requirements');
  /** Authentication credentials are required to access this resource */
  static readonly S004 = ServerErrorCode.unauthenticated('S004', 'Authentication credentials are required to access this resource');
  /** Access denied due to insufficient permissions to perform this operation */
  static readonly S005 = ServerErrorCode.forbidden('S005', 'Access denied due to insufficient permissions to perform this operation');
  /** The request is malformed or contains invalid parameters */
  static readonly S006 = ServerErrorCode.badRequest('S006', 'The request is malformed or contains invalid parameters');
  /** Rate limit exceeded due to too many requests sent in a given time frame */
  static readonly S007 = ServerErrorCode.badRequest('S007', 'Rate limit exceeded due to too many requests sent in a given time frame', 429);
  /** Resource conflict as the requested operation conflicts with existing data */
  static readonly S008 = ServerErrorCode.conflict('S008', 'Resource conflict as the requested operation conflicts with existing data');
  /** The requested resource could not be found */
  static readonly S009 = ServerErrorCode.notFound('S009', 'The requested resource could not be found');
  /** Access blocked due to security policy restrictions */
  static readonly S010 = ServerErrorCode.forbidden('S010', 'Access blocked due to security policy restrictions');
}

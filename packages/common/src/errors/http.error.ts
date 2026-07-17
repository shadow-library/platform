/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { ErrorCode } from './error-code.error';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The generic HTTP error catalog, owned by the framework-agnostic core so any transport (Fastify,
 * edge handlers, RPC gateways) can throw the same well-known responses. Consuming frameworks extend
 * or re-export this instead of declaring their own copy; apps extend `ErrorCode` for their catalogs.
 */

export class HttpErrorCode extends ErrorCode {
  /*!
   * List of all generic HTTP errors
   */

  /** An unexpected server error occurred while processing the request */
  static readonly S001 = new HttpErrorCode('S001', 'An unexpected server error occurred while processing the request');
  /** The requested endpoint does not exist */
  static readonly S002 = HttpErrorCode.notFound('S002', 'The requested endpoint does not exist');
  /** The provided input data is invalid or does not meet validation requirements */
  static readonly S003 = HttpErrorCode.validation('S003', 'The provided input data is invalid or does not meet validation requirements');
  /** Authentication credentials are required to access this resource */
  static readonly S004 = HttpErrorCode.unauthenticated('S004', 'Authentication credentials are required to access this resource');
  /** Access denied due to insufficient permissions to perform this operation */
  static readonly S005 = HttpErrorCode.forbidden('S005', 'Access denied due to insufficient permissions to perform this operation');
  /** The request is malformed or contains invalid parameters */
  static readonly S006 = HttpErrorCode.badRequest('S006', 'The request is malformed or contains invalid parameters');
  /** Rate limit exceeded due to too many requests sent in a given time frame */
  static readonly S007 = HttpErrorCode.badRequest('S007', 'Rate limit exceeded due to too many requests sent in a given time frame', 429);
  /** Resource conflict as the requested operation conflicts with existing data */
  static readonly S008 = HttpErrorCode.conflict('S008', 'Resource conflict as the requested operation conflicts with existing data');
  /** The requested resource could not be found */
  static readonly S009 = HttpErrorCode.notFound('S009', 'The requested resource could not be found');
  /** Access blocked due to security policy restrictions */
  static readonly S010 = HttpErrorCode.forbidden('S010', 'Access blocked due to security policy restrictions');
}

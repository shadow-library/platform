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

export class AppErrorCode extends ServerErrorCode {
  /**
   * Application Error Codes
   */

  /** Application not found */
  static readonly APP_001 = new AppErrorCode('APP_001', ErrorType.NOT_FOUND, 'Application not found');
  /** Application already exists */
  static readonly APP_002 = new AppErrorCode('APP_002', ErrorType.CONFLICT, 'Application already exists');
  /** Application role not found */
  static readonly APP_003 = new AppErrorCode('APP_003', ErrorType.NOT_FOUND, 'Application role not found');

  /**
   * User Error Codes
   */

  /** User not found */
  static readonly USR_001 = new AppErrorCode('USR_001', ErrorType.NOT_FOUND, 'User not found');
  /** Username already exists */
  static readonly USR_002 = new AppErrorCode('USR_002', ErrorType.CONFLICT, 'Username already exists');
  /** Email already exists */
  static readonly USR_003 = new AppErrorCode('USR_003', ErrorType.CONFLICT, 'Email already exists');
  /** Phone number already exists */
  static readonly USR_004 = new AppErrorCode('USR_004', ErrorType.CONFLICT, 'Phone number already exists');

  /**
   * Authentication Flow Error Codes
   */

  /** The authentication flow does not exist or has expired */
  static readonly AUTH_001 = new AppErrorCode('AUTH_001', ErrorType.NOT_FOUND, 'Authentication flow not found or expired', 410);
  /** The requested step does not match the current flow state */
  static readonly AUTH_002 = new AppErrorCode('AUTH_002', ErrorType.CONFLICT, 'Invalid flow state for this operation');
  /** The submitted credential or code is invalid */
  static readonly AUTH_003 = new AppErrorCode('AUTH_003', ErrorType.UNAUTHENTICATED, 'Invalid credentials');
  /** The flow was terminated after too many failed attempts */
  static readonly AUTH_004 = new AppErrorCode('AUTH_004', ErrorType.NOT_FOUND, 'Authentication flow terminated', 410);

  /**
   * Organisation Error Codes
   */

  /** The principal is not a member of the organisation */
  static readonly ORG_001 = new AppErrorCode('ORG_001', ErrorType.UNAUTHORIZED, 'Not a member of this organisation');
  /** The organisation does not exist */
  static readonly ORG_002 = new AppErrorCode('ORG_002', ErrorType.NOT_FOUND, 'Organisation not found');

  /**
   * OAuth / OIDC Error Codes (mapped to RFC 6749 error identifiers)
   */

  /** invalid_request — a required parameter is missing or malformed */
  static readonly OAU_001 = new AppErrorCode('invalid_request', ErrorType.CLIENT_ERROR, 'The request is missing a required parameter or is malformed', 400);
  /** invalid_client — client authentication failed */
  static readonly OAU_002 = new AppErrorCode('invalid_client', ErrorType.UNAUTHENTICATED, 'Client authentication failed', 401);
  /** invalid_grant — the grant or credential is invalid, expired, or revoked */
  static readonly OAU_003 = new AppErrorCode('invalid_grant', ErrorType.CLIENT_ERROR, 'The authorization grant is invalid, expired, or revoked', 400);
  /** unsupported_grant_type / invalid_scope */
  static readonly OAU_004 = new AppErrorCode('invalid_scope', ErrorType.CLIENT_ERROR, 'The requested scope or grant is invalid', 400);
}

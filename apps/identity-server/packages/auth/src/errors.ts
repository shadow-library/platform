/**
 * Importing npm packages
 */
import { AppError, ErrorCode, ErrorType } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export class AuthErrorCode extends ErrorCode {
  /*!
   * Configuration Errors
   */

  /** The auth client configuration is invalid */
  static readonly CONFIG_INVALID = new AuthErrorCode('CONFIG_INVALID', ErrorType.INTERNAL_ERROR, 'Auth client configuration is invalid');

  /*!
   * Token Verification Errors
   */

  /** The token algorithm is not in the allow-list */
  static readonly ALG_REJECTED = new AuthErrorCode('ALG_REJECTED', ErrorType.UNAUTHENTICATED, 'Token algorithm is not allowed');
  /** The token is not addressed to this audience */
  static readonly AUDIENCE_MISMATCH = new AuthErrorCode('AUDIENCE_MISMATCH', ErrorType.UNAUTHENTICATED, 'Token is not addressed to this audience');
  /** The token was issued by an untrusted issuer */
  static readonly ISSUER_MISMATCH = new AuthErrorCode('ISSUER_MISMATCH', ErrorType.UNAUTHENTICATED, 'Token issuer is not trusted');
  /** No published JWKS key matches the token's kid */
  static readonly KEY_UNKNOWN = new AuthErrorCode('KEY_UNKNOWN', ErrorType.UNAUTHENTICATED, 'No published key matches the token');
  /** The token nonce does not match the expected nonce */
  static readonly NONCE_MISMATCH = new AuthErrorCode('NONCE_MISMATCH', ErrorType.UNAUTHENTICATED, 'Token nonce does not match the expected nonce');
  /** The token has expired */
  static readonly TOKEN_EXPIRED = new AuthErrorCode('TOKEN_EXPIRED', ErrorType.UNAUTHENTICATED, 'Token has expired');
  /** The token is malformed or its signature does not verify */
  static readonly TOKEN_INVALID = new AuthErrorCode('TOKEN_INVALID', ErrorType.UNAUTHENTICATED, 'Token is invalid');

  /*!
   * OIDC Relying-Party Errors
   */

  /** OIDC discovery failed or answered with an inconsistent document */
  static readonly DISCOVERY_FAILED = new AuthErrorCode('DISCOVERY_FAILED', ErrorType.IO_ERROR, 'OIDC discovery failed');
  /** The authorization-code exchange failed */
  static readonly EXCHANGE_FAILED = new AuthErrorCode('EXCHANGE_FAILED', ErrorType.IO_ERROR, 'Authorization code exchange failed');
  /** The token introspection request failed */
  static readonly INTROSPECTION_FAILED = new AuthErrorCode('INTROSPECTION_FAILED', ErrorType.IO_ERROR, 'Token introspection failed');

  /*!
   * Machine-to-Machine Errors
   */

  /** The policy decision point is unreachable or answered malformed */
  static readonly PDP_UNAVAILABLE = new AuthErrorCode('PDP_UNAVAILABLE', ErrorType.IO_ERROR, 'Policy decision point is unavailable');
  /** The role-catalog sync was rejected or unreachable */
  static readonly ROLE_SYNC_FAILED = new AuthErrorCode('ROLE_SYNC_FAILED', ErrorType.IO_ERROR, 'Role catalog sync failed');
  /** The service-access rules could not be loaded at startup */
  static readonly SERVICE_ACCESS_FAILED = new AuthErrorCode('SERVICE_ACCESS_FAILED', ErrorType.IO_ERROR, 'Service access rules could not be loaded');
  /** The service name is invalid or cannot be resolved */
  static readonly SERVICE_UNKNOWN = new AuthErrorCode('SERVICE_UNKNOWN', ErrorType.NOT_FOUND, 'Unknown service');
  /** The client-credentials token request failed */
  static readonly TOKEN_REQUEST_FAILED = new AuthErrorCode('TOKEN_REQUEST_FAILED', ErrorType.IO_ERROR, 'Token request failed');
}

export class AuthError extends AppError<AuthErrorCode> {
  constructor(code: AuthErrorCode, message?: string) {
    super(code);
    if (message) this.message = message;
  }

  /** The machine code, e.g. `'TOKEN_EXPIRED'` */
  get code(): string {
    return this.getCode();
  }

  static is(error: unknown, code?: AuthErrorCode): error is AuthError {
    return error instanceof AuthError && (code === undefined || error.getCode() === code.getCode());
  }
}

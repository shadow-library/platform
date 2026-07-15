/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type AuthErrorCode =
  | 'ALG_REJECTED'
  | 'AUDIENCE_MISMATCH'
  | 'CONFIG_INVALID'
  | 'DISCOVERY_FAILED'
  | 'EXCHANGE_FAILED'
  | 'INTROSPECTION_FAILED'
  | 'ISSUER_MISMATCH'
  | 'KEY_UNKNOWN'
  | 'NONCE_MISMATCH'
  | 'PDP_UNAVAILABLE'
  | 'ROLE_SYNC_FAILED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'TOKEN_REQUEST_FAILED';

/**
 * Declaring the constants
 */

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuthError';
  }

  static is(error: unknown, code?: AuthErrorCode): error is AuthError {
    return error instanceof AuthError && (code === undefined || error.code === code);
  }
}

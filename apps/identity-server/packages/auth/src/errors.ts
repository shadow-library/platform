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
 * The SDK error catalog: keys create and throw `AppError`s directly. Call-site context travels in
 * the `data` payload (e.g. `{ reason }`), keeping the catalog message stable while structured
 * detail flows into logs. Transient transport failures use `unavailable` (retryable, 503); broken
 * configuration uses `internal` (a defect — masked outside logs).
 */

export class AuthErrorCode extends ErrorCode {
  /*!
   * Configuration Errors
   */

  /** The auth client configuration is invalid */
  static readonly CONFIG_INVALID = AuthErrorCode.internal('CONFIG_INVALID', 'Auth client configuration is invalid: {reason}');

  /*!
   * Token Verification Errors
   */

  /** The token algorithm is not in the allow-list */
  static readonly ALG_REJECTED = AuthErrorCode.unauthenticated('ALG_REJECTED', 'Token algorithm is not allowed');
  /** The token is not addressed to this audience */
  static readonly AUDIENCE_MISMATCH = AuthErrorCode.unauthenticated('AUDIENCE_MISMATCH', 'Token is not addressed to this audience');
  /** The token was issued by an untrusted issuer */
  static readonly ISSUER_MISMATCH = AuthErrorCode.unauthenticated('ISSUER_MISMATCH', 'Token issuer is not trusted');
  /** No published JWKS key matches the token's kid */
  static readonly KEY_UNKNOWN = AuthErrorCode.unauthenticated('KEY_UNKNOWN', 'No published key matches the token');
  /** The token nonce does not match the expected nonce */
  static readonly NONCE_MISMATCH = AuthErrorCode.unauthenticated('NONCE_MISMATCH', 'Token nonce does not match the expected nonce');
  /** The token has expired */
  static readonly TOKEN_EXPIRED = AuthErrorCode.unauthenticated('TOKEN_EXPIRED', 'Token has expired');
  /** The token is malformed or its signature does not verify */
  static readonly TOKEN_INVALID = AuthErrorCode.unauthenticated('TOKEN_INVALID', 'Token is invalid: {reason}');

  /*!
   * OIDC Relying-Party Errors
   */

  /** OIDC discovery failed or answered with an inconsistent document */
  static readonly DISCOVERY_FAILED = AuthErrorCode.unavailable('DISCOVERY_FAILED', 'OIDC discovery failed: {reason}');
  /** The authorization-code exchange failed */
  static readonly EXCHANGE_FAILED = AuthErrorCode.unavailable('EXCHANGE_FAILED', 'Authorization code exchange failed: {reason}');
  /** The token introspection request failed */
  static readonly INTROSPECTION_FAILED = AuthErrorCode.unavailable('INTROSPECTION_FAILED', 'Token introspection failed: {reason}');

  /*!
   * Machine-to-Machine Errors
   */

  /** The policy decision point is unreachable or answered malformed */
  static readonly PDP_UNAVAILABLE = AuthErrorCode.unavailable('PDP_UNAVAILABLE', 'Policy decision point is unavailable: {reason}');
  /** The role-catalog sync was rejected or unreachable */
  static readonly ROLE_SYNC_FAILED = AuthErrorCode.unavailable('ROLE_SYNC_FAILED', 'Role catalog sync failed: {reason}');
  /** The service-access rules could not be loaded at startup */
  static readonly SERVICE_ACCESS_FAILED = AuthErrorCode.unavailable('SERVICE_ACCESS_FAILED', 'Service access rules could not be loaded: {reason}');
  /** The service name is invalid or cannot be resolved */
  static readonly SERVICE_UNKNOWN = AuthErrorCode.notFound('SERVICE_UNKNOWN', 'Unknown service: {reason}');
  /** The client-credentials token request failed */
  static readonly TOKEN_REQUEST_FAILED = AuthErrorCode.unavailable('TOKEN_REQUEST_FAILED', 'Token request failed: {reason}');
}

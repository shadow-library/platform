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
  /** The token revocation request failed */
  static readonly REVOCATION_FAILED = AuthErrorCode.unavailable('REVOCATION_FAILED', 'Token revocation failed: {reason}');

  /*!
   * First-Party App Session Errors
   */

  /** An app-session endpoint was unreachable or answered in a way the SDK cannot interpret */
  static readonly APP_SESSION_FAILED = AuthErrorCode.unavailable('APP_SESSION_FAILED', 'Application session request failed: {reason}');
  /** The route needs an AAL2 token and no live elevation grant covers this app session and audience */
  static readonly ELEVATION_REQUIRED = AuthErrorCode.forbidden('ELEVATION_REQUIRED', 'Step-up authentication is required');
  /** The client holds no scope on the requested resource — a registration defect, never retryable */
  static readonly RESOURCE_NOT_ENTITLED = AuthErrorCode.internal('RESOURCE_NOT_ENTITLED', 'Client is not entitled to the requested resource: {reason}');
  /** The requested scope is not granted for this audience — a configuration defect, never retryable */
  static readonly SCOPE_NOT_GRANTED = AuthErrorCode.internal('SCOPE_NOT_GRANTED', 'Requested scope is not granted for this audience: {reason}');
  /** A configured scope is absent from the issuer's published `scopes_supported`; caught at startup so a typo cannot silently narrow every token */
  static readonly SCOPE_UNSUPPORTED = AuthErrorCode.internal('SCOPE_UNSUPPORTED', 'Issuer does not publish the configured scope(s): {scopes}');
  /** The app-session handle is unknown, expired, revoked, owned by another client, or its identity session has ended */
  static readonly SESSION_INVALID = AuthErrorCode.unauthenticated('SESSION_INVALID', 'Application session is no longer valid');

  /*!
   * Browser Flow Errors
   */

  /** The callback carried no `state`, or one that does not match the transient login state */
  static readonly LOGIN_STATE_INVALID = AuthErrorCode.badRequest('LOGIN_STATE_INVALID', 'Login state is missing or does not match');
  /** The back-channel logout token failed validation */
  static readonly LOGOUT_TOKEN_INVALID = AuthErrorCode.badRequest('LOGOUT_TOKEN_INVALID', 'Back-channel logout token is invalid: {reason}');
  /** A `return_to` or post-logout target failed the redirect allow-list */
  static readonly REDIRECT_NOT_ALLOWED = AuthErrorCode.badRequest('REDIRECT_NOT_ALLOWED', 'Redirect target is not allowed');

  /*!
   * Machine-to-Machine Errors
   */

  /** The policy decision point is unreachable or answered malformed */
  static readonly PDP_UNAVAILABLE = AuthErrorCode.unavailable('PDP_UNAVAILABLE', 'Policy decision point is unavailable: {reason}');
  /** The role-catalog sync was rejected or unreachable */
  static readonly ROLE_SYNC_FAILED = AuthErrorCode.unavailable('ROLE_SYNC_FAILED', 'Role catalog sync failed: {reason}');
  /** The service-access rules could not be loaded at startup */
  static readonly SERVICE_ACCESS_FAILED = AuthErrorCode.unavailable('SERVICE_ACCESS_FAILED', 'Service access rules could not be loaded: {reason}');
  /** The client-credentials token request failed */
  static readonly TOKEN_REQUEST_FAILED = AuthErrorCode.unavailable('TOKEN_REQUEST_FAILED', 'Token request failed: {reason}');
}

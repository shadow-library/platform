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

export class AppErrorCode extends ServerErrorCode {
  /*!
   * Application Error Codes
   */

  /** Application not found */
  static readonly APP_001 = AppErrorCode.notFound('APP_001', 'Application not found');
  /** Application already exists */
  static readonly APP_002 = AppErrorCode.conflict('APP_002', 'Application already exists');
  /** Application role not found */
  static readonly APP_003 = AppErrorCode.notFound('APP_003', 'Application role not found');
  /** The platform application is protected and cannot be mutated or deleted */
  static readonly APP_004 = AppErrorCode.conflict('APP_004', 'The platform application cannot be modified or deleted', 403);
  /** The application still owns OAuth clients (FK restrict) and cannot be deleted */
  static readonly APP_005 = AppErrorCode.conflict('APP_005', 'The application still has registered OAuth clients');

  /*!
   * User Error Codes
   */

  /** User not found */
  static readonly USR_001 = AppErrorCode.notFound('USR_001', 'User not found');
  /** Username already exists */
  static readonly USR_002 = AppErrorCode.conflict('USR_002', 'Username already exists');
  /** Email already exists */
  static readonly USR_003 = AppErrorCode.conflict('USR_003', 'Email already exists');
  /** Phone number already exists */
  static readonly USR_004 = AppErrorCode.conflict('USR_004', 'Phone number already exists');
  /** The primary contact identifier cannot be removed */
  static readonly USR_005 = AppErrorCode.conflict('USR_005', 'Cannot remove the primary contact identifier');
  /** Only a verified identifier can become primary */
  static readonly USR_006 = AppErrorCode.conflict('USR_006', 'Identifier must be verified first');

  /*!
   * Authentication Flow Error Codes
   */

  /** The authentication flow does not exist or has expired */
  static readonly AUTH_001 = AppErrorCode.notFound('AUTH_001', 'Authentication flow not found or expired', 410);
  /** The requested step does not match the current flow state */
  static readonly AUTH_002 = AppErrorCode.conflict('AUTH_002', 'Invalid flow state for this operation');
  /** The submitted credential or code is invalid */
  static readonly AUTH_003 = AppErrorCode.unauthenticated('AUTH_003', 'Invalid credentials');
  /** The flow was terminated after too many failed attempts */
  static readonly AUTH_004 = AppErrorCode.notFound('AUTH_004', 'Authentication flow terminated', 410);
  /** No valid session accompanies a request to an authenticated endpoint */
  static readonly AUTH_005 = AppErrorCode.unauthenticated('AUTH_005', 'Authentication required');
  /** A sensitive operation requires recent second-factor proof (step-up) */
  static readonly AUTH_006 = AppErrorCode.forbidden('AUTH_006', 'Step-up authentication required');
  /** The organisation enforces federated sign-in; the local credential step is unavailable */
  static readonly AUTH_007 = AppErrorCode.forbidden('AUTH_007', 'Federated sign-in is required for this account');

  /*!
   * MFA Error Codes
   */

  /** The requested MFA method is not enrolled for this account */
  static readonly MFA_001 = AppErrorCode.notFound('MFA_001', 'MFA method not enrolled');
  /** The submitted MFA code is invalid, expired, or replayed */
  static readonly MFA_002 = AppErrorCode.unauthenticated('MFA_002', 'Invalid verification code');
  /** The MFA method is already enrolled */
  static readonly MFA_003 = AppErrorCode.conflict('MFA_003', 'MFA method already enrolled');

  /*!
   * Security Error Codes
   */

  /** Too many requests from this client within the window (Tier-1/Tier-2 budgets) */
  static readonly SEC_001 = AppErrorCode.badRequest('RATE_LIMITED', 'Too many requests, retry later', 429);
  /** The security backend is unavailable and the endpoint fails closed */
  static readonly SEC_002 = AppErrorCode.unavailable('SEC_002', 'Service temporarily unavailable');
  /** A service (M2M) bearer token is required for this endpoint */
  static readonly SEC_003 = AppErrorCode.unauthenticated('SEC_003', 'Service authentication required');
  /** The presented service token lacks the required scope */
  static readonly SEC_004 = AppErrorCode.forbidden('SEC_004', 'Insufficient scope');

  /*!
   * Administration Error Codes
   */

  /** The session principal lacks the administrative permission for this operation */
  static readonly ADM_001 = AppErrorCode.forbidden('ADM_001', 'Insufficient administrative privileges');
  /** The platform organisation is missing — bootstrap has not run */
  static readonly ADM_002 = new AppErrorCode('ADM_002', 'Platform administration is not provisioned');
  /** A malformed administrative request value (for example an unparseable timestamp) */
  static readonly ADM_003 = AppErrorCode.validation('ADM_003', 'Invalid administrative request value', 400);
  /** The application already holds the maximum number of OAuth clients permitted */
  static readonly ADM_004 = AppErrorCode.validation('ADM_004', 'Application has reached its maximum number of OAuth clients', 409);
  /** A workload-identity client requires a workload subject binding but none was provided */
  static readonly ADM_005 = AppErrorCode.validation('ADM_005', 'A workload subject is required for Kubernetes workload identity authentication', 400);

  /*!
   * Authorization (RBAC) Error Codes
   */

  /** A pushed role catalog is malformed — for example a role references a permission it does not declare */
  static readonly AUTHZ_001 = AppErrorCode.validation('AUTHZ_001', 'Invalid role catalog manifest', 400);
  /** The presented service token is not bound to an application that can own a role catalog */
  static readonly AUTHZ_002 = AppErrorCode.forbidden('AUTHZ_002', 'Service token is not bound to an application');
  /** A service-access rule is malformed — bad method, path pattern, or an unknown caller client */
  static readonly AUTHZ_003 = AppErrorCode.validation('AUTHZ_003', 'Invalid service access rule', 400);

  /*!
   * Organisation Error Codes
   */

  /** The principal is not a member of the organisation */
  static readonly ORG_001 = AppErrorCode.forbidden('ORG_001', 'Not a member of this organisation');
  /** The organisation does not exist */
  static readonly ORG_002 = AppErrorCode.notFound('ORG_002', 'Organisation not found');
  /** Personal workspaces are single-user by construction (D-1) and reject membership operations */
  static readonly ORG_003 = AppErrorCode.conflict('ORG_003', 'Operation not permitted on a personal workspace');
  /** An organisation must always retain at least one owner */
  static readonly ORG_004 = AppErrorCode.conflict('ORG_004', 'An organisation must retain at least one owner');
  /** Invitation absent, expired, revoked, already resolved, or not addressed to the caller — indistinguishable by design */
  static readonly ORG_005 = AppErrorCode.notFound('ORG_005', 'Invitation is invalid or has expired');
  /** The requested organisation slug is already taken */
  static readonly ORG_006 = AppErrorCode.conflict('ORG_006', 'Organisation slug already taken');
  /** The caller's organisation role does not permit this operation */
  static readonly ORG_007 = AppErrorCode.forbidden('ORG_007', 'Insufficient organisation role');
  /** The submitted domain name is not a valid public hostname */
  static readonly ORG_008 = AppErrorCode.validation('ORG_008', 'Invalid domain name', 400);
  /** The domain is already registered for this organisation */
  static readonly ORG_009 = AppErrorCode.conflict('ORG_009', 'Domain already registered');
  /** The domain record does not exist in this organisation */
  static readonly ORG_010 = AppErrorCode.notFound('ORG_010', 'Domain not found');

  /*!
   * Webhook Error Codes
   */

  /** The webhook subscription does not exist */
  static readonly WHK_001 = AppErrorCode.notFound('WHK_001', 'Webhook subscription not found');
  /** The target URL is not a public https endpoint (SSRF guard) */
  static readonly WHK_002 = AppErrorCode.validation('WHK_002', 'Webhook target must be a public https url', 400);
  /** The delivery does not exist under this subscription */
  static readonly WHK_003 = AppErrorCode.notFound('WHK_003', 'Webhook delivery not found');

  /*!
   * Federation Error Codes
   */

  /** The identity provider configuration is invalid (bad issuer url, discovery failure, endpoint mismatch) */
  static readonly FED_001 = AppErrorCode.validation('FED_001', 'Invalid identity provider configuration', 400);
  /** The identity provider registration does not exist in this organisation */
  static readonly FED_002 = AppErrorCode.notFound('FED_002', 'Identity provider not found');
  /** An organisation may configure only one identity provider */
  static readonly FED_003 = AppErrorCode.conflict('FED_003', 'An identity provider is already configured');

  /*!
   * SAML Error Codes
   */

  /** The SAMLRequest is malformed or its issuer is not a registered, active service provider */
  static readonly SML_001 = AppErrorCode.validation('SML_001', 'Invalid saml authentication request', 400);
  /** The AuthnRequest names an assertion consumer service other than the registered one */
  static readonly SML_002 = AppErrorCode.validation('SML_002', 'Assertion consumer service mismatch', 400);
  /** The pending SSO request expired or was already consumed (single use) */
  static readonly SML_003 = AppErrorCode.notFound('SML_003', 'Saml sign-on request not found or expired', 410);
  /** The service provider registration does not exist */
  static readonly SML_004 = AppErrorCode.notFound('SML_004', 'Service provider not found');

  /*!
   * OAuth / OIDC Error Codes (mapped to RFC 6749 error identifiers)
   */

  /** invalid_request — a required parameter is missing or malformed */
  static readonly OAU_001 = AppErrorCode.badRequest('invalid_request', 'The request is missing a required parameter or is malformed');
  /** invalid_client — client authentication failed */
  static readonly OAU_002 = AppErrorCode.unauthenticated('invalid_client', 'Client authentication failed');
  /** invalid_grant — the grant or credential is invalid, expired, or revoked */
  static readonly OAU_003 = AppErrorCode.badRequest('invalid_grant', 'The authorization grant is invalid, expired, or revoked');
  /** unsupported_grant_type / invalid_scope */
  static readonly OAU_004 = AppErrorCode.badRequest('invalid_scope', 'The requested scope or grant is invalid');
}

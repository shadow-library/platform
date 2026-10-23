import { ServerErrorCode } from '@shadow-library/fastify';

export class AppErrorCode extends ServerErrorCode {
  static readonly APP_001 = AppErrorCode.notFound('APP_001', 'Application not found');
  static readonly APP_002 = AppErrorCode.conflict('APP_002', 'Application already exists');
  static readonly APP_003 = AppErrorCode.notFound('APP_003', 'Application role not found');
  static readonly APP_004 = AppErrorCode.conflict('APP_004', 'The platform application cannot be modified or deleted', 403);
  /** The application still owns OAuth clients (FK restrict) and cannot be deleted */
  static readonly APP_005 = AppErrorCode.conflict('APP_005', 'The application still has registered OAuth clients');
  /** The application is inactive, or INTERNAL to a caller with no qualifying platform membership — answered as an unknown application */
  static readonly APP_006 = AppErrorCode.notFound('APP_006', 'Application not found');
  /** The application is visible to the caller but not granted to them by any organisation */
  static readonly APP_007 = AppErrorCode.forbidden('APP_007', 'Access to this application is denied');
  /** Only a RESTRICTED application can be released to an organisation (PUBLIC is already universal, INTERNAL is staff-only) */
  static readonly APP_008 = AppErrorCode.validation('APP_008', 'Only a restricted application can be released to an organisation', 400);
  /** Thrown wherever a platform-level application operation refuses an org-owned app: release, org assignment, and admin update/delete */
  static readonly APP_009 = AppErrorCode.conflict('APP_009', 'The application is owned by an organisation');
  static readonly APP_010 = AppErrorCode.validation('APP_010', 'This scope cannot be granted to an organisation-owned application', 400);
  static readonly APP_011 = AppErrorCode.conflict('APP_011', 'Organisation has reached its maximum number of registered applications');
  static readonly APP_012 = AppErrorCode.validation('APP_012', 'Invalid redirect uri for a third-party application', 400);
  /** A public client authenticates with PKCE alone, so it holds no secret that could be rotated */
  static readonly APP_013 = AppErrorCode.validation('APP_013', 'A public application has no client secret to rotate', 400);
  /** Bot ownership transfers still name the application; deleting it would strand the records those bots own there */
  static readonly APP_014 = AppErrorCode.conflict('APP_014', 'The application still has bot ownership transfers in flight');

  static readonly USR_001 = AppErrorCode.notFound('USR_001', 'User not found');
  static readonly USR_002 = AppErrorCode.conflict('USR_002', 'Username already exists');
  static readonly USR_003 = AppErrorCode.conflict('USR_003', 'Email already exists');
  static readonly USR_004 = AppErrorCode.conflict('USR_004', 'Phone number already exists');
  static readonly USR_005 = AppErrorCode.conflict('USR_005', 'Cannot remove the primary contact identifier');
  static readonly USR_006 = AppErrorCode.conflict('USR_006', 'Identifier must be verified first');

  static readonly AUTH_001 = AppErrorCode.notFound('AUTH_001', 'Authentication flow not found or expired', 410);
  static readonly AUTH_002 = AppErrorCode.conflict('AUTH_002', 'Invalid flow state for this operation');
  static readonly AUTH_003 = AppErrorCode.unauthenticated('AUTH_003', 'Invalid credentials');
  static readonly AUTH_004 = AppErrorCode.notFound('AUTH_004', 'Authentication flow terminated', 410);
  static readonly AUTH_005 = AppErrorCode.unauthenticated('AUTH_005', 'Authentication required');
  static readonly AUTH_006 = AppErrorCode.forbidden('AUTH_006', 'Step-up authentication required');
  /** The organisation enforces federated sign-in, so the local credential step is unavailable */
  static readonly AUTH_007 = AppErrorCode.forbidden('AUTH_007', 'Federated sign-in is required for this account');
  /** No account matches the submitted identifier (login is deliberately an existence oracle) */
  static readonly AUTH_008 = AppErrorCode.notFound('AUTH_008', 'No account matches this identifier');
  /** Account barred for a policy or security violation; only a platform administrator can lift it */
  static readonly AUTH_009 = AppErrorCode.forbidden('AUTH_009', 'Account is blocked');
  static readonly AUTH_010 = AppErrorCode.forbidden('AUTH_010', 'Account is suspended');
  /** Account deactivated as part of its lifecycle (offboarding, SCIM deprovisioning) */
  static readonly AUTH_011 = AppErrorCode.forbidden('AUTH_011', 'Account is deactivated');
  /** The account is under a FULL security lock and refuses every interactive method until the lock lifts */
  static readonly AUTH_012 = AppErrorCode.forbidden('AUTH_012', 'Account is locked');

  static readonly MFA_001 = AppErrorCode.notFound('MFA_001', 'MFA method not enrolled');
  /** Invalid, expired, or already-used code (replay is rejected) */
  static readonly MFA_002 = AppErrorCode.unauthenticated('MFA_002', 'Invalid verification code');
  static readonly MFA_003 = AppErrorCode.conflict('MFA_003', 'MFA method already enrolled');
  static readonly MFA_004 = AppErrorCode.notFound('MFA_004', 'No linked identity provider available for step-up');

  /** Too many requests from this client within the window */
  static readonly SEC_001 = AppErrorCode.badRequest('RATE_LIMITED', 'Too many requests, retry later', 429);
  static readonly SEC_002 = AppErrorCode.unavailable('SEC_002', 'Service temporarily unavailable');
  static readonly SEC_003 = AppErrorCode.unauthenticated('SEC_003', 'Service authentication required');
  static readonly SEC_004 = AppErrorCode.forbidden('SEC_004', 'Insufficient scope');

  static readonly ADM_001 = AppErrorCode.forbidden('ADM_001', 'Insufficient administrative privileges');
  static readonly ADM_002 = new AppErrorCode('ADM_002', 'Platform administration is not provisioned');
  static readonly ADM_003 = AppErrorCode.validation('ADM_003', 'Invalid administrative request value', 400);
  static readonly ADM_004 = AppErrorCode.validation('ADM_004', 'Application has reached its maximum number of OAuth clients', 409);
  static readonly ADM_005 = AppErrorCode.validation('ADM_005', 'A workload subject is required for Kubernetes workload identity authentication', 400);
  /** The client id is malformed (must be lowercase letters, digits and hyphens) or is reserved */
  static readonly ADM_006 = AppErrorCode.validation('ADM_006', 'Invalid or reserved OAuth client id', 400);
  /** A workload subject binding is malformed, or a cluster-wide namespace wildcard was rejected */
  static readonly ADM_007 = AppErrorCode.validation('ADM_007', 'Invalid workload subject binding', 400);

  static readonly AUTHZ_001 = AppErrorCode.validation('AUTHZ_001', 'Invalid role catalog manifest', 400);
  /** The presented service token is not bound to an application that can own a role catalog */
  static readonly AUTHZ_002 = AppErrorCode.forbidden('AUTHZ_002', 'Service token is not bound to an application');
  static readonly AUTHZ_003 = AppErrorCode.validation('AUTHZ_003', 'Invalid service access rule', 400);
  static readonly AUTHZ_004 = AppErrorCode.conflict('AUTHZ_004', 'Role catalog sync would delete too much of the catalog');

  static readonly ORG_001 = AppErrorCode.forbidden('ORG_001', 'Not a member of this organisation');
  static readonly ORG_002 = AppErrorCode.notFound('ORG_002', 'Organisation not found');
  /** Personal workspaces are single-user by construction and reject membership operations */
  static readonly ORG_003 = AppErrorCode.conflict('ORG_003', 'Operation not permitted on a personal workspace');
  static readonly ORG_004 = AppErrorCode.conflict('ORG_004', 'An organisation must retain at least one owner');
  /** Invitation absent, expired, revoked, already resolved, or not addressed to the caller — indistinguishable by design */
  static readonly ORG_005 = AppErrorCode.notFound('ORG_005', 'Invitation is invalid or has expired');
  static readonly ORG_006 = AppErrorCode.conflict('ORG_006', 'Organisation slug already taken');
  static readonly ORG_007 = AppErrorCode.forbidden('ORG_007', 'Insufficient organisation role');
  static readonly ORG_008 = AppErrorCode.validation('ORG_008', 'Invalid domain name', 400);
  static readonly ORG_009 = AppErrorCode.conflict('ORG_009', 'Domain already registered');
  static readonly ORG_010 = AppErrorCode.notFound('ORG_010', 'Domain not found');
  /** The application cannot be assigned because the organisation's members could never reach it (inactive, INTERNAL, or an unreleased RESTRICTED app) */
  static readonly ORG_011 = AppErrorCode.validation('ORG_011', 'The application cannot be assigned to this organisation', 400);
  /** Revoke-path companion to ORG_011: same machine code and status so no new failure oracle appears, wording that fits removal rather than assignment */
  static readonly ORG_011_REVOKE = AppErrorCode.validation('ORG_011', 'The application is not entitled in this organisation', 400);
  static readonly ORG_012 = AppErrorCode.validation('ORG_012', 'Organisation name is reserved', 400);

  static readonly BOT_001 = AppErrorCode.conflict('BOT_001', 'Organisation has reached its maximum number of bots');
  static readonly BOT_002 = AppErrorCode.conflict('BOT_002', 'Bots are available to team organisations only');
  /** Handles are unique within an organisation, deleted bots included, because owned records keep displaying them */
  static readonly BOT_003 = AppErrorCode.conflict('BOT_003', 'Bot handle already taken');
  /** The role is not declared bot-grantable by its application, or the organisation cannot reach that application — the two are deliberately indistinguishable */
  static readonly BOT_004 = AppErrorCode.conflict('BOT_004', 'Permission cannot be granted to a bot');
  /** The granting admin does not hold the permission themselves; a bot never exceeds its granter */
  static readonly BOT_005 = AppErrorCode.forbidden('BOT_005', 'Permission is not held by the granting administrator');
  /** A bot may hold at most two unrevoked, unexpired keys so rotation can overlap without accumulating credentials */
  static readonly BOT_006 = AppErrorCode.conflict('BOT_006', 'Bot already has the maximum number of active keys');
  /** Key expiry must be in the future and no more than 365 days away */
  static readonly BOT_007 = AppErrorCode.validation('BOT_007', 'Key expiry is out of range', 400);
  /** Records a bot owns can only be handed to a person who is still an ACTIVE member of the bot's own organisation */
  static readonly BOT_008 = AppErrorCode.validation('BOT_008', 'Transfer recipient is not an active member of the organisation', 400);
  /** Absent, deleted, or owned by another organisation — indistinguishable by design */
  static readonly BOT_009 = AppErrorCode.notFound('BOT_009', 'Bot not found');
  /** The bot's lifecycle status does not permit the operation, such as suspending a suspended bot or issuing a key to one that is not active */
  static readonly BOT_010 = AppErrorCode.conflict('BOT_010', "Operation not permitted in the bot's current status");
  static readonly BOT_011 = AppErrorCode.notFound('BOT_011', 'Bot key not found');
  /** An IP allowlist entry is not an IPv4 or IPv6 address or CIDR range, or the list has more than 20 distinct entries */
  static readonly BOT_012 = AppErrorCode.validation('BOT_012', 'Invalid IP allowlist', 400);
  /** Key issuance, bot changes and resumption need an active organisation; suspending a bot and revoking its keys stay available */
  static readonly BOT_013 = AppErrorCode.conflict('BOT_013', 'Organisation is not active');

  static readonly POL_001 = AppErrorCode.notFound('POL_001', 'Unknown organisation policy');
  static readonly POL_002 = AppErrorCode.validation('POL_002', 'Invalid organisation policy value', 400);

  static readonly WHK_001 = AppErrorCode.notFound('WHK_001', 'Webhook subscription not found');
  /** The target URL is not a public https endpoint (SSRF guard) */
  static readonly WHK_002 = AppErrorCode.validation('WHK_002', 'Webhook target must be a public https url', 400);
  static readonly WHK_003 = AppErrorCode.notFound('WHK_003', 'Webhook delivery not found');

  /** A row expected to hold a sealed secret has neither an envelope nor a legacy ciphertext */
  static readonly KEY_001 = AppErrorCode.internal('KEY_001', 'The stored secret is missing');

  static readonly FED_001 = AppErrorCode.validation('FED_001', 'Invalid identity provider configuration', 400);
  static readonly FED_002 = AppErrorCode.notFound('FED_002', 'Identity provider not found');
  static readonly FED_003 = AppErrorCode.conflict('FED_003', 'An identity provider is already configured');
  static readonly FED_004 = AppErrorCode.conflict('FED_004', 'Sign-in method is not configured', 409);
  static readonly FED_005 = AppErrorCode.validation('FED_005', 'Microsoft sign-in requires a tenant-scoped issuer', 400);
  /** The upstream account is unknown here and the provider does not permit new accounts */
  static readonly FED_006 = AppErrorCode.forbidden('FED_006', 'Sign-up through this provider is not allowed');
  static readonly FED_007 = AppErrorCode.validation('FED_007', 'Apple sign-in requires a team id and key id', 400);

  static readonly SML_001 = AppErrorCode.validation('SML_001', 'Invalid saml authentication request', 400);
  static readonly SML_002 = AppErrorCode.validation('SML_002', 'Assertion consumer service mismatch', 400);
  /** The pending SSO request expired or was already consumed (single use) */
  static readonly SML_003 = AppErrorCode.notFound('SML_003', 'Saml sign-on request not found or expired', 410);
  static readonly SML_004 = AppErrorCode.notFound('SML_004', 'Service provider not found');

  static readonly SCIM_001 = AppErrorCode.notFound('SCIM_001', 'SCIM group not found');
  static readonly SCIM_002 = AppErrorCode.notFound('SCIM_002', 'SCIM group role mapping not found');

  static readonly OAU_001 = AppErrorCode.badRequest('invalid_request', 'The request is missing a required parameter or is malformed');
  static readonly OAU_002 = AppErrorCode.unauthenticated('invalid_client', 'Client authentication failed');
  static readonly OAU_003 = AppErrorCode.badRequest('invalid_grant', 'The authorization grant is invalid, expired, or revoked');
  static readonly OAU_004 = AppErrorCode.badRequest('invalid_scope', 'The requested scope or grant is invalid');
  static readonly OAU_005 = AppErrorCode.badRequest('invalid_target', 'The requested resource is unknown or not permitted');
  /** unauthorized_client — the authenticated client may not use this grant, such as a bot key exchange by a client that is not first-party */
  static readonly OAU_006 = AppErrorCode.badRequest('unauthorized_client', 'The client is not authorized to use this grant');
  /** Bearer token missing, malformed, expired, or not a user token (RFC 6750 §3.1 invalid_token) */
  static readonly OAU_007 = AppErrorCode.unauthenticated('invalid_token', 'The access token is invalid or expired');
  static readonly OAU_008 = AppErrorCode.badRequest('unsupported_grant_type', 'The authorization grant type is not supported');
}

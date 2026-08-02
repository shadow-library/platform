/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME, OIDC_PROTOCOL_SCOPES } from '@server/constants';
import { KeyService } from '@server/modules/auth/keys';
import { SessionService } from '@server/modules/auth/session';
import { RefreshTokenClientMismatchError, RefreshTokenReuseError, RefreshTokenService } from '@server/modules/auth/token';
import { UserEmailService, UserService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { OAuthClient } from '@server/modules/infrastructure/datastore';
import { RateLimiterService } from '@server/modules/infrastructure/security';
import { ApplicationAccessService } from '@server/modules/system/application';
import { PolicyService } from '@server/modules/system/policy';

import { AccessTokenService } from './access-token.service';
import { AuthorizationCodeService } from './authorization-code.service';
import { ConsentService } from './consent.service';
import { OAuthClientService } from './oauth-client.service';
import { ACCESS_TOKEN_TYPE, DEFAULT_AUDIENCE, TOKEN_EXCHANGE_GRANT } from './oauth.constants';
import { verifyPkce } from './pkce';
import { WorkloadIdentityService } from './workload-identity.service';

/**
 * Defining types
 */

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scope: string;
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  resource?: string;
}

export type AuthorizeResult = { kind: 'redirect'; url: string } | { kind: 'login' };

export interface ClientCredential {
  /** Optional when a client assertion is presented: the client is then resolved from the verified workload subject */
  clientId?: string;
  clientSecret?: string;
  /** RFC 7523 client assertion — a projected k8s service-account token (D-16) */
  clientAssertion?: string;
}

export interface TokenParams {
  grantType: string;
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
  refreshToken?: string;
  scope?: string;
  resource?: string;
  /** RFC 8693 token exchange (D-22) */
  subjectToken?: string;
  subjectTokenType?: string;
  requestedTokenType?: string;
  actorToken?: string;
}

export interface TokenResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
  idToken?: string;
  refreshToken?: string;
  /** RFC 8693 requires the issued type to be stated; present on exchange responses only. */
  issuedTokenType?: string;
}

export interface IntrospectionResult {
  active: boolean;
  sub?: string;
  scope?: string;
  aud?: string;
  exp?: number;
  clientId?: string;
  tokenType?: string;
}

/** The audience a token will carry, together with the scopes the client may actually hold on it. */
interface ResolvedGrant {
  audience: string;
  scopes: string[];
  /** Requested scopes the client is not granted for this audience — dropped on user flows, fatal on service flows. */
  rejected: string[];
}

/**
 * Declaring the constants
 */

@Injectable()
export class OAuthService {
  private readonly logger = Logger.getLogger(APP_NAME, OAuthService.name);
  /** identity-web's hosted pages sit at the login URL's origin; the access-denied page lives beside login. */
  private readonly loginUrl = Config.get('oauth.login-url');

  constructor(
    private readonly clientService: OAuthClientService,
    private readonly codeService: AuthorizationCodeService,
    private readonly accessTokenService: AccessTokenService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly sessionService: SessionService,
    private readonly userService: UserService,
    private readonly userEmailService: UserEmailService,
    private readonly auditService: AuditService,
    private readonly keyService: KeyService,
    private readonly consentService: ConsentService,
    private readonly workloadIdentityService: WorkloadIdentityService,
    private readonly policyService: PolicyService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly applicationAccessService: ApplicationAccessService,
  ) {}

  /**
   * Token lifetimes are the strictest of the platform default, the client's own setting and the
   * policies of every organisation involved — the acting user's and the one owning the client — so
   * either party can tighten a lifetime and neither can loosen the other's.
   */
  private tokenPolicyScope(client: OAuthClient, userOrganisationId?: bigint | null): { organisationIds: (bigint | null | undefined)[] } {
    return { organisationIds: [userOrganisationId, client.organisationId] };
  }

  /** RFC 7009 token revocation: revokes the refresh-token family the caller owns. Always succeeds (even if unknown). */
  async revoke(token: string, credential: ClientCredential): Promise<void> {
    const client = await this.authenticateClient(credential);
    this.assertConfidential(client);
    await this.refreshTokenService.revokeBySecret(token, client.id);
  }

  /**
   * RFC 7662 introspection: reports whether an access or refresh token is currently valid. The answer
   * is scoped to the calling client — a token issued to someone else reads as inactive, so
   * introspection cannot be used to probe another client's tokens.
   */
  async introspect(token: string, credential: ClientCredential): Promise<IntrospectionResult> {
    const client = await this.authenticateClient(credential);
    this.assertConfidential(client);

    const claims = this.keyService.verify(token);
    if (claims && typeof claims.exp === 'number' && claims.exp * 1000 > Date.now()) {
      if (claims.client_id !== client.id) return this.foreignToken(client.id, 'access_token');
      return {
        active: true,
        sub: String(claims.sub),
        scope: claims.scope ? String(claims.scope) : undefined,
        aud: claims.aud ? String(claims.aud) : undefined,
        exp: claims.exp,
        clientId: String(claims.client_id),
        tokenType: 'access_token',
      };
    }

    const refresh = await this.refreshTokenService.describeBySecret(token);
    if (refresh?.active) {
      if (refresh.context.clientId !== client.id) return this.foreignToken(client.id, 'refresh_token');
      return {
        active: true,
        sub: refresh.context.userId.toString(),
        scope: refresh.context.scope ?? undefined,
        aud: refresh.context.audience ?? undefined,
        clientId: refresh.context.clientId ?? undefined,
        tokenType: 'refresh_token',
      };
    }
    return { active: false };
  }

  private foreignToken(callerClientId: string, tokenType: string): IntrospectionResult {
    this.logger.warn('introspection answered inactive: token belongs to another client', {
      securityEvent: 'oauth.introspection_client_mismatch',
      callerClientId,
      tokenType,
    });
    return { active: false };
  }

  /**
   * Token revocation and introspection act on credentials rather than merely presenting them, so a
   * public client — which authenticates with nothing but a client id — must not reach either.
   */
  private assertConfidential(client: OAuthClient): void {
    if (client.tokenEndpointAuthMethod !== 'none') return;
    this.logger.warn('endpoint rejected: public clients may not introspect or revoke tokens', { securityEvent: 'oauth.client_auth_failed', clientId: client.id });
    throw AppErrorCode.OAU_002.create();
  }

  /** Authorization Code entry point: validates the request then either issues a code or asks the caller to log in. */
  async authorize(params: AuthorizeParams, sessionSecret?: string): Promise<AuthorizeResult> {
    const client = await this.requireClient(params.clientId);
    if (!(await this.clientService.isRedirectUriAllowed(client.id, params.redirectUri))) throw AppErrorCode.OAU_001.create();
    if (params.responseType !== 'code') throw AppErrorCode.OAU_001.create();
    if (!client.grantTypes.includes('authorization_code')) throw AppErrorCode.OAU_001.create();
    if (client.requirePkce && (!params.codeChallenge || params.codeChallengeMethod !== 'S256')) throw AppErrorCode.OAU_001.create();

    /** Resolved before the session is consulted so an ineligible target fails fast rather than after a login round trip. */
    const grant = await this.resolveGrant(client, params.resource, params.scope, 'user');
    if (grant.rejected.length > 0) {
      this.logger.warn('dropped scopes the client does not hold on the requested audience', { clientId: client.id, audience: grant.audience, dropped: grant.rejected });
    }

    const session = sessionSecret ? await this.sessionService.validate(sessionSecret) : null;
    if (!session) return { kind: 'login' };

    /**
     * The sign-in gate (T-902), keyed on the application rather than the client (D-A7): a user who
     * no longer reaches this application is turned away here, before any code is issued. A *hidden*
     * denial (inactive or INTERNAL app) is indistinguishable from an unknown client (D-A3); a
     * *denied* one answers openly so a refused customer becomes a sales lead rather than a leak.
     */
    try {
      await this.applicationAccessService.assertUserAccess(session.userId, client.applicationId);
    } catch (error) {
      if (AppError.is(error, AppErrorCode.APP_006)) throw AppErrorCode.OAU_002.create();
      if (!AppError.is(error, AppErrorCode.APP_007)) throw error;
      return this.denyAuthorize(client, params, session.userId);
    }

    const scope = grant.scopes.join(' ');
    if (client.isFirstParty) {
      await this.consentService.record(session.userId, client.id, grant.scopes, 'FIRST_PARTY_POLICY');
    } else if (!(await this.consentService.getActive(session.userId, client.id))) {
      return { kind: 'login' };
    }

    const code = await this.codeService.issue({
      clientId: client.id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge ?? '',
      codeChallengeMethod: params.codeChallengeMethod ?? 'S256',
      scope,
      nonce: params.nonce,
      resource: params.resource,
      userId: session.userId.toString(),
      sessionId: session.id.toString(),
    });

    const url = new URL(params.redirectUri);
    url.searchParams.set('code', code);
    if (params.state) url.searchParams.set('state', params.state);
    await this.auditService.record({
      action: 'oauth.authorize.granted',
      outcome: 'SUCCESS',
      actorType: 'USER',
      actorId: session.userId.toString(),
      targetType: 'oauth_client',
      targetId: client.id,
    });
    this.logger.debug('authorization code granted', { clientId: client.id, userId: session.userId.toString(), scope });
    return { kind: 'redirect', url: url.toString() };
  }

  /**
   * Turns a *denied* (visible but ungranted) user away from the authorize endpoint. A first-party
   * client — whose redirect target is not a place to surface an OAuth error to a human — is sent to
   * identity-web's hosted access-denied page naming the application; a third-party client gets the
   * RFC 6749 `access_denied` on its own `redirect_uri`, mirroring `ConsentService.decide`.
   */
  private async denyAuthorize(client: OAuthClient, params: AuthorizeParams, userId: bigint): Promise<AuthorizeResult> {
    await this.auditService.record({
      action: 'oauth.authorize.denied',
      outcome: 'DENIED',
      actorType: 'USER',
      actorId: userId.toString(),
      targetType: 'oauth_client',
      targetId: client.id,
    });
    this.logger.debug('authorization denied: user has no access to the application', { clientId: client.id, userId: userId.toString(), applicationId: client.applicationId });

    if (client.isFirstParty) {
      const application = (await this.clientService.resolveApplicationLabel(client.id)) ?? client.id;
      const url = new URL('/error', this.loginUrl);
      url.searchParams.set('error', 'access_denied');
      url.searchParams.set('application', application);
      url.searchParams.set('client_id', client.id);
      return { kind: 'redirect', url: url.toString() };
    }

    const url = new URL(params.redirectUri);
    url.searchParams.set('error', 'access_denied');
    if (params.state) url.searchParams.set('state', params.state);
    return { kind: 'redirect', url: url.toString() };
  }

  /**
   * Resolves the audience a token will carry together with the scopes it may hold. Two rules apply,
   * both evaluated against what this specific client is granted:
   *
   * - **Audience entitlement** — an explicitly requested resource must be one the client holds at
   *   least one scope on. Registration alone is not entitlement; without this, any client could mint
   *   a token addressed to any API (SCOPE-02). Unknown and un-entitled resources fail identically, so
   *   the check never reveals which resources exist.
   * - **Scope/audience agreement** — a resource capability is only minted for the resource that owns
   *   it, so a grant on one API can never authorise a token addressed to another.
   *
   * OIDC protocol scopes are exempt from the second rule on user flows: they describe the ID token
   * and userinfo response rather than a resource-server capability. Service tokens get no exemption.
   */
  private async resolveGrant(client: OAuthClient, requestedResource: string | undefined, requestedScope: string, principal: 'user' | 'service'): Promise<ResolvedGrant> {
    const audience = requestedResource ?? DEFAULT_AUDIENCE;
    const granted = await this.clientService.getGrantedScopes(client.id);
    const grantedHere = new Set(granted.filter(scope => scope.resourceIdentifier === audience).map(scope => scope.name));
    if (requestedResource !== undefined && grantedHere.size === 0 && !(await this.clientService.isOwnAudience(client, requestedResource))) {
      /**
       * `isOwnAudience` carves out the one legitimate zero-grant request: an application addressing
       * its own canonical audience (D-21). Everything else fails identically, revealing nothing.
       */
      this.logger.warn('token request rejected: client holds no scope on the requested resource', {
        securityEvent: 'oauth.audience_denied',
        clientId: client.id,
        resource: requestedResource,
      });
      throw AppErrorCode.OAU_005.create();
    }

    const requested = requestedScope.split(' ').filter(Boolean);
    const principalScoped = await this.clientService.filterScopesForPrincipal(requested, principal);
    const isAllowed = (name: string): boolean => grantedHere.has(name) || (principal === 'user' && OIDC_PROTOCOL_SCOPES.has(name));
    return { audience, scopes: principalScoped.filter(isAllowed), rejected: principalScoped.filter(name => !isAllowed(name)) };
  }

  async token(params: TokenParams, credential: ClientCredential): Promise<TokenResult> {
    this.logger.debug('token request received', { grantType: params.grantType, clientId: credential.clientId, resource: params.resource });
    if (params.grantType === 'authorization_code') return this.exchangeCode(params, credential);
    if (params.grantType === 'refresh_token') return this.refresh(params, credential);
    if (params.grantType === 'client_credentials') return this.clientCredentials(params, credential);
    if (params.grantType === TOKEN_EXCHANGE_GRANT) return this.tokenExchange(params, credential);
    this.logger.warn('token request rejected: unsupported grant type', { grantType: params.grantType, clientId: credential.clientId });
    throw AppErrorCode.OAU_004.create();
  }

  /**
   * RFC 8693 token exchange (D-22): an application calls another **as the user** by presenting the
   * user's own token, never by asserting an identity in a header. Holding the token is the whole
   * security property — a compromised service can only act for the users currently using it, where
   * a header assertion would let it act for the entire directory.
   *
   * The resulting token is bounded on every axis: the caller's own grants on the target rather than
   * the user's consent (which was frozen to one resource at authorize time), an `exp` that can only
   * shrink, and `aal` omitted so elevation never crosses a service boundary (D-19).
   */
  private async tokenExchange(params: TokenParams, credential: ClientCredential): Promise<TokenResult> {
    const client = await this.authenticateGrantClient(credential);
    if (!params.subjectToken || params.subjectTokenType !== ACCESS_TOKEN_TYPE) throw AppErrorCode.OAU_001.create();
    if (params.requestedTokenType && params.requestedTokenType !== ACCESS_TOKEN_TYPE) throw AppErrorCode.OAU_001.create();
    /** The actor is the authenticated caller. A second delegation shape is refused rather than ignored. */
    if (params.actorToken) throw AppErrorCode.OAU_001.create();
    if (!params.resource) throw AppErrorCode.OAU_005.create();

    const subject = this.accessTokenService.verifyAccessToken(params.subjectToken);
    if (!subject || subject.token_type !== 'user' || typeof subject.sub !== 'string') {
      this.logger.warn('token exchange rejected: subject token is not a valid user token', { securityEvent: 'oauth.exchange_denied', clientId: client.id });
      throw AppErrorCode.OAU_003.create();
    }

    /** Single-hop by design: a longer chain needs its own decision recorded before it is allowed. */
    if (subject.act) {
      this.logger.warn('token exchange rejected: subject token is itself delegated', { securityEvent: 'oauth.exchange_denied', clientId: client.id, subject: subject.sub });
      throw AppErrorCode.OAU_003.create();
    }

    /** A caller may only exchange a token addressed to its own API — it must already be the audience. */
    const ownerApplicationId = await this.clientService.getResourceOwner(String(subject.aud));
    if (ownerApplicationId === null || ownerApplicationId !== client.applicationId) {
      this.logger.warn('token exchange rejected: caller does not own the subject token audience', {
        securityEvent: 'oauth.exchange_denied',
        clientId: client.id,
        audience: String(subject.aud),
      });
      throw AppErrorCode.OAU_003.create();
    }

    /**
     * The delegated call may only reach an application the subject user themselves may reach: a
     * service acting *as the user* can never take them somewhere their own sign-in would be refused
     * (T-902). Both denial classes read as `invalid_target` — a delegated caller learns nothing about
     * the target's visibility that the user's own access does not already decide.
     */
    const targetApplicationId = await this.clientService.getResourceOwner(params.resource);
    if (targetApplicationId !== null) {
      await this.applicationAccessService.assertUserAccess(BigInt(subject.sub), targetApplicationId).catch(error => {
        if (!AppError.is(error, AppErrorCode.APP_006) && !AppError.is(error, AppErrorCode.APP_007)) throw error;
        this.logger.warn('token exchange rejected: the subject user has no access to the target application', {
          securityEvent: 'oauth.exchange_denied',
          clientId: client.id,
          subject: subject.sub,
          targetApplicationId,
        });
        throw AppErrorCode.OAU_005.create();
      });
    }

    const scope = await this.exchangeScopes(client, params.resource, params.scope);
    /** Each hop shrinks the user's authority rather than extending it. */
    const policyTtl = await this.policyService.resolve('auth.access_token.ttl', { ...this.tokenPolicyScope(client), clientValue: client.accessTokenTtl });
    const ttlSeconds = Math.min(policyTtl, (subject.exp as number) - Math.floor(Date.now() / 1000));
    if (ttlSeconds <= 0) throw AppErrorCode.OAU_003.create();

    const { token: accessToken, expiresIn } = this.accessTokenService.mintAccessToken({
      subject: subject.sub,
      audience: params.resource,
      scope,
      clientId: client.id,
      organisationId: typeof subject.org === 'string' ? subject.org : undefined,
      sessionId: typeof subject.sid === 'string' ? subject.sid : undefined,
      ttlSeconds,
      actorType: 'user',
      actorClientId: client.id,
    });

    this.logger.info('access token issued', {
      securityEvent: 'oauth.token_exchanged',
      grantType: 'token-exchange',
      clientId: client.id,
      subject: subject.sub,
      audience: params.resource,
      scope,
    });
    return { accessToken, tokenType: 'Bearer', expiresIn, scope, issuedTokenType: ACCESS_TOKEN_TYPE };
  }

  /**
   * The exchanged scope ceiling: the calling application's own grants on the target, never the
   * user's consent — that was frozen to a single resource at authorize time and never covered the
   * downstream application. Sensitive scopes are excluded outright, because they mint only into an
   * elevated token (D-19) and an exchanged token is always AAL1.
   */
  private async exchangeScopes(client: OAuthClient, target: string, requestedScope?: string): Promise<string> {
    const granted = await this.clientService.getGrantedScopes(client.id);
    const available = new Set(granted.filter(scope => scope.resourceIdentifier === target && !scope.isSensitive).map(scope => scope.name));
    if (available.size === 0) {
      this.logger.warn('token exchange rejected: caller holds no scope on the target resource', { securityEvent: 'oauth.audience_denied', clientId: client.id, resource: target });
      throw AppErrorCode.OAU_005.create();
    }

    const requested = (requestedScope ?? '').split(' ').filter(Boolean);
    if (requested.length === 0) return [...available].join(' ');

    const rejected = requested.filter(name => !available.has(name));
    if (rejected.length > 0) {
      this.logger.warn('token exchange rejected: requested scope exceeds the caller’s grants on the target', {
        securityEvent: 'oauth.scope_denied',
        clientId: client.id,
        resource: target,
        rejected,
      });
      throw AppErrorCode.OAU_004.create();
    }
    return requested.join(' ');
  }

  private async exchangeCode(params: TokenParams, credential: ClientCredential): Promise<TokenResult> {
    const client = await this.authenticateGrantClient(credential);
    if (!params.code || !params.redirectUri || !params.codeVerifier) throw AppErrorCode.OAU_001.create();

    const payload = await this.codeService.consume(params.code);
    if (!payload || payload.clientId !== client.id || payload.redirectUri !== params.redirectUri) {
      this.logger.warn('authorization code exchange rejected: invalid, expired, or mismatched code', { clientId: client.id });
      throw AppErrorCode.OAU_003.create();
    }
    if (!verifyPkce(params.codeVerifier, payload.codeChallenge, payload.codeChallengeMethod)) {
      this.logger.warn('authorization code exchange rejected: pkce verification failed', { securityEvent: 'oauth.pkce_failed', clientId: client.id });
      throw AppErrorCode.OAU_003.create();
    }

    const userId = BigInt(payload.userId);
    const user = await this.userService.getUser(userId);
    if (!user || user.status !== 'ACTIVE') {
      this.logger.warn('authorization code exchange rejected: user inactive or missing', { clientId: client.id, userId: payload.userId });
      throw AppErrorCode.OAU_003.create();
    }

    /** Re-resolved rather than replayed: a grant revoked between authorization and exchange must not survive into the token. */
    const grant = await this.resolveGrant(client, payload.resource, payload.scope, 'user');
    const scope = grant.scopes.join(' ');
    /**
     * The organisation the token acts in is the one the user reaches this application through, not
     * their personal workspace — capability is evaluated there, and the two coincide only for PUBLIC
     * applications. The authorize gate already proved access; this closes the race where it lapsed
     * between authorization and exchange.
     */
    const organisationId = await this.applicationAccessService.resolveActiveOrganisationId(userId, client.applicationId);
    if (!organisationId) {
      this.logger.warn('authorization code exchange rejected: the user reaches the application through no organisation', { clientId: client.id, userId: payload.userId });
      throw AppErrorCode.OAU_003.create();
    }
    const org = organisationId.toString();
    const policyScope = this.tokenPolicyScope(client, organisationId);
    const ttlSeconds = await this.policyService.resolve('auth.access_token.ttl', { ...policyScope, clientValue: client.accessTokenTtl });
    const { token: accessToken, expiresIn } = this.accessTokenService.mintAccessToken({
      subject: payload.userId,
      audience: grant.audience,
      scope,
      clientId: client.id,
      organisationId: org,
      sessionId: payload.sessionId,
      ttlSeconds,
      actorType: 'user',
    });

    const idToken = this.accessTokenService.mintIdToken({
      subject: payload.userId,
      clientId: client.id,
      nonce: payload.nonce,
      ttlSeconds: 300,
      /** `sid` ties the ID token to the session so back-channel logout tokens can reference it. */
      claims: { ...(await this.idClaims(userId)), sid: payload.sessionId },
    });

    let refreshToken: string | undefined;
    if (client.grantTypes.includes('refresh_token')) {
      const issued = await this.refreshTokenService.issue({
        userId,
        sessionId: BigInt(payload.sessionId),
        clientId: client.id,
        scope,
        audience: grant.audience,
        organisationId,
        clientOrganisationId: client.organisationId,
        clientTtlSeconds: client.refreshTokenTtl,
      });
      refreshToken = issued.secret;
    }

    this.logger.info('access token issued', {
      securityEvent: 'oauth.token_issued',
      grantType: 'authorization_code',
      clientId: client.id,
      userId: payload.userId,
      audience: grant.audience,
      scope,
      refreshTokenIssued: refreshToken !== undefined,
    });
    return { accessToken, tokenType: 'Bearer', expiresIn, scope, idToken, refreshToken };
  }

  private async refresh(params: TokenParams, credential: ClientCredential): Promise<TokenResult> {
    const client = await this.authenticateGrantClient(credential);
    if (!params.refreshToken) throw AppErrorCode.OAU_001.create();

    /** The client binding is verified INSIDE rotate() before the token is consumed, so a mismatched caller cannot burn the victim's token. */
    const rotationContext = { expectedClientId: client.id, clientOrganisationId: client.organisationId, clientTtlSeconds: client.refreshTokenTtl };
    const rotated = await this.refreshTokenService.rotate(params.refreshToken, rotationContext).catch(error => {
      if (error instanceof RefreshTokenReuseError) {
        this.logger.warn('refresh token reuse detected, token family revoked', { securityEvent: 'oauth.refresh_token_reuse', clientId: client.id });
        throw AppErrorCode.OAU_003.create();
      }
      if (error instanceof RefreshTokenClientMismatchError) {
        this.logger.warn('refresh token rejected: client mismatch', { clientId: client.id });
        throw AppErrorCode.OAU_003.create();
      }
      throw error;
    });

    /**
     * The originating session is the authority behind every token in this family. Rotation has already
     * consumed the presented token by this point, so a dead session revokes the whole family rather
     * than merely refusing the call — the rotated secret is never handed back.
     */
    const sessionId = rotated.context.sessionId;
    if (sessionId !== null && !(await this.sessionService.validateById(sessionId))) {
      await this.refreshTokenService.revokeFamily(rotated.familyId, 'EXPIRY');
      this.logger.warn('refresh rejected: the originating session is no longer active', {
        securityEvent: 'oauth.refresh_session_inactive',
        clientId: client.id,
        familyId: rotated.familyId,
      });
      throw AppErrorCode.OAU_003.create();
    }

    /**
     * The hard cut on unassignment (D-A4): a user who has lost access to the application takes no new
     * token from this family. Revoking the family rather than merely refusing the call means the lapse
     * is permanent — the presented secret was already consumed by rotation above.
     */
    try {
      await this.applicationAccessService.assertUserAccess(rotated.context.userId, client.applicationId);
    } catch (error) {
      if (!AppError.is(error, AppErrorCode.APP_006) && !AppError.is(error, AppErrorCode.APP_007)) throw error;
      await this.refreshTokenService.revokeFamily(rotated.familyId, 'ADMIN');
      this.logger.warn('refresh rejected: the user no longer has access to the application', {
        securityEvent: 'oauth.refresh_access_revoked',
        clientId: client.id,
        familyId: rotated.familyId,
        applicationId: client.applicationId,
      });
      throw AppErrorCode.OAU_003.create();
    }

    /**
     * The family is pinned to the organisation it was opened in, and a refresh must not silently move
     * it: a long-lived credential quietly re-pointed at another organisation would widen its authority
     * without the client ever asking. Losing that one organisation is the same hard cut as losing the
     * application, so the family ends rather than migrating.
     */
    const granting = await this.applicationAccessService.listGrantingOrganisations(rotated.context.userId, client.applicationId);
    if (rotated.context.organisationId !== null && !granting.some(organisation => organisation.id === rotated.context.organisationId)) {
      await this.refreshTokenService.revokeFamily(rotated.familyId, 'ADMIN');
      this.logger.warn('refresh rejected: the organisation this family was opened in no longer grants the application', {
        securityEvent: 'oauth.refresh_access_revoked',
        clientId: client.id,
        familyId: rotated.familyId,
        organisationId: rotated.context.organisationId?.toString() ?? null,
      });
      throw AppErrorCode.OAU_003.create();
    }

    /**
     * Grants are re-resolved from the client's current entitlements instead of replaying what the
     * family stored, so a revoked scope or a deactivated resource takes effect on the next refresh
     * rather than lingering for the lifetime of the family.
     */
    const requestedResource = rotated.context.audience === DEFAULT_AUDIENCE ? undefined : (rotated.context.audience ?? undefined);
    const grant = await this.resolveGrant(client, requestedResource, rotated.context.scope ?? '', 'user');
    if (grant.rejected.length > 0) {
      this.logger.warn('dropped scopes revoked since the refresh-token family was opened', { clientId: client.id, familyId: rotated.familyId, dropped: grant.rejected });
    }
    if (grant.scopes.length === 0 && (rotated.context.scope ?? '').length > 0) {
      await this.refreshTokenService.revokeFamily(rotated.familyId, 'ADMIN');
      this.logger.warn('refresh rejected: every scope in the family has been revoked', { securityEvent: 'oauth.scope_denied', clientId: client.id, familyId: rotated.familyId });
      throw AppErrorCode.OAU_004.create();
    }

    const scope = grant.scopes.join(' ');
    const ttlSeconds = await this.policyService.resolve('auth.access_token.ttl', {
      ...this.tokenPolicyScope(client, rotated.context.organisationId),
      clientValue: client.accessTokenTtl,
    });
    const { token: accessToken, expiresIn } = this.accessTokenService.mintAccessToken({
      subject: rotated.context.userId.toString(),
      audience: grant.audience,
      scope,
      clientId: client.id,
      organisationId: rotated.context.organisationId?.toString(),
      sessionId: sessionId?.toString(),
      ttlSeconds,
      actorType: 'user',
    });
    this.logger.info('access token issued', {
      securityEvent: 'oauth.token_issued',
      grantType: 'refresh_token',
      clientId: client.id,
      userId: rotated.context.userId.toString(),
      audience: grant.audience,
      scope,
    });
    return { accessToken, tokenType: 'Bearer', expiresIn, scope, refreshToken: rotated.secret };
  }

  private async clientCredentials(params: TokenParams, credential: ClientCredential): Promise<TokenResult> {
    const client = await this.authenticateGrantClient(credential);
    if (!client.grantTypes.includes('client_credentials')) throw AppErrorCode.OAU_004.create();

    /** A service flow asks for exactly what it needs, so an un-granted scope is an error rather than something to quietly drop. */
    const grant = await this.resolveGrant(client, params.resource, params.scope ?? '', 'service');
    if (grant.rejected.length > 0) {
      this.logger.warn('client_credentials request rejected: scope not granted for the requested audience', {
        securityEvent: 'oauth.scope_denied',
        clientId: client.id,
        audience: grant.audience,
        rejected: grant.rejected,
      });
      throw AppErrorCode.OAU_004.create();
    }

    const scope = grant.scopes.join(' ');
    const ttlSeconds = await this.policyService.resolve('auth.access_token.ttl', { ...this.tokenPolicyScope(client), clientValue: client.accessTokenTtl });
    const { token: accessToken, expiresIn } = this.accessTokenService.mintAccessToken({
      subject: client.id,
      audience: grant.audience,
      scope,
      clientId: client.id,
      ttlSeconds,
      actorType: 'service',
    });
    this.logger.info('access token issued', {
      securityEvent: 'oauth.token_issued',
      grantType: 'client_credentials',
      clientId: client.id,
      audience: grant.audience,
      scope,
    });
    return { accessToken, tokenType: 'Bearer', expiresIn, scope };
  }

  /**
   * Authenticates the client for a `/oauth2/token` grant and charges the call to that client's own
   * budget rather than to its network's (T-804). Revocation and introspection deliberately stay on
   * the IP tier: they are administrative and low-volume, not what a fleet behind one egress IP
   * floods, so they would only pay twice.
   */
  private async authenticateGrantClient(credential: ClientCredential): Promise<OAuthClient> {
    const client = await this.authenticateClient(credential);
    await this.rateLimiterService.consumeClientBudget(client.id);
    return client;
  }

  private async authenticateClient(credential: ClientCredential): Promise<OAuthClient> {
    if (credential.clientAssertion) return this.authenticateWorkload(credential);
    if (!credential.clientId) throw AppErrorCode.OAU_002.create();

    const client = await this.requireClient(credential.clientId);
    if (client.tokenEndpointAuthMethod === 'none') return client;
    /**
     * A workload-identity client (`private_key_jwt`) must present its projected SA-token assertion
     * (handled above); it holds no secret, so a secretless call must be rejected outright rather
     * than fall through to the secret path (D-16).
     */
    if (client.tokenEndpointAuthMethod === 'private_key_jwt') {
      this.logger.warn('client authentication failed: workload client presented no assertion', { securityEvent: 'oauth.client_auth_failed', clientId: client.id });
      throw AppErrorCode.OAU_002.create();
    }
    if (!credential.clientSecret || !(await this.clientService.verifySecret(client.id, credential.clientSecret))) {
      this.logger.warn('client authentication failed: invalid client secret', { securityEvent: 'oauth.client_auth_failed', clientId: client.id });
      throw AppErrorCode.OAU_002.create();
    }
    return client;
  }

  /** Authenticates via a projected k8s SA token: the verified workload subject must be bound to a registered client (D-16). */
  private async authenticateWorkload(credential: ClientCredential): Promise<OAuthClient> {
    const workload = await this.workloadIdentityService.verify(credential.clientAssertion as string).catch((error: Error) => {
      this.logger.warn('client authentication failed: invalid workload assertion', {
        securityEvent: 'oauth.client_auth_failed',
        clientId: credential.clientId,
        reason: error.message,
      });
      throw AppErrorCode.OAU_002.create();
    });

    /**
     * With an explicit `client_id` the client is named and only its own bindings are tested, so
     * overlapping patterns across clients stay harmless. Without one, the client is resolved from the
     * exact subject alone — pattern bindings are unreachable on this path (D-16).
     */
    const client = credential.clientId ? await this.clientService.getClient(credential.clientId) : await this.clientService.resolveClientBySubject(workload.subject);
    const matches = client !== null && (!credential.clientId || this.clientService.subjectMatchesClient(client, workload.subject));
    if (!client || !client.isActive || !matches) {
      this.logger.warn('client authentication failed: workload subject not bound to an active client', {
        securityEvent: 'oauth.client_auth_failed',
        workloadSubject: workload.subject,
        clientId: credential.clientId,
      });
      throw AppErrorCode.OAU_002.create();
    }
    /** Attribution: the concrete SA subject is logged as the acting caller, alongside the resolved client id. */
    this.logger.info('workload identity authenticated', {
      securityEvent: 'oauth.workload_authenticated',
      clientId: workload.subject,
      resolvedClientId: client.id,
      issuer: workload.issuer,
    });
    return client;
  }

  private async requireClient(clientId: string): Promise<OAuthClient> {
    const client = await this.clientService.getClient(clientId);
    if (!client || !client.isActive) {
      this.logger.debug('oauth client lookup failed: unknown or inactive client', { clientId });
      throw AppErrorCode.OAU_002.create();
    }
    return client;
  }

  private async idClaims(userId: bigint): Promise<Record<string, unknown>> {
    const email = await this.userEmailService.getPrimaryEmail(userId);
    return email ? { email, email_verified: true } : {};
  }
}

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { KeyService } from '@server/modules/auth/keys';
import { SessionService } from '@server/modules/auth/session';
import { RefreshTokenReuseError, RefreshTokenService } from '@server/modules/auth/token';
import { UserEmailService, UserService } from '@server/modules/identity/user';
import { AuditService } from '@server/modules/infrastructure/audit';
import { OAuthClient } from '@server/modules/infrastructure/datastore';

import { AccessTokenService } from './access-token.service';
import { AuthorizationCodeService } from './authorization-code.service';
import { ConsentService } from './consent.service';
import { OAuthClientService } from './oauth-client.service';
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
}

export interface TokenResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
  idToken?: string;
  refreshToken?: string;
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

/**
 * Declaring the constants
 */
const DEFAULT_AUDIENCE = 'shadow-identity';

@Injectable()
export class OAuthService {
  private readonly logger = Logger.getLogger(APP_NAME, OAuthService.name);

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
  ) {}

  /** RFC 7009 token revocation: revokes the refresh-token family. Always succeeds (even if unknown). */
  async revoke(token: string, credential: ClientCredential): Promise<void> {
    await this.authenticateClient(credential);
    await this.refreshTokenService.revokeBySecret(token);
  }

  /** RFC 7662 introspection: reports whether an access or refresh token is currently valid. */
  async introspect(token: string, credential: ClientCredential): Promise<IntrospectionResult> {
    await this.authenticateClient(credential);

    const claims = this.keyService.verify(token);
    if (claims && typeof claims.exp === 'number' && claims.exp * 1000 > Date.now()) {
      return {
        active: true,
        sub: String(claims.sub),
        scope: claims.scope ? String(claims.scope) : undefined,
        aud: claims.aud ? String(claims.aud) : undefined,
        exp: claims.exp,
        clientId: claims.client_id ? String(claims.client_id) : undefined,
        tokenType: 'access_token',
      };
    }

    const refresh = await this.refreshTokenService.describeBySecret(token);
    if (refresh?.active) {
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

  /** Authorization Code entry point: validates the request then either issues a code or asks the caller to log in. */
  async authorize(params: AuthorizeParams, sessionSecret?: string): Promise<AuthorizeResult> {
    const client = await this.requireClient(params.clientId);
    if (!(await this.clientService.isRedirectUriAllowed(client.id, params.redirectUri))) throw AppErrorCode.OAU_001.create();
    if (params.responseType !== 'code') throw AppErrorCode.OAU_001.create();
    if (!client.grantTypes.includes('authorization_code')) throw AppErrorCode.OAU_001.create();
    if (client.requirePkce && (!params.codeChallenge || params.codeChallengeMethod !== 'S256')) throw AppErrorCode.OAU_001.create();

    const session = sessionSecret ? await this.sessionService.validate(sessionSecret) : null;
    if (!session) return { kind: 'login' };

    /** Service-only scopes never ride a user token: drop them before consent and code issuance. */
    const requested = params.scope.split(' ').filter(Boolean);
    const scopes = await this.clientService.filterScopesForPrincipal(requested, 'user');
    const scope = scopes.join(' ');
    if (client.isFirstParty) {
      await this.consentService.record(session.userId, client.id, scopes, 'FIRST_PARTY_POLICY');
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
    this.logger.debug('authorization code granted', { clientId: client.id, userId: session.userId.toString(), scope: params.scope });
    return { kind: 'redirect', url: url.toString() };
  }

  async token(params: TokenParams, credential: ClientCredential): Promise<TokenResult> {
    this.logger.debug('token request received', { grantType: params.grantType, clientId: credential.clientId, resource: params.resource });
    if (params.grantType === 'authorization_code') return this.exchangeCode(params, credential);
    if (params.grantType === 'refresh_token') return this.refresh(params, credential);
    if (params.grantType === 'client_credentials') return this.clientCredentials(params, credential);
    this.logger.warn('token request rejected: unsupported grant type', { grantType: params.grantType, clientId: credential.clientId });
    throw AppErrorCode.OAU_004.create();
  }

  private async exchangeCode(params: TokenParams, credential: ClientCredential): Promise<TokenResult> {
    const client = await this.authenticateClient(credential);
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

    const audience = payload.resource ?? DEFAULT_AUDIENCE;
    const org = user.personalOrganisationId?.toString();
    const { token: accessToken, expiresIn } = this.accessTokenService.mintAccessToken({
      subject: payload.userId,
      audience,
      scope: payload.scope,
      clientId: client.id,
      organisationId: org,
      sessionId: payload.sessionId,
      ttlSeconds: client.accessTokenTtl,
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
        scope: payload.scope,
        audience,
        organisationId: user.personalOrganisationId,
      });
      refreshToken = issued.secret;
    }

    this.logger.debug('issued tokens via authorization_code grant', {
      clientId: client.id,
      userId: payload.userId,
      scope: payload.scope,
      refreshTokenIssued: refreshToken !== undefined,
    });
    return { accessToken, tokenType: 'Bearer', expiresIn, scope: payload.scope, idToken, refreshToken };
  }

  private async refresh(params: TokenParams, credential: ClientCredential): Promise<TokenResult> {
    const client = await this.authenticateClient(credential);
    if (!params.refreshToken) throw AppErrorCode.OAU_001.create();

    const rotated = await this.refreshTokenService.rotate(params.refreshToken).catch(error => {
      if (error instanceof RefreshTokenReuseError) {
        this.logger.warn('refresh token reuse detected, token family revoked', { securityEvent: 'oauth.refresh_token_reuse', clientId: client.id });
        throw AppErrorCode.OAU_003.create();
      }
      throw error;
    });
    if (rotated.context.clientId !== client.id) {
      this.logger.warn('refresh token rejected: client mismatch', { clientId: client.id, tokenClientId: rotated.context.clientId });
      throw AppErrorCode.OAU_003.create();
    }

    const scope = rotated.context.scope ?? '';
    const { token: accessToken, expiresIn } = this.accessTokenService.mintAccessToken({
      subject: rotated.context.userId.toString(),
      audience: rotated.context.audience ?? DEFAULT_AUDIENCE,
      scope,
      clientId: client.id,
      organisationId: rotated.context.organisationId?.toString(),
      sessionId: rotated.context.sessionId?.toString(),
      ttlSeconds: client.accessTokenTtl,
      actorType: 'user',
    });
    this.logger.debug('rotated refresh token and issued access token', { clientId: client.id, userId: rotated.context.userId.toString(), scope });
    return { accessToken, tokenType: 'Bearer', expiresIn, scope, refreshToken: rotated.secret };
  }

  private async clientCredentials(params: TokenParams, credential: ClientCredential): Promise<TokenResult> {
    const client = await this.authenticateClient(credential);
    if (!client.grantTypes.includes('client_credentials')) throw AppErrorCode.OAU_004.create();

    const granted = await this.clientService.getGrantedScopeNames(client.id);
    const requested = (params.scope ?? '').split(' ').filter(Boolean);
    const disallowed = requested.filter(scope => !granted.includes(scope));
    if (disallowed.length > 0) {
      this.logger.warn('client_credentials request rejected: scope not granted to client', { clientId: client.id, disallowed });
      throw AppErrorCode.OAU_004.create();
    }
    /** User-only scopes never ride a service token, even if somehow granted to the client. */
    const scope = (await this.clientService.filterScopesForPrincipal(requested, 'service')).join(' ');

    const audience = params.resource ?? DEFAULT_AUDIENCE;
    const { token: accessToken, expiresIn } = this.accessTokenService.mintAccessToken({
      subject: client.id,
      audience,
      scope,
      clientId: client.id,
      ttlSeconds: client.accessTokenTtl,
      actorType: 'service',
    });
    this.logger.debug('issued token via client_credentials grant', { clientId: client.id, scope });
    return { accessToken, tokenType: 'Bearer', expiresIn, scope };
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

    const client = await this.clientService.getClientByWorkloadSubject(workload.subject);
    if (!client || !client.isActive || (credential.clientId && credential.clientId !== client.id)) {
      this.logger.warn('client authentication failed: workload subject not bound to an active client', {
        securityEvent: 'oauth.client_auth_failed',
        workloadSubject: workload.subject,
        clientId: credential.clientId,
      });
      throw AppErrorCode.OAU_002.create();
    }
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

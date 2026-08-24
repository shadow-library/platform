import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, throwError } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME, OIDC_PROTOCOL_SCOPES } from '@server/constants';
import { AccessTokenService, AuthorizationCodeService, DEFAULT_AUDIENCE, OAuthClientService, verifyPkce } from '@server/modules/auth/oauth';
import { SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { AppSession, AppSessionElevation, DatabaseService, OAuthClient, Organisation, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationAccessService } from '@server/modules/system/application';
import { PolicyService } from '@server/modules/system/policy';

export interface CreateAppSession {
  client: OAuthClient;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AppSessionResult {
  handle: string;
  userId: bigint;
  expiresAt: Date;
  scope: string;
}

export interface MintTokenInput {
  client: OAuthClient;
  handle: string;
  resource?: string;
  scope?: string;
  elevated?: boolean;
}

export interface MintedToken {
  accessToken: string;
  expiresIn: number;
  scope: string;
  audience: string;
  aal: 'AAL1' | 'AAL2';
}

export interface SessionOrganisations {
  organisations: Organisation[];
  activeId: bigint | null;
}

export interface SwitchedOrganisation {
  handle: string;
  expiresAt: Date;
}

@Injectable()
export class AppSessionService {
  private readonly logger = Logger.getLogger(APP_NAME, AppSessionService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly codeService: AuthorizationCodeService,
    private readonly accessTokenService: AccessTokenService,
    private readonly clientService: OAuthClientService,
    private readonly sessionService: SessionService,
    private readonly userService: UserService,
    private readonly policyService: PolicyService,
    private readonly applicationAccessService: ApplicationAccessService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private hash(handle: string): string {
    return createHash('sha256').update(handle).digest('hex');
  }

  async create(input: CreateAppSession): Promise<AppSessionResult> {
    if (!input.client.isFirstParty) {
      this.logger.warn('app session refused: only first-party clients may hold one', { securityEvent: 'app_session.denied', clientId: input.client.id });
      throw AppErrorCode.OAU_002.create();
    }

    const payload = await this.codeService.consume(input.code);
    if (!payload || payload.clientId !== input.client.id || payload.redirectUri !== input.redirectUri) {
      this.logger.warn('app session refused: invalid, expired or mismatched authorization code', { securityEvent: 'app_session.denied', clientId: input.client.id });
      throw AppErrorCode.OAU_003.create();
    }
    if (!verifyPkce(input.codeVerifier, payload.codeChallenge, payload.codeChallengeMethod)) {
      this.logger.warn('app session refused: pkce verification failed', { securityEvent: 'oauth.pkce_failed', clientId: input.client.id });
      throw AppErrorCode.OAU_003.create();
    }

    const user = await this.userService.getUser(BigInt(payload.userId));
    if (!user || user.status !== 'ACTIVE') throw AppErrorCode.OAU_003.create();

    const identitySessionId = BigInt(payload.sessionId);
    if (!(await this.sessionService.validateById(identitySessionId))) throw AppErrorCode.OAU_003.create();

    await this.applicationAccessService.assertUserAccess(user.id, input.client.applicationId);
    const organisationId =
      (await this.applicationAccessService.resolveActiveOrganisationId(user.id, input.client.applicationId)) ??
      throwError(AppError.internal('Application access granted a user no organisation to act in'));

    const handle = randomBytes(32).toString('base64url');
    const organisationIds = [organisationId, input.client.organisationId];
    const absoluteTtl = await this.policyService.resolve('auth.app_session.absolute_ttl', { organisationIds });
    const expiresAt = new Date(Date.now() + absoluteTtl * 1000);

    const session = await this.db
      .insert(schema.appSessions)
      .values({
        sessionHash: this.hash(handle),
        clientId: input.client.id,
        identitySessionId,
        userId: user.id,
        organisationId,
        grantedScope: payload.scope,
        expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      })
      .returning()
      .then(([row]) => row ?? throwError(AppError.internal('App session creation failed')));

    this.logger.info('app session created', {
      securityEvent: 'app_session.created',
      clientId: input.client.id,
      appSessionId: session.id.toString(),
      identitySessionId: identitySessionId.toString(),
    });
    return { handle, userId: user.id, expiresAt, scope: payload.scope };
  }

  async mintToken(input: MintTokenInput): Promise<MintedToken> {
    const live = await this.requireLiveSession(input.client, input.handle);

    await this.assertApplicationAccess(live, input.client);
    const session = await this.realignOrganisation(live, input.client);

    const audience = input.resource ?? DEFAULT_AUDIENCE;
    const availableHere = await this.clientService.getAvailableScopes(input.client, audience);
    if (input.resource !== undefined && availableHere.size === 0 && !(await this.clientService.isOwnAudience(input.client, input.resource))) {
      this.logger.warn('app session token refused: client holds no scope on the requested resource', {
        securityEvent: 'oauth.audience_denied',
        clientId: input.client.id,
        resource: input.resource,
      });
      throw AppErrorCode.OAU_005.create();
    }

    const elevation = input.elevated ? await this.requireElevation(session, audience) : null;
    const consented = new Set(session.grantedScope.split(' ').filter(Boolean));
    const requested = (input.scope ?? session.grantedScope).split(' ').filter(Boolean);
    const scopes = requested.filter(name => {
      if (OIDC_PROTOCOL_SCOPES.has(name)) return consented.has(name);
      const scope = availableHere.get(name);
      if (!scope || !consented.has(name)) return false;
      return scope.isSensitive ? elevation !== null : true;
    });

    const organisationIds = [session.organisationId, input.client.organisationId];
    const ttlSeconds = elevation
      ? await this.elevatedTtl(organisationIds, elevation.expiresAt)
      : await this.policyService.resolve('auth.access_token.ttl', { organisationIds, clientValue: input.client.accessTokenTtl });

    const scope = scopes.join(' ');
    const aal = elevation ? 'AAL2' : 'AAL1';
    const { token: accessToken, expiresIn } = this.accessTokenService.mintAccessToken({
      subject: session.userId.toString(),
      audience,
      scope,
      clientId: input.client.id,
      organisationId: session.organisationId?.toString(),
      sessionId: session.identitySessionId.toString(),
      ttlSeconds,
      actorType: 'user',
      aal,
    });

    await this.touch(session);
    this.logger.info('access token issued', {
      securityEvent: 'oauth.token_issued',
      grantType: 'app_session',
      clientId: input.client.id,
      userId: session.userId.toString(),
      audience,
      scope,
      aal,
    });
    return { accessToken, expiresIn, scope, audience, aal };
  }

  async claimElevation(client: OAuthClient, handle: string, resource?: string): Promise<Date> {
    const session = await this.requireLiveSession(client, handle);
    const audience = resource ?? DEFAULT_AUDIENCE;
    const identitySession = await this.sessionService.validateById(session.identitySessionId);
    if (!identitySession || !this.sessionService.isElevated(identitySession)) {
      this.logger.warn('elevation claim refused: the identity session holds no live step-up', {
        securityEvent: 'app_session.elevation_denied',
        clientId: client.id,
        appSessionId: session.id.toString(),
      });
      throw AppErrorCode.AUTH_006.create();
    }

    if (!this.sessionService.matchesElevationIntent(identitySession, client.id, audience)) {
      this.logger.warn('elevation claim refused: the step-up was performed for a different client or audience', {
        securityEvent: 'app_session.elevation_intent_mismatch',
        clientId: client.id,
        appSessionId: session.id.toString(),
        audience,
        intentClientId: identitySession.elevationIntent?.clientId ?? null,
        intentResource: identitySession.elevationIntent?.resource ?? null,
      });
      throw AppErrorCode.AUTH_006.create();
    }

    const organisationIds = [session.organisationId, client.organisationId];
    const windowSeconds = await this.policyService.resolve('auth.elevation.window', { organisationIds });
    const remainingMs = (identitySession.elevatedUntil ?? 0) - Date.now();
    const expiresAt = new Date(Date.now() + Math.min(windowSeconds * 1000, remainingMs));

    await this.db
      .insert(schema.appSessionElevations)
      .values({ appSessionId: session.id, audience, expiresAt })
      .onConflictDoUpdate({ target: [schema.appSessionElevations.appSessionId, schema.appSessionElevations.audience], set: { expiresAt } });
    await this.sessionService.consumeElevation(session.identitySessionId);

    this.logger.info('step-up claimed for a single audience', {
      securityEvent: 'app_session.elevation_claimed',
      clientId: client.id,
      appSessionId: session.id.toString(),
      audience,
    });
    return expiresAt;
  }

  async listOrganisations(client: OAuthClient, handle: string): Promise<SessionOrganisations> {
    const session = await this.requireLiveSession(client, handle);
    const organisations = await this.applicationAccessService.listGrantingOrganisations(session.userId, client.applicationId);
    return { organisations, activeId: session.organisationId };
  }

  async switchOrganisation(client: OAuthClient, handle: string, organisationId: bigint): Promise<SwitchedOrganisation> {
    const session = await this.requireLiveSession(client, handle);
    await this.assertApplicationAccess(session, client);

    const granting = await this.applicationAccessService.listGrantingOrganisations(session.userId, client.applicationId);
    if (!granting.some(organisation => organisation.id === organisationId)) {
      this.logger.warn('organisation switch refused: the user does not reach this application through the requested organisation', {
        securityEvent: 'app_session.organisation_denied',
        clientId: client.id,
        appSessionId: session.id.toString(),
        organisationId: organisationId.toString(),
      });
      throw AppErrorCode.APP_007.create();
    }

    const rotated = randomBytes(32).toString('base64url');
    await this.db
      .update(schema.appSessions)
      .set({ sessionHash: this.hash(rotated), organisationId, lastUsedAt: new Date() })
      .where(eq(schema.appSessions.id, session.id));

    this.logger.info('app session switched organisation', {
      securityEvent: 'app_session.organisation_switched',
      clientId: client.id,
      appSessionId: session.id.toString(),
      previousOrganisationId: session.organisationId?.toString() ?? null,
      organisationId: organisationId.toString(),
    });
    return { handle: rotated, expiresAt: session.expiresAt };
  }

  async revoke(client: OAuthClient, handle: string): Promise<void> {
    const [session] = await this.db
      .update(schema.appSessions)
      .set({ status: 'REVOKED', terminatedAt: new Date() })
      .where(and(eq(schema.appSessions.sessionHash, this.hash(handle)), eq(schema.appSessions.clientId, client.id), eq(schema.appSessions.status, 'ACTIVE')))
      .returning({ id: schema.appSessions.id });
    if (session) this.logger.info('app session revoked', { securityEvent: 'app_session.revoked', clientId: client.id, appSessionId: session.id.toString() });
  }

  async revokeForIdentitySession(identitySessionId: bigint): Promise<void> {
    await this.db
      .update(schema.appSessions)
      .set({ status: 'REVOKED', terminatedAt: new Date() })
      .where(and(eq(schema.appSessions.identitySessionId, identitySessionId), eq(schema.appSessions.status, 'ACTIVE')));
  }

  private async requireLiveSession(client: OAuthClient, handle: string): Promise<AppSession> {
    const session = await this.db.query.appSessions.findFirst({ where: eq(schema.appSessions.sessionHash, this.hash(handle)) });
    if (!session || session.clientId !== client.id || session.status !== 'ACTIVE') throw AppErrorCode.AUTH_005.create();

    const now = Date.now();
    const idleTtl = await this.policyService.resolve('auth.app_session.idle_ttl', { organisationIds: [session.organisationId, client.organisationId] });
    if (session.expiresAt.getTime() <= now || session.lastUsedAt.getTime() + idleTtl * 1000 <= now) {
      await this.expire(session.id);
      throw AppErrorCode.AUTH_005.create();
    }

    if (!(await this.sessionService.validateById(session.identitySessionId))) {
      await this.revokeForIdentitySession(session.identitySessionId);
      this.logger.warn('app session refused: the central session is no longer active', {
        securityEvent: 'app_session.identity_session_inactive',
        clientId: client.id,
        appSessionId: session.id.toString(),
      });
      throw AppErrorCode.AUTH_005.create();
    }
    return session;
  }

  private async assertApplicationAccess(session: AppSession, client: OAuthClient): Promise<void> {
    try {
      await this.applicationAccessService.assertUserAccess(session.userId, client.applicationId);
    } catch (error) {
      if (!AppError.is(error, AppErrorCode.APP_006) && !AppError.is(error, AppErrorCode.APP_007)) throw error;
      await this.db.update(schema.appSessions).set({ status: 'REVOKED', terminatedAt: new Date() }).where(eq(schema.appSessions.id, session.id));
      this.logger.warn('app session revoked: the user no longer has access to the application', {
        securityEvent: 'app_session.access_revoked',
        clientId: client.id,
        appSessionId: session.id.toString(),
        applicationId: client.applicationId,
      });
      throw AppErrorCode.AUTH_005.create();
    }
  }

  private async realignOrganisation(session: AppSession, client: OAuthClient): Promise<AppSession> {
    const granting = await this.applicationAccessService.listGrantingOrganisations(session.userId, client.applicationId);
    if (session.organisationId !== null && granting.some(organisation => organisation.id === session.organisationId)) return session;

    const organisationId =
      (await this.applicationAccessService.resolveActiveOrganisationId(session.userId, client.applicationId)) ??
      throwError(AppError.internal('Application access granted a session no organisation to act in'));

    await this.db.update(schema.appSessions).set({ organisationId }).where(eq(schema.appSessions.id, session.id));
    this.logger.info('app session realigned onto a granting organisation', {
      securityEvent: 'app_session.organisation_realigned',
      clientId: client.id,
      appSessionId: session.id.toString(),
      previousOrganisationId: session.organisationId?.toString() ?? null,
      organisationId: organisationId.toString(),
    });
    return { ...session, organisationId };
  }

  private async requireElevation(session: AppSession, audience: string): Promise<AppSessionElevation> {
    const elevation = await this.db.query.appSessionElevations.findFirst({
      where: and(
        eq(schema.appSessionElevations.appSessionId, session.id),
        eq(schema.appSessionElevations.audience, audience),
        gt(schema.appSessionElevations.expiresAt, new Date()),
      ),
    });
    if (!elevation) throw AppErrorCode.AUTH_006.create();
    return elevation;
  }

  private async elevatedTtl(organisationIds: (bigint | null | undefined)[], elevationExpiresAt: Date): Promise<number> {
    const configured = await this.policyService.resolve('auth.elevated_token.ttl', { organisationIds });
    const remaining = Math.floor((elevationExpiresAt.getTime() - Date.now()) / 1000);
    return Math.max(1, Math.min(configured, remaining));
  }

  private async touch(session: AppSession): Promise<void> {
    await this.db.update(schema.appSessions).set({ lastUsedAt: new Date() }).where(eq(schema.appSessions.id, session.id));
  }

  private async expire(appSessionId: bigint): Promise<void> {
    await this.db.update(schema.appSessions).set({ status: 'EXPIRED', terminatedAt: new Date() }).where(eq(schema.appSessions.id, appSessionId));
  }
}

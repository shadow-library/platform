/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { AccessTokenService, AuthorizationCodeService, DEFAULT_AUDIENCE, OAuthClientService, verifyPkce } from '@server/modules/auth/oauth';
import { SessionService } from '@server/modules/auth/session';
import { UserService } from '@server/modules/identity/user';
import { AppSession, AppSessionElevation, DatabaseService, OAuthClient, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { PolicyService } from '@server/modules/system/policy';

/**
 * Defining types
 */

export interface CreateAppSession {
  client: OAuthClient;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AppSessionResult {
  /** The opaque handle. Returned exactly once; the application stores it in its own cookie. */
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
  /** Requires a step-up grant already held for this exact audience; never falls back to the central session. */
  elevated?: boolean;
}

export interface MintedToken {
  accessToken: string;
  expiresIn: number;
  scope: string;
  audience: string;
  aal: 'AAL1' | 'AAL2';
}

/**
 * Declaring the constants
 */
const OIDC_PROTOCOL_SCOPES = new Set(['openid', 'profile', 'email', 'offline_access', 'address', 'phone']);

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
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private hash(handle: string): string {
    return createHash('sha256').update(handle).digest('hex');
  }

  /**
   * Exchanges an authorization code for an application session. The application authenticates with its
   * own M2M token, so the browser never sees a token and the handle it does receive is worthless
   * without those credentials.
   */
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

    const handle = randomBytes(32).toString('base64url');
    const organisationIds = [user.personalOrganisationId, input.client.organisationId];
    const absoluteTtl = await this.policyService.resolve('auth.app_session.absolute_ttl', { organisationIds });
    const expiresAt = new Date(Date.now() + absoluteTtl * 1000);

    const session = await this.db
      .insert(schema.appSessions)
      .values({
        sessionHash: this.hash(handle),
        clientId: input.client.id,
        identitySessionId,
        userId: user.id,
        organisationId: user.personalOrganisationId,
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

  /**
   * Mints an access token for a live application session. The central session is re-validated on every
   * call, so a sign-out at the identity service stops token issuance everywhere immediately.
   */
  async mintToken(input: MintTokenInput): Promise<MintedToken> {
    const session = await this.requireLiveSession(input.client, input.handle);
    const granted = await this.clientService.getGrantedScopes(input.client.id);
    const audience = input.resource ?? DEFAULT_AUDIENCE;
    const grantedHere = new Map(granted.filter(scope => scope.resourceIdentifier === audience).map(scope => [scope.name, scope]));
    if (input.resource !== undefined && grantedHere.size === 0 && !(await this.clientService.isOwnAudience(input.client, input.resource))) {
      /** Same carve-out as the OAuth grant resolver: an application's own canonical audience needs no scope grant (D-21). */
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
    /**
     * Three ceilings compose: the user's consent, the client's grant on this audience, and — for a
     * sensitive scope — a step-up grant addressed to this same audience. A sensitive capability is
     * therefore unreachable from an ordinary token no matter what the caller asks for.
     */
    const scopes = requested.filter(name => {
      if (OIDC_PROTOCOL_SCOPES.has(name)) return consented.has(name);
      const scope = grantedHere.get(name);
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

  /**
   * Converts a completed step-up on the identity domain into a grant addressed to one application
   * session and one audience, then **consumes** the central elevation.
   *
   * Consuming it is the whole point: the proof is spent here rather than left standing on the session,
   * so a second application — or the same application targeting a different API — cannot ride this
   * step-up and must send the user through their own. Elevation therefore never bleeds sideways
   * between services, and never lingers on the parent session.
   *
   * Consuming it is not enough on its own, though: a live window was previously claimable
   * first-come-first-served, so whichever application asked first won a proof the user performed for
   * someone else. The claim must therefore also match the intent recorded when the ceremony began
   * (D-19, T-801), and a window opened with no intent — the identity console's own step-up — is
   * claimable by no application at all.
   */
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

  /** Ends one application session without touching the central session or any sibling application. */
  async revoke(client: OAuthClient, handle: string): Promise<void> {
    const [session] = await this.db
      .update(schema.appSessions)
      .set({ status: 'REVOKED', terminatedAt: new Date() })
      .where(and(eq(schema.appSessions.sessionHash, this.hash(handle)), eq(schema.appSessions.clientId, client.id), eq(schema.appSessions.status, 'ACTIVE')))
      .returning({ id: schema.appSessions.id });
    if (session) this.logger.info('app session revoked', { securityEvent: 'app_session.revoked', clientId: client.id, appSessionId: session.id.toString() });
  }

  /** Cascades a central sign-out to every application session it produced. */
  async revokeForIdentitySession(identitySessionId: bigint): Promise<void> {
    await this.db
      .update(schema.appSessions)
      .set({ status: 'REVOKED', terminatedAt: new Date() })
      .where(and(eq(schema.appSessions.identitySessionId, identitySessionId), eq(schema.appSessions.status, 'ACTIVE')));
  }

  private async requireLiveSession(client: OAuthClient, handle: string): Promise<AppSession> {
    const session = await this.db.query.appSessions.findFirst({ where: eq(schema.appSessions.sessionHash, this.hash(handle)) });
    /** A handle presented by a client other than the one it was issued to is treated as unknown. */
    if (!session || session.clientId !== client.id || session.status !== 'ACTIVE') throw AppErrorCode.AUTH_005.create();

    const now = Date.now();
    const idleTtl = await this.policyService.resolve('auth.app_session.idle_ttl', { organisationIds: [session.organisationId, client.organisationId] });
    if (session.expiresAt.getTime() <= now || session.lastUsedAt.getTime() + idleTtl * 1000 <= now) {
      await this.expire(session.id);
      throw AppErrorCode.AUTH_005.create();
    }

    /** The central session stays authoritative: a sign-out there ends every application session at once. */
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
    /** An elevated token must never outlive the grant behind it, so the remaining window is the ceiling. */
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

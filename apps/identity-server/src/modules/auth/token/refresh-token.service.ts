/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';

import { and, eq, ne } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { SessionService } from '@server/modules/auth/session';
import { AuditService } from '@server/modules/infrastructure/audit';
import { DatabaseService, PrimaryDatabase, RefreshToken, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface IssueRefreshToken {
  userId: bigint;
  sessionId?: bigint | null;
  clientId?: string | null;
  scope?: string | null;
  audience?: string | null;
  organisationId?: bigint | null;
  ipAddress?: string;
  ipCountry?: string;
}

export interface FamilyContext {
  userId: bigint;
  clientId: string | null;
  scope: string | null;
  audience: string | null;
  organisationId: bigint | null;
  sessionId: bigint | null;
}

export interface RefreshTokenResult {
  secret: string;
  familyId: string;
  tokenId: string;
  context: FamilyContext;
}

export interface RotationContext {
  ipAddress?: string;
  ipCountry?: string;
}

export interface RefreshTokenDescription {
  active: boolean;
  context: FamilyContext;
}

interface MintedSecret {
  secret: string;
  tokenHash: string;
}

export class RefreshTokenReuseError extends Error {
  constructor() {
    super('Refresh token reuse detected');
    this.name = 'RefreshTokenReuseError';
  }
}

/**
 * Declaring the constants
 */
const REFRESH_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshTokenService {
  private readonly logger = Logger.getLogger(APP_NAME, RefreshTokenService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly sessionService: SessionService,
    private readonly auditService: AuditService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private mint(): MintedSecret {
    const secret = randomBytes(32).toString('base64url');
    return { secret, tokenHash: this.hash(secret) };
  }

  /** Opens a new family and issues its first refresh token. */
  async issue(input: IssueRefreshToken): Promise<RefreshTokenResult> {
    const { secret, tokenHash } = this.mint();
    const result = await this.db.transaction(async tx => {
      const [family] = await tx
        .insert(schema.refreshTokenFamilies)
        .values({
          userId: input.userId,
          sessionId: input.sessionId ?? null,
          clientId: input.clientId ?? null,
          scope: input.scope ?? null,
          audience: input.audience ?? null,
          organisationId: input.organisationId ?? null,
        })
        .returning();
      if (!family) {
        this.logger.error('failed to create refresh token family', { userId: input.userId, clientId: input.clientId });
        throw AppError.internal('Failed to create refresh token family');
      }
      const [token] = await tx
        .insert(schema.refreshTokens)
        .values({ familyId: family.id, tokenHash, expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS), ipAddress: input.ipAddress ?? null, ipCountry: input.ipCountry ?? null })
        .returning();
      if (!token) {
        this.logger.error('failed to create refresh token', { userId: input.userId, familyId: family.id });
        throw AppError.internal('Failed to create refresh token');
      }
      return { familyId: family.id, tokenId: token.id, context: this.toContext(family) };
    });
    this.logger.debug('issued refresh token family', { userId: input.userId, clientId: input.clientId, familyId: result.familyId });
    return { secret, ...result };
  }

  private toContext(family: typeof schema.refreshTokenFamilies.$inferSelect): FamilyContext {
    return { userId: family.userId, clientId: family.clientId, scope: family.scope, audience: family.audience, organisationId: family.organisationId, sessionId: family.sessionId };
  }

  /**
   * Rotates a refresh token: the presented token must be ACTIVE. Presenting a superseded token
   * (ROTATED/REVOKED) means the chain leaked — the entire family and its session are revoked and a
   * security event is recorded (D-11).
   */
  async rotate(secret: string, context: RotationContext = {}): Promise<RefreshTokenResult> {
    const presented = await this.db.query.refreshTokens.findFirst({ where: eq(schema.refreshTokens.tokenHash, this.hash(secret)) });
    if (!presented) {
      this.logger.warn('refresh token rotation rejected: presented token is unknown', { securityEvent: 'security.token_reuse' });
      throw new RefreshTokenReuseError();
    }

    if (presented.status !== 'ACTIVE' || presented.expiresAt.getTime() <= Date.now()) {
      this.logger.warn('refresh token rotation rejected: superseded or expired token replayed', {
        securityEvent: 'security.token_reuse',
        familyId: presented.familyId,
        status: presented.status,
      });
      await this.revokeFamily(presented.familyId, 'ROTATION_REUSE');
      throw new RefreshTokenReuseError();
    }

    const family = await this.db.query.refreshTokenFamilies.findFirst({ where: eq(schema.refreshTokenFamilies.id, presented.familyId) });
    if (!family || family.status !== 'ACTIVE') {
      this.logger.warn('refresh token rotation rejected: family is not active', { securityEvent: 'security.token_reuse', familyId: presented.familyId });
      throw new RefreshTokenReuseError();
    }

    const { secret: nextSecret, tokenHash } = this.mint();
    const tokenId = await this.db.transaction(async tx => {
      await tx.update(schema.refreshTokens).set({ status: 'ROTATED', rotatedAt: new Date() }).where(eq(schema.refreshTokens.id, presented.id));
      const token = await tx
        .insert(schema.refreshTokens)
        .values({
          familyId: family.id,
          tokenHash,
          previousTokenId: presented.id,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
          ipAddress: context.ipAddress ?? null,
          ipCountry: context.ipCountry ?? null,
        })
        .returning({ id: schema.refreshTokens.id })
        .then(([row]) => row ?? throwError(AppError.internal('Failed to rotate refresh token')));
      return token.id;
    });
    this.logger.debug('rotated refresh token', { userId: family.userId, familyId: family.id });
    return { secret: nextSecret, familyId: family.id, tokenId, context: this.toContext(family) };
  }

  /** Revokes the family a presented refresh token belongs to (RFC 7009); a no-op if unknown. */
  async revokeBySecret(secret: string): Promise<void> {
    const token = await this.db.query.refreshTokens.findFirst({ where: eq(schema.refreshTokens.tokenHash, this.hash(secret)) });
    if (token) await this.revokeFamily(token.familyId, 'LOGOUT');
  }

  /** Describes a refresh token for introspection: active only if the token and its family are live. */
  async describeBySecret(secret: string): Promise<RefreshTokenDescription | null> {
    const token = await this.db.query.refreshTokens.findFirst({ where: eq(schema.refreshTokens.tokenHash, this.hash(secret)) });
    if (!token) return null;
    const family = await this.db.query.refreshTokenFamilies.findFirst({ where: eq(schema.refreshTokenFamilies.id, token.familyId) });
    if (!family) return null;
    const active = token.status === 'ACTIVE' && token.expiresAt.getTime() > Date.now() && family.status === 'ACTIVE';
    return { active, context: this.toContext(family) };
  }

  async revokeFamily(familyId: string, reason: RefreshToken.RevokeReason): Promise<void> {
    const [family] = await this.db
      .update(schema.refreshTokenFamilies)
      .set({ status: 'REVOKED', revokeReason: reason, revokedAt: new Date() })
      .where(and(eq(schema.refreshTokenFamilies.id, familyId), eq(schema.refreshTokenFamilies.status, 'ACTIVE')))
      .returning();
    if (!family) return;

    await this.db
      .update(schema.refreshTokens)
      .set({ status: 'REVOKED' })
      .where(and(eq(schema.refreshTokens.familyId, familyId), ne(schema.refreshTokens.status, 'REVOKED')));
    if (reason === 'ROTATION_REUSE') {
      if (family.sessionId) await this.sessionService.revoke(family.sessionId, 'TERMINATED');
      await this.auditService.record({
        action: 'security.token_reuse',
        outcome: 'FAILURE',
        actorType: 'USER',
        actorId: family.userId.toString(),
        targetType: 'refresh_token_family',
        targetId: familyId,
      });
      this.logger.warn('Refresh token reuse detected; family and session revoked', { securityEvent: 'security.token_reuse', familyId, userId: family.userId });
    }
  }

  /** Revokes every active family a user holds, across all clients (admin lockdown, T-602). */
  async revokeAllForUser(userId: bigint): Promise<void> {
    const families = await this.db
      .update(schema.refreshTokenFamilies)
      .set({ status: 'REVOKED', revokeReason: 'ADMIN', revokedAt: new Date() })
      .where(and(eq(schema.refreshTokenFamilies.userId, userId), eq(schema.refreshTokenFamilies.status, 'ACTIVE')))
      .returning({ id: schema.refreshTokenFamilies.id });
    await Promise.all(
      families.map(family =>
        this.db
          .update(schema.refreshTokens)
          .set({ status: 'REVOKED' })
          .where(and(eq(schema.refreshTokens.familyId, family.id), ne(schema.refreshTokens.status, 'REVOKED'))),
      ),
    );
  }

  /** Revokes every active family a user holds in an organisation context (SCIM deprovisioning of adopted accounts). */
  async revokeForUserOrganisation(userId: bigint, organisationId: bigint): Promise<void> {
    const families = await this.db
      .update(schema.refreshTokenFamilies)
      .set({ status: 'REVOKED', revokeReason: 'ADMIN', revokedAt: new Date() })
      .where(and(eq(schema.refreshTokenFamilies.userId, userId), eq(schema.refreshTokenFamilies.organisationId, organisationId), eq(schema.refreshTokenFamilies.status, 'ACTIVE')))
      .returning({ id: schema.refreshTokenFamilies.id });
    await Promise.all(
      families.map(family =>
        this.db
          .update(schema.refreshTokens)
          .set({ status: 'REVOKED' })
          .where(and(eq(schema.refreshTokens.familyId, family.id), ne(schema.refreshTokens.status, 'REVOKED'))),
      ),
    );
  }

  /** Revokes every active family a user holds for a specific client (used on consent withdrawal). */
  async revokeForUserClient(userId: bigint, clientId: string): Promise<void> {
    const families = await this.db
      .update(schema.refreshTokenFamilies)
      .set({ status: 'REVOKED', revokeReason: 'ADMIN', revokedAt: new Date() })
      .where(and(eq(schema.refreshTokenFamilies.userId, userId), eq(schema.refreshTokenFamilies.clientId, clientId), eq(schema.refreshTokenFamilies.status, 'ACTIVE')))
      .returning({ id: schema.refreshTokenFamilies.id });
    await Promise.all(
      families.map(family =>
        this.db
          .update(schema.refreshTokens)
          .set({ status: 'REVOKED' })
          .where(and(eq(schema.refreshTokens.familyId, family.id), ne(schema.refreshTokens.status, 'REVOKED'))),
      ),
    );
  }

  async revokeForSession(sessionId: bigint): Promise<void> {
    const families = await this.db
      .update(schema.refreshTokenFamilies)
      .set({ status: 'REVOKED', revokeReason: 'LOGOUT', revokedAt: new Date() })
      .where(and(eq(schema.refreshTokenFamilies.sessionId, sessionId), eq(schema.refreshTokenFamilies.status, 'ACTIVE')))
      .returning({ id: schema.refreshTokenFamilies.id });
    await Promise.all(
      families.map(family =>
        this.db
          .update(schema.refreshTokens)
          .set({ status: 'REVOKED' })
          .where(and(eq(schema.refreshTokens.familyId, family.id), ne(schema.refreshTokens.status, 'REVOKED'))),
      ),
    );
  }
}

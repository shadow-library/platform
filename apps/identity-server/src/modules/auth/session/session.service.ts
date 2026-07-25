/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';

import { and, eq, ne } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase, schema, UserSession } from '@server/modules/infrastructure/datastore';

import { buildSessionCookies, CookieSpec } from './session-cookie';
import { SESSION_ABSOLUTE_TTL_MS, SESSION_CACHE_TTL_S, SESSION_ELEVATION_TTL_MS, SESSION_IDLE_TTL_MS, SESSION_TOUCH_THROTTLE_MS } from './session.constants';

/**
 * Defining types
 */

export interface CreateSession {
  userId: bigint;
  aal?: UserSession.Aal;
  signInEventId?: string | null;
  deviceFingerprint?: string;
  deviceName?: string;
  ipAddress?: string;
  ipCountry?: string;
  userAgent?: string;
}

export interface SessionResult {
  session: UserSession;
  secret: string;
  cookies: CookieSpec[];
}

export interface SessionWithDevice {
  session: UserSession;
  deviceName: string | null;
}

/**
 * What an open step-up window was performed for (D-19, T-801). `clientId` absent means the ceremony
 * carried no application intent — the identity console's own step-up — and no application may claim
 * it. A resolved `resource` is always present alongside a client so the audience comparison has a
 * value on both sides.
 */
export interface ElevationIntent {
  clientId: string;
  resource: string;
}

interface CachedSession {
  id: string;
  userId: string;
  aal: UserSession.Aal;
  elevatedUntil: number | null;
  elevationIntent: ElevationIntent | null;
  expiresAt: number;
}

export interface ValidatedSession {
  id: bigint;
  userId: bigint;
  aal: UserSession.Aal;
  elevatedUntil: number | null;
  elevationIntent: ElevationIntent | null;
  expiresAt: number;
}

export type TerminationReason = 'REVOKED' | 'TERMINATED' | 'EXPIRED';

/**
 * Declaring the constants
 */

@Injectable()
export class SessionService {
  private readonly logger = Logger.getLogger(APP_NAME, SessionService.name);
  private readonly db: PrimaryDatabase;
  private readonly redis: Redis;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
    this.redis = databaseService.getRedisClient();
  }

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private cacheKey(hash: string): string {
    return `session:${hash}`;
  }

  private userSetKey(userId: bigint): string {
    return `user_sessions:${userId}`;
  }

  async create(input: CreateSession): Promise<SessionResult> {
    const secret = randomBytes(32).toString('base64url');
    const sessionHash = this.hashSecret(secret);
    const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_TTL_MS);
    const deviceId = input.deviceFingerprint ? await this.upsertDevice(input.userId, input.deviceFingerprint, input.deviceName) : null;
    const aal = input.aal ?? 'AAL1';

    const session = await this.db
      .insert(schema.userSessions)
      .values({
        userId: input.userId,
        sessionHash,
        userSignInEventId: input.signInEventId ?? null,
        deviceId,
        aal,
        /** A session born from a fresh second-factor proof starts inside the step-up window. */
        elevatedUntil: aal === 'AAL2' ? new Date(Date.now() + SESSION_ELEVATION_TTL_MS) : null,
        expiresAt,
        ipAddress: input.ipAddress ?? null,
        ipCountry: input.ipCountry ?? null,
        userAgent: input.userAgent ?? null,
      })
      .returning()
      .then(([row]) => row ?? throwError(AppError.internal('Session creation failed')));

    await this.redis.sadd(this.userSetKey(input.userId), sessionHash);
    await this.cache(session);
    this.logger.debug('session created', { sessionId: session.id, userId: input.userId, aal: session.aal });
    return { session, secret, cookies: buildSessionCookies(secret, expiresAt) };
  }

  /** Resolves a session secret to a live session, enforcing absolute and idle expiry. */
  async validate(secret: string): Promise<ValidatedSession | null> {
    const hash = this.hashSecret(secret);
    const cached = await this.redis.get(this.cacheKey(hash));
    if (cached) return this.reviveCached(cached);

    const session = await this.db.query.userSessions.findFirst({ where: eq(schema.userSessions.sessionHash, hash) });
    if (!session || session.status !== 'ACTIVE') return null;

    const now = Date.now();
    if (session.expiresAt.getTime() <= now || session.lastUsedAt.getTime() + SESSION_IDLE_TTL_MS <= now) {
      await this.expire(session);
      return null;
    }

    await this.touch(session, now);
    await this.cache(session);
    return this.toValidated(session);
  }

  /**
   * Validates a session by id rather than by secret, for flows that hold a session reference instead
   * of the cookie — refresh-token rotation and first-party app sessions. Exercising such a reference
   * is genuine session activity, so the idle window is refreshed on success just as it is for a
   * cookie-borne request.
   */
  async validateById(sessionId: bigint): Promise<ValidatedSession | null> {
    const session = await this.getById(sessionId);
    if (!session || session.status !== 'ACTIVE') return null;

    const now = Date.now();
    if (session.expiresAt.getTime() <= now || session.lastUsedAt.getTime() + SESSION_IDLE_TTL_MS <= now) {
      await this.expire(session);
      return null;
    }

    await this.touch(session, now);
    await this.cache(session);
    return this.toValidated(session);
  }

  /** Refreshes `last_used_at` at most once per throttle window to bound write amplification. */
  private async touch(session: UserSession, now: number): Promise<void> {
    if (session.lastUsedAt.getTime() + SESSION_TOUCH_THROTTLE_MS > now) return;
    const lastUsedAt = new Date(now);
    await this.db.update(schema.userSessions).set({ lastUsedAt }).where(eq(schema.userSessions.id, session.id));
    session.lastUsedAt = lastUsedAt;
  }

  /**
   * Records a fresh second-factor proof: the session's achieved AAL becomes AAL2 permanently while
   * the elevation window that gates sensitive operations is time-boxed.
   *
   * The window is opened *for* the intent the ceremony declared (D-19, T-801) and only a matching
   * claim can spend it. Re-elevating overwrites the previous intent, so a window is never claimable
   * by an application the user did not just step up for.
   */
  async elevate(sessionId: bigint, intent?: ElevationIntent): Promise<ValidatedSession | null> {
    const elevatedUntil = new Date(Date.now() + SESSION_ELEVATION_TTL_MS);
    const [session] = await this.db
      .update(schema.userSessions)
      .set({ aal: 'AAL2', elevatedUntil, elevationIntentClientId: intent?.clientId ?? null, elevationIntentResource: intent?.resource ?? null })
      .where(eq(schema.userSessions.id, sessionId))
      .returning();
    if (!session) return null;
    await this.cache(session);
    return this.toValidated(session);
  }

  isElevated(session: ValidatedSession): boolean {
    return session.elevatedUntil !== null && session.elevatedUntil > Date.now();
  }

  /**
   * Whether an open window was opened for this exact `(client, audience)` pair. A window with no
   * intent belongs to the identity console and is claimable by no application, so elevated authority
   * can never cross from the console — or from a sibling application — into an API.
   */
  matchesElevationIntent(session: ValidatedSession, clientId: string, resource: string): boolean {
    const intent = session.elevationIntent;
    return intent !== null && intent.clientId === clientId && intent.resource === resource;
  }

  /**
   * Spends the step-up window while leaving the achieved `aal` intact.
   *
   * A step-up is proof for one privileged act, not a mode the session sits in. Once an application has
   * exchanged it for an audience-scoped elevation grant, the window is closed so no second application
   * — and no identity-domain route — can ride the same proof. `aal` remains AAL2 because the user did
   * demonstrate a second factor; only the right to act on it is consumed.
   */
  async consumeElevation(sessionId: bigint): Promise<void> {
    const [session] = await this.db
      .update(schema.userSessions)
      .set({ elevatedUntil: null, elevationIntentClientId: null, elevationIntentResource: null })
      .where(eq(schema.userSessions.id, sessionId))
      .returning();
    if (session) await this.cache(session);
  }

  async revoke(sessionId: bigint, reason: TerminationReason = 'REVOKED'): Promise<void> {
    const [session] = await this.db
      .update(schema.userSessions)
      .set({ status: reason, terminatedAt: new Date() })
      .where(and(eq(schema.userSessions.id, sessionId), eq(schema.userSessions.status, 'ACTIVE')))
      .returning();
    if (session) await this.invalidate(session);
  }

  /** Global sign-out: terminates every active session for the user, optionally sparing one. */
  async terminateAllForUser(userId: bigint, exceptSessionId?: bigint): Promise<void> {
    const condition = exceptSessionId
      ? and(eq(schema.userSessions.userId, userId), eq(schema.userSessions.status, 'ACTIVE'), ne(schema.userSessions.id, exceptSessionId))
      : and(eq(schema.userSessions.userId, userId), eq(schema.userSessions.status, 'ACTIVE'));
    const terminated = await this.db.update(schema.userSessions).set({ status: 'TERMINATED', terminatedAt: new Date() }).where(condition).returning();
    await Promise.all(terminated.map(session => this.invalidate(session)));
  }

  async listActiveForUser(userId: bigint): Promise<UserSession[]> {
    return this.db.query.userSessions.findMany({ where: and(eq(schema.userSessions.userId, userId), eq(schema.userSessions.status, 'ACTIVE')) });
  }

  async getById(sessionId: bigint): Promise<UserSession | null> {
    const session = await this.db.query.userSessions.findFirst({ where: eq(schema.userSessions.id, sessionId) });
    return session ?? null;
  }

  /** Active sessions joined with their device labels, for the self-service session list (§4.4). */
  async listActiveDetailed(userId: bigint): Promise<SessionWithDevice[]> {
    return this.db
      .select({ session: schema.userSessions, deviceName: schema.devices.name })
      .from(schema.userSessions)
      .leftJoin(schema.devices, eq(schema.userSessions.deviceId, schema.devices.id))
      .where(and(eq(schema.userSessions.userId, userId), eq(schema.userSessions.status, 'ACTIVE')));
  }

  private async expire(session: UserSession): Promise<void> {
    await this.db.update(schema.userSessions).set({ status: 'EXPIRED', terminatedAt: new Date() }).where(eq(schema.userSessions.id, session.id));
    await this.invalidate(session);
  }

  private async upsertDevice(userId: bigint, fingerprint: string, name?: string): Promise<bigint> {
    const fingerprintHash = this.hashSecret(fingerprint);
    const device = await this.db
      .insert(schema.devices)
      .values({ userId, fingerprintHash, name: name ?? null })
      .onConflictDoUpdate({ target: [schema.devices.userId, schema.devices.fingerprintHash], set: { lastSeenAt: new Date() } })
      .returning({ id: schema.devices.id })
      .then(([row]) => row ?? throwError(AppError.internal('Device upsert failed')));
    return device.id;
  }

  private async cache(session: UserSession): Promise<void> {
    const payload = JSON.stringify({
      id: session.id.toString(),
      userId: session.userId.toString(),
      aal: session.aal,
      elevatedUntil: session.elevatedUntil ? session.elevatedUntil.getTime() : null,
      elevationIntent: SessionService.toIntent(session),
      expiresAt: session.expiresAt.getTime(),
    });
    await this.redis.set(this.cacheKey(session.sessionHash), payload, 'EX', SESSION_CACHE_TTL_S);
  }

  private async invalidate(session: UserSession): Promise<void> {
    await this.redis.del(this.cacheKey(session.sessionHash));
    await this.redis.srem(this.userSetKey(session.userId), session.sessionHash);
  }

  /** Both columns are written together, so a client without a resource is not a representable state. */
  private static toIntent(session: UserSession): ElevationIntent | null {
    if (!session.elevationIntentClientId || !session.elevationIntentResource) return null;
    return { clientId: session.elevationIntentClientId, resource: session.elevationIntentResource };
  }

  private toValidated(session: UserSession): ValidatedSession {
    return {
      id: session.id,
      userId: session.userId,
      aal: session.aal,
      elevatedUntil: session.elevatedUntil ? session.elevatedUntil.getTime() : null,
      elevationIntent: SessionService.toIntent(session),
      expiresAt: session.expiresAt.getTime(),
    };
  }

  private reviveCached(cached: string): ValidatedSession {
    const parsed = JSON.parse(cached) as CachedSession;
    return {
      id: BigInt(parsed.id),
      userId: BigInt(parsed.userId),
      aal: parsed.aal,
      elevatedUntil: parsed.elevatedUntil,
      elevationIntent: parsed.elevationIntent ?? null,
      expiresAt: parsed.expiresAt,
    };
  }
}

/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { and, eq, ne } from 'drizzle-orm';
import { Redis } from 'ioredis';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase, UserSession, schema } from '@server/modules/infrastructure/datastore';

import { CookieSpec, buildSessionCookies } from './session-cookie';
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

export interface ValidatedSession {
  id: bigint;
  userId: bigint;
  aal: UserSession.Aal;
  elevatedUntil: number | null;
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

    const [session] = await this.db
      .insert(schema.userSessions)
      .values({
        userId: input.userId,
        sessionHash,
        userSignInEventId: input.signInEventId ?? null,
        deviceId,
        aal: input.aal ?? 'AAL1',
        expiresAt,
        ipAddress: input.ipAddress ?? null,
        ipCountry: input.ipCountry ?? null,
        userAgent: input.userAgent ?? null,
      })
      .returning();
    if (!session) throw new Error('Session creation failed');

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

  /** Refreshes `last_used_at` at most once per throttle window to bound write amplification. */
  private async touch(session: UserSession, now: number): Promise<void> {
    if (session.lastUsedAt.getTime() + SESSION_TOUCH_THROTTLE_MS > now) return;
    const lastUsedAt = new Date(now);
    await this.db.update(schema.userSessions).set({ lastUsedAt }).where(eq(schema.userSessions.id, session.id));
    session.lastUsedAt = lastUsedAt;
  }

  async elevate(sessionId: bigint): Promise<void> {
    const elevatedUntil = new Date(Date.now() + SESSION_ELEVATION_TTL_MS);
    const [session] = await this.db.update(schema.userSessions).set({ elevatedUntil }).where(eq(schema.userSessions.id, sessionId)).returning();
    if (session) await this.cache(session);
  }

  isElevated(session: ValidatedSession): boolean {
    return session.elevatedUntil !== null && session.elevatedUntil > Date.now();
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

  private async expire(session: UserSession): Promise<void> {
    await this.db.update(schema.userSessions).set({ status: 'EXPIRED', terminatedAt: new Date() }).where(eq(schema.userSessions.id, session.id));
    await this.invalidate(session);
  }

  private async upsertDevice(userId: bigint, fingerprint: string, name?: string): Promise<bigint> {
    const fingerprintHash = this.hashSecret(fingerprint);
    const [device] = await this.db
      .insert(schema.devices)
      .values({ userId, fingerprintHash, name: name ?? null })
      .onConflictDoUpdate({ target: [schema.devices.userId, schema.devices.fingerprintHash], set: { lastSeenAt: new Date() } })
      .returning({ id: schema.devices.id });
    if (!device) throw new Error('Device upsert failed');
    return device.id;
  }

  private async cache(session: UserSession): Promise<void> {
    const payload = JSON.stringify({
      id: session.id.toString(),
      userId: session.userId.toString(),
      aal: session.aal,
      elevatedUntil: session.elevatedUntil ? session.elevatedUntil.getTime() : null,
      expiresAt: session.expiresAt.getTime(),
    });
    await this.redis.set(this.cacheKey(session.sessionHash), payload, 'EX', SESSION_CACHE_TTL_S);
  }

  private async invalidate(session: UserSession): Promise<void> {
    await this.redis.del(this.cacheKey(session.sessionHash));
    await this.redis.srem(this.userSetKey(session.userId), session.sessionHash);
  }

  private toValidated(session: UserSession): ValidatedSession {
    return {
      id: session.id,
      userId: session.userId,
      aal: session.aal,
      elevatedUntil: session.elevatedUntil ? session.elevatedUntil.getTime() : null,
      expiresAt: session.expiresAt.getTime(),
    };
  }

  private reviveCached(cached: string): ValidatedSession {
    const parsed = JSON.parse(cached) as { id: string; userId: string; aal: UserSession.Aal; elevatedUntil: number | null; expiresAt: number };
    return { id: BigInt(parsed.id), userId: BigInt(parsed.userId), aal: parsed.aal, elevatedUntil: parsed.elevatedUntil, expiresAt: parsed.expiresAt };
  }
}

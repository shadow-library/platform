/**
 * Importing npm packages
 */
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase, schema, User, UserSession } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface SignInDevice {
  deviceId?: string;
  ipAddress?: string;
  ipCountry?: string;
  userAgent?: string;
}

export interface SignInEventInput {
  flowId: string;
  userId?: bigint | null;
  identifier: string;
  status: UserSession.SignInEvent['status'];
  authMode: User.AuthProvider;
  mfaMode?: User.AuthProvider | null;
  device?: SignInDevice;
}

/**
 * Declaring the constants
 *
 * Tier-4 persistent lock: after this many failed authentications within the window, the account's
 * password credential is locked to OTP-only recovery paths (docs/auth/overview.md §8).
 */
const LOCK_THRESHOLD = 5;
const LOCK_WINDOW_MINUTES = 15;
const FAILURE_STATUSES: UserSession.SignInEvent['status'][] = ['INVALID_CREDENTIALS', 'MFA_FAILED'];

@Injectable()
export class SignInEventService {
  private readonly logger = Logger.getLogger(APP_NAME, SignInEventService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async record(input: SignInEventInput): Promise<void> {
    await this.db
      .insert(schema.userSignInEvents)
      .values({
        id: input.flowId.replace(/^flow_auth_/, ''),
        userId: input.userId ?? null,
        identifier: input.identifier,
        status: input.status,
        authModeUsed: input.authMode,
        mfaModeUsed: input.mfaMode ?? null,
        deviceId: input.device?.deviceId ?? null,
        ipAddress: input.device?.ipAddress ?? null,
        ipCountry: input.device?.ipCountry ?? null,
        userAgent: input.device?.userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: schema.userSignInEvents.id,
        set: { status: input.status, mfaModeUsed: input.mfaMode ?? null },
      });
  }

  /**
   * Applies the Tier-4 persistent lock when recent failures for the user exceed the threshold.
   * Returns true if the account is now locked to OTP-only.
   */
  async evaluateLock(userId: bigint): Promise<boolean> {
    const since = new Date(Date.now() - LOCK_WINDOW_MINUTES * 60_000);
    const rows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.userSignInEvents)
      .where(and(eq(schema.userSignInEvents.userId, userId), gte(schema.userSignInEvents.createdAt, since), inArray(schema.userSignInEvents.status, FAILURE_STATUSES)));

    const count = rows[0]?.count ?? 0;
    if (count < LOCK_THRESHOLD) return false;
    await this.db
      .update(schema.users)
      .set({ lockMode: 'OTP_ONLY', lockedUntil: new Date(Date.now() + LOCK_WINDOW_MINUTES * 60_000) })
      .where(eq(schema.users.id, userId));
    this.logger.warn('Account locked to OTP-only after repeated failures', { userId, count });
    return true;
  }
}

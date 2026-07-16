/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { and, desc, eq, notInArray } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

export interface PasswordHash {
  hash: string;
  version: number;
}

export interface VerifyResult {
  valid: boolean;
  needsRehash: boolean;
}

/**
 * Declaring the constants
 *
 * Argon2id cost parameters are pinned and versioned so a policy change becomes a rehash-on-verify
 * migration rather than a silent divergence. Bumping PARAMS_VERSION marks every older hash for
 * upgrade the next time its owner authenticates.
 */
const ARGON2_OPTIONS = { algorithm: 'argon2id', memoryCost: 65536, timeCost: 3 } as const;
export const PASSWORD_PARAMS_VERSION = 1;
const PASSWORD_HISTORY_DEPTH = 5;

/** A valid argon2id hash used to spend equivalent work when a user has no password credential. */
const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=1$NCJqmYBSCaQHCbd96KVjeycfea/Op9Qf6OqrtzsUMkw$YNaWD8v4qxMkTfyuv7T0n+3PYqGqYo+6ixhN31TqX6E';

@Injectable()
export class PasswordService {
  private readonly logger = Logger.getLogger(APP_NAME, PasswordService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async hash(password: string): Promise<PasswordHash> {
    const hash = await Bun.password.hash(password, ARGON2_OPTIONS);
    return { hash, version: PASSWORD_PARAMS_VERSION };
  }

  async verify(password: string, stored: PasswordHash): Promise<VerifyResult> {
    const valid = await Bun.password.verify(password, stored.hash);
    return { valid, needsRehash: valid && stored.version !== PASSWORD_PARAMS_VERSION };
  }

  /**
   * Verifies a user's password credential, transparently upgrading the stored hash when the pinned
   * parameters have changed. Returns false (after a constant-work dummy verification) when the user
   * has no password identity, so callers cannot distinguish "no credential" from "wrong password".
   */
  async verifyForUser(userId: bigint | null, password: string): Promise<boolean> {
    const identity = userId
      ? await this.db.query.userAuthIdentities.findFirst({
          where: and(eq(schema.userAuthIdentities.userId, userId), eq(schema.userAuthIdentities.provider, 'PASSWORD')),
          with: { password: true },
        })
      : undefined;
    const stored = identity?.password;
    if (!stored) {
      await Bun.password.verify(password, DUMMY_HASH).catch(() => false);
      this.logger.debug('password verification failed: user has no password credential', { userId });
      return false;
    }

    const result = await this.verify(password, { hash: stored.hash, version: stored.version });
    if (result.valid && result.needsRehash) {
      const rehashed = await this.hash(password);
      await this.db
        .update(schema.userPasswords)
        .set({ hash: rehashed.hash, version: rehashed.version, algorithm: 'ARGON2ID' })
        .where(eq(schema.userPasswords.userAuthIdentityId, stored.userAuthIdentityId));
      this.logger.debug('upgraded stored password hash to current argon2id params', { userId });
    }
    this.logger.debug('password verification completed', { userId, valid: result.valid });
    return result.valid;
  }

  /**
   * Sets (or creates) a user's password credential and records it in history. Used by recovery and
   * password change; callers should reject reused passwords via isReused beforehand.
   */
  async changePassword(userId: bigint, password: string, providerKey: string): Promise<void> {
    const { hash, version } = await this.hash(password);
    await this.db.transaction(async tx => {
      let identity = await tx.query.userAuthIdentities.findFirst({
        where: and(eq(schema.userAuthIdentities.userId, userId), eq(schema.userAuthIdentities.provider, 'PASSWORD')),
      });
      if (!identity) {
        [identity] = await tx.insert(schema.userAuthIdentities).values({ userId, provider: 'PASSWORD', providerKey }).returning();
        this.logger.debug('created password identity for user', { userId });
      }
      if (!identity) {
        this.logger.error('failed to resolve password identity during change', { userId });
        throw AppError.internal('Failed to resolve password identity');
      }

      await tx
        .insert(schema.userPasswords)
        .values({ userAuthIdentityId: identity.id, hash, version, algorithm: 'ARGON2ID' })
        .onConflictDoUpdate({ target: schema.userPasswords.userAuthIdentityId, set: { hash, version, algorithm: 'ARGON2ID' } });
      await tx.insert(schema.passwordHistory).values({ userId, hash });
      /** A replaced credential satisfies any admin-forced reset (T-602). */
      await tx.update(schema.users).set({ passwordResetRequired: false }).where(eq(schema.users.id, userId));
    });
    await this.pruneHistory(userId);
    this.logger.info('password changed', { userId });
  }

  /** Rejects a candidate password that matches the current or any of the recent stored hashes. */
  async isReused(userId: bigint, password: string): Promise<boolean> {
    const history = await this.db
      .select({ hash: schema.passwordHistory.hash })
      .from(schema.passwordHistory)
      .where(eq(schema.passwordHistory.userId, userId))
      .orderBy(desc(schema.passwordHistory.createdAt))
      .limit(PASSWORD_HISTORY_DEPTH);
    for (const entry of history) {
      if (await Bun.password.verify(password, entry.hash)) {
        this.logger.debug('password reuse check: candidate matches a recent password', { userId });
        return true;
      }
    }
    this.logger.debug('password reuse check: candidate is new', { userId, historyDepth: history.length });
    return false;
  }

  async recordHistory(userId: bigint, hash: string): Promise<void> {
    await this.db.insert(schema.passwordHistory).values({ userId, hash });
    await this.pruneHistory(userId);
  }

  private async pruneHistory(userId: bigint): Promise<void> {
    const kept = await this.db
      .select({ id: schema.passwordHistory.id })
      .from(schema.passwordHistory)
      .where(eq(schema.passwordHistory.userId, userId))
      .orderBy(desc(schema.passwordHistory.createdAt))
      .limit(PASSWORD_HISTORY_DEPTH);
    if (kept.length < PASSWORD_HISTORY_DEPTH) return;
    const keptIds = kept.map(entry => entry.id);
    await this.db.delete(schema.passwordHistory).where(and(eq(schema.passwordHistory.userId, userId), notInArray(schema.passwordHistory.id, keptIds)));
  }
}

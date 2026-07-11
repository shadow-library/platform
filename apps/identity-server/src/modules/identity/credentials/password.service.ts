/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
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

  /** Rejects a candidate password that matches the current or any of the recent stored hashes. */
  async isReused(userId: bigint, password: string): Promise<boolean> {
    const history = await this.db
      .select({ hash: schema.passwordHistory.hash })
      .from(schema.passwordHistory)
      .where(eq(schema.passwordHistory.userId, userId))
      .orderBy(desc(schema.passwordHistory.createdAt))
      .limit(PASSWORD_HISTORY_DEPTH);
    for (const entry of history) {
      if (await Bun.password.verify(password, entry.hash)) return true;
    }
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

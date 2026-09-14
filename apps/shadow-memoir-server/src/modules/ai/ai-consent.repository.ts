/**
 * Importing npm packages
 */
import { and, eq, isNotNull, isNull, TransactionRollbackError } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type AiConsent, nextSyncSeq, schema } from '@server/database';

/**
 * Defining types
 */

export interface AiConsentDecision {
  dataClass: AiConsent.DataClass;
  granted: boolean;
}

/**
 * Declaring the constants
 */

const CONSENT_KEY = [schema.aiConsents.accountId, schema.aiConsents.dataClass];

/** A declined class is a row withdrawn at the moment it was recorded: `withdrawn_at IS NULL` stays the only "granted" test, so a decision never needs a nullable `granted_at`. */
@Injectable()
export class AiConsentRepository extends OwnerScopedRepository {
  async list(): Promise<AiConsent.Row[]> {
    return (await this.scoped(schema.aiConsents)) as AiConsent.Row[];
  }

  async grant(dataClass: AiConsent.DataClass): Promise<void> {
    const accountId = this.requireAccountId();
    const now = new Date();
    await this.db
      .insert(schema.aiConsents)
      .values({ accountId, dataClass, grantedAt: now, withdrawnAt: null })
      .onConflictDoUpdate({
        target: CONSENT_KEY,
        set: { grantedAt: now, withdrawnAt: null, syncSeq: nextSyncSeq() },
        setWhere: and(eq(schema.aiConsents.accountId, accountId), isNotNull(schema.aiConsents.withdrawnAt)),
      });
  }

  async withdraw(dataClass: AiConsent.DataClass): Promise<void> {
    const accountId = this.requireAccountId();
    const now = new Date();
    await this.db
      .insert(schema.aiConsents)
      .values({ accountId, dataClass, grantedAt: now, withdrawnAt: now })
      .onConflictDoUpdate({
        target: CONSENT_KEY,
        set: { withdrawnAt: now, syncSeq: nextSyncSeq() },
        setWhere: and(eq(schema.aiConsents.accountId, accountId), isNull(schema.aiConsents.withdrawnAt)),
      });
  }

  /**
   * The unique `(account_id, data_class)` key is the guard: a concurrent first decision waits on the winner's rows and then inserts none, and
   * any partial insert is rolled back. Callers pass every class in one fixed order, so two racing decisions cannot deadlock on each other's keys.
   */
  async recordFirstDecision(decisions: AiConsentDecision[]): Promise<boolean> {
    const accountId = this.requireAccountId();
    const now = new Date();
    const values = decisions.map(({ dataClass, granted }) => ({ accountId, dataClass, grantedAt: now, withdrawnAt: granted ? null : now }));
    try {
      await this.transaction(async tx => {
        const recorded = await tx.insert(schema.aiConsents).values(values).onConflictDoNothing({ target: CONSENT_KEY }).returning({ dataClass: schema.aiConsents.dataClass });
        if (recorded.length < values.length) tx.rollback();
      });
      return true;
    } catch (error) {
      if (error instanceof TransactionRollbackError) return false;
      throw error;
    }
  }
}

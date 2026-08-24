/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { OwnerScopedRepository } from '@modules/auth';
import { type AiConsent, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class AiConsentRepository extends OwnerScopedRepository {
  async list(): Promise<AiConsent.Row[]> {
    return (await this.scoped(schema.aiConsents)) as AiConsent.Row[];
  }

  /** Re-grant upserts the same row (§10.3): grant/withdraw history is the latest transition, never a growing log. */
  async grant(dataClass: AiConsent.DataClass): Promise<AiConsent.Row> {
    const accountId = this.requireAccountId();
    const now = new Date();
    const [row] = await this.db
      .insert(schema.aiConsents)
      .values({ accountId, dataClass, grantedAt: now, withdrawnAt: null })
      .onConflictDoUpdate({
        target: [schema.aiConsents.accountId, schema.aiConsents.dataClass],
        set: { grantedAt: now, withdrawnAt: null },
        setWhere: eq(schema.aiConsents.accountId, accountId),
      })
      .returning();
    if (!row) throw AppError.internal('ai_consents upsert returned no row');
    return row;
  }

  /** No-op when the class was never granted — nothing to withdraw, and no row is created for the sake of one. */
  async withdraw(dataClass: AiConsent.DataClass): Promise<void> {
    await this.scopedUpdate(schema.aiConsents, { withdrawnAt: new Date() }, eq(schema.aiConsents.dataClass, dataClass));
  }
}

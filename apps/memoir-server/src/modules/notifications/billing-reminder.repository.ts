/**
 * Importing npm packages
 */
import { and, inArray, lte, or } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { type Entitlement, type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

export interface DueEntitlement {
  accountId: bigint;
  state: Entitlement.State;
  expiresAt: Date | null;
  graceEndsAt: Date | null;
}

@Injectable()
export class BillingReminderRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /** Grace/lapsed remind unconditionally (there is exactly one grace window and one lapse per cycle); trial/active remind once their `expiresAt` is inside the configured lead window. */
  async findDue(horizon: Date): Promise<DueEntitlement[]> {
    return this.db
      .select({
        accountId: schema.entitlements.accountId,
        state: schema.entitlements.state,
        expiresAt: schema.entitlements.expiresAt,
        graceEndsAt: schema.entitlements.graceEndsAt,
      })
      .from(schema.entitlements)
      .where(
        or(inArray(schema.entitlements.state, ['grace', 'lapsed']), and(inArray(schema.entitlements.state, ['trial', 'active']), lte(schema.entitlements.expiresAt, horizon))),
      );
  }
}

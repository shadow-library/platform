/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { type Entitlement, type PrimaryDatabase, schema } from '@server/database';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * The read half of the entitlement surface, on the API pool — which holds SELECT and nothing else
 * (ARCHITECTURE §5.4). There is deliberately no update or insert method on this class: the write path
 * lives in `BillingRepository` behind the `memoir_billing` pool, so no amount of misuse from a
 * user-facing route can reach a write.
 */
@Injectable()
export class EntitlementRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async findByAccountId(accountId: bigint): Promise<Entitlement.Row | null> {
    const [row] = await this.db.select().from(schema.entitlements).where(eq(schema.entitlements.accountId, accountId));
    return row ?? null;
  }
}

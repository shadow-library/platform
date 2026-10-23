import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type Entitlement, type PrimaryDatabase, schema } from '@server/database';

/**
 * The read half of the entitlement surface. There is deliberately no update or insert method on this
 * class: the write path lives in `BillingRepository`, which no user-facing route reaches.
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

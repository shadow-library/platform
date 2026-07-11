/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { and, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { DatabaseService, FederatedIdentity, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class FederatedIdentityService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async findBySubject(identityProviderId: string, subject: string): Promise<FederatedIdentity | null> {
    const identity = await this.db.query.federatedIdentities.findFirst({
      where: and(eq(schema.federatedIdentities.identityProviderId, identityProviderId), eq(schema.federatedIdentities.subject, subject)),
    });
    return identity ?? null;
  }

  async link(identityProviderId: string, userId: bigint, subject: string): Promise<FederatedIdentity> {
    const [identity] = await this.db.insert(schema.federatedIdentities).values({ identityProviderId, userId, subject }).returning();
    if (!identity) throw new Error('Federated identity link failed');
    return identity;
  }

  async listForUser(userId: bigint): Promise<FederatedIdentity[]> {
    return this.db.query.federatedIdentities.findMany({ where: eq(schema.federatedIdentities.userId, userId) });
  }
}

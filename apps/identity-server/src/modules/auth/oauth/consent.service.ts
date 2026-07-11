/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { and, eq, isNull } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { RefreshTokenService } from '@server/modules/auth/token';
import { Consent, DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class ConsentService {
  private readonly logger = Logger.getLogger(APP_NAME, ConsentService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {
    this.db = databaseService.getPostgresClient();
  }

  private activeCondition(userId: bigint, clientId: string) {
    return and(eq(schema.consents.userId, userId), eq(schema.consents.clientId, clientId), isNull(schema.consents.revokedAt));
  }

  async getActive(userId: bigint, clientId: string): Promise<Consent | null> {
    const consent = await this.db.query.consents.findFirst({ where: this.activeCondition(userId, clientId) });
    return consent ?? null;
  }

  /** Records a consent grant idempotently, adding any newly requested scopes to the active record. */
  async record(userId: bigint, clientId: string, scopeNames: string[], source: Consent.Source): Promise<void> {
    const existing = await this.getActive(userId, clientId);
    if (!existing) {
      await this.db.insert(schema.consents).values({ userId, clientId, scopeNames, source });
      return;
    }
    const merged = Array.from(new Set([...existing.scopeNames, ...scopeNames]));
    if (merged.length !== existing.scopeNames.length) await this.db.update(schema.consents).set({ scopeNames: merged }).where(eq(schema.consents.id, existing.id));
  }

  async listForUser(userId: bigint): Promise<Consent[]> {
    return this.db.query.consents.findMany({ where: and(eq(schema.consents.userId, userId), isNull(schema.consents.revokedAt)) });
  }

  /** Withdraws consent and revokes every token the client holds for the user. */
  async withdraw(userId: bigint, clientId: string): Promise<void> {
    await this.db.update(schema.consents).set({ revokedAt: new Date() }).where(this.activeCondition(userId, clientId));
    await this.refreshTokenService.revokeForUserClient(userId, clientId);
    this.logger.info('Consent withdrawn', { userId, clientId });
  }
}

/**
 * Importing npm packages
 */
import { and, eq, isNull } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { RefreshTokenService } from '@server/modules/auth/token';
import { Consent, DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';
import { ApplicationMemberService } from '@server/modules/system/application';

import { OAuthClientService } from './oauth-client.service';

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
    private readonly clientService: OAuthClientService,
    private readonly applicationMemberService: ApplicationMemberService,
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
      await this.provisionMembership(userId, clientId);
      return;
    }
    const merged = Array.from(new Set([...existing.scopeNames, ...scopeNames]));
    if (merged.length !== existing.scopeNames.length) await this.db.update(schema.consents).set({ scopeNames: merged }).where(eq(schema.consents.id, existing.id));
  }

  /**
   * First-use provisioning: a fresh grant enrols the user into the client's application. Best-effort
   * by design — a usage record must never break the authorization it rides on, so a failure is
   * logged and swallowed rather than surfaced to the OAuth flow.
   */
  private async provisionMembership(userId: bigint, clientId: string): Promise<void> {
    try {
      const client = await this.clientService.getClient(clientId);
      if (client) await this.applicationMemberService.ensureMembership(client.applicationId, userId);
    } catch (error) {
      this.logger.warn('Failed to provision application membership on consent', { userId, clientId, error });
    }
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

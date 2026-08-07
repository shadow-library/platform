import { and, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

const UNVERIFIED_CLAIM_TTL_DAYS = 7;

@Injectable()
export class MaintenanceService {
  private readonly logger = Logger.getLogger(APP_NAME, MaintenanceService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  async purgeStaleContactClaims(): Promise<number> {
    const cutoff = new Date(Date.now() - UNVERIFIED_CLAIM_TTL_DAYS * 24 * 60 * 60 * 1000);
    const emails = await this.db
      .delete(schema.userEmails)
      .where(and(isNull(schema.userEmails.verifiedAt), lt(schema.userEmails.createdAt, cutoff)))
      .returning({ emailId: schema.userEmails.emailId });
    const phones = await this.db
      .delete(schema.userPhones)
      .where(and(isNull(schema.userPhones.verifiedAt), lt(schema.userPhones.createdAt, cutoff)))
      .returning({ phoneNumber: schema.userPhones.phoneNumber });
    const challenges = await this.db
      .delete(schema.verificationChallenges)
      .where(lt(schema.verificationChallenges.expiresAt, sql`now() - interval '1 day'`))
      .returning({ id: schema.verificationChallenges.id });

    const purged = emails.length + phones.length + challenges.length;
    if (purged > 0) this.logger.info('purged stale claims and challenges', { emails: emails.length, phones: phones.length, challenges: challenges.length });
    return purged;
  }

  async purgeStaleAppSessions(): Promise<number> {
    const orphaned = await this.db
      .update(schema.appSessions)
      .set({ status: 'EXPIRED', terminatedAt: new Date() })
      .where(
        and(
          eq(schema.appSessions.status, 'ACTIVE'),
          or(
            lt(schema.appSessions.expiresAt, new Date()),
            inArray(schema.appSessions.identitySessionId, this.db.select({ id: schema.userSessions.id }).from(schema.userSessions).where(ne(schema.userSessions.status, 'ACTIVE'))),
          ),
        ),
      )
      .returning({ id: schema.appSessions.id });

    const elevations = await this.db
      .delete(schema.appSessionElevations)
      .where(lt(schema.appSessionElevations.expiresAt, new Date()))
      .returning({ id: schema.appSessionElevations.id });

    const purged = orphaned.length + elevations.length;
    if (purged > 0) this.logger.info('purged stale app sessions and elevations', { appSessions: orphaned.length, elevations: elevations.length });
    return purged;
  }
}

/**
 * Importing npm packages
 */
import { and, isNull, lt, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase, schema } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const UNVERIFIED_CLAIM_TTL_DAYS = 7;

/**
 * Periodic data hygiene. Stale unverified email/phone claims are purged so an abandoned claim can
 * never indefinitely shadow an address (DB doc §2); consumed or expired OTP challenges age out
 * with them.
 */
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
}

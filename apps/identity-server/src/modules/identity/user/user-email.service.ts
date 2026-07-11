/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatabaseService, PrimaryDatabase } from '@server/modules/infrastructure/datastore';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Injectable()
export class UserEmailService {
  private readonly logger = Logger.getLogger(APP_NAME, UserEmailService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient();
  }

  /** An address is taken only once verified: unverified claims must not block registration (DB §2). */
  async isEmailExists(email: string): Promise<boolean> {
    const userEmail = await this.db.query.userEmails.findFirst({
      where: (userEmail, { and, eq, isNotNull }) => and(eq(userEmail.emailId, email.toLowerCase()), isNotNull(userEmail.verifiedAt)),
    });
    return !!userEmail;
  }

  /** Returns the user's primary verified email, preferring a primary flag then any verified one. */
  async getPrimaryEmail(userId: bigint): Promise<string | null> {
    const emails = await this.db.query.userEmails.findMany({ where: (email, { eq }) => eq(email.userId, userId) });
    const verified = emails.filter(email => email.verifiedAt !== null);
    const primary = verified.find(email => email.isPrimary) ?? verified[0];
    return primary?.emailId ?? null;
  }
}

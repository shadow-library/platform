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

  async isEmailExists(email: string): Promise<boolean> {
    const userEmail = await this.db.query.userEmails.findFirst({
      where: (userEmail, { eq }) => eq(userEmail.emailId, email.toLowerCase()),
    });
    return !!userEmail;
  }

  /** Returns the user's primary verified email, preferring a primary flag then any verified one. */
  async getPrimaryEmail(userId: bigint): Promise<string | null> {
    const emails = await this.db.query.userEmails.findMany({ where: (email, { eq }) => eq(email.userId, userId) });
    const verified = emails.filter(email => email.isVerified);
    const primary = verified.find(email => email.isPrimary) ?? verified[0];
    return primary?.emailId ?? null;
  }
}

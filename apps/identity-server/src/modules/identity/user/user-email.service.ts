/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { DatastoreService, PrimaryDatabase } from '@server/modules/infrastructure/datastore';

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

  constructor(datastoreService: DatastoreService) {
    this.db = datastoreService.getPrimaryDatabase();
  }

  async isEmailExists(email: string): Promise<boolean> {
    const userEmail = await this.db.query.userEmails.findFirst({
      where: (userEmail, { eq }) => eq(userEmail.emailId, email.toLowerCase()),
    });
    return !!userEmail;
  }
}

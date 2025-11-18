/**
 * Importing npm packages
 */
import { ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const constraintErrorMap: Record<string, ServerError> = {
  users_username_unique: new ServerError(AppErrorCode.USR_002),
  user_emails_email_id_unique: new ServerError(AppErrorCode.USR_003),
  user_phones_phone_number_unique: new ServerError(AppErrorCode.USR_004),
};

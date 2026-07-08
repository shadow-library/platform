/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { ServerError } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '../classes/app-error-code';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// Maps postgres constraint names to user-facing errors; anything unmapped surfaces as a 500 from
// DatabaseService.translateError, so every user-triggerable constraint belongs here.
export const constraintErrorMap: Record<string, ServerError> = {
  projects_name_unique: new ServerError(AppErrorCode.PRJ_002),
};

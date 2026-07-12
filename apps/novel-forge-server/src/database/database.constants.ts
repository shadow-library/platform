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

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

// Maps postgres constraint names to user-facing errors; anything unmapped surfaces as a 500 from
// DatabaseService.translateError, so every user-triggerable constraint belongs here. Currently empty:
// project names stopped being unique and no other constraint is reachable from user input.
export const constraintErrorMap: Record<string, ServerError> = {};

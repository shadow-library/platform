/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/*!
 * Message Style Guide:
 *
 * All validation messages in this object must follow a **constraint-based**
 * style. The message should describe only the failed constraint, not the field
 * name itself. The `field` will be provided separately by the error object.
 *
 * Examples:
 *   - "must be a valid email address"
 *   - "must be a valid phone number"
 *   - "must not be empty"
 *   - "must be at least 8 characters long"
 *
 * Bad Examples (do NOT include the field name):
 *   - "Email is invalid"
 *   - "The phone number you entered is wrong"
 *
 * This ensures consistency, supports machine-readable error handling, and
 * allows the consumer to format errors as:
 *    `${field} ${msg}`
 */
export const ERROR_MESSAGES = {
  INVALID_EMAIL: 'must be a valid email address',
  INVALID_PHONE_NUMBER: 'must be a valid phone number',
  INVALID_PASSWORD: 'must be at least 8 characters long and include a mix of lowercase, uppercase, numbers, and special characters',
  INVALID_USERNAME: 'must be 3-32 characters long and contain only letters, numbers, dots, underscores, or hyphens',
  INVALID_DATE_OF_BIRTH: 'must be a valid date in the past',
} as const satisfies Record<string, string>;

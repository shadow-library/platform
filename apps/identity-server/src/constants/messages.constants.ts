/**
 * Validation messages use constraint-based wording: describe only the failed constraint, never the
 * field name. The error object supplies `field` separately, allowing consumers to render
 * `${field} ${msg}` and handle failures consistently. Prefer "must be a valid email address" or
 * "must not be empty", not "Email is invalid" or "The phone number you entered is wrong".
 */
export const ERROR_MESSAGES = {
  INVALID_EMAIL: 'must be a valid email address',
  INVALID_PHONE_NUMBER: 'must be a valid phone number',
  INVALID_PASSWORD: 'must be at least 8 characters long and include a mix of lowercase, uppercase, numbers, and special characters',
  INVALID_USERNAME: 'must be 3-32 characters long and contain only letters, numbers, dots, underscores, or hyphens',
  INVALID_DATE_OF_BIRTH: 'must be a valid date in the past',
  BREACHED_PASSWORD: 'has appeared in a known data breach and must not be used',
  REUSED_PASSWORD: 'must not match a recently used password',
  INVALID_IDENTIFIER: 'must be a valid email address, phone number, or username',
  INVALID_ID: 'must be a numeric identifier',
  INVALID_UUID: 'must be a valid UUID',
  INVALID_OTP: 'must be a 6-digit code',
  INVALID_CLIENT_ID: 'must be 3-64 characters long, contain only lowercase letters, numbers, or hyphens, and start and end with a letter or number',
  INVALID_SLUG: 'must be at most 48 characters long, contain only lowercase letters, numbers, or hyphens, and start and end with a letter or number',
  INVALID_APPLICATION_NAME: 'must be 2-63 characters long, contain only lowercase letters, numbers, or hyphens, and start with a letter or number',
  INVALID_SUBDOMAIN: 'must be 1-63 characters long, contain only lowercase letters, numbers, or hyphens, and start with a letter or number',
  EXPIRY_NOT_APPLICABLE: 'may only accompany a suspension, which is the sole status that lapses on its own',
  EXPIRY_MUST_BE_FUTURE: 'must be a point in the future',
} as const satisfies Record<string, string>;

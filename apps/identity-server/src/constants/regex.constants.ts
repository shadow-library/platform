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

export const REGEX = {
  USERNAME: /^[a-zA-Z0-9._-]{3,32}$/,
  EMAIL: /^[^@\s]+@[^@\s]+\.[^@\s]+$/,
  PHONE: /^\+[1-9]\d{6,14}$/,
} as const satisfies Record<string, RegExp>;

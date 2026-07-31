/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface ShadowErrorOptions {
  /** Process exit code this error should surface as. Defaults to 1. */
  exitCode?: number;
  cause?: unknown;
}

/**
 * Declaring the constants
 */

/**
 * Domain error for `shadow` command failures. `bin/shadow` catches this at the top level, prints
 * `message` without a stack trace, and exits with `exitCode` — every command should throw this (never a
 * bare `Error`) so failures are reported consistently.
 */
export class ShadowError extends Error {
  readonly exitCode: number;

  constructor(message: string, options: ShadowErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'ShadowError';
    this.exitCode = options.exitCode ?? 1;
  }
}

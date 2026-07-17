/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export interface ShadowScriptsErrorOptions {
  /** Process exit code this error should surface as. Defaults to 1. */
  exitCode?: number;
  cause?: unknown;
}

/**
 * Declaring the constants
 */

/**
 * Domain error for shadow-scripts command failures. `bin/shadow-scripts` catches this at the top
 * level, prints `message` without a stack trace, and exits with `exitCode` — every command should
 * throw this (never a bare `Error`) so failures are reported consistently.
 */
export class ShadowScriptsError extends Error {
  readonly exitCode: number;

  constructor(message: string, options: ShadowScriptsErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'ShadowScriptsError';
    this.exitCode = options.exitCode ?? 1;
  }
}

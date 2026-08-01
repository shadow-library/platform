/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { log } from './logger.ts';

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
 * Domain error for tooling failures. Every entrypoint catches this at the top level, prints `message`
 * without a stack trace, and exits with `exitCode` — scripts throw this (never a bare `Error`) so
 * failures are reported consistently.
 */
export class ShadowError extends Error {
  readonly exitCode: number;

  constructor(message: string, options: ShadowErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'ShadowError';
    this.exitCode = options.exitCode ?? 1;
  }
}

/**
 * Prints a thrown value and returns the exit code it should surface as. A {@link ShadowError} is an
 * expected, user-facing failure and prints as a bare message; anything else is a tooling bug and keeps
 * its stack trace.
 */
export function reportError(error: unknown): number {
  if (error instanceof ShadowError) {
    log.error(error.message);
    return error.exitCode;
  }
  log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  return 1;
}

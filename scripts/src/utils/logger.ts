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

/**
 * The only file in this package permitted to call `console.*` directly — every command imports
 * these instead, keeping `no-console` meaningful everywhere else while still letting a CLI do its
 * one job of talking to the terminal.
 */
export const log = {
  info: (message: string): void => console.log(message), // eslint-disable-line no-console
  success: (message: string): void => console.log('\x1b[32m%s\x1b[0m', message), // eslint-disable-line no-console
  warn: (message: string): void => console.warn('\x1b[33m%s\x1b[0m', message), // eslint-disable-line no-console
  error: (message: string): void => console.error('\x1b[31m%s\x1b[0m', message), // eslint-disable-line no-console
};

export const formatDuration = (ms: number): string => (ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(3)}s`);

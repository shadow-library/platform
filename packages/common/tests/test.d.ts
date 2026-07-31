/**
 * Importing npm packages
 */
import 'bun:test';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

declare module 'bun:test' {
  export interface Expect {
    /* eslint-disable-next-line @typescript-eslint/prefer-function-type */
    <T = unknown>(actual?: T, customFailMessage?: string): Matchers<unknown>;
  }
}

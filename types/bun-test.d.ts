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

/**
 * Shared ambient augmentation for every workspace's `bun:test`: widens `Expect`'s callable signature to accept a
 * generic `<T>`. Wired once via the root `tsconfig.base.json`'s `files` entry, formerly duplicated byte-identically
 * across 8 workspace `tests/test.d.ts` copies.
 */
declare module 'bun:test' {
  export interface Expect {
    /* eslint-disable-next-line @typescript-eslint/prefer-function-type */
    <T = unknown>(actual?: T, customFailMessage?: string): Matchers<unknown>;
  }
}

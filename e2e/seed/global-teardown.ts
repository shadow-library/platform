/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { closeDbs } from '../lib/db';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Playwright's global teardown. It drains any database clients opened in the runner process; the per-worker
 * clients close themselves via `idle_timeout` (see `lib/db.ts`), so between the two nothing keeps the event loop
 * alive after the run.
 */
export default async function globalTeardown(): Promise<void> {
  await closeDbs();
}

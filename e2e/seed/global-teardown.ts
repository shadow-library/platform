import { closeDbs } from '../lib/db';

/** Drains DB clients opened in the runner process; per-worker clients close themselves via `idle_timeout` (see `lib/db.ts`). */
export default async function globalTeardown(): Promise<void> {
  await closeDbs();
}

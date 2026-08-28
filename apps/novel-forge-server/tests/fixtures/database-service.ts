import { DatabaseService } from '@shadow-library/modules';

import { type PrimaryDatabase } from '@server/database';
import { constraintErrorMap } from '@server/database/database.constants';

/**
 * A real `DatabaseService` bound to an already-open test client. Specs that exercise `run()` need the
 * app's own `constraintErrorMap`, which a `{ getPostgresClient }` literal cannot supply.
 */
export function createTestDatabaseService(db: PrimaryDatabase): DatabaseService {
  const service = new DatabaseService({ postgres: { constraintErrorMap, factory: () => db } });
  return Object.assign(service, { getPostgresClient: () => db });
}

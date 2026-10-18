import { type Logger } from '@shadow-library/common';

import { type BackfillResult } from '@server/modules/auth/keys/secret-backfill';

export type Backfill = () => Promise<BackfillResult>;

export interface MigrateJobSteps {
  /** Runs before any schema change, so a malformed keyring fails the job while the database is untouched */
  prepareBackfill(): Backfill;
  migrate(): Promise<void>;
}

/**
 * Resolves the process exit code. A row the backfill could not seal fails the job, and so the rollout: the old image keeps serving from the legacy
 * columns, which nothing here has changed. Only the row ids are logged, never a value.
 */
export async function runMigrateJob(steps: MigrateJobSteps, logger: Logger): Promise<number> {
  try {
    const backfill = steps.prepareBackfill();
    await steps.migrate();
    logger.info('Database migrations applied');
    const { sealed, skipped, failed } = await backfill();
    if (failed.length > 0) {
      logger.error('The secret backfill could not seal every row; failing the job so the rollout stops', { failed, sealed, skipped });
      return 1;
    }
    logger.info('Sealed the legacy secrets', { sealed, skipped });
    return 0;
  } catch (error) {
    logger.error('Database migration failed', { error });
    return 1;
  }
}

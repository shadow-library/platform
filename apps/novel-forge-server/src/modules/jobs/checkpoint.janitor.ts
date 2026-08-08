import { and, inArray, lt, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

@Injectable()
export class CheckpointJanitor {
  private readonly logger = Logger.getLogger(APP_NAME, CheckpointJanitor.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async onModuleInit(): Promise<void> {
    const purged = await this.purge(this.db).catch(err => {
      this.logger.warn('Checkpoint janitor purge failed on boot', { err });
      return 0;
    });
    if (purged > 0) this.logger.info(`Checkpoint janitor: purged ${purged} stale workflow run(s)`);
  }

  // Uses raw SQL for the three checkpoint tables because they have no Drizzle schema.
  async purge(db: PrimaryDatabase, olderThanDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);

    const runs = await db
      .select({ id: schema.workflowRuns.id })
      .from(schema.workflowRuns)
      .where(and(inArray(schema.workflowRuns.status, ['completed', 'failed', 'cancelled']), lt(schema.workflowRuns.endedAt, cutoff)));

    if (runs.length === 0) return 0;

    const threadIds = runs.map(r => r.id);
    this.logger.debug('Checkpoint janitor: purging terminal run checkpoints', { olderThanDays, cutoff, runs: threadIds.length });

    await db.execute(sql`DELETE FROM checkpoints WHERE thread_id = ANY(${threadIds}::text[])`);
    await db.execute(sql`DELETE FROM checkpoint_writes WHERE thread_id = ANY(${threadIds}::text[])`);
    await db.execute(sql`DELETE FROM checkpoint_blobs WHERE thread_id = ANY(${threadIds}::text[])`);

    return threadIds.length;
  }
}

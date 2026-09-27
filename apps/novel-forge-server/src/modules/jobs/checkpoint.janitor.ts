import { and, inArray, lt, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

const JOB_EVENT_SWEEP_MS = 86_400_000;

@Injectable()
export class CheckpointJanitor {
  private readonly logger = Logger.getLogger(APP_NAME, CheckpointJanitor.name);
  private readonly db: PrimaryDatabase;
  private jobEventSweep: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async onModuleInit(): Promise<void> {
    const purged = await this.purge(this.db).catch(err => {
      this.logger.warn('Checkpoint janitor purge failed on boot', { err });
      return 0;
    });
    if (purged > 0) this.logger.info(`Checkpoint janitor: purged ${purged} stale workflow run(s)`);
    await this.sweepJobEvents();
    this.jobEventSweep = setInterval(() => void this.sweepJobEvents(), JOB_EVENT_SWEEP_MS);
    this.jobEventSweep.unref?.();
  }

  onModuleDestroy(): void {
    if (this.jobEventSweep) clearInterval(this.jobEventSweep);
    this.jobEventSweep = null;
  }

  private async sweepJobEvents(): Promise<void> {
    await this.purgeJobEvents(this.db).catch(err => this.logger.warn('Job event retention sweep failed', { err }));
  }

  /** A chat replays a settled job's events for an hour at most; a week on, nothing reads them. */
  async purgeJobEvents(db: PrimaryDatabase, olderThanDays = 7): Promise<void> {
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
    const settled = db
      .select({ id: schema.jobs.id })
      .from(schema.jobs)
      .where(and(inArray(schema.jobs.status, ['done', 'failed', 'cancelled']), lt(schema.jobs.updatedAt, cutoff)));
    await db.delete(schema.jobEvents).where(inArray(schema.jobEvents.jobId, settled));
    this.logger.debug('Job event retention sweep done', { olderThanDays, cutoff });
  }

  // Uses raw SQL for the three checkpoint tables because they have no Drizzle schema.
  async purge(db: PrimaryDatabase, olderThanDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);

    const settled = and(inArray(schema.workflowRuns.status, ['completed', 'failed', 'cancelled']), lt(schema.workflowRuns.endedAt, cutoff));
    const runs = await db.$count(schema.workflowRuns, settled);
    if (runs === 0) return 0;

    this.logger.debug('Checkpoint janitor: purging terminal run checkpoints', { olderThanDays, cutoff, runs });

    const settledThreads = db
      .select({ id: sql`${schema.workflowRuns.id}::text` })
      .from(schema.workflowRuns)
      .where(settled);
    await db.execute(sql`DELETE FROM checkpoints WHERE thread_id IN ${settledThreads}`);
    await db.execute(sql`DELETE FROM checkpoint_writes WHERE thread_id IN ${settledThreads}`);
    await db.execute(sql`DELETE FROM checkpoint_blobs WHERE thread_id IN ${settledThreads}`);

    return runs;
  }
}

import { and, inArray, lt, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

const SWEEP_INTERVAL_MS = 86_400_000;

/** LangGraph's PostgresSaver tables, keyed by `thread_id` (a workflow run's id) and absent from the Drizzle schema. */
const CHECKPOINT_TABLES = ['checkpoints', 'checkpoint_writes', 'checkpoint_blobs'];

@Injectable()
export class CheckpointJanitor {
  private readonly logger = Logger.getLogger(APP_NAME, CheckpointJanitor.name);
  private readonly db: PrimaryDatabase;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async onModuleInit(): Promise<void> {
    await this.sweep();
    this.timer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async sweep(): Promise<void> {
    const purged = await this.purge(this.db).catch(err => {
      this.logger.warn('Checkpoint janitor purge failed', { err });
      return 0;
    });
    if (purged > 0) this.logger.info(`Checkpoint janitor: purged ${purged} stale workflow run(s)`);
    await this.purgeOrphans(this.db).catch(err => this.logger.warn('Checkpoint janitor orphan purge failed', { err }));
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
    for (const table of CHECKPOINT_TABLES) await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE thread_id IN ${settledThreads}`);

    return runs;
  }

  /**
   * Threads whose run row is gone, cascaded away with its project, which the settled purge can never match. A run's row commits
   * before its graph writes the first checkpoint, so a thread with no row is never a live one.
   */
  async purgeOrphans(db: PrimaryDatabase): Promise<void> {
    for (const table of CHECKPOINT_TABLES) {
      const threadId = sql.raw(`${table}.thread_id`);
      await db.execute(sql`DELETE FROM ${sql.raw(table)} WHERE NOT EXISTS (select 1 from ${schema.workflowRuns} where ${schema.workflowRuns.id}::text = ${threadId})`);
    }
  }
}

import { and, eq, inArray, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { runSilenceMs } from './run-liveness';

export interface RecordedCancel {
  silentMs: number;
}

/** The `workflow_runs` columns that let one replica stop a run another replica is running. */
@Injectable()
export class RunControlRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Null when no running run has this id. A repeated cancel keeps the time of the first. */
  async requestCancel(runId: string): Promise<RecordedCancel | null> {
    const { id, status, cancelRequestedAt } = schema.workflowRuns;
    const [run] = await this.db
      .update(schema.workflowRuns)
      .set({ cancelRequestedAt: sql`coalesce(${cancelRequestedAt}, now())` })
      .where(and(eq(id, runId), eq(status, 'running')))
      .returning({ silentMs: runSilenceMs() });
    return run ?? null;
  }

  /** Of `runIds`, those still running with no cancel requested; with `heartbeat`, every one still running is stamped as alive too. */
  async stillWanted(runIds: string[], heartbeat: boolean): Promise<Set<string>> {
    const { id, status, cancelRequestedAt } = schema.workflowRuns;
    const running = and(inArray(id, runIds), eq(status, 'running'));
    const rows = heartbeat
      ? await this.db
          .update(schema.workflowRuns)
          .set({ heartbeatAt: sql`now()` })
          .where(running)
          .returning({ id, cancelRequestedAt })
      : await this.db.select({ id, cancelRequestedAt }).from(schema.workflowRuns).where(running);
    return new Set(rows.filter(row => row.cancelRequestedAt === null).map(row => row.id));
  }
}

import { and, asc, eq, gt, inArray, lt, notExists, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type Ai, type PrimaryDatabase, schema } from '@server/database';

import { runLastSeen, runSilenceMs } from '../ai/graphs/run-liveness';
import { CHAT_TURN_GRAPH } from './chat-selection';
import { TERMINAL_TURN_EVENTS, type TurnEventRecord, type TurnStreamEventName } from './turn-stream.types';

export interface TurnRunState {
  running: boolean;
  hasEvents: boolean;
  /** Settled within `RECENTLY_ENDED`: a turn that failed fast may not have stored its `error` yet. */
  recentlyEnded: boolean;
}

export interface TurnRunLiveness {
  status: Ai.WorkflowRunStatus;
  silentMs: number;
}

const RECENTLY_ENDED = sql.raw(`interval '1 minute'`);

/** Keys the sweep's lock apart from every other advisory lock the app takes ("TURN"). */
const PRUNE_LOCK_NAMESPACE = 0x5455524e;
const PRUNE_LOCK_KEY = 0;

/** A chat turn's stored stream frames, and the run row that says whether more are coming. */
@Injectable()
export class TurnEventRepository {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Idempotent, so a batch whose commit was lost in transit can be sent again. */
  async append(projectId: bigint, runId: string, records: TurnEventRecord[]): Promise<void> {
    const rows = records.map(record => ({ runId, projectId, seq: record.seq, event: record.event, data: sql`${record.data}::text::jsonb` }));
    await this.db.insert(schema.turnEvents).values(rows).onConflictDoNothing();
  }

  async eventsAfter(projectId: bigint, runId: string, after: number, limit: number): Promise<TurnEventRecord[]> {
    const { turnEvents } = schema;
    const rows = await this.db
      .select({ seq: turnEvents.seq, event: turnEvents.event, data: turnEvents.data })
      .from(turnEvents)
      .where(and(eq(turnEvents.runId, runId), eq(turnEvents.projectId, projectId), gt(turnEvents.seq, after)))
      .orderBy(asc(turnEvents.seq))
      .limit(limit);
    return rows.map(row => ({ seq: row.seq, event: row.event as TurnStreamEventName, data: JSON.stringify(row.data) }));
  }

  /** Undefined for a run that is not a chat turn of this project. */
  async findRun(projectId: bigint, runId: string): Promise<TurnRunState | undefined> {
    const { workflowRuns, turnEvents } = schema;
    const events = this.db.select({ seq: turnEvents.seq }).from(turnEvents).where(eq(turnEvents.runId, workflowRuns.id));
    const [run] = await this.db
      .select({
        status: workflowRuns.status,
        hasEvents: sql<boolean>`exists (${events})`.mapWith(Boolean),
        recentlyEnded: sql<boolean>`coalesce(${workflowRuns.endedAt} > now() - ${RECENTLY_ENDED}, false)`.mapWith(Boolean),
      })
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.projectId, projectId), eq(workflowRuns.graph, CHAT_TURN_GRAPH)))
      .limit(1);
    return run ? { running: run.status === 'running', hasEvents: run.hasEvents, recentlyEnded: run.recentlyEnded } : undefined;
  }

  /** Null once the run's row is gone. */
  async runLiveness(runId: string): Promise<TurnRunLiveness | null> {
    const { workflowRuns } = schema;
    const [run] = await this.db.select({ status: workflowRuns.status, silentMs: runSilenceMs() }).from(workflowRuns).where(eq(workflowRuns.id, runId)).limit(1);
    return run ?? null;
  }

  /** Null when another replica's sweep holds the lock, which is transaction-scoped: a session lock on a pooled connection could be released or left held on another connection. */
  prune(endedBefore: Date, abandonedBefore: Date): Promise<number | null> {
    const { turnEvents, workflowRuns } = schema;
    return this.db.transaction(async tx => {
      const [lock] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(${PRUNE_LOCK_NAMESPACE}::int, ${PRUNE_LOCK_KEY}::int) as locked`);
      if (!lock?.locked) return null;
      const ended = tx
        .select({ runId: turnEvents.runId })
        .from(turnEvents)
        .where(and(inArray(turnEvents.event, [...TERMINAL_TURN_EVENTS]), lt(turnEvents.createdAt, endedBefore)));
      const settled = await tx.delete(turnEvents).where(inArray(turnEvents.runId, ended)).returning({ seq: turnEvents.seq });
      const quiet = tx
        .select({ runId: turnEvents.runId })
        .from(turnEvents)
        .groupBy(turnEvents.runId)
        .having(sql`max(${turnEvents.createdAt}) < ${abandonedBefore.toISOString()}::timestamptz`);
      const live = tx
        .select({ id: workflowRuns.id })
        .from(workflowRuns)
        .where(and(eq(workflowRuns.id, turnEvents.runId), sql`${runLastSeen()} >= ${abandonedBefore.toISOString()}::timestamptz`));
      const abandoned = await tx
        .delete(turnEvents)
        .where(and(inArray(turnEvents.runId, quiet), notExists(live)))
        .returning({ seq: turnEvents.seq });
      return settled.length + abandoned.length;
    });
  }
}

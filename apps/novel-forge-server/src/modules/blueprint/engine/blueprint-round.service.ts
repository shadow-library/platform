import { and, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Blueprint, type DbExecutor, type Job, type PrimaryDatabase, type PrimaryTransaction, schema } from '@server/database';

import { ACTIVE_ROUND_STATUSES, effectiveRoundStatus } from './blueprint-round';

export interface RoundWithJob {
  round: Blueprint.Round;
  jobStatus: Job.Status | null;
}

export interface RoundOutcome {
  options: unknown;
  coachMessage: string;
}

export const THREAD_ROUNDS = 8;

export function stepLockKey(projectId: bigint, stepKey: string): string {
  return `blueprint:${projectId}:${stepKey}`;
}

/** The round as the author sees it: a round whose job settled without it is reported with the job's outcome. */
export function presentRound({ round, jobStatus }: RoundWithJob, now = new Date()): Blueprint.Round {
  const effective = effectiveRoundStatus(round, jobStatus, now);
  return effective.status === round.status ? round : { ...round, ...effective };
}

@Injectable()
export class BlueprintRoundService {
  private readonly logger = Logger.getLogger(APP_NAME, BlueprintRoundService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Serialises round starts and locks of one generating step for the rest of the transaction, without blocking any other step. */
  async lockStep(projectId: bigint, stepKey: string, tx: PrimaryTransaction): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${stepLockKey(projectId, stepKey)}, 0))`);
  }

  async latestPerStep(projectId: bigint): Promise<RoundWithJob[]> {
    const table = schema.blueprintRounds;
    return this.db
      .selectDistinctOn([table.stepKey], { round: table, jobStatus: schema.jobs.status })
      .from(table)
      .leftJoin(schema.jobs, eq(schema.jobs.id, table.jobId))
      .where(eq(table.projectId, projectId))
      .orderBy(table.stepKey, desc(table.round));
  }

  async latestForStep(projectId: bigint, stepKey: string, executor: DbExecutor = this.db): Promise<RoundWithJob | undefined> {
    const table = schema.blueprintRounds;
    const [latest] = await executor
      .select({ round: table, jobStatus: schema.jobs.status })
      .from(table)
      .leftJoin(schema.jobs, eq(schema.jobs.id, table.jobId))
      .where(and(eq(table.projectId, projectId), eq(table.stepKey, stepKey)))
      .orderBy(desc(table.round))
      .limit(1);
    return latest;
  }

  /** Newest first, and only as many as the step's conversation and the latest ready options can need. */
  recentForStep(projectId: bigint, stepKey: string, beforeRound: number): Promise<Blueprint.Round[]> {
    const table = schema.blueprintRounds;
    return this.db.query.blueprintRounds.findMany({
      where: and(eq(table.projectId, projectId), eq(table.stepKey, stepKey), lt(table.round, beforeRound)),
      orderBy: desc(table.round),
      limit: THREAD_ROUNDS,
    });
  }

  async latestReady(projectId: bigint, stepKey: string, executor: DbExecutor = this.db): Promise<Blueprint.Round | undefined> {
    const table = schema.blueprintRounds;
    return executor.query.blueprintRounds.findFirst({
      where: and(eq(table.projectId, projectId), eq(table.stepKey, stepKey), eq(table.status, 'ready'), isNotNull(table.options)),
      orderBy: desc(table.round),
    });
  }

  get(projectId: bigint, roundId: bigint): Promise<Blueprint.Round | undefined> {
    const table = schema.blueprintRounds;
    return this.db.query.blueprintRounds.findFirst({ where: and(eq(table.id, roundId), eq(table.projectId, projectId)) });
  }

  async create(round: Blueprint.NewRound, executor: DbExecutor): Promise<Blueprint.Round> {
    const [created] = await executor
      .insert(schema.blueprintRounds)
      .values(round)
      .returning()
      .catch(err => this.databaseService.translateError(err));
    if (!created) throw AppErrorCode.S001.create();
    this.logger.info('blueprint round created', { projectId: created.projectId, stepKey: created.stepKey, round: created.round });
    return created;
  }

  async attachJob(roundId: bigint, jobId: string): Promise<Blueprint.Round | undefined> {
    const [round] = await this.db.update(schema.blueprintRounds).set({ jobId, updatedAt: new Date() }).where(eq(schema.blueprintRounds.id, roundId)).returning();
    return round;
  }

  async markRunning(roundId: bigint): Promise<boolean> {
    const table = schema.blueprintRounds;
    const [round] = await this.db
      .update(table)
      .set({ status: 'running', error: null, updatedAt: new Date() })
      .where(and(eq(table.id, roundId), inArray(table.status, [...ACTIVE_ROUND_STATUSES])))
      .returning({ id: table.id });
    return round !== undefined;
  }

  async markReady(roundId: bigint, outcome: RoundOutcome): Promise<void> {
    const table = schema.blueprintRounds;
    await this.db
      .update(table)
      .set({ status: 'ready', options: outcome.options, coachMessage: outcome.coachMessage, error: null, updatedAt: new Date() })
      .where(and(eq(table.id, roundId), inArray(table.status, [...ACTIVE_ROUND_STATUSES])));
  }

  async settle(roundId: bigint, status: 'failed' | 'cancelled', error: string | null, executor: DbExecutor = this.db): Promise<Blueprint.Round | undefined> {
    const table = schema.blueprintRounds;
    const [round] = await executor
      .update(table)
      .set({ status, error, updatedAt: new Date() })
      .where(and(eq(table.id, roundId), inArray(table.status, [...ACTIVE_ROUND_STATUSES])))
      .returning();
    if (round) this.logger.info('blueprint round settled', { roundId, stepKey: round.stepKey, status });
    return round;
  }

  async cancelRequested(jobId: string): Promise<boolean> {
    const job = await this.db.query.jobs.findFirst({ where: eq(schema.jobs.id, jobId), columns: { cancelRequestedAt: true } });
    return job?.cancelRequestedAt != null;
  }
}

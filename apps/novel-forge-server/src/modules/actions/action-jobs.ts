import { and, eq, inArray, or, sql } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { type DbExecutor, type Job, type PrimaryDatabase, type PrimaryTransaction, type Refinement, schema } from '@server/database';

import { type JobOrigin, payloadOrigin } from '../jobs/job.service';
import { type ActionContext } from '../refinement/action-registry';

export const ORGANISE_GRAPH = 'notes-organise';
export const PLAN_GRAPH = 'chapter-plan';

export interface StartedActionJob {
  jobId: string;
  runId: string;
  /** The same card op's job was already queued or running; the ids name that job. */
  deduped: boolean;
}

const JOB_CARD_KINDS: Refinement.Kind[] = ['organise', 'chapter_plan'];
const LIVE_CARD_STATUSES: Refinement.ProposalStatus[] = ['pending', 'applied'];

/** An op is applied once, so each accepted op gets a job row of its own, and a finished one is never reset under a later card. */
export function actionJobTarget(context: Pick<ActionContext, 'proposalId' | 'opIndex'>): string {
  return `proposal-${context.proposalId}-${context.opIndex}`;
}

export function actionJobOrigin(context: ActionContext): JobOrigin | undefined {
  if (!context.sessionId) return undefined;
  return { sessionId: context.sessionId, messageId: context.messageId === null ? null : `${context.messageId}`, proposalId: `${context.proposalId}`, opIndex: context.opIndex };
}

/** Where a job's card lands: the chat and message the action was accepted from, when there was one. */
export function cardOwner(job: Pick<Job.Row, 'payload'>): { sessionId?: string; messageId?: bigint } {
  const origin = payloadOrigin(job.payload);
  if (!origin) return {};
  return { sessionId: origin.sessionId, ...(origin.messageId === null ? {} : { messageId: BigInt(origin.messageId) }) };
}

/** The live card an earlier attempt of this job staged: a retry after it landed must not stage a second one. */
export async function stagedByJob(db: Pick<DbExecutor, 'select'>, projectId: bigint, jobId: string): Promise<bigint | undefined> {
  const [row] = await db
    .select({ id: schema.refinementProposals.id })
    .from(schema.refinementProposals)
    .innerJoin(schema.workflowRuns, eq(sql`${schema.workflowRuns.id}::text`, schema.refinementProposals.runId))
    .where(
      and(
        eq(schema.refinementProposals.projectId, projectId),
        eq(schema.workflowRuns.jobId, jobId),
        inArray(schema.refinementProposals.kind, JOB_CARD_KINDS),
        inArray(schema.refinementProposals.status, LIVE_CARD_STATUSES),
      ),
    )
    .limit(1);
  return row?.id;
}

/**
 * Stages a job's card at most once. The job row is locked while its earlier card is looked for, so two attempts of the job stage in turn;
 * a conflict on the one-card-per-run index means another attempt got there first, and its card is the answer.
 */
export async function stageOnce(db: PrimaryDatabase, projectId: bigint, jobId: string, stage: (tx: PrimaryTransaction) => Promise<Refinement.Proposal>): Promise<bigint> {
  try {
    return await db.transaction(async tx => {
      await tx.select({ id: schema.jobs.id }).from(schema.jobs).where(eq(schema.jobs.id, jobId)).for('update');
      return (await stagedByJob(tx, projectId, jobId)) ?? (await stage(tx)).id;
    });
  } catch (err) {
    const staged = await stagedByJob(db, projectId, jobId);
    if (staged === undefined) throw err;
    return staged;
  }
}

/**
 * A pending organise card still holds the last round: a second run would stage beside it a card written over the same pages. An applied
 * card records what it wrote as it applies, except one staged before cards carried their record: its pages cannot be told apart from
 * the author's, so organising waits until it is undone.
 */
export async function assertNotesUnorganised(db: Pick<DbExecutor, 'select'>, projectId: bigint): Promise<void> {
  const table = schema.refinementProposals;
  const legacyApplied = and(eq(table.status, 'applied'), sql`${table.organiseRecord}->>'legacy' = 'true'`);
  const [organised] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.projectId, projectId), eq(table.kind, 'organise'), or(eq(table.status, 'pending'), legacyApplied)))
    .limit(1);
  if (organised) throw AppErrorCode.NTS_004.create();
}

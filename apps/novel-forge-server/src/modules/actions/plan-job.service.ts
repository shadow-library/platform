import { and, desc, eq, gt, inArray, lt, lte, ne, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { nextWritableChapter } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type Job, type PrimaryDatabase, schema } from '@server/database';

import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { JobService } from '../jobs/job.service';
import { type ActionContext } from '../refinement/action-registry';
import { ProposalService } from '../refinement/proposal.service';
import { contentTokens, normaliseForQuote, quoteIsTentative, splitSentences } from '../refinement/write-policy';
import { cardOwner, PLAN_GRAPH, stagedByJob, stageOnce } from './action-jobs';
import { type ChapterPlanRequest, ChapterPlanService } from './chapter-plan.service';

export type PlanJobPayload = ChapterPlanRequest;

/** Plans only the next writable chapter, the one the author, the chat and generation all write next. */
export async function assertPlansNextChapter(db: Pick<DbExecutor, 'query'>, projectId: bigint, chapter: number | undefined): Promise<number> {
  const next = await nextWritableChapter(db, projectId);
  if (chapter !== undefined && chapter !== next) throw AppErrorCode.PLN_006.create({ chapter: String(chapter), next: String(next) });
  return next;
}

/** Re-read where the card is staged: a draft written while the plan was made moves the story past the chapter it planned. */
export async function assertPlanStillNext(db: Pick<DbExecutor, 'query'>, projectId: bigint, chapter: number): Promise<void> {
  const next = await nextWritableChapter(db, projectId);
  if (next !== chapter) throw AppErrorCode.PLN_008.create({ chapter: String(chapter), next: String(next) });
}

const INTENT_TURNS = 3;
const MIN_INTENT_WORDS = 2;
const PLAN_ACTION = JSON.stringify([{ op: 'action.plan_chapter' }]);

/**
 * The author's own messages the plan card answers: their latest turns in that chat up to the card's message, back no further than the last
 * three, nor past the previous plan card or plan action there, which an earlier chapter's intent belongs to.
 */
export async function authorMessagesFor(db: Pick<DbExecutor, 'query'>, context: Pick<ActionContext, 'sessionId' | 'messageId' | 'proposalId'>): Promise<string[]> {
  const { sessionId, messageId } = context;
  if (!sessionId || messageId === null) return [];
  const proposals = schema.refinementProposals;
  const previousPlan = await db.query.refinementProposals.findFirst({
    columns: { messageId: true },
    where: and(
      eq(proposals.sessionId, sessionId),
      lt(proposals.id, context.proposalId),
      or(eq(proposals.kind, 'chapter_plan'), sql`${proposals.changeSet} @> ${PLAN_ACTION}::text::jsonb`),
    ),
    orderBy: desc(proposals.id),
  });
  const messages = await db.query.chatMessages.findMany({
    columns: { content: true },
    where: and(
      eq(schema.chatMessages.sessionId, sessionId),
      eq(schema.chatMessages.role, 'user'),
      lte(schema.chatMessages.id, messageId),
      previousPlan?.messageId ? gt(schema.chatMessages.id, previousPlan.messageId) : undefined,
    ),
    orderBy: desc(schema.chatMessages.id),
    limit: INTENT_TURNS,
  });
  return messages.map(message => message.content);
}

function bare(text: string): string {
  return normaliseForQuote(text).replace(/^["'\s]+|["'\s.!…]+$/gu, '');
}

/** The author stated it: a whole sentence of theirs, or at least two content words of it verbatim, and never asked, hedged or turned down. */
export function intentStatedIn(intent: string, message: string): boolean {
  const needle = bare(intent);
  if (!needle) return false;
  const whole = splitSentences(message).some(sentence => bare(sentence) === needle);
  const contained = contentTokens(needle).length >= MIN_INTENT_WORDS && normaliseForQuote(message).includes(needle);
  return (whole || contained) && !quoteIsTentative(needle, message);
}

export interface PlanSteer extends Pick<ChapterPlanRequest, 'intent' | 'direction'> {
  /** An intent the author's messages do not state, left out because the author chose a direction of their own. */
  droppedIntent?: string;
}

/**
 * Intent is the author's own account of the chapter and outranks a direction, so it holds only when their messages say it; anything else the
 * chat called intent is a direction it proposed, and plans as one unless the author chose a direction of their own.
 */
export function planSteer(intent: string | undefined, direction: string | undefined, authorMessages: readonly string[]): PlanSteer {
  const said = intent?.trim();
  const chosen = direction?.trim();
  if (said && authorMessages.some(message => intentStatedIn(said, message))) return { intent: said, ...(chosen ? { direction: chosen } : {}) };
  if (said && chosen) return { direction: chosen, droppedIntent: said };
  const steer = chosen || said;
  return steer ? { direction: steer } : {};
}

/** One plan at a time: a second card's plan is refused by name rather than folded into the one already running. */
export async function assertNoOtherPlan(db: Pick<DbExecutor, 'query'>, projectId: bigint, target: string, chapter: number): Promise<void> {
  const running = await db.query.jobs.findFirst({
    columns: { payload: true },
    where: and(eq(schema.jobs.projectId, projectId), eq(schema.jobs.kind, 'plan'), inArray(schema.jobs.status, ['pending', 'in_progress']), ne(schema.jobs.target, target)),
  });
  if (!running) return;
  const planned = (running.payload as Partial<PlanJobPayload> | null)?.chapter ?? chapter;
  throw AppErrorCode.PLN_009.create({ chapter: String(planned) });
}

/** The payload's plan request alone: the job's origin rides in the same payload and is no part of what is planned. */
export function planJobInput(payload: PlanJobPayload): ChapterPlanRequest {
  const request: ChapterPlanRequest = { chapter: payload.chapter };
  if (payload.intent?.trim()) request.intent = payload.intent.trim();
  if (payload.direction?.trim()) request.direction = payload.direction.trim();
  if (payload.empty) request.empty = true;
  return request;
}

/** Hosts the next-chapter plan pass as a job; its plan is always a card, never written straight to the brief. */
@Injectable()
export class PlanJobService {
  private readonly logger = Logger.getLogger(APP_NAME, PlanJobService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly jobService: JobService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly planner: ChapterPlanService,
    private readonly proposals: ProposalService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async run(job: Job.Row): Promise<void> {
    const { id: jobId, projectId } = job;
    const request = job.payload as PlanJobPayload;
    const { chapter } = request;
    const current = String(chapter);
    const staged = await stagedByJob(this.db, projectId, jobId);
    if (staged !== undefined) {
      this.logger.info('plan job retried after its card was staged — settling it as done', { jobId, projectId, chapter, proposalId: staged });
      await this.workflowRunService.settleJobRuns(jobId, 'completed');
      return this.jobService.progress(jobId, { done: 1, total: 1, current, phase: 'staged', proposalId: String(staged) });
    }

    await this.jobService.progress(jobId, { done: 0, total: 1, current, phase: 'planning', startedAt: new Date().toISOString() });
    const input = planJobInput(request);
    const { result: card } = await this.workflowRunService.runChain(projectId, PLAN_GRAPH, job.target, input, runId => this.plan(job, input, runId), jobId);
    await this.jobService.progress(jobId, { done: 1, total: 1, current, phase: 'staged', proposalId: String(card) });
  }

  // Checked again at run time: a draft written while the job waited moves the next chapter on.
  private async plan(job: Job.Row, request: ChapterPlanRequest, runId: string): Promise<bigint> {
    await assertPlansNextChapter(this.db, job.projectId, request.chapter);
    const op = await this.planner.plan(job.projectId, request, runId);
    const card = { ...cardOwner(job), scopeType: 'novel' as const, kind: 'chapter_plan' as const, summary: `Plan for chapter ${request.chapter}`, runId };
    return stageOnce(this.db, job.projectId, job.id, async tx => {
      await assertPlanStillNext(tx, job.projectId, request.chapter);
      return this.proposals.create(job.projectId, { ...card, changeSet: [op], allowedOps: ['brief.update'] }, tx);
    });
  }
}

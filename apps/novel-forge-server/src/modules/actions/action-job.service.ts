import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Job, type PrimaryDatabase } from '@server/database';

import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';
import { loadActiveLedger } from '../ledger/ledger-entries';
import { ORGANISE_MIN_WORDS, organiseApplies } from '../notes';
import { type ActionContext, ActionExecutorRegistry } from '../refinement/action-registry';
import { type ActionOp } from '../refinement/change-set';
import { actionJobOrigin, actionJobTarget, assertNotesUnorganised, ORGANISE_GRAPH, PLAN_GRAPH, type StartedActionJob } from './action-jobs';
import { assertEmptyPlanAllowed } from './chapter-plan.service';
import { OrganiseJobService } from './organise-job.service';
import { assertNoOtherPlan, assertPlansNextChapter, authorMessagesFor, planJobInput, PlanJobService, planSteer } from './plan-job.service';

type PlanChapterOp = Extract<ActionOp, { op: 'action.plan_chapter' }>;

/** Turns an accepted organise or plan card into a durable job, and runs those jobs, including ones a restart left pending. */
@Injectable()
export class ActionJobService {
  private readonly logger = Logger.getLogger(APP_NAME, ActionJobService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
    private readonly workflowRunService: WorkflowRunService,
    private readonly organiseJobs: OrganiseJobService,
    private readonly planJobs: PlanJobService,
    private readonly registry: ActionExecutorRegistry,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  onModuleInit(): void {
    this.jobExecutor.registerHandler('organise', job => this.organiseJobs.run(job));
    this.jobExecutor.registerHandler('plan', job => this.planJobs.run(job));

    this.registry.register('action.organise_notes', async (projectId, _action, context) => {
      const { jobId, runId, deduped } = await this.organise(projectId, context);
      return { summary: deduped ? 'your notes are already being organised' : 'organising your notes — the result arrives as a card', jobId, runId };
    });
    this.registry.register('action.plan_chapter', async (projectId, action, context) => {
      if (action.op !== 'action.plan_chapter') throw AppError.internal('executor misrouted');
      const { jobId, runId, deduped, chapter } = await this.plan(projectId, action, context);
      return { summary: deduped ? `chapter ${chapter} is already being planned` : `planning chapter ${chapter} — the plan arrives as a card`, jobId, runId };
    });
  }

  async organise(projectId: bigint, context: ActionContext): Promise<StartedActionJob> {
    const ledger = await loadActiveLedger(this.db, projectId);
    if (!organiseApplies(ledger)) throw AppErrorCode.NTS_003.create({ words: String(ORGANISE_MIN_WORDS) });
    await assertNotesUnorganised(this.db, projectId);
    return this.start(projectId, 'organise', ORGANISE_GRAPH, context, {});
  }

  async plan(projectId: bigint, action: PlanChapterOp, context: ActionContext): Promise<StartedActionJob & { chapter: number }> {
    const chapter = await assertPlansNextChapter(this.db, projectId, action.chapter);
    await assertNoOtherPlan(this.db, projectId, actionJobTarget(context), chapter);
    if (action.empty) await assertEmptyPlanAllowed(this.db, projectId, chapter);
    const steer = planSteer(action.intent, action.direction, action.intent?.trim() ? await authorMessagesFor(this.db, context) : []);
    if (steer.droppedIntent) this.logger.info('plan: dropped an intent the author never stated, for the direction they chose', { projectId, chapter, direction: steer.direction });
    const payload = planJobInput({ chapter, intent: steer.intent, direction: steer.direction, empty: action.empty });
    try {
      return { ...(await this.start(projectId, 'plan', PLAN_GRAPH, context, payload)), chapter };
    } catch (err) {
      // The authoring claim refuses a plan while any authoring job runs; when that job is itself a plan, the plan's own refusal says why.
      if (err instanceof AppError && err.code === AppErrorCode.JOB_002.code) await assertNoOtherPlan(this.db, projectId, actionJobTarget(context), chapter);
      throw err;
    }
  }

  // The run opens with the job, so the author's apply answers with both ids; the job's first attempt resumes it rather than opening another.
  private async start(projectId: bigint, kind: Job.Kind, graph: string, context: ActionContext, payload: object): Promise<StartedActionJob> {
    const target = actionJobTarget(context);
    const origin = actionJobOrigin(context);
    const { id: jobId, outcome } = await this.jobService.enqueueJob(projectId, kind, target, { ...payload, ...(origin ? { origin } : {}) });
    const runId = await this.workflowRunService.createRun(projectId, graph, target, payload, jobId);
    if (outcome !== 'deduped') this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('action job dispatch failed', { err, jobId, kind }));
    return { jobId, runId, deduped: outcome === 'deduped' };
  }
}

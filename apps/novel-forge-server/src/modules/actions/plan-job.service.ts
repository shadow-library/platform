import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { nextWritableChapter } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type Job, type PrimaryDatabase } from '@server/database';

import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ChapterInsertService, type PlannedSlotBrief } from '../generation/chapter-insert.service';
import { JobService } from '../jobs/job.service';
import { type BriefUpdateOp } from '../refinement/change-set';
import { ProposalService } from '../refinement/proposal.service';
import { cardOwner, PLAN_GRAPH, stagedByJob, stageOnce } from './action-jobs';

export interface PlanJobPayload {
  chapter: number;
  intent?: string;
}

/** Plans only the next writable chapter, the one the author, the chat and generation all write next. */
export async function assertPlansNextChapter(db: Pick<DbExecutor, 'query'>, projectId: bigint, chapter: number | undefined): Promise<number> {
  const next = await nextWritableChapter(db, projectId);
  if (chapter !== undefined && chapter !== next) throw AppErrorCode.PLN_006.create({ chapter: String(chapter), next: String(next) });
  return next;
}

/** The planner's fields the plan card carries; scenes and milestones wait for the plan pass that structures them. */
export function planCardOp(chapter: number, planned: PlannedSlotBrief): BriefUpdateOp {
  const op: BriefUpdateOp = { op: 'brief.update', chapter, body: planned.body };
  if (planned.title) op.title = planned.title;
  if (planned.contextRefs) op.contextRefs = planned.contextRefs;
  if (planned.pov) op.pov = planned.pov;
  if (planned.chapterPurpose) op.chapterPurpose = planned.chapterPurpose;
  if (planned.readerValue) op.readerValue = planned.readerValue;
  if (planned.endingContract) op.endingContract = planned.endingContract as BriefUpdateOp['endingContract'];
  if (planned.knowledgeContract) op.knowledgeContract = planned.knowledgeContract as BriefUpdateOp['knowledgeContract'];
  return op;
}

/** Hosts the existing one-chapter plan call as a job; its plan is always a card, never written straight to the brief. */
@Injectable()
export class PlanJobService {
  private readonly logger = Logger.getLogger(APP_NAME, PlanJobService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly jobService: JobService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly chapterInsert: ChapterInsertService,
    private readonly proposals: ProposalService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async run(job: Job.Row): Promise<void> {
    const { id: jobId, projectId } = job;
    const { chapter, intent } = job.payload as PlanJobPayload;
    const current = String(chapter);
    const staged = await stagedByJob(this.db, projectId, jobId);
    if (staged !== undefined) {
      this.logger.info('plan job retried after its card was staged — settling it as done', { jobId, projectId, chapter, proposalId: staged });
      await this.workflowRunService.settleJobRuns(jobId, 'completed');
      return this.jobService.progress(jobId, { done: 1, total: 1, current, phase: 'staged', proposalId: String(staged) });
    }

    await this.jobService.progress(jobId, { done: 0, total: 1, current, phase: 'planning', startedAt: new Date().toISOString() });
    const { result: card } = await this.workflowRunService.runChain(projectId, PLAN_GRAPH, job.target, { chapter, intent }, runId => this.plan(job, chapter, intent, runId), jobId);
    await this.jobService.progress(jobId, { done: 1, total: 1, current, phase: 'staged', proposalId: String(card) });
  }

  // Checked again at run time: a draft written while the job waited moves the next chapter on.
  private async plan(job: Job.Row, chapter: number, intent: string | undefined, runId: string): Promise<bigint> {
    await assertPlansNextChapter(this.db, job.projectId, chapter);
    const planned = await this.chapterInsert.planNext(job.projectId, chapter, intent, runId);
    const card = { ...cardOwner(job), scopeType: 'novel' as const, kind: 'chapter_plan' as const, summary: `Plan for chapter ${chapter}`, runId };
    return stageOnce(this.db, job.projectId, job.id, tx =>
      this.proposals.create(job.projectId, { ...card, changeSet: [planCardOp(chapter, planned)], allowedOps: ['brief.update'] }, tx),
    );
  }
}

import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Job, type PrimaryDatabase, schema } from '@server/database';

import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { notesOrganisePrompt } from '../ai/prompts/notes-organise.prompt';
import { JobService } from '../jobs/job.service';
import { loadActiveLedger } from '../ledger/ledger-entries';
import { keepEveryOrganiseOption, ORGANISE_CHANGE_OPS, organiseContext, organiseOptions, planOrganise } from '../notes';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { ProposalService } from '../refinement/proposal.service';
import { cardOwner, ORGANISE_GRAPH, stagedByJob, stageOnce } from './action-jobs';

const STEPS = 2;

/**
 * Hosts the notes Organise pass as a job. Its whole output is staged as one card the author accepts; the organise decision, rules and
 * suggestions are ledger entries rather than change-set ops, so they wait for the chat-native organise to give them a card of their own.
 */
@Injectable()
export class OrganiseJobService {
  private readonly logger = Logger.getLogger(APP_NAME, OrganiseJobService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly jobService: JobService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly modelRouter: ModelRouterService,
    private readonly pluginPolicy: PluginPolicyService,
    private readonly proposals: ProposalService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async run(job: Job.Row): Promise<void> {
    const { id: jobId, projectId } = job;
    const staged = await stagedByJob(this.db, projectId, jobId);
    if (staged !== undefined) {
      this.logger.info('organise job retried after its card was staged — settling it as done', { jobId, projectId, proposalId: staged });
      await this.workflowRunService.settleJobRuns(jobId, 'completed');
      return this.jobService.progress(jobId, { done: STEPS, total: STEPS, current: 'notes', phase: 'staged', proposalId: String(staged) });
    }

    await this.jobService.progress(jobId, { done: 0, total: STEPS, current: 'notes', phase: 'organising', startedAt: new Date().toISOString() });
    const { result: card } = await this.workflowRunService.runChain(projectId, ORGANISE_GRAPH, job.target, {}, runId => this.organise(job, runId), jobId);
    await this.jobService.progress(jobId, { done: STEPS, total: STEPS, current: 'notes', phase: 'staged', proposalId: String(card) });
  }

  private async organise(job: Job.Row, runId: string): Promise<bigint> {
    const projectId = job.projectId;
    const [project, ledger] = await Promise.all([this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }), loadActiveLedger(this.db, projectId)]);
    if (!project) throw AppErrorCode.PRJ_001.create();

    const prompt = notesOrganisePrompt;
    const role = prompt.role ?? 'bible';
    const policy = await this.pluginPolicy.resolve(projectId, { role, promptKey: prompt.key }, project);
    const telemetry = { projectId, runId, node: 'organise', promptKey: prompt.key, promptVersion: prompt.version, role };
    const output = await this.modelRouter.structured(prompt, { ...organiseContext(ledger) }, telemetry, project as ProjectConfig, policy);
    const { options } = organiseOptions(output, ledger);
    await this.jobService.progress(job.id, { done: 1, total: STEPS, current: 'notes', phase: 'staging' });

    return stageOnce(this.db, projectId, job.id, async tx => {
      const plan = await planOrganise(keepEveryOrganiseOption(options), { round: { round: 1, options }, ledger, projectId, tx });
      const card = { ...cardOwner(job), scopeType: 'novel' as const, kind: 'organise' as const, summary: plan.summary, runId };
      return this.proposals.create(projectId, { ...card, changeSet: plan.changeSet, allowedOps: ORGANISE_CHANGE_OPS }, tx);
    });
  }
}

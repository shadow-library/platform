import { and, eq, inArray, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Job, type PrimaryDatabase, type PrimaryTransaction, type Project, type Refinement, schema } from '@server/database';

import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { hardLineError, screenTexts } from '../ai/hard-line';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { notesOrganisePrompt } from '../ai/prompts/notes-organise.prompt';
import { type NotesOrganiseOutput } from '../ai/schemas/notes-organise.schema';
import { JobService, payloadOrigin } from '../jobs/job.service';
import { loadActiveLedger } from '../ledger/ledger-entries';
import {
  earlierParts,
  mergeOrganiseOutputs,
  notesOf,
  notesSource,
  ORGANISE_CHANGE_OPS,
  type OrganiseCandidates,
  organiseCandidates,
  organiseCardSelection,
  organiseContext,
  type OrganiseOptions,
  organiseOptions,
  organisePasses,
  organiseReceipt,
  type OrganiseReceipt,
  organiseRecordFor,
  organiseRecordOf,
  organiseSummary,
  planOrganise,
} from '../notes';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { loadCurrentRecords } from '../refinement/artifact-state';
import { type ChangeOp, changeSetRefs } from '../refinement/change-set';
import { ProposalApplyService } from '../refinement/proposal-apply.service';
import { DISCARDABLE, ProposalService } from '../refinement/proposal.service';
import { type StageOptions, stageTurnChangeSet, type TurnProposalPort } from '../refinement/turn-proposals';
import { cardOwner, ORGANISE_GRAPH, stagedByJob, stageOnce } from './action-jobs';

interface Staged {
  applied?: bigint;
  card?: bigint;
  receipt?: OrganiseReceipt;
  applyNote?: string;
}

const APPLIED_SUMMARY = 'Added to your Story Bible — from your notes';
const LIVE_STATUSES: Refinement.ProposalStatus[] = ['pending', 'applied'];

/**
 * Hosts the notes Organise pass as a job. Long notes are organised in parts, one model call each, and the parts become one round. What the
 * quote rule finds in the notes applies at once as one revertible proposal; everything else waits on one card. Each proposal carries the
 * record its apply writes to the ledger.
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
    private readonly applier: ProposalApplyService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async run(job: Job.Row): Promise<void> {
    const { id: jobId, projectId } = job;
    const staged = await stagedByJob(this.db, projectId, jobId);
    if (staged !== undefined) {
      this.logger.info('organise job retried after its card was staged — settling it as done', { jobId, projectId, proposalId: staged });
      await this.workflowRunService.settleJobRuns(jobId, 'completed');
      return this.jobService.progress(jobId, { done: 1, total: 1, current: 'notes', phase: 'staged', ...stagedProgress(await this.stagedByRun(projectId, jobId)) });
    }

    await this.jobService.progress(jobId, { done: 0, total: 1, current: 'notes', phase: 'organising', startedAt: new Date().toISOString() });
    const { result } = await this.workflowRunService.runChain(projectId, ORGANISE_GRAPH, job.target, {}, runId => this.organise(job, runId), jobId);
    await this.jobService.progress(jobId, { done: result.steps, total: result.steps, current: 'notes', phase: 'staged', ...stagedProgress(result.staged) });
  }

  private async organise(job: Job.Row, runId: string): Promise<{ staged: Staged; steps: number }> {
    const projectId = job.projectId;
    const [project, ledger] = await Promise.all([this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }), loadActiveLedger(this.db, projectId)]);
    if (!project) throw AppErrorCode.PRJ_001.create();

    const prompt = notesOrganisePrompt;
    const role = prompt.role ?? 'bible';
    const policy = await this.pluginPolicy.resolve(projectId, { role, promptKey: prompt.key }, project);
    const telemetry = { projectId, runId, node: 'organise', promptKey: prompt.key, promptVersion: prompt.version, role };
    const notes = notesOf(ledger);
    const passes = organisePasses(notes);
    const steps = passes.length + 1;
    const outputs: NotesOrganiseOutput[] = [];
    for (const [index, pass] of passes.entries()) {
      if (index > 0) await this.jobService.progress(job.id, { done: index, total: steps, current: 'notes', phase: 'organising' });
      const context = organiseContext(ledger, pass, passes.length, earlierParts(outputs));
      outputs.push(await this.modelRouter.structured(prompt, { ...context }, telemetry, project as ProjectConfig, policy));
    }
    const { options } = organiseOptions(mergeOrganiseOutputs(outputs), ledger);
    screenModelWriting(project, options);
    await this.jobService.progress(job.id, { done: passes.length, total: steps, current: 'notes', phase: 'staging' });

    const mode = await this.sessionMode(job);
    const staged: Staged = {};
    await stageOnce(this.db, projectId, job.id, async tx => {
      await this.supersedeWaitingCards(tx, projectId);
      const plan = await planOrganise(organiseCardSelection(options), { round: { round: 1, options }, ledger, projectId, tx });
      const current = await loadCurrentRecords(tx, projectId, changeSetRefs(plan.changeSet));
      const candidates = organiseCandidates({ plan, options, source: notesSource(notes), current, mode, passes: passes.length, ledger });
      const staging = await stageTurnChangeSet(this.port(tx, job, runId, candidates), candidates.split, []);
      const first = staging.appliedProposal ?? staging.cardProposal;
      // Rolling the whole stage back, applied part included, lets a retry stage both halves together rather than leave the card lost.
      if (!first || (candidates.split.cards.length > 0 && !staging.cardProposal)) throw AppErrorCode.NTS_011.create({ retryable: true });
      Object.assign(staged, {
        applied: staging.appliedProposal?.id,
        card: staging.cardProposal?.id,
        receipt: organiseRecordOf(first.organiseRecord)?.receipt,
        applyNote: staging.applyNote,
      });
      return first;
    });
    return { staged: staged.receipt ? staged : await this.stagedByRun(projectId, job.id), steps };
  }

  /**
   * Staging runs inside the job's own transaction, so each write the two-proposal staging may abandon — a refused apply, a card that
   * failed to save — runs in a savepoint of its own and rolls back alone.
   */
  private port(tx: PrimaryTransaction, job: Job.Row, runId: string, candidates: OrganiseCandidates): TurnProposalPort {
    const { split } = candidates;
    const projectId = job.projectId;
    return {
      stage: (changeSet: ChangeOp[], warnings: string[], options: StageOptions) =>
        tx.transaction(async savepoint => {
          const applied = changeSet === split.direct;
          const receipt = organiseReceipt(candidates, applied || changeSet === split.cards ? split.direct : [], changeSet === split.ops ? split.ops : split.cards);
          const role = applied ? 'applied' : 'card';
          return this.proposals.create(
            projectId,
            {
              ...cardOwner(job),
              scopeType: 'novel',
              kind: 'organise',
              summary: applied ? APPLIED_SUMMARY : organiseSummary(receipt),
              runId,
              changeSet,
              allowedOps: ORGANISE_CHANGE_OPS,
              entityMaterialization: options.entityMaterialization,
              ...(warnings.length > 0 ? { warnings } : {}),
              organiseRecord: organiseRecordFor(candidates, changeSet, role, receipt),
            },
            savepoint,
          );
        }),
      apply: proposalId => tx.transaction(savepoint => this.applier.apply(projectId, proposalId, { autoApplied: true, tx: savepoint })),
      linkApplied: async () => undefined,
      discard: async proposalId => {
        const discarded = await tx
          .update(schema.refinementProposals)
          .set({ status: 'discarded', updatedAt: new Date() })
          .where(and(eq(schema.refinementProposals.id, proposalId), inArray(schema.refinementProposals.status, DISCARDABLE)))
          .returning({ id: schema.refinementProposals.id });
        if (discarded.length === 0) throw AppErrorCode.RFN_002.create();
      },
    };
  }

  /** Two cards over the same notes would each write the same pages: a newer round replaces a card still waiting from an older one. */
  private async supersedeWaitingCards(tx: PrimaryTransaction, projectId: bigint): Promise<void> {
    const table = schema.refinementProposals;
    await tx
      .update(table)
      .set({ status: 'superseded', updatedAt: new Date() })
      .where(and(eq(table.projectId, projectId), eq(table.kind, 'organise'), eq(table.status, 'pending')));
  }

  /** The chat the action came from decides whether what the notes back applies at once; a card accepted outside a chat applies it. */
  private async sessionMode(job: Job.Row): Promise<Refinement.ChatMode> {
    const sessionId = payloadOrigin(job.payload)?.sessionId;
    if (!sessionId) return 'auto';
    const session = await this.db.query.chatSessions.findFirst({ where: eq(schema.chatSessions.id, sessionId), columns: { mode: true } });
    return session?.mode ?? 'auto';
  }

  private async stagedByRun(projectId: bigint, jobId: string): Promise<Staged> {
    const rows = await this.db
      .select({ id: schema.refinementProposals.id, autoApplied: schema.refinementProposals.autoApplied, organiseRecord: schema.refinementProposals.organiseRecord })
      .from(schema.refinementProposals)
      .innerJoin(schema.workflowRuns, eq(sql`${schema.workflowRuns.id}::text`, schema.refinementProposals.runId))
      .where(
        and(
          eq(schema.refinementProposals.projectId, projectId),
          eq(schema.workflowRuns.jobId, jobId),
          eq(schema.refinementProposals.kind, 'organise'),
          inArray(schema.refinementProposals.status, LIVE_STATUSES),
        ),
      );
    const applied = rows.find(row => row.autoApplied);
    const card = rows.find(row => !row.autoApplied);
    return { applied: applied?.id, card: card?.id, receipt: organiseRecordOf((card ?? applied)?.organiseRecord)?.receipt };
  }
}

function stagedProgress(staged: Staged): { proposalId?: string; appliedProposalId?: string; organised?: OrganiseReceipt; applyNote?: string } {
  return {
    ...(staged.applyNote ? { applyNote: staged.applyNote } : {}),
    ...(staged.card === undefined ? {} : { proposalId: String(staged.card) }),
    ...(staged.applied === undefined ? {} : { appliedProposalId: String(staged.applied) }),
    ...(staged.receipt ? { organised: staged.receipt } : {}),
  };
}

/**
 * The organise model is not screened on its way out, and an unrestricted one may write what the author never did: whatever it inferred
 * or suggested is held to the rule for text supplied to a call before it reaches a card.
 */
function screenModelWriting(project: Pick<Project.Row, 'contentMode'>, options: OrganiseOptions): void {
  if (project.contentMode !== 'unrestricted') return;
  const source = 'The organised notes';
  const written = [
    ...options.pages.flatMap(page => page.sections.filter(section => section.quote === undefined).map(section => section.body)),
    ...options.records.filter(record => record.quote === undefined).map(record => record.summary),
    ...options.suggestions.map(suggestion => suggestion.text),
  ];
  const hit = screenTexts(written.map(text => ({ text, scope: 'supplied' as const, source })));
  if (hit) throw hardLineError(hit);
}

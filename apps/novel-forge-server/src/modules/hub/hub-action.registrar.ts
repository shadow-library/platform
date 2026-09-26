import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Refinement } from '@server/database';

import { GenerationService } from '../generation/generation.service';
import { type ActionExecutionContext, type ActionExecutionResult, ActionExecutorRegistry, ProposalApplyService } from '../refinement';
import { RefineService } from '../refinement/refine.service';
import { ChapterReviewService } from '../review/chapter-review.service';

/**
 * Wires every chat action to the service that performs it. Lives outside the
 * refinement module because GenerationModule imports RefinementModule — this module sits above both
 * and pushes closures down into the dependency-free registry at bootstrap.
 */
@Injectable()
export class HubActionRegistrar {
  private readonly logger = Logger.getLogger(APP_NAME, HubActionRegistrar.name);

  constructor(
    private readonly registry: ActionExecutorRegistry,
    private readonly generationService: GenerationService,
    private readonly refineService: RefineService,
    private readonly proposalApplyService: ProposalApplyService,
    private readonly reviewService: ChapterReviewService,
  ) {}

  onModuleInit(): void {
    const registry = this.registry;

    registry.register('action.generate_chapter', async (projectId, action) => {
      if (action.op !== 'action.generate_chapter') throw AppError.internal('executor misrouted');
      const job = await this.generationService.generateChapter(projectId, action.chapter);
      return { summary: `enqueued generation of chapter ${action.chapter}`, jobId: job.jobId };
    });

    registry.register('action.audit_bible', async (projectId, _action, ctx) => {
      const result = await this.refineService.auditBible(projectId);
      if (!result.proposal) return { summary: `bible audit found nothing to change (${result.findings.length} finding(s))`, runId: result.runId };
      return this.settleChainProposal(projectId, result.proposal, result.runId, `bible audit staged ${result.findings.length} finding(s)`, ctx);
    });

    registry.register('action.enhance_premise', async (projectId, action, ctx) => {
      if (action.op !== 'action.enhance_premise') throw AppError.internal('executor misrouted');
      const result = await this.refineService.enhancePremise(projectId, action.overview);
      return this.settleChainProposal(projectId, result.proposal, result.runId, 'premise enhancement staged', ctx);
    });

    registry.register('action.judge_draft', async (projectId, action) => {
      if (action.op !== 'action.judge_draft') throw AppError.internal('executor misrouted');
      const review = await this.reviewService.run(projectId, action.chapter, { kind: 'judge' });
      return { summary: `judge verdict on chapter ${action.chapter} revision ${review.draftRevision ?? 'final'}: ${review.verdict} (${review.findings.length} finding(s))` };
    });

    registry.register('action.revise_draft', async (projectId, action) => {
      if (action.op !== 'action.revise_draft') throw AppError.internal('executor misrouted');
      const draft = await this.generationService.reviseDraft(projectId, action.chapter, { note: action.note });
      return { summary: `revised chapter ${action.chapter} draft to revision ${draft.revision}` };
    });

    registry.register('action.approve_draft', async (projectId, action) => {
      if (action.op !== 'action.approve_draft') throw AppError.internal('executor misrouted');
      if (action.revision === undefined) {
        await this.generationService.getDraft(projectId, action.chapter);
        throw AppErrorCode.DRF_013.create();
      }
      await this.generationService.approveDraft(projectId, action.chapter, { revision: action.revision });
      return { summary: `approved chapter ${action.chapter} draft at revision ${action.revision}` };
    });

    registry.register('action.validate', async (projectId, action) => {
      if (action.op !== 'action.validate') throw AppError.internal('executor misrouted');
      if (action.scope === 'chapter' && action.chapter !== undefined) {
        const review = await this.reviewService.run(projectId, action.chapter, { kind: 'editorial' });
        return { summary: `chapter ${action.chapter} review: ${review.verdict} (${review.findings.length} finding(s))` };
      }
      const run = await this.generationService.validate(projectId);
      return { summary: `novel validation ${run.status}: ${run.outcome}`, runId: run.runId };
    });

    registry.register('action.finalize', async (projectId, action) => {
      if (action.op !== 'action.finalize') throw AppError.internal('executor misrouted');
      const run = await this.generationService.finalize(projectId, { chapter: action.upTo });
      return { summary: `finalize ${run.status}: ${run.outcome}`, runId: run.runId };
    });

    this.logger.debug('hub action executors registered');
  }

  /**
   * Chain-producing actions stage their own proposal; in an auto-mode turn that proposal is applied
   * on the spot so the mode stays honest end-to-end — a conflict leaves it pending for manual review
   * instead of failing the action.
   */
  private async settleChainProposal(projectId: bigint, proposal: Refinement.Proposal, runId: string, summary: string, ctx: ActionExecutionContext): Promise<ActionExecutionResult> {
    if (!ctx.autoApplied) return { summary: `${summary} — proposal ${proposal.id} pending review`, runId, proposalId: String(proposal.id) };
    try {
      await this.proposalApplyService.apply(projectId, proposal.id, { autoApplied: true });
      return { summary: `${summary} — proposal ${proposal.id} auto-applied`, runId, proposalId: String(proposal.id) };
    } catch (err) {
      this.logger.warn(`auto-apply of chain proposal ${proposal.id} failed; left for manual review`, { err });
      return { summary: `${summary} — proposal ${proposal.id} staged (auto-apply conflicted; review manually)`, runId, proposalId: String(proposal.id) };
    }
  }
}

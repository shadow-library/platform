import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type Refinement } from '@server/database';

import { ArcService } from '../bible/arc/arc.service';
import { VolumeService } from '../bible/volume/volume.service';
import { GenerationService } from '../generation/generation.service';
import { type ActionExecutionContext, type ActionExecutionResult, ActionExecutorRegistry, ProposalApplyService } from '../refinement';
import { RefineService } from '../refinement/refine.service';

/**
 * Wires every chat action to the service that performs it (chat-hub design §5.3). Lives outside the
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
    private readonly volumeService: VolumeService,
    private readonly arcService: ArcService,
    private readonly proposalApplyService: ProposalApplyService,
  ) {}

  onModuleInit(): void {
    const registry = this.registry;

    registry.register('action.generate_chapters', async (projectId, action) => {
      if (action.op !== 'action.generate_chapters') throw AppError.internal('executor misrouted');
      const job = await this.generationService.generate(projectId, { limit: action.count });
      return { summary: `enqueued generation of ${action.count} chapter(s)`, jobId: job.jobId };
    });

    registry.register('action.plan_volumes', async (projectId, action) => {
      if (action.op !== 'action.plan_volumes') throw AppError.internal('executor misrouted');
      const result = await this.generationService.plan(projectId, { volumeCount: action.volumeCount, chaptersPerVolume: action.chaptersPerVolume });
      return { summary: `planned ${result.volumes.length} volume(s)` };
    });

    registry.register('action.plan_arcs', async (projectId, action, ctx) => {
      if (action.op !== 'action.plan_arcs') throw AppError.internal('executor misrouted');
      const result = await this.refineService.planArcs(projectId, action.volumeKey, { arcCount: action.arcCount });
      return this.settleChainProposal(projectId, result.proposal, result.runId, `planned arcs for ${action.volumeKey}`, ctx);
    });

    registry.register('action.outline_arc', async (projectId, action) => {
      if (action.op !== 'action.outline_arc') throw AppError.internal('executor misrouted');
      const result = await this.generationService.outlineArc(projectId, action.arcKey, {});
      return { summary: `outlined ${result.briefs.length} brief(s) for ${action.arcKey}` };
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
      const result = await this.generationService.judgeDraft(projectId, action.chapter);
      return { summary: `judge verdict on chapter ${action.chapter}: ${result.verdict} (${result.findings.length} finding(s))` };
    });

    registry.register('action.revise_draft', async (projectId, action) => {
      if (action.op !== 'action.revise_draft') throw AppError.internal('executor misrouted');
      const draft = await this.generationService.reviseDraft(projectId, action.chapter, { note: action.note });
      return { summary: `revised chapter ${action.chapter} draft to revision ${draft.revision}` };
    });

    registry.register('action.approve_draft', async (projectId, action) => {
      if (action.op !== 'action.approve_draft') throw AppError.internal('executor misrouted');
      await this.generationService.approveDraft(projectId, action.chapter);
      return { summary: `approved chapter ${action.chapter} draft` };
    });

    registry.register('action.approve_volume_plan', async projectId => {
      await this.volumeService.approve(projectId);
      return { summary: 'approved the volume plan' };
    });

    registry.register('action.approve_arcs', async (projectId, action) => {
      if (action.op !== 'action.approve_arcs') throw AppError.internal('executor misrouted');
      await this.arcService.approve(projectId, action.volumeKey);
      return { summary: `approved arcs of ${action.volumeKey}` };
    });

    registry.register('action.validate', async (projectId, action) => {
      if (action.op !== 'action.validate') throw AppError.internal('executor misrouted');
      if (action.scope === 'chapter' && action.chapter !== undefined) {
        const review = await this.generationService.reviewChapter(projectId, action.chapter);
        return { summary: `chapter ${action.chapter} review: ${review.disposition}` };
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
   * instead of failing the action (chat-hub design §4.2).
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

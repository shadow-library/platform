import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { ContextAssembler, NOVEL_CHAT_HISTORY_ALLOWANCE } from '../ai/context/context-assembler.service';
import { CHAPTER_PACK_CONSUMERS } from '../ai/graphs/chapter-generation.graph';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { chatPromptTokens, chatScopeInstructions, PROMPT_REGISTRY } from '../ai/prompts';
import { type PremiseEnhanceOutput } from '../ai/schemas';
import { toolsForNode } from '../ai/tools';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { type ChangeOp } from './change-set';
import { ProposalService } from './proposal.service';
import { type ContextPreviewResponse } from './refine.dto';

export interface PremiseEnhanceResult {
  proposal: Refinement.Proposal;
  rationale: Omit<PremiseEnhanceOutput, 'changeSet'>;
  runId: string;
}

export interface ContextPreviewInput {
  purpose: string;
  chapter?: number;
  scopeType?: string;
}

@Injectable()
export class RefineService {
  private readonly logger = Logger.getLogger(APP_NAME, RefineService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly contextAssembler: ContextAssembler,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly proposalService: ProposalService,
    private readonly pluginPolicy: PluginPolicyService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Upgrades a rough overview into a serialized-web-novel premise. The improvements are
   * staged as a premise_enhance proposal; the rationale fields come back so the author sees WHY
   * before applying, and refinement continues in a novel-scoped chat.
   */
  async enhancePremise(projectId: bigint, overview?: string): Promise<PremiseEnhanceResult> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    const effectiveOverview = overview ?? project.brief ?? project.premise;
    if (!effectiveOverview) throw AppErrorCode.PRM_001.create();
    this.logger.info('enhancePremise: starting', {
      projectId,
      overviewSource: overview ? 'argument' : project.brief ? 'brief' : 'premise',
      overviewLength: effectiveOverview.length,
    });

    const prompt = PROMPT_REGISTRY['premise-enhance'];
    const policy = await this.pluginPolicy.resolve(projectId, { role: 'premise' }, project);
    const pack = await this.contextAssembler.forPremise(projectId, { policy });

    const { runId, result } = await this.workflowRunService.runChain(projectId, 'premise-enhance', 'premise', { overview: effectiveOverview }, async runId => {
      await this.workflowRunService.linkContextPack(runId, pack.id);
      const ctx = { projectId, runId, node: 'premise-enhance', promptKey: prompt.key, promptVersion: prompt.version, role: 'premise' };
      const output = (await this.modelRouter.structured(
        prompt,
        { stableContext: pack.rendered, overview: effectiveOverview },
        ctx,
        project as ProjectConfig,
        policy,
      )) as PremiseEnhanceOutput;

      const proposal = await this.proposalService.create(projectId, {
        scopeType: 'novel',
        kind: 'premise_enhance',
        summary: output.hook.slice(0, 300),
        changeSet: output.changeSet as unknown as ChangeOp[],
        allowedOps: ['premise.update', 'bible_document.upsert'],
        runId,
      });
      const rationale = { ...output };
      delete (rationale as Partial<PremiseEnhanceOutput>).changeSet;
      return { proposal, rationale: rationale as Omit<PremiseEnhanceOutput, 'changeSet'> };
    });

    this.logger.info('enhancePremise: staged proposal', { projectId, runId, proposalId: result.proposal.id });
    return { ...result, runId };
  }

  /** Dry-run window into exactly what a model call would see — the debugging seam. */
  async previewContext(projectId: bigint, query: ContextPreviewInput): Promise<ContextPreviewResponse> {
    const pack = await this.assemblePreview(projectId, query);
    return {
      purpose: pack.purpose,
      budgetTokens: pack.budgetTokens,
      usedTokens: pack.usedTokens,
      sections: pack.sections.map(s => ({ key: s.key, tier: s.tier, segment: s.segment, tokens: s.tokens, truncated: s.truncated })),
      unresolvedRefs: pack.unresolvedRefs,
      omitted: pack.omitted,
      renderedStable: pack.renderedStable,
      renderedVolatile: pack.renderedVolatile,
      rendered: pack.rendered,
    };
  }

  private async assemblePreview(projectId: bigint, query: ContextPreviewInput): ReturnType<ContextAssembler['forNovelChat']> {
    const resolver = await this.pluginPolicy.scoped(projectId);
    const chapter = query.chapter ?? 1;
    switch (query.purpose) {
      case 'generation':
        return this.contextAssembler.forChapter(projectId, chapter, { dryRun: true, policy: resolver.forPack({ role: 'generation', chapter }, CHAPTER_PACK_CONSUMERS) });
      case 'outline':
        return this.contextAssembler.forOutline(projectId, chapter, { policy: resolver.for({ role: 'outline', chapter }) });
      case 'chat': {
        if (!query.scopeType) throw AppErrorCode.CHT_003.create();
        const policy = resolver.for({ role: 'chat' });
        return this.contextAssembler.forNovelChat(projectId, new Date(), {
          policy,
          promptTokens: chatPromptTokens(chatScopeInstructions(toolsForNode('chat-hub'))),
          requestTokens: NOVEL_CHAT_HISTORY_ALLOWANCE,
        });
      }
      case 'premise':
        return this.contextAssembler.forPremise(projectId, { policy: resolver.for({ role: 'premise' }) });
      default:
        return this.contextAssembler.forAudit(projectId, { policy: resolver.for({ role: 'audit' }) });
    }
  }
}

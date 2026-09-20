import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { assertAuthoringProject } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { ContextAssembler } from '../ai/context/context-assembler.service';
import { CHAPTER_PACK_CONSUMERS } from '../ai/graphs/chapter-generation.graph';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { buildArcPlanPrompt, PROMPT_REGISTRY } from '../ai/prompts';
import { type ArcPlanOutput, type BibleAuditOutput, type PremiseEnhanceOutput } from '../ai/schemas';
import { renderDocInventory, renderEntityInventory } from '../bible/bible-inventory';
import { renderManifest } from '../bible/bible-manifest';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { type ChangeOp } from './change-set';
import { ProposalService } from './proposal.service';
import { type ContextPreviewResponse } from './refine.dto';

export interface PremiseEnhanceResult {
  proposal: Refinement.Proposal;
  rationale: Omit<PremiseEnhanceOutput, 'changeSet'>;
  runId: string;
}

export interface BibleAuditResult {
  proposal: Refinement.Proposal | null;
  findings: BibleAuditOutput['findings'];
  runId: string;
}

export interface ArcPlanResult {
  proposal: Refinement.Proposal;
  arcs: ArcPlanOutput['arcs'];
  runId: string;
}

export interface ContextPreviewInput {
  purpose: string;
  chapter?: number;
  scopeType?: string;
  volumeKey?: string;
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
    assertAuthoringProject(project);
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

  /**
   * Audits the bible against the required-document manifest: drafted content for what is
   * missing or thin, removals for dead weight — all staged through the same proposal pipe. A clean
   * bible returns findings with no proposal.
   */
  async auditBible(projectId: bigint): Promise<BibleAuditResult> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    assertAuthoringProject(project);

    const prompt = PROMPT_REGISTRY['bible-audit'];
    const policy = await this.pluginPolicy.resolve(projectId, { role: 'audit' }, project);
    const [pack, docs, entities] = await Promise.all([
      this.contextAssembler.forAudit(projectId, { policy }),
      this.db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId), orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug] }),
      this.db.query.entities.findMany({ where: eq(schema.entities.projectId, projectId), columns: { entityKey: true, name: true, type: true } }),
    ]);
    const docInventory = renderDocInventory(docs);
    const entityInventory = renderEntityInventory(entities);
    this.logger.info('auditBible: starting', { projectId, existingDocs: docs.length, existingEntities: entities.length });

    const { runId, result } = await this.workflowRunService.runChain(projectId, 'bible-audit', 'bible', {}, async runId => {
      await this.workflowRunService.linkContextPack(runId, pack.id);
      const ctx = { projectId, runId, node: 'bible-audit', promptKey: prompt.key, promptVersion: prompt.version, role: 'audit' };
      const output = (await this.modelRouter.structured(
        prompt,
        { stableContext: pack.rendered, docInventory, entityInventory, manifest: renderManifest() },
        ctx,
        project as ProjectConfig,
        policy,
      )) as BibleAuditOutput;

      this.logger.info('auditBible: findings', { projectId, runId, findings: output.findings.length, changeSetOps: output.changeSet.length });
      if (output.changeSet.length === 0) return { proposal: null, findings: output.findings };

      const proposal = await this.proposalService.create(projectId, {
        scopeType: 'novel',
        kind: 'bible_audit',
        summary: `bible audit: ${output.changeSet.length} canon change(s) proposed`,
        changeSet: output.changeSet as unknown as ChangeOp[],
        allowedOps: ['bible_document.upsert', 'bible_document.remove', 'entity.upsert', 'entity.remove'],
        runId,
      });
      return { proposal, findings: output.findings };
    });

    return { ...result, runId };
  }

  /**
   * Plans the arcs of one volume: the model must partition the volume's chapter range
   * exactly (coverage re-enters the repair ladder) and expand thin material with suggested ideas.
   * The plan is STAGED as an arc_plan proposal — applying it writes the arcs.
   */
  async planArcs(projectId: bigint, volumeKey: string, opts?: { arcCount?: number; guidance?: string }): Promise<ArcPlanResult> {
    const [project, volumes] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId) }),
    ]);
    if (!project) throw AppErrorCode.PRJ_001.create();
    assertAuthoringProject(project);

    const volume = volumes.find(v => v.volumeKey === volumeKey);
    if (!volume) throw AppErrorCode.VOL_001.create();
    // Gate 1: the whole plan is approved with laid-out ranges before arcs are planned.
    const planReady = volumes.every(v => v.status !== 'draft') && volume.startChapter !== null && volume.endChapter !== null;
    if (!planReady) throw AppErrorCode.ARC_003.create();

    const startChapter = volume.startChapter as number;
    const endChapter = volume.endChapter as number;
    this.logger.info('planArcs: starting', { projectId, volumeKey, startChapter, endChapter, arcCount: opts?.arcCount });
    const prompt = buildArcPlanPrompt(startChapter, endChapter);
    const policy = await this.pluginPolicy.resolve(projectId, { role: 'arc' }, project);
    const pack = await this.contextAssembler.forArcPlanning(projectId, volumeKey, { policy });

    const { runId, result } = await this.workflowRunService.runChain(projectId, 'arc-plan', `volume:${volumeKey}`, { arcCount: opts?.arcCount }, async runId => {
      await this.workflowRunService.linkContextPack(runId, pack.id);
      const ctx = { projectId, runId, node: 'arc-plan', promptKey: prompt.key, promptVersion: prompt.version, role: 'arc' };
      const input = {
        stableContext: pack.rendered,
        volumeKey,
        startChapter,
        endChapter,
        arcCount: opts?.arcCount ?? 'decide from the material',
        guidance: opts?.guidance ?? '',
      };
      const output = (await this.modelRouter.structured(prompt, input, ctx, project as ProjectConfig, policy)) as ArcPlanOutput;

      const changeSet: ChangeOp[] = output.arcs.map((arc, index) => ({
        op: 'arc.upsert',
        arcKey: arc.arcKey,
        volumeKey,
        ordinal: index + 1,
        title: arc.title,
        objective: arc.objective,
        escalation: arc.escalation,
        payoff: arc.payoff,
        hook: arc.hook,
        chapterStart: arc.chapterStart,
        chapterEnd: arc.chapterEnd,
        cast: arc.cast,
        body: arc.ideas.length > 0 ? `${arc.body}\n\nIdeas:\n${arc.ideas.map(idea => `- ${idea}`).join('\n')}` : arc.body,
      }));

      const proposal = await this.proposalService.create(projectId, {
        scopeType: 'arc_plan',
        scopeRef: `volume:${volumeKey}`,
        kind: 'arc_plan',
        summary: `${output.arcs.length} arc(s) planned for ${volumeKey} (chs ${startChapter}–${endChapter})`,
        changeSet,
        allowedOps: ['arc.upsert', 'arc.remove'],
        runId,
      });
      this.logger.info('planArcs: staged proposal', { projectId, runId, volumeKey, arcs: output.arcs.length, proposalId: proposal.id });
      return { proposal, arcs: output.arcs };
    });

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

  private async assemblePreview(projectId: bigint, query: ContextPreviewInput): ReturnType<ContextAssembler['forChatTurn']> {
    const resolver = await this.pluginPolicy.scoped(projectId);
    const chapter = query.chapter ?? 1;
    switch (query.purpose) {
      case 'generation':
        return this.contextAssembler.forChapter(projectId, chapter, { dryRun: true, policy: resolver.forPack({ role: 'generation', chapter }, CHAPTER_PACK_CONSUMERS) });
      case 'outline':
        return this.contextAssembler.forOutline(projectId, chapter, { policy: resolver.for({ role: 'outline', chapter }) });
      case 'chat': {
        if (!query.scopeType) throw AppErrorCode.CHT_003.create();
        const session = { scopeType: query.scopeType as Refinement.ChatScope, createdAt: new Date() };
        return this.contextAssembler.forChatTurn(projectId, session, { policy: resolver.for({ role: 'chat' }) });
      }
      case 'arc_plan': {
        if (!query.volumeKey) throw AppErrorCode.VOL_001.create();
        return this.contextAssembler.forArcPlanning(projectId, query.volumeKey, { policy: resolver.for({ role: 'arc' }) });
      }
      case 'premise':
        return this.contextAssembler.forPremise(projectId, { policy: resolver.for({ role: 'premise' }) });
      default:
        return this.contextAssembler.forAudit(projectId, { policy: resolver.for({ role: 'audit' }) });
    }
  }
}

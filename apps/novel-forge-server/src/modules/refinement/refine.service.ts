/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { type ChangeOp } from './change-set';
import { ProposalService } from './proposal.service';
import { renderManifest } from './required-bible-docs';
import { ContextAssembler } from '../ai/context/context-assembler.service';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY, buildArcPlanPrompt } from '../ai/prompts';
import { type ArcPlanOutput, type BibleAuditOutput, type PremiseEnhanceOutput } from '../ai/schemas';

/**
 * Defining types
 */

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
  scopeRef?: string;
  volumeKey?: string;
}

/**
 * Declaring the constants
 */

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
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Upgrades a rough overview into a serialized-web-novel premise (design §7). The improvements are
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
    const pack = await this.contextAssembler.forPremise(projectId);

    const { runId, result } = await this.workflowRunService.runChain(projectId, 'premise-enhance', 'premise', { overview: effectiveOverview }, async runId => {
      await this.workflowRunService.linkContextPack(runId, pack.id);
      const ctx = { projectId, runId, node: 'premise-enhance', promptKey: prompt.key, promptVersion: prompt.version, role: 'premise' };
      const output = (await this.modelRouter.structured(
        prompt,
        { stableContext: pack.rendered, overview: effectiveOverview },
        ctx,
        project as ProjectConfig,
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
   * Audits the bible against the required-document manifest (design §7): drafted content for what is
   * missing or thin, removals for dead weight — all staged through the same proposal pipe. A clean
   * bible returns findings with no proposal.
   */
  async auditBible(projectId: bigint): Promise<BibleAuditResult> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();

    const prompt = PROMPT_REGISTRY['bible-audit'];
    const [pack, docs] = await Promise.all([
      this.contextAssembler.forAudit(projectId),
      this.db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId), orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug] }),
    ]);
    const docInventory = docs.length > 0 ? docs.map(d => `${d.section}/${d.slug} (revision ${d.revision})`).join('\n') : 'none';
    this.logger.info('auditBible: starting', { projectId, existingDocs: docs.length });

    const { runId, result } = await this.workflowRunService.runChain(projectId, 'bible-audit', 'bible', {}, async runId => {
      await this.workflowRunService.linkContextPack(runId, pack.id);
      const ctx = { projectId, runId, node: 'bible-audit', promptKey: prompt.key, promptVersion: prompt.version, role: 'audit' };
      const output = (await this.modelRouter.structured(
        prompt,
        { stableContext: pack.rendered, docInventory, manifest: renderManifest() },
        ctx,
        project as ProjectConfig,
      )) as BibleAuditOutput;

      this.logger.info('auditBible: findings', { projectId, runId, findings: output.findings.length, changeSetOps: output.changeSet.length });
      if (output.changeSet.length === 0) return { proposal: null, findings: output.findings };

      const proposal = await this.proposalService.create(projectId, {
        scopeType: 'novel',
        kind: 'bible_audit',
        summary: `bible audit: ${output.changeSet.length} document change(s) proposed`,
        changeSet: output.changeSet as unknown as ChangeOp[],
        allowedOps: ['bible_document.upsert', 'bible_document.remove'],
        runId,
      });
      return { proposal, findings: output.findings };
    });

    return { ...result, runId };
  }

  /**
   * Plans the arcs of one volume (design §8): the model must partition the volume's chapter range
   * exactly (coverage re-enters the repair ladder) and expand thin material with suggested ideas.
   * Per Appendix A rule 13 the plan is STAGED as an arc_plan proposal — applying it writes the arcs.
   */
  async planArcs(projectId: bigint, volumeKey: string, opts?: { arcCount?: number; guidance?: string }): Promise<ArcPlanResult> {
    const [project, volumes] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId) }),
    ]);
    if (!project) throw AppErrorCode.PRJ_001.create();

    const volume = volumes.find(v => v.volumeKey === volumeKey);
    if (!volume) throw AppErrorCode.VOL_001.create();
    // Gate 1 (design §4): the whole plan is approved with laid-out ranges before arcs are planned.
    const planReady = volumes.every(v => v.status !== 'draft') && volume.startChapter !== null && volume.endChapter !== null;
    if (!planReady) throw AppErrorCode.ARC_003.create();

    const startChapter = volume.startChapter as number;
    const endChapter = volume.endChapter as number;
    this.logger.info('planArcs: starting', { projectId, volumeKey, startChapter, endChapter, arcCount: opts?.arcCount });
    const prompt = buildArcPlanPrompt(startChapter, endChapter);
    const pack = await this.contextAssembler.forArcPlanning(projectId, volumeKey);

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
      const output = (await this.modelRouter.structured(prompt, input, ctx, project as ProjectConfig)) as ArcPlanOutput;

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

  /** Dry-run window into exactly what a model call would see — the debugging seam of design §12. */
  async previewContext(projectId: bigint, query: ContextPreviewInput): Promise<Record<string, unknown>> {
    const pack = await this.assemblePreview(projectId, query);
    return {
      purpose: pack.purpose,
      budgetTokens: pack.budgetTokens,
      usedTokens: pack.usedTokens,
      sections: pack.sections.map(s => ({ key: s.key, tier: s.tier, segment: s.segment, tokens: s.tokens, truncated: s.truncated })),
      unresolvedRefs: pack.unresolvedRefs,
      renderedStable: pack.renderedStable,
      renderedVolatile: pack.renderedVolatile,
      rendered: pack.rendered,
    };
  }

  private assemblePreview(projectId: bigint, query: ContextPreviewInput): ReturnType<ContextAssembler['forChatTurn']> {
    switch (query.purpose) {
      case 'generation':
        return this.contextAssembler.forChapter(projectId, query.chapter ?? 1, { dryRun: true });
      case 'outline':
        return this.contextAssembler.forOutline(projectId, query.chapter ?? 1);
      case 'chat': {
        if (!query.scopeType) throw AppErrorCode.CHT_003.create();
        return this.contextAssembler.forChatTurn(projectId, { scopeType: query.scopeType as Refinement.ChatScope, scopeRef: query.scopeRef ?? null, createdAt: new Date() });
      }
      case 'arc_plan': {
        if (!query.volumeKey) throw AppErrorCode.VOL_001.create();
        return this.contextAssembler.forArcPlanning(projectId, query.volumeKey);
      }
      case 'premise':
        return this.contextAssembler.forPremise(projectId);
      default:
        return this.contextAssembler.forAudit(projectId);
    }
  }
}

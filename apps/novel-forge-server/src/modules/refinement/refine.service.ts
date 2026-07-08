/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
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
import { PROMPT_REGISTRY } from '../ai/prompts';
import { type BibleAuditOutput, type PremiseEnhanceOutput } from '../ai/schemas';

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
    if (!project) throw new ServerError(AppErrorCode.PRJ_001);
    const effectiveOverview = overview ?? project.brief ?? project.premise;
    if (!effectiveOverview) throw new ServerError(AppErrorCode.PRM_001);

    const prompt = PROMPT_REGISTRY['premise-enhance'];
    const pack = await this.contextAssembler.forPremise(projectId);

    const { runId, result } = await this.workflowRunService.runChain(projectId, 'premise-enhance', 'premise', { overview: effectiveOverview }, async runId => {
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

    return { ...result, runId };
  }

  /**
   * Audits the bible against the required-document manifest (design §7): drafted content for what is
   * missing or thin, removals for dead weight — all staged through the same proposal pipe. A clean
   * bible returns findings with no proposal.
   */
  async auditBible(projectId: bigint): Promise<BibleAuditResult> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw new ServerError(AppErrorCode.PRJ_001);

    const prompt = PROMPT_REGISTRY['bible-audit'];
    const [pack, docs] = await Promise.all([
      this.contextAssembler.forAudit(projectId),
      this.db.query.bibleDocuments.findMany({ where: eq(schema.bibleDocuments.projectId, projectId), orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug] }),
    ]);
    const docInventory = docs.length > 0 ? docs.map(d => `${d.section}/${d.slug} (revision ${d.revision})`).join('\n') : 'none';

    const { runId, result } = await this.workflowRunService.runChain(projectId, 'bible-audit', 'bible', {}, async runId => {
      const ctx = { projectId, runId, node: 'bible-audit', promptKey: prompt.key, promptVersion: prompt.version, role: 'audit' };
      const output = (await this.modelRouter.structured(
        prompt,
        { stableContext: pack.rendered, docInventory, manifest: renderManifest() },
        ctx,
        project as ProjectConfig,
      )) as BibleAuditOutput;

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
}

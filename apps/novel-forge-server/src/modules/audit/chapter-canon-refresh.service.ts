import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Job, type PrimaryDatabase, type PrimaryTransaction, schema } from '@server/database';

import { chapterProjectConfig } from '../ai/chapter-route';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { CANON_REFRESH_OPS, PROMPT_REGISTRY } from '../ai/prompts';
import { type ChapterCanonRefreshOutput } from '../ai/schemas';
import { JobHandlerRegistry } from '../jobs/job-handler.registry';
import { JobService } from '../jobs/job.service';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { type ArtifactState, loadArtifactStates } from '../refinement/artifact-state';
import { ProposalService } from '../refinement/proposal.service';
import { currentRecords, type RefreshRows, renderRefreshMaterial, secretFacts } from './bible-audit-material';
import { buildCanonRefreshReport, renderReportSummary } from './bible-audit-report';

export type CanonRefreshOutcome = 'staged' | 'unchanged' | 'already_refreshed' | 'not_final' | 'isolated';

export interface CanonRefreshResult {
  outcome: CanonRefreshOutcome;
  reportId?: bigint;
  proposalId?: bigint | null;
}

export const CANON_REFRESH_GRAPH = 'chapter-canon-refresh';

export function canonRefreshTarget(chapter: number): string {
  return `chapter-${chapter}`;
}

function refreshChapter(payload: unknown): number | undefined {
  const chapter = (payload as { chapter?: unknown } | null)?.chapter;
  return typeof chapter === 'number' && Number.isInteger(chapter) && chapter > 0 ? chapter : undefined;
}

/**
 * After a chapter is finalized, reads the Story Bible against what that chapter established and stages the pages and records it left out
 * of date as one audit card for the author. It never applies anything, and it runs once per chapter: a report already stored for the
 * chapter answers every later run.
 */
@Injectable()
export class ChapterCanonRefreshService {
  private readonly logger = Logger.getLogger(APP_NAME, ChapterCanonRefreshService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly modelRouter: ModelRouterService,
    private readonly pluginPolicy: PluginPolicyService,
    private readonly proposalService: ProposalService,
    private readonly jobService: JobService,
    private readonly jobHandlers: JobHandlerRegistry,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  onModuleInit(): void {
    this.jobHandlers.register('canon_refresh', job => this.runJob(job));
  }

  async refresh(projectId: bigint, chapter: number, jobId?: string): Promise<CanonRefreshResult> {
    const existing = await this.findReport(this.db, projectId, chapter);
    if (existing) return { outcome: 'already_refreshed', reportId: existing.id, proposalId: existing.proposalId };

    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    const loaded = await this.loadRows(projectId, chapter);
    if (loaded.outcome !== 'loaded') {
      this.logger.info('canon refresh: nothing to read', { projectId, chapter, outcome: loaded.outcome });
      return { outcome: loaded.outcome };
    }
    const { rows, states } = loaded;
    if (jobId) await this.jobService.progress(jobId, { done: 0, total: 1, current: String(chapter), phase: 'refreshing' });

    const { runId, result } = await this.workflowRunService.runChain(
      projectId,
      CANON_REFRESH_GRAPH,
      canonRefreshTarget(chapter),
      { chapter },
      async runId => {
        const signal = this.modelRouter.bindRunSignal(runId);
        const material = renderRefreshMaterial(rows);
        const prompt = PROMPT_REGISTRY['chapter-canon-refresh'];
        const policy = await this.pluginPolicy.resolve(projectId, { role: 'audit', chapter }, project);
        const ctx = { projectId, runId, node: CANON_REFRESH_GRAPH, promptKey: prompt.key, promptVersion: prompt.version, role: 'audit', chapter };
        const routed = chapterProjectConfig(project as ProjectConfig, 'standard');
        const output = (await this.modelRouter.structured(prompt, { material: material.bible, chapterProse: material.chapter }, ctx, routed, policy)) as ChapterCanonRefreshOutput;

        const built = buildCanonRefreshReport({
          refresh: output,
          chapterRef: `chapter:${chapter}`,
          sources: material.sources,
          partial: material.partial,
          existingRefs: new Set(Object.keys(states)),
          current: currentRecords({ ...rows, chapters: [], isolatedChapters: [] }),
          secrets: secretFacts(rows.facts),
        });
        if (built.findings.length === 0) return { outcome: 'unchanged' as const };

        const summary = `Chapter ${chapter}: ${renderReportSummary(built.findings, material.checked.copy)}`;
        return this.db.transaction(async tx => {
          if (signal.aborted) throw AppErrorCode.AI_013.create();
          const raced = await this.findReport(tx, projectId, chapter);
          if (raced) return { outcome: 'already_refreshed' as const, reportId: raced.id, proposalId: raced.proposalId };
          const proposal =
            built.changeSet.length === 0
              ? null
              : await this.proposalService.create(
                  projectId,
                  {
                    scopeType: 'novel',
                    kind: 'bible_audit',
                    summary: summary.slice(0, 300),
                    changeSet: built.changeSet,
                    allowedOps: CANON_REFRESH_OPS,
                    entityMaterialization: false,
                    runId,
                    baseline: states,
                  },
                  tx,
                );
          const [report] = await tx
            .insert(schema.validationReports)
            .values({
              projectId,
              scope: 'bible',
              chapter,
              issues: built.findings.length,
              summary,
              payload: { changeSet: built.changeSet, failures: {} },
              findings: built.findings,
              checked: material.checked,
              runId,
              proposalId: proposal?.id ?? null,
            })
            .returning({ id: schema.validationReports.id });
          if (!report) throw AppError.internal('canon refresh report insert returned no row');
          return { outcome: 'staged' as const, reportId: report.id, proposalId: proposal?.id ?? null };
        });
      },
      jobId,
    );

    this.logger.info('canon refresh: done', { projectId, chapter, runId, ...result });
    return result;
  }

  private async runJob(job: Job.Row): Promise<void> {
    const chapter = refreshChapter(job.payload);
    if (chapter === undefined) throw AppError.internal(`canon refresh job ${job.id} names no chapter`);
    const result = await this.refresh(job.projectId, chapter, job.id);
    const card = result.proposalId ? { proposalId: String(result.proposalId) } : {};
    await this.jobService.progress(job.id, { done: 1, total: 1, current: String(chapter), phase: result.outcome, ...card });
  }

  private async findReport(db: PrimaryDatabase | PrimaryTransaction, projectId: bigint, chapter: number): Promise<{ id: bigint; proposalId: bigint | null } | undefined> {
    return db.query.validationReports.findFirst({
      where: and(eq(schema.validationReports.projectId, projectId), eq(schema.validationReports.scope, 'bible'), eq(schema.validationReports.chapter, chapter)),
      columns: { id: true, proposalId: true },
    });
  }

  /** One snapshot for the material and the baseline, as the audit reads it: an edit landing between them would be overwritten by a fix written from older text. */
  private loadRows(
    projectId: bigint,
    chapter: number,
  ): Promise<{ outcome: 'loaded'; rows: RefreshRows; states: Record<string, ArtifactState> } | { outcome: 'not_final' | 'isolated' }> {
    return this.db.transaction(
      async tx => {
        const row = await tx.query.chapters.findFirst({
          where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter), eq(schema.chapters.status, 'done'), eq(schema.chapters.locked, true)),
          columns: { number: true, title: true, summary: true, content: true, isolated: true },
        });
        if (!row) return { outcome: 'not_final' as const };
        if (row.isolated) return { outcome: 'isolated' as const };

        const documents = await tx.query.bibleDocuments.findMany({
          where: eq(schema.bibleDocuments.projectId, projectId),
          orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug],
          columns: { section: true, slug: true, body: true },
        });
        const entities = await tx.query.entities.findMany({
          where: eq(schema.entities.projectId, projectId),
          orderBy: [schema.entities.type, schema.entities.entityKey],
          columns: { entityKey: true, type: true, name: true, status: true, motivation: true, notes: true, body: true },
        });
        const facts = await tx.query.canonFacts.findMany({
          where: eq(schema.canonFacts.projectId, projectId),
          orderBy: schema.canonFacts.factKey,
          columns: { factKey: true, text: true, writerNote: true, terms: true, allowedClues: true, revealChapter: true, disclosedInChapter: true, source: true },
        });
        const review = await tx.query.finalizeReviews.findFirst({
          where: and(eq(schema.finalizeReviews.projectId, projectId), eq(schema.finalizeReviews.chapter, chapter), eq(schema.finalizeReviews.status, 'applied')),
          columns: { id: true },
        });
        const answered = review
          ? await tx.query.finalizeReviewItems.findMany({
              where: and(eq(schema.finalizeReviewItems.reviewId, review.id), isNotNull(schema.finalizeReviewItems.decision), ne(schema.finalizeReviewItems.category, 'summary')),
              orderBy: schema.finalizeReviewItems.position,
              columns: { claim: true, decision: true },
            })
          : [];
        const reviewItems = answered.flatMap(item => (item.decision ? [{ claim: item.claim, decision: item.decision }] : []));
        const refs = [...documents.map(doc => `doc:${doc.section}/${doc.slug}`), ...entities.map(entity => `entity:${entity.entityKey}`)];
        const states = await loadArtifactStates(tx, projectId, refs);
        const chapterRow = { number: row.number, title: row.title, summary: row.summary, content: row.content ?? '' };
        return { outcome: 'loaded' as const, rows: { documents, entities, facts, chapter: chapterRow, reviewItems }, states };
      },
      { isolationLevel: 'repeatable read' },
    );
  }
}

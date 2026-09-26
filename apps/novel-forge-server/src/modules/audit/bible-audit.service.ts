import { and, desc, eq, inArray } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { selectedOpIndexes } from '@server/common';
import { APP_NAME } from '@server/constants';
import {
  type BibleAuditChecked,
  type BibleAuditFinding,
  type BibleAuditPass,
  type Job,
  type PrimaryDatabase,
  type PrimaryTransaction,
  type Project,
  type Refinement,
  schema,
} from '@server/database';

import { ContextAssembler } from '../ai/context/context-assembler.service';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { CONTRADICTION_OPS, PROMPT_REGISTRY } from '../ai/prompts';
import { type BibleAuditOutput, type BibleContradictionOutput } from '../ai/schemas';
import { type InventoryDoc, renderDocInventory, renderEntityInventory } from '../bible/bible-inventory';
import { renderManifest } from '../bible/bible-manifest';
import { JobExecutor } from '../jobs/job.executor';
import { JobService } from '../jobs/job.service';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { type ChangeOp, type OpType } from '../refinement/change-set';
import { type ArtifactState, loadArtifactStates } from '../refinement/artifact-state';
import { DISCARDABLE, ProposalService } from '../refinement/proposal.service';
import { type AuditRows, currentRecords, describeChecked, renderAuditMaterial, secretFacts } from './bible-audit-material';
import { buildAuditReport, renderReportSummary } from './bible-audit-report';

export type FindingDecision = Job.FindingDecisionKind;

export interface FindingDecisionRequest {
  decision: FindingDecision;
  reason?: string;
}

export interface AuditFindingView extends BibleAuditFinding {
  decision: { decision: FindingDecision; reason: string | null; updatedAt: Date } | null;
}

export interface BibleAuditView {
  id: bigint;
  summary: string;
  checked: BibleAuditChecked;
  findings: AuditFindingView[];
  openFindings: number;
  proposalId: bigint | null;
  proposalStatus: Refinement.ProposalStatus | null;
  /** The op indexes of the card set to apply: every op a finding the author has not skipped still proposes. */
  selection: number[];
  runId: string | null;
  createdAt: Date;
}

export interface BibleAuditRun {
  report: BibleAuditView;
  proposal: Refinement.Proposal | null;
  runId: string;
}

export interface QueuedBibleAudit {
  jobId: string;
  runId: string;
  status: Job.Status;
}

interface AuditPayload {
  changeSet: ChangeOp[];
  failures: Partial<Record<BibleAuditPass, string>>;
}

type ReportRow = Job.ValidationReport & { decisions: Job.FindingDecision[] };
type PassResult<T> = { ok: true; output: T } | { ok: false; error: string };

const AUDIT_GRAPH = 'bible-audit';
const AUDIT_TARGET = 'bible';
const HISTORY_LIMIT = 50;
const COVERAGE_OPS: readonly OpType[] = ['bible_document.upsert', 'bible_document.remove', 'entity.upsert', 'entity.remove'];
const STAGED_OPS: readonly OpType[] = [...new Set([...COVERAGE_OPS, ...CONTRADICTION_OPS])];
const SETTLED_CARD: ReadonlySet<Refinement.ProposalStatus> = new Set(['applied', 'reverted', 'conflicted']);
const RESTAGEABLE_CARD: ReadonlySet<Refinement.ProposalStatus> = new Set(['discarded', 'superseded']);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Audits the Story Bible in two passes — coverage against the manifest, and contradictions between pages, records, facts and finalized
 * chapter summaries — and keeps each run as a report whose findings the author keeps or skips. Every proposed change waits on a card.
 */
@Injectable()
export class BibleAuditService {
  private readonly logger = Logger.getLogger(APP_NAME, BibleAuditService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly workflowRunService: WorkflowRunService,
    private readonly modelRouter: ModelRouterService,
    private readonly contextAssembler: ContextAssembler,
    private readonly pluginPolicy: PluginPolicyService,
    private readonly proposalService: ProposalService,
    private readonly jobService: JobService,
    private readonly jobExecutor: JobExecutor,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  onModuleInit(): void {
    this.jobExecutor.registerHandler('audit', job => this.runJob(job));
  }

  async start(projectId: bigint): Promise<QueuedBibleAudit> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { id: true } });
    if (!project) throw AppErrorCode.PRJ_001.create();
    const jobId = await this.jobService.enqueue(projectId, 'audit', AUDIT_TARGET, {});
    const runId = await this.workflowRunService.createRun(projectId, AUDIT_GRAPH, AUDIT_TARGET, {}, jobId);
    this.jobExecutor.dispatch(jobId).catch(err => this.logger.error('audit job dispatch failed', { err, jobId }));
    const status = (await this.jobService.get(jobId))?.status ?? 'pending';
    return { jobId, runId, status };
  }

  async run(projectId: bigint, jobId?: string): Promise<BibleAuditRun> {
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    const { rows, states } = await this.loadRows(projectId);
    this.logger.info('bible audit: starting', {
      projectId,
      documents: rows.documents.length,
      entities: rows.entities.length,
      facts: rows.facts.length,
      chapters: rows.chapters.length,
    });

    const { runId, result } = await this.workflowRunService.runChain(
      projectId,
      AUDIT_GRAPH,
      AUDIT_TARGET,
      {},
      async runId => {
        const signal = this.modelRouter.bindRunSignal(runId);
        const material = renderAuditMaterial(rows);
        const [coverage, contradictions] = await Promise.all([
          this.pass('coverage', projectId, () => this.coverage(projectId, project, rows, runId)),
          this.pass('contradictions', projectId, () => this.contradictions(projectId, project, material.rendered, runId)),
        ]);
        if (!coverage.ok && !contradictions.ok) throw AppErrorCode.AUD_004.create();

        const passes: Record<BibleAuditPass, 'ran' | 'failed'> = { coverage: coverage.ok ? 'ran' : 'failed', contradictions: contradictions.ok ? 'ran' : 'failed' };
        const existingRefs = new Set([...rows.documents.map(doc => `doc:${doc.section}/${doc.slug}`), ...rows.entities.map(entity => `entity:${entity.entityKey}`)]);
        const built = buildAuditReport({
          coverage: coverage.ok ? coverage.output : null,
          contradictions: contradictions.ok ? contradictions.output : null,
          sources: material.sources,
          existingRefs,
          current: currentRecords(rows),
          secrets: secretFacts(rows.facts),
        });
        const checked = describeChecked(passes, rows, material);
        const summary = renderReportSummary(built.findings, checked.copy);
        const payload: AuditPayload = {
          changeSet: built.changeSet,
          failures: { ...(coverage.ok ? {} : { coverage: coverage.error }), ...(contradictions.ok ? {} : { contradictions: contradictions.error }) },
        };

        return this.db.transaction(async tx => {
          if (signal.aborted) throw AppErrorCode.AI_013.create();
          // Coverage ops passed the rule that new canon pages bring their records when the model wrote them; contradiction ops only correct records that exist.
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
                    allowedOps: STAGED_OPS,
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
              chapter: null,
              issues: built.findings.length,
              summary,
              payload,
              findings: built.findings,
              checked,
              runId,
              proposalId: proposal?.id ?? null,
            })
            .returning();
          if (!report) throw AppError.internal('audit report insert returned no row');
          return { report: present({ ...report, decisions: [] }, proposal?.status ?? null), proposal };
        });
      },
      jobId,
    );

    this.logger.info('bible audit: report stored', { projectId, runId, reportId: result.report.id, findings: result.report.findings.length, proposalId: result.proposal?.id });
    return { ...result, runId };
  }

  async list(projectId: bigint): Promise<BibleAuditView[]> {
    const reports = await this.db.query.validationReports.findMany({
      where: and(eq(schema.validationReports.projectId, projectId), eq(schema.validationReports.scope, 'bible')),
      orderBy: [desc(schema.validationReports.createdAt), desc(schema.validationReports.id)],
      limit: HISTORY_LIMIT,
      with: { decisions: true },
    });
    const statuses = await this.proposalStatuses(reports.flatMap(report => (report.proposalId === null ? [] : [report.proposalId])));
    return reports.map(report => present(report, report.proposalId === null ? null : (statuses.get(report.proposalId) ?? null)));
  }

  async get(projectId: bigint, reportId: bigint): Promise<BibleAuditView> {
    const report = await this.findReport(this.db, projectId, reportId);
    const proposal =
      report.proposalId === null
        ? undefined
        : await this.db.query.refinementProposals.findFirst({ where: eq(schema.refinementProposals.id, report.proposalId), columns: { status: true } });
    return present(report, proposal?.status ?? null);
  }

  /**
   * Keep leaves the finding's ops on the card, restaging the card when it was discarded or superseded; Skip takes them off it, and
   * discards the card once nothing on it is kept. A card already applied, undone or conflicted is settled: the author audits again.
   */
  async decide(projectId: bigint, reportId: bigint, findingId: string, request: FindingDecisionRequest): Promise<BibleAuditView> {
    const reason = request.reason?.trim() || null;
    await this.db.transaction(async tx => {
      const [locked] = await tx.select({ id: schema.validationReports.id }).from(schema.validationReports).where(eq(schema.validationReports.id, reportId)).for('update');
      if (!locked) throw AppErrorCode.AUD_001.create();
      const report = await this.findReport(tx, projectId, reportId);
      const finding = (report.findings ?? []).find(candidate => candidate.id === findingId);
      if (!finding) throw AppErrorCode.AUD_002.create();
      const [card] = report.proposalId === null ? [] : await tx.select().from(schema.refinementProposals).where(eq(schema.refinementProposals.id, report.proposalId)).for('update');
      if (card && SETTLED_CARD.has(card.status)) throw AppErrorCode.AUD_003.create();
      if (request.decision === 'kept' && finding.opIndexes.length > 0 && !card) throw AppErrorCode.AUD_003.create();

      await tx
        .insert(schema.validationFindingDecisions)
        .values({ reportId, findingId, decision: request.decision, reason })
        .onConflictDoUpdate({
          target: [schema.validationFindingDecisions.reportId, schema.validationFindingDecisions.findingId],
          set: { decision: request.decision, reason, updatedAt: new Date() },
        });
      const decisions = await tx.query.validationFindingDecisions.findMany({ where: eq(schema.validationFindingDecisions.reportId, reportId) });
      const selection = selectedOpIndexes(report.findings ?? [], decisions);

      if (card?.status === 'pending' && selection.length === 0) await this.discardCard(tx, card.id);
      if (request.decision === 'kept' && finding.opIndexes.length > 0 && card && RESTAGEABLE_CARD.has(card.status)) await this.restageCard(tx, projectId, report.id, card);
    });
    this.logger.info('audit finding decided', { projectId, reportId, findingId, decision: request.decision });
    return this.get(projectId, reportId);
  }

  private async runJob(job: Job.Row): Promise<void> {
    if (job.attempts > 0 && (await this.alreadyAudited(job.id))) {
      this.logger.info('audit job retried after its report was stored — settling it as done', { jobId: job.id, projectId: job.projectId });
      await this.workflowRunService.settleJobRuns(job.id, 'completed');
      return;
    }
    await this.run(job.projectId, job.id);
  }

  private async alreadyAudited(jobId: string): Promise<boolean> {
    const run = await this.db.query.workflowRuns.findFirst({
      where: and(eq(schema.workflowRuns.jobId, jobId), eq(schema.workflowRuns.graph, AUDIT_GRAPH)),
      orderBy: desc(schema.workflowRuns.startedAt),
      columns: { id: true },
    });
    if (!run) return false;
    const report = await this.db.query.validationReports.findFirst({ where: eq(schema.validationReports.runId, run.id), columns: { id: true } });
    return report !== undefined;
  }

  private async pass<T>(pass: BibleAuditPass, projectId: bigint, run: () => Promise<T>): Promise<PassResult<T>> {
    try {
      return { ok: true, output: await run() };
    } catch (err) {
      if (AppError.is(err, AppErrorCode.AI_013)) throw err;
      this.logger.warn('bible audit: a pass failed — the report says it did not run', { projectId, pass, err });
      return { ok: false, error: errorMessage(err) };
    }
  }

  private async coverage(projectId: bigint, project: Project.Row, rows: AuditRows & { documents: InventoryDoc[] }, runId: string): Promise<BibleAuditOutput> {
    const prompt = PROMPT_REGISTRY['bible-audit'];
    const policy = await this.pluginPolicy.resolve(projectId, { role: 'audit' }, project);
    const pack = await this.contextAssembler.forAudit(projectId, { policy });
    await this.workflowRunService.linkContextPack(runId, pack.id);
    const ctx = { projectId, runId, node: 'bible-audit', promptKey: prompt.key, promptVersion: prompt.version, role: 'audit' };
    const vars = {
      stableContext: pack.rendered,
      docInventory: renderDocInventory(rows.documents),
      entityInventory: renderEntityInventory(rows.entities),
      manifest: renderManifest(),
    };
    return (await this.modelRouter.structured(prompt, vars, ctx, project as ProjectConfig, policy)) as BibleAuditOutput;
  }

  private async contradictions(projectId: bigint, project: Project.Row, material: string, runId: string): Promise<BibleContradictionOutput> {
    const prompt = PROMPT_REGISTRY['bible-contradiction'];
    const policy = await this.pluginPolicy.resolve(projectId, { role: 'audit' }, project);
    const ctx = { projectId, runId, node: 'bible-contradiction', promptKey: prompt.key, promptVersion: prompt.version, role: 'audit' };
    return (await this.modelRouter.structured(prompt, { material }, ctx, project as ProjectConfig, policy)) as BibleContradictionOutput;
  }

  /** The bible as the audit reads it, and the state of every record in it at that moment — the baseline its card is staged on. */
  private loadRows(projectId: bigint): Promise<{ rows: AuditRows & { documents: InventoryDoc[] }; states: Record<string, ArtifactState> }> {
    // One snapshot for the material and the baseline: an edit landing between them would enter the baseline and be overwritten by a fix written from older text.
    return this.db.transaction(
      async tx => {
        const documents = await tx.query.bibleDocuments.findMany({
          where: eq(schema.bibleDocuments.projectId, projectId),
          orderBy: [schema.bibleDocuments.section, schema.bibleDocuments.slug],
          columns: { section: true, slug: true, body: true, revision: true },
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
        const chapters = await tx.query.chapters.findMany({
          where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done')),
          orderBy: schema.chapters.number,
          columns: { number: true, title: true, summary: true, isolated: true },
        });
        const refs = [
          ...documents.map(doc => `doc:${doc.section}/${doc.slug}`),
          ...entities.map(entity => `entity:${entity.entityKey}`),
          ...facts.map(fact => `fact:${fact.factKey}`),
        ];
        const states = await loadArtifactStates(tx, projectId, refs);
        const standard = chapters.filter(chapter => !chapter.isolated).map(({ number, title, summary }) => ({ number, title, summary }));
        const isolatedChapters = chapters.filter(chapter => chapter.isolated).map(chapter => chapter.number);
        return { rows: { documents, entities, facts, chapters: standard, isolatedChapters }, states };
      },
      { isolationLevel: 'repeatable read' },
    );
  }

  private async findReport(db: PrimaryDatabase | PrimaryTransaction, projectId: bigint, reportId: bigint): Promise<ReportRow> {
    const report = await db.query.validationReports.findFirst({
      where: and(eq(schema.validationReports.id, reportId), eq(schema.validationReports.projectId, projectId), eq(schema.validationReports.scope, 'bible')),
      with: { decisions: true },
    });
    if (!report) throw AppErrorCode.AUD_001.create();
    return report;
  }

  private async proposalStatuses(ids: bigint[]): Promise<Map<bigint, Refinement.ProposalStatus>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.query.refinementProposals.findMany({ where: inArray(schema.refinementProposals.id, ids), columns: { id: true, status: true } });
    return new Map(rows.map(row => [row.id, row.status]));
  }

  private async discardCard(tx: PrimaryTransaction, proposalId: bigint): Promise<void> {
    const discarded = await tx
      .update(schema.refinementProposals)
      .set({ status: 'discarded', updatedAt: new Date() })
      .where(and(eq(schema.refinementProposals.id, proposalId), inArray(schema.refinementProposals.status, DISCARDABLE)))
      .returning({ id: schema.refinementProposals.id });
    if (discarded.length === 0) throw AppErrorCode.RFN_002.create();
  }

  /**
   * Keeping a finding is the author asking for its change again, so a discarded or superseded card is staged anew — through the same
   * checks and warnings as any card, but on the baseline the audit read, so an apply still refuses what changed since.
   */
  private async restageCard(tx: PrimaryTransaction, projectId: bigint, reportId: bigint, card: Refinement.Proposal): Promise<void> {
    const restaged = await this.proposalService.create(
      projectId,
      {
        scopeType: card.scopeType,
        scopeRef: card.scopeRef,
        kind: 'bible_audit',
        summary: card.summary,
        changeSet: card.changeSet as ChangeOp[],
        allowedOps: STAGED_OPS,
        entityMaterialization: false,
        runId: card.runId,
        baseline: card.baseline as Record<string, ArtifactState>,
      },
      tx,
    );
    await tx.update(schema.validationReports).set({ proposalId: restaged.id }).where(eq(schema.validationReports.id, reportId));
  }
}

function present(report: ReportRow, proposalStatus: Refinement.ProposalStatus | null): BibleAuditView {
  const findings = report.findings ?? [];
  const decisionByFinding = new Map(report.decisions.map(decision => [decision.findingId, decision]));
  const views = findings.map(finding => {
    const decision = decisionByFinding.get(finding.id);
    return { ...finding, decision: decision ? { decision: decision.decision, reason: decision.reason, updatedAt: decision.updatedAt } : null };
  });
  if (!report.checked) throw AppError.internal('a bible audit report was stored without what it checked');
  return {
    id: report.id,
    summary: report.summary ?? '',
    checked: report.checked,
    findings: views,
    openFindings: views.filter(view => view.decision === null).length,
    proposalId: report.proposalId,
    proposalStatus,
    selection: selectedOpIndexes(findings, report.decisions),
    runId: report.runId,
    createdAt: report.createdAt,
  };
}

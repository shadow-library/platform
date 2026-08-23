import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type ReforgeTransform, schema } from '@server/database';

import { ContextAssembler } from '../ai/context/context-assembler.service';
import { truncateAtParagraph } from '../ai/context/token-budget';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { PROMPT_REGISTRY } from '../ai/prompts';
import { type ReforgeAnalyzeWindowOutput, type ReforgeArcSchema, type ReforgeFindingSchema, type ReforgeSynthesizeOutput } from '../ai/schemas/reforge-transform.schema';
import { renderAnalysisReport } from './analysis-report';
import { type AnalysisSignals, computeAnalysisSignals, renderSignalDigest, type SignalChapter } from './analysis-signals';
import { ReforgeService } from './reforge.service';

export interface AnalyzeProgress {
  phase: 'signals' | 'analyzing' | 'synthesizing';
  done: number;
  total: number;
  current: string;
}

export interface AnalyzeOptions {
  jobId?: string;
  onProgress?: (progress: AnalyzeProgress) => Promise<void>;
}

export interface AnalysisResult {
  analysisId: bigint;
  chaptersAnalyzed: number;
  windowsFailed: number;
  findings: number;
}

export interface AnalysisStatusResult {
  /** `metrics` is absent rather than null until the run lands, so the response stays a plain object. */
  analysis: Omit<ReforgeTransform.Analysis, 'metrics'> & { metrics?: ReforgeTransform.AnalysisMetrics };
  findingCounts: Record<string, number>;
}

export interface FindingFilter {
  type?: ReforgeTransform.FindingType;
  minSeverity?: number;
  page?: number;
  limit?: number;
}

const DEFAULT_WINDOW = 15;
// Above this many cards a single synthesis call would carry a >120k-token haystack, which degrades
// exactly the comparative judgment the pass exists to make (transform design §3.3).
const ROLLUP_THRESHOLD = 600;
const ROLLUP_SIZE = 100;
// A pathological unsplit chapter must not blow a whole window's budget; the recombine pass is what
// properly fixes those, and the analysis still needs to see the rest of the window.
const CHAPTER_TOKEN_CAP = 4_000;
// A plan drawn from a holed report is worse than no plan.
const MAX_FAILED_WINDOW_RATIO = 0.1;
const NO_RENAME_BIBLE = 'No rename bible has been seeded for this project yet — refer to characters and places by the names the source uses.';

@Injectable()
export class ReforgeAnalysisService {
  private readonly logger = Logger.getLogger(APP_NAME, ReforgeAnalysisService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly reforgeService: ReforgeService,
    private readonly contextAssembler: ContextAssembler,
    private readonly modelRouter: ModelRouterService,
    private readonly workflowRunService: WorkflowRunService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async getLatest(projectId: bigint): Promise<ReforgeTransform.Analysis> {
    const analysis = await this.db.query.reforgeAnalyses.findFirst({
      where: eq(schema.reforgeAnalyses.projectId, projectId),
      orderBy: [desc(schema.reforgeAnalyses.createdAt), desc(schema.reforgeAnalyses.id)],
    });
    if (!analysis) throw AppErrorCode.REF_004.create();
    return analysis;
  }

  async status(projectId: bigint): Promise<AnalysisStatusResult> {
    const analysis = await this.getLatest(projectId);
    const rows = await this.db
      .select({ type: schema.reforgeFindings.type, count: sql<number>`count(*)::int` })
      .from(schema.reforgeFindings)
      .where(eq(schema.reforgeFindings.analysisId, analysis.id))
      .groupBy(schema.reforgeFindings.type);
    return { analysis: { ...analysis, metrics: analysis.metrics ?? undefined }, findingCounts: Object.fromEntries(rows.map(r => [r.type, r.count])) };
  }

  async report(projectId: bigint): Promise<string> {
    const analysis = await this.getLatest(projectId);
    return analysis.report ?? '';
  }

  async listFindings(projectId: bigint, filter: FindingFilter = {}): Promise<{ items: ReforgeTransform.Finding[]; total: number }> {
    const analysis = await this.getLatest(projectId);
    const conditions = [eq(schema.reforgeFindings.analysisId, analysis.id)];
    if (filter.type) conditions.push(eq(schema.reforgeFindings.type, filter.type));
    if (filter.minSeverity) conditions.push(sql`${schema.reforgeFindings.severity} >= ${filter.minSeverity}`);
    const where = and(...conditions);

    const limit = filter.limit ?? 50;
    const page = filter.page ?? 1;
    const [items, [total]] = await Promise.all([
      this.db.query.reforgeFindings.findMany({
        where,
        orderBy: [desc(schema.reforgeFindings.severity), asc(schema.reforgeFindings.fromChapter)],
        limit,
        offset: (page - 1) * limit,
      }),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.reforgeFindings)
        .where(where),
    ]);
    return { items, total: total?.count ?? 0 };
  }

  /**
   * The analysis stage of transform design §3: deterministic signals, then a serial chain of windowed
   * model passes carrying state forward, then synthesis. A failed window is flagged and the chain
   * continues on the previous window's carry state — but the stage throws if too many failed, because
   * the plan drawn from the report is the thing that decides what the novel becomes.
   */
  async analyze(projectId: bigint, options: AnalyzeOptions = {}): Promise<AnalysisResult> {
    const reforge = await this.reforgeService.getOrCreate(projectId);
    const [project, rebrand, glossary, chapters] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.db.query.rebrands.findFirst({ where: eq(schema.rebrands.projectId, projectId) }),
      this.db.query.rebrandGlossary.findMany({ where: eq(schema.rebrandGlossary.projectId, projectId) }),
      this.db.query.chapters.findMany({ where: eq(schema.chapters.projectId, projectId), orderBy: [asc(schema.chapters.number)] }),
    ]);
    if (chapters.length === 0) throw AppError.internal(`project ${projectId} has no chapters — provide chapters before running the source analysis`);

    const windowSize = reforge.settings?.analysisWindow ?? DEFAULT_WINDOW;
    const signalChapters: SignalChapter[] = chapters.map(c => ({ chapter: c.number, title: c.title, body: c.content ?? '', wordCount: c.wordCount }));

    await options.onProgress?.({ phase: 'signals', done: 0, total: chapters.length, current: 'signals' });
    const signals = computeAnalysisSignals(signalChapters, { glossary });
    this.logger.info('reforge analysis: signals computed', { projectId, chapters: chapters.length, candidates: signals.candidates.length });

    const [analysis] = await this.db
      .insert(schema.reforgeAnalyses)
      .values({ projectId, status: 'analyzing', windowSize, signals: signals as never })
      .returning();
    if (!analysis) throw AppError.internal(`failed to open a reforge analysis for project ${projectId}`);

    const worldNotes = rebrand?.worldNotes ?? NO_RENAME_BIBLE;
    const windows = chunk(chapters, windowSize);
    const runIds: string[] = [];
    const modelFindings: ReforgeFindingSchema[] = [];
    let carry: string | null = null;
    let windowsFailed = 0;

    for (const [index, windowChapters] of windows.entries()) {
      const first = windowChapters[0] as (typeof chapters)[number];
      const last = windowChapters[windowChapters.length - 1] as (typeof chapters)[number];
      const label = `${first.number}-${last.number}`;
      await options.onProgress?.({ phase: 'analyzing', done: index, total: windows.length, current: label });

      try {
        const output = await this.runWindow(projectId, project as ProjectConfig, analysis.id, {
          window: index + 1,
          label,
          worldNotes,
          signalDigest: renderSignalDigest(signals, first.number, last.number),
          carryState: carry,
          chapters: windowChapters.map(c => renderChapterForAnalysis(c.number, c.title, c.content ?? '')).join('\n\n---\n\n'),
          jobId: options.jobId,
          runIds,
        });
        carry = renderCarryState(output.carryState);
        modelFindings.push(...output.findings);
      } catch (err) {
        windowsFailed++;
        this.logger.error('reforge analysis: window failed', { projectId, analysisId: analysis.id, window: index + 1, label, err });
        await this.db.insert(schema.reforgeFindings).values({
          analysisId: analysis.id,
          type: 'window_failed',
          fromChapter: first.number,
          toChapter: last.number,
          severity: 3,
          confidence: 1,
          detectedBy: 'signal',
          label: `analysis window ${label} failed`,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (windowsFailed > windows.length * MAX_FAILED_WINDOW_RATIO) {
      await this.db
        .update(schema.reforgeAnalyses)
        .set({ status: 'failed', windowsFailed, lastError: `${windowsFailed} of ${windows.length} analysis windows failed`, updatedAt: new Date() })
        .where(eq(schema.reforgeAnalyses.id, analysis.id));
      throw AppError.internal(`reforge analysis aborted: ${windowsFailed} of ${windows.length} windows failed`);
    }

    await options.onProgress?.({ phase: 'synthesizing', done: windows.length, total: windows.length, current: 'synthesis' });
    await this.db.update(schema.reforgeAnalyses).set({ status: 'synthesizing', windowsFailed, updatedAt: new Date() }).where(eq(schema.reforgeAnalyses.id, analysis.id));

    const cards = await this.db.query.reforgeChapterCards.findMany({
      where: eq(schema.reforgeChapterCards.analysisId, analysis.id),
      orderBy: [asc(schema.reforgeChapterCards.chapter)],
    });
    const synthesis = await this.synthesize(projectId, project as ProjectConfig, {
      analysisId: analysis.id,
      worldNotes,
      signals,
      cards,
      jobId: options.jobId,
      runIds,
    });

    const findingCount = await this.persistFindings(analysis.id, signals, [...modelFindings, ...synthesis.findings]);
    const metrics = buildMetrics(signals, cards, synthesis.arcs.length);
    const report = renderAnalysisReport({
      chapterCount: chapters.length,
      windowCount: windows.length,
      windowsFailed,
      metrics,
      summary: synthesis.summary,
      pacingProfile: synthesis.pacingProfile ?? null,
      arcs: synthesis.arcs,
      findings: await this.db.query.reforgeFindings.findMany({ where: eq(schema.reforgeFindings.analysisId, analysis.id) }),
    });

    await this.db
      .update(schema.reforgeAnalyses)
      .set({ status: 'done', chaptersAnalyzed: cards.length, windowsFailed, metrics, report, runIds, updatedAt: new Date() })
      .where(eq(schema.reforgeAnalyses.id, analysis.id));

    this.logger.info('reforge analysis complete', { projectId, analysisId: analysis.id, chapters: cards.length, windowsFailed, findings: findingCount });
    return { analysisId: analysis.id, chaptersAnalyzed: cards.length, windowsFailed, findings: findingCount };
  }

  private async runWindow(
    projectId: bigint,
    project: ProjectConfig,
    analysisId: bigint,
    input: { window: number; label: string; worldNotes: string; signalDigest: string; carryState: string | null; chapters: string; jobId?: string; runIds: string[] },
  ): Promise<ReforgeAnalyzeWindowOutput> {
    const prompt = PROMPT_REGISTRY['reforge-analyze-window'];
    const pack = await this.contextAssembler.forReforgeAnalysis(projectId, input.window, {
      worldNotes: input.worldNotes,
      glossarySlice: null,
      signalDigest: input.signalDigest,
      carryState: input.carryState,
    });

    const { runId, result } = await this.workflowRunService.runChain(projectId, 'reforge-analyze-window', `window-${input.window}`, { jobId: input.jobId }, async runId => {
      if (pack.id) await this.workflowRunService.linkContextPack(runId, pack.id);
      const ctx = { projectId, runId, node: 'analyzeWindow', promptKey: prompt.key, promptVersion: prompt.version, role: 'extraction' };
      const vars = { stableContext: pack.renderedStable, volatileContext: pack.renderedVolatile, windowLabel: input.label, chapters: input.chapters };
      const output = (await this.modelRouter.structured(prompt, vars, ctx, project)) as ReforgeAnalyzeWindowOutput;

      await this.db
        .insert(schema.reforgeChapterCards)
        .values(
          output.cards.map(card => ({
            analysisId,
            chapter: card.chapter,
            card: card as never,
            movement: card.movement,
            threadsOpened: card.threadsOpened ?? null,
            threadsClosed: card.threadsClosed ?? null,
          })),
        )
        .onConflictDoNothing();
      return output;
    });

    input.runIds.push(runId);
    return result;
  }

  private async synthesize(
    projectId: bigint,
    project: ProjectConfig,
    input: { analysisId: bigint; worldNotes: string; signals: AnalysisSignals; cards: ReforgeTransform.ChapterCard[]; jobId?: string; runIds: string[] },
  ): Promise<ReforgeSynthesizeOutput> {
    if (input.cards.length <= ROLLUP_THRESHOLD) {
      const scope = `the whole novel, chapters ${input.cards[0]?.chapter ?? 1}-${input.cards[input.cards.length - 1]?.chapter ?? 1}`;
      return this.runSynthesis(projectId, project, input, scope, input.cards.map(renderCard).join('\n'), 'global');
    }

    const rollups: ReforgeSynthesizeOutput[] = [];
    for (const [index, slice] of chunk(input.cards, ROLLUP_SIZE).entries()) {
      const scope = `chapters ${slice[0]?.chapter}-${slice[slice.length - 1]?.chapter} of ${input.cards.length}`;
      rollups.push(await this.runSynthesis(projectId, project, input, scope, slice.map(renderCard).join('\n'), `rollup-${index + 1}`));
    }
    return this.runSynthesis(projectId, project, input, `the whole novel, rolled up from ${rollups.length} slices`, rollups.map(renderRollup).join('\n\n'), 'global');
  }

  private async runSynthesis(
    projectId: bigint,
    project: ProjectConfig,
    input: { worldNotes: string; signals: AnalysisSignals; jobId?: string; runIds: string[] },
    scope: string,
    cardIndex: string,
    target: string,
  ): Promise<ReforgeSynthesizeOutput> {
    const prompt = PROMPT_REGISTRY['reforge-synthesize'];
    const pack = await this.contextAssembler.forReforgeAnalysis(projectId, null, {
      worldNotes: input.worldNotes,
      glossarySlice: null,
      signalDigest: renderSignalDigest(input.signals),
      carryState: null,
    });

    const { runId, result } = await this.workflowRunService.runChain(projectId, 'reforge-synthesize', target, { jobId: input.jobId }, async runId => {
      if (pack.id) await this.workflowRunService.linkContextPack(runId, pack.id);
      const ctx = { projectId, runId, node: 'synthesize', promptKey: prompt.key, promptVersion: prompt.version, role: 'extraction' };
      const vars = { stableContext: pack.renderedStable, volatileContext: pack.renderedVolatile, scope, cardIndex };
      return (await this.modelRouter.structured(prompt, vars, ctx, project)) as ReforgeSynthesizeOutput;
    });

    input.runIds.push(runId);
    return result;
  }

  /**
   * Model findings land first so a signal they cite is recorded as `both`; every signal the model never
   * confirmed still lands, at the confidence its detector assigned, because a dead subplot the analysis
   * discards becomes a kept span nobody questions.
   */
  private async persistFindings(analysisId: bigint, signals: AnalysisSignals, findings: ReforgeFindingSchema[]): Promise<number> {
    const confirmed = new Set(findings.map(f => f.signalRef).filter((ref): ref is string => !!ref));
    const rows = findings.map(f => ({
      analysisId,
      type: f.type,
      fromChapter: f.fromChapter,
      toChapter: f.toChapter,
      severity: f.severity,
      confidence: f.confidence,
      detectedBy: (f.signalRef ? 'both' : 'model') as ReforgeTransform.FindingSource,
      label: f.label,
      detail: f.detail ?? null,
      evidence: f.signalRef ? ({ signalRef: f.signalRef } as never) : null,
    }));

    for (const candidate of signals.candidates) {
      if (confirmed.has(candidate.id)) continue;
      rows.push({
        analysisId,
        type: candidate.type,
        fromChapter: candidate.fromChapter,
        toChapter: candidate.toChapter,
        severity: candidate.severity,
        confidence: candidate.confidence,
        detectedBy: 'signal',
        label: candidate.label,
        detail: candidate.detail,
        evidence: { signalRef: candidate.id, ...candidate.evidence } as never,
      });
    }

    if (rows.length > 0) await this.db.insert(schema.reforgeFindings).values(rows);
    return rows.length;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function renderChapterForAnalysis(number: number, title: string | null, content: string): string {
  return `### Chapter ${number}${title ? ` — ${title}` : ''}\n${truncateAtParagraph(content, CHAPTER_TOKEN_CAP).text}`;
}

function renderCarryState(carry: ReforgeAnalyzeWindowOutput['carryState']): string {
  const lines = [carry.storySoFar];
  if (carry.openThreads && carry.openThreads.length > 0) lines.push(`Open threads: ${carry.openThreads.join('; ')}`);
  if (carry.arcRegister) lines.push(`Arc: ${carry.arcRegister}`);
  return lines.join('\n');
}

function renderCard(row: ReforgeTransform.ChapterCard): string {
  const card = row.card;
  const parts = [`${row.chapter} [${row.movement}] ${card.summary}`];
  if (card.pov) parts.push(`pov ${card.pov}`);
  if (card.cast?.length) parts.push(`cast ${card.cast.join(', ')}`);
  if (card.threadsOpened?.length) parts.push(`opens ${card.threadsOpened.join(', ')}`);
  if (card.threadsClosed?.length) parts.push(`closes ${card.threadsClosed.join(', ')}`);
  return parts.join(' | ');
}

function renderRollup(rollup: ReforgeSynthesizeOutput): string {
  const arcs = rollup.arcs.map((arc: ReforgeArcSchema) => `- ${arc.label} (ch. ${arc.fromChapter}-${arc.toChapter})`).join('\n');
  const findings = rollup.findings.map(f => `- ${f.type} ch. ${f.fromChapter}-${f.toChapter}: ${f.label}`).join('\n');
  return [rollup.summary, arcs, findings].filter(Boolean).join('\n');
}

function buildMetrics(signals: AnalysisSignals, cards: ReforgeTransform.ChapterCard[], arcCount: number): ReforgeTransform.AnalysisMetrics {
  // `stallRatio` is the model's reading, not the deterministic `staticRatio`: a chapter can introduce
  // names and still not move the story, which is the case the signal cannot see.
  const stalled = cards.filter(card => card.movement === 'stalls').length;
  return {
    repetitionRatio: signals.metrics.repetitionRatio,
    stallRatio: cards.length > 0 ? Number((stalled / cards.length).toFixed(4)) : signals.metrics.staticRatio,
    medianWords: signals.metrics.medianWords,
    arcCount,
    deadThreadCount: signals.metrics.deadThreadCount,
  };
}

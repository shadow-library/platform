import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph';
import { and, asc, desc, eq, lt, ne, sql } from 'drizzle-orm';
import { AppError, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Rebrand, type Reforge, type ReforgeTransform } from '@server/database';
import * as schema from '@server/database/schemas';

// Direct file imports of DI-free pure functions — never a feature barrel, whose services import the AI module.
import { type GlossaryLike, renderGlossarySlice, type ResidueIssue, scanResidue, selectGlossarySlice } from '../../rebrand/residue-scan';
import { renderCutLedger, type ResurfacedCut, scanResurfacedCuts, selectCutSlice, slugifyCutKey } from '../../reforge/cut-ledger';
import { locateOutputChapter } from '../../reforge/plan-validation';
import { type ContextAssembler } from '../context/context-assembler.service';
import { type ModelRouterService, type ProjectConfig } from '../model-router.service';
import { PROMPT_REGISTRY } from '../prompts';
import { type ReforgeTransformJudgeOutput, type ReforgeTransformWriteOutput } from '../schemas';
import { type TelemetryContext } from '../telemetry.handler';

export interface SpanTransformServices {
  db: PrimaryDatabase;
  contextAssembler: ContextAssembler;
  modelRouter: ModelRouterService;
  checkpointer: BaseCheckpointSaver;
}

export interface TransformContractIssue {
  source: 'contract';
  type: string;
  detail: string;
  excerpt?: string;
}

type TransformIssue = ResidueIssue | ResurfacedCut | TransformContractIssue;

const SpanTransformAnnotation = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, n) => n, default: () => '0' }),
  planId: Annotation<string>({ reducer: (_, n) => n, default: () => '0' }),
  outputChapter: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  runId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  span: Annotation<ReforgeTransform.PlanSpan | null>({ reducer: (_, n) => n, default: () => null }),
  indexInSpan: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  sourceProse: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  worldNotes: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  directives: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  instructions: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  settings: Annotation<Reforge.Settings>({ reducer: (_, n) => n, default: () => ({}) }),
  bannedExtra: Annotation<string[]>({ reducer: (_, n) => n, default: () => [] }),
  glossary: Annotation<GlossaryLike[]>({ reducer: (_, n) => n, default: () => [] }),
  glossarySlice: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  cuts: Annotation<ReforgeTransform.Cut[]>({ reducer: (_, n) => n, default: () => [] }),
  approvedAt: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  cutLedgerText: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  carryState: Annotation<Record<string, unknown> | null>({ reducer: (_, n) => n, default: () => null }),
  prevBody: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  stableContext: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  volatileContext: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  written: Annotation<ReforgeTransformWriteOutput | null>({ reducer: (_, n) => n, default: () => null }),
  fidelity: Annotation<ReforgeTransformJudgeOutput | null>({ reducer: (_, n) => n, default: () => null }),
  residueIssues: Annotation<ResidueIssue[]>({ reducer: (_, n) => n, default: () => [] }),
  cutIssues: Annotation<ResurfacedCut[]>({ reducer: (_, n) => n, default: () => [] }),
  judgeIssues: Annotation<TransformContractIssue[]>({ reducer: (_, n) => n, default: () => [] }),
  attempt: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  repairNotes: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  outcome: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  nodeTrace: Annotation<string[]>({ reducer: (a, n) => [...a, ...n], default: () => [] }),
});

type SpanTransformState = typeof SpanTransformAnnotation.State;

const logger = Logger.getLogger(APP_NAME, 'span-transform.graph');

/**
 * Clean → persist; dirty on the first attempt → one repair pass through write; still dirty → persist as
 * attention. Named distinctly from both chapter-generation's `routeAfterJudge` and chapter-reforge's
 * `routeAfterFidelityJudge`, which share a barrel with it.
 */
export function routeAfterTransformJudge(state: Pick<SpanTransformState, 'residueIssues' | 'cutIssues' | 'judgeIssues' | 'attempt'>): 'persist' | 'repair' {
  const dirty = state.residueIssues.length + state.cutIssues.length + state.judgeIssues.length > 0;
  if (!dirty) return 'persist';
  return state.attempt === 0 ? 'repair' : 'persist';
}

function renderIssues(issues: TransformIssue[]): string {
  return issues.map((issue, i) => `${i + 1}. [${issue.type}] ${issue.detail}${issue.excerpt ? ` — near: "${issue.excerpt}"` : ''}`).join('\n');
}

/** The plan's contract for this chapter, as the writer and the judge both read it. */
function renderPlanSpan(span: ReforgeTransform.PlanSpan, outputChapter: number, indexInSpan: number): string {
  const beats = (span.keptBeats ?? []).map(beat => `- ${beat}`).join('\n');
  const lines = [
    `This is output chapter ${outputChapter}: chapter ${indexInSpan + 1} of the ${span.targetChapters} this span produces, written from source chapters ${span.fromChapter}-${span.toChapter} (${span.action}).`,
  ];
  if (span.arcLabel) lines.push(`Arc: ${span.arcLabel}`);
  if (span.rationale) lines.push(`Why this span is shaped this way: ${span.rationale}`);
  lines.push(`KEPT BEATS — the contract this chapter owes the reader:\n${beats || '- (none listed)'}`);
  if (span.continuityNotes) lines.push(`Continuity across this span's seam: ${span.continuityNotes}`);
  return lines.join('\n');
}

function wordCount(body: string): number {
  return body.trim().split(/\s+/).filter(Boolean).length;
}

export function createSpanTransformGraph(services: SpanTransformServices): ReturnType<typeof buildSpanTransformGraph> {
  return buildSpanTransformGraph(services);
}

function buildSpanTransformGraph(services: SpanTransformServices) {
  const { db, contextAssembler, modelRouter, checkpointer } = services;

  /**
   * Resolves which span this output chapter belongs to from the plan itself, so a single-output re-run
   * can never drift from the approved structure (transform design §5).
   */
  async function loadSpan(state: SpanTransformState) {
    const projectId = BigInt(state.projectId);
    const planId = BigInt(state.planId);
    const [plan, spans, reforge, rebrand, glossaryRows, cutRows, previous] = await Promise.all([
      db.query.reforgePlans.findFirst({ where: eq(schema.reforgePlans.id, planId) }),
      db.query.reforgePlanSpans.findMany({ where: eq(schema.reforgePlanSpans.planId, planId), orderBy: [asc(schema.reforgePlanSpans.ordinal)] }),
      db.query.reforges.findFirst({ where: eq(schema.reforges.projectId, projectId) }),
      db.query.rebrands.findFirst({ where: eq(schema.rebrands.projectId, projectId) }),
      db.query.rebrandGlossary.findMany({ where: eq(schema.rebrandGlossary.projectId, projectId) }),
      db.query.reforgeCuts.findMany({ where: eq(schema.reforgeCuts.planId, planId) }),
      // Continuity comes from the previous OUTPUT chapter — the source tail would leak pre-rename names
      // and pre-cut material by definition (design §6.2).
      db.query.reforgeOutputs.findFirst({
        where: and(eq(schema.reforgeOutputs.planId, planId), lt(schema.reforgeOutputs.outputChapter, state.outputChapter), ne(schema.reforgeOutputs.status, 'failed')),
        orderBy: [desc(schema.reforgeOutputs.outputChapter)],
      }),
    ]);

    if (!plan) throw AppError.internal(`[loadSpan] Plan ${state.planId} not found`);
    if (plan.status !== 'approved') throw AppError.internal(`[loadSpan] Plan ${state.planId} is ${plan.status}, not approved — no write may run against it`);
    if (!rebrand?.worldNotes) throw AppError.internal(`[loadSpan] Rename bible is not seeded for project ${state.projectId}`);

    const location = locateOutputChapter(spans, state.outputChapter);
    if (!location) throw AppError.internal(`[loadSpan] Output chapter ${state.outputChapter} is outside plan ${state.planId}`);
    const { span: located, indexInSpan } = location;

    const sourceChapters = await db.query.chapters.findMany({
      where: and(eq(schema.chapters.projectId, projectId), sql`${schema.chapters.number} between ${located.fromChapter} and ${located.toChapter}`),
      orderBy: [asc(schema.chapters.number)],
    });

    logger.debug('span transform loadSpan', {
      runId: state.runId,
      outputChapter: state.outputChapter,
      spanOrdinal: located.ordinal,
      indexInSpan,
      sourceChapters: sourceChapters.length,
      cuts: cutRows.length,
    });

    return {
      span: located,
      indexInSpan,
      sourceProse: sourceChapters.map(c => `### Chapter ${c.number}${c.title ? ` — ${c.title}` : ''}\n${c.content ?? ''}`).join('\n\n---\n\n'),
      worldNotes: rebrand.worldNotes,
      directives: rebrand.directives,
      instructions: reforge?.instructions ?? null,
      settings: (reforge?.settings ?? {}) as Reforge.Settings,
      bannedExtra: ((rebrand.settings as Rebrand.Settings | null)?.bannedExtra ?? []) as string[],
      glossary: glossaryRows.map(g => ({ sourceName: g.sourceName, variants: g.variants as string[] | null, replacement: g.replacement, category: g.category, notes: g.notes })),
      cuts: cutRows,
      approvedAt: plan.approvedAt ? plan.approvedAt.toISOString() : null,
      carryState: (previous?.carryState as Record<string, unknown> | null) ?? null,
      prevBody: previous?.body || null,
      nodeTrace: ['loadSpan'],
    };
  }

  async function transformContext(state: SpanTransformState) {
    const projectId = BigInt(state.projectId);
    const span = state.span as ReforgeTransform.PlanSpan;
    const glossarySlice = renderGlossarySlice(selectGlossarySlice(state.sourceProse, state.glossary));

    // The ledger seeded at approval is the stable half; anything appended during the run is volatile,
    // so a growing ledger never invalidates the cache prefix (design §6.1).
    const approvedAt = state.approvedAt ? new Date(state.approvedAt) : null;
    const isSeeded = (cut: ReforgeTransform.Cut): boolean => !approvedAt || cut.createdAt <= approvedAt;
    const options = { sourceText: state.sourceProse, outputChapter: state.outputChapter };
    const stableSlice = selectCutSlice(state.cuts.filter(isSeeded), options);
    const discovered = selectCutSlice(
      state.cuts.filter(cut => !isSeeded(cut)),
      options,
    );

    const pack = await contextAssembler.forReforgeTransform(projectId, state.outputChapter, {
      worldNotes: state.worldNotes,
      directives: state.directives,
      instructions: state.instructions,
      targetWords: state.settings.targetWords ?? null,
      cutLedger: renderCutLedger(stableSlice),
      discoveredCuts: discovered.length > 0 ? renderCutLedger(discovered) : null,
      planSpan: renderPlanSpan(span, state.outputChapter, state.indexInSpan),
      bridge: span.bridgeDirective,
      glossarySlice,
      carryState: state.carryState ? JSON.stringify(state.carryState) : null,
      prevBody: state.prevBody,
    });
    if (pack.id) await db.update(schema.workflowRuns).set({ contextPackId: pack.id }).where(eq(schema.workflowRuns.id, state.runId));

    logger.debug('span transform context', { runId: state.runId, outputChapter: state.outputChapter, ledgerEntries: stableSlice.length, packLength: pack.rendered.length });
    return {
      glossarySlice,
      cutLedgerText: renderCutLedger([...stableSlice, ...discovered]),
      stableContext: pack.renderedStable,
      volatileContext: pack.renderedVolatile,
      nodeTrace: ['transformContext'],
    };
  }

  async function write(state: SpanTransformState) {
    const projectId = BigInt(state.projectId);
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const prompt = PROMPT_REGISTRY['reforge-transform-write'];

    const ctx: TelemetryContext = {
      projectId,
      runId: state.runId,
      node: state.attempt === 0 ? 'write' : 'repair',
      promptKey: prompt.key,
      promptVersion: prompt.version,
      role: 'reforge',
    };
    const result = (await modelRouter.structured(
      prompt,
      { stableContext: state.stableContext, volatileContext: state.volatileContext, sourceProse: state.sourceProse, repairNotes: state.repairNotes || 'none' },
      ctx,
      projectRow as ProjectConfig | undefined,
    )) as ReforgeTransformWriteOutput;

    logger.debug('span transform write', {
      runId: state.runId,
      outputChapter: state.outputChapter,
      attempt: state.attempt,
      bodyLength: result.body.length,
      cutDelta: result.cutDelta?.length ?? 0,
    });
    return { written: result, nodeTrace: ['write'] };
  }

  function residueScan(state: SpanTransformState) {
    if (!state.written) return { residueIssues: [], nodeTrace: ['residueScan'] };
    const combined = [...state.glossary, ...(state.written.discoveredNames ?? [])];
    const residueIssues = scanResidue(state.written.body, combined, state.bannedExtra);
    if (residueIssues.length > 0) logger.debug('span transform residueScan found issues', { runId: state.runId, outputChapter: state.outputChapter, issues: residueIssues });
    return { residueIssues, nodeTrace: ['residueScan'] };
  }

  function cutScan(state: SpanTransformState) {
    if (!state.written) return { cutIssues: [], nodeTrace: ['cutScan'] };
    const cutIssues = scanResurfacedCuts(state.written.body, state.cuts, state.outputChapter);
    if (cutIssues.length > 0) logger.debug('span transform cutScan found resurfaced cuts', { runId: state.runId, outputChapter: state.outputChapter, issues: cutIssues });
    return { cutIssues, nodeTrace: ['cutScan'] };
  }

  async function judge(state: SpanTransformState) {
    if (!state.written || state.settings.judgeEnabled === false) return { judgeIssues: [], fidelity: null, nodeTrace: ['judge'] };

    const projectId = BigInt(state.projectId);
    const span = state.span as ReforgeTransform.PlanSpan;
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const prompt = PROMPT_REGISTRY['reforge-transform-judge'];

    const ctx: TelemetryContext = { projectId, runId: state.runId, node: 'judge', promptKey: prompt.key, promptVersion: prompt.version, role: 'judge' };
    const result = (await modelRouter.structured(
      prompt,
      {
        keptBeats: (span.keptBeats ?? []).map(beat => `- ${beat}`).join('\n') || '(none)',
        continuityNotes: span.continuityNotes ?? 'none',
        bridge: span.bridgeDirective ?? 'none',
        cutLedger: state.cutLedgerText,
        worldNotes: state.worldNotes,
        glossarySlice: state.glossarySlice,
        scanHits: state.cutIssues.length > 0 ? renderIssues(state.cutIssues) : 'none',
        writtenProse: state.written.body,
      },
      ctx,
      projectRow as ProjectConfig | undefined,
    )) as ReforgeTransformJudgeOutput;

    // The pre-scan already reports its own hits; taking the judge's copy too would double every repair note.
    const judgeIssues: TransformContractIssue[] =
      result.verdict === 'issues'
        ? result.issues.filter(i => i.type !== 'resurfaced_cut').map(i => ({ source: 'contract' as const, type: i.type, detail: i.detail, excerpt: i.excerpt }))
        : [];
    logger.debug('span transform judge', {
      runId: state.runId,
      outputChapter: state.outputChapter,
      verdict: result.verdict,
      coveredBeats: result.coveredBeats,
      totalBeats: result.totalBeats,
      judgeIssues: judgeIssues.length,
    });
    return { judgeIssues, fidelity: result, nodeTrace: ['judge'] };
  }

  function prepareRepair(state: SpanTransformState) {
    const issues: TransformIssue[] = [...state.residueIssues, ...state.cutIssues, ...state.judgeIssues];
    logger.debug('span transform repair pass', { outputChapter: state.outputChapter, issues: issues.length });
    return { attempt: state.attempt + 1, repairNotes: renderIssues(issues), nodeTrace: ['prepareRepair'] };
  }

  async function persistOutput(state: SpanTransformState) {
    if (!state.written) throw AppError.internal('[persistOutput] No written output to persist');
    const span = state.span as ReforgeTransform.PlanSpan;
    const written = state.written;
    const issues: TransformIssue[] = [...state.residueIssues, ...state.cutIssues, ...state.judgeIssues];
    const status: ReforgeTransform.OutputStatus = issues.length > 0 ? 'attention' : 'written';

    const values = {
      projectId: BigInt(state.projectId),
      planId: BigInt(state.planId),
      outputChapter: state.outputChapter,
      spanOrdinal: span.ordinal,
      spanKey: span.spanKey,
      fromChapter: span.fromChapter,
      toChapter: span.toChapter,
      indexInSpan: state.indexInSpan,
      title: written.title,
      body: written.body,
      summary: written.summary ?? null,
      planBeats: (span.keptBeats as never) ?? null,
      changes: (written.changes as never) ?? null,
      fidelity: (state.fidelity as never) ?? null,
      carryState: ((written.carryState ?? state.carryState) as never) ?? null,
      cutDelta: (written.cutDelta as never) ?? null,
      status,
      issues: issues.length > 0 ? (issues as never) : null,
      wordCount: wordCount(written.body),
      runId: state.runId,
    };
    await db
      .insert(schema.reforgeOutputs)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.reforgeOutputs.planId, schema.reforgeOutputs.outputChapter],
        set: {
          spanOrdinal: sql`EXCLUDED.span_ordinal`,
          spanKey: sql`EXCLUDED.span_key`,
          fromChapter: sql`EXCLUDED.from_chapter`,
          toChapter: sql`EXCLUDED.to_chapter`,
          indexInSpan: sql`EXCLUDED.index_in_span`,
          title: sql`EXCLUDED.title`,
          body: sql`EXCLUDED.body`,
          summary: sql`EXCLUDED.summary`,
          planBeats: sql`EXCLUDED.plan_beats`,
          changes: sql`EXCLUDED.changes`,
          fidelity: sql`EXCLUDED.fidelity`,
          carryState: sql`EXCLUDED.carry_state`,
          cutDelta: sql`EXCLUDED.cut_delta`,
          status: sql`EXCLUDED.status`,
          issues: sql`EXCLUDED.issues`,
          wordCount: sql`EXCLUDED.word_count`,
          runId: sql`EXCLUDED.run_id`,
          revision: sql`${schema.reforgeOutputs.revision} + 1`,
          updatedAt: new Date(),
        },
      });

    logger.debug('span transform persistOutput', { runId: state.runId, outputChapter: state.outputChapter, status, issues: issues.length });
    return { outcome: status, nodeTrace: ['persistOutput'] };
  }

  async function mergeGlossary(state: SpanTransformState) {
    const discovered = state.written?.discoveredNames ?? [];
    if (discovered.length === 0) return { nodeTrace: ['mergeGlossary'] };

    await db
      .insert(schema.rebrandGlossary)
      .values(
        discovered.map(m => ({
          projectId: BigInt(state.projectId),
          sourceName: m.sourceName,
          variants: m.variants ?? null,
          replacement: m.replacement,
          category: m.category,
          notes: m.notes ?? null,
          createdChapter: (state.span as ReforgeTransform.PlanSpan).fromChapter,
        })),
      )
      .onConflictDoNothing()
      .catch(err => logger.warn('glossary merge error (non-fatal)', { err, outputChapter: state.outputChapter }));

    return { nodeTrace: ['mergeGlossary'] };
  }

  // Append-only, insert-conflict-keeps-existing: what this chapter discovered it had to cut binds on
  // every later chapter, and is never re-described (design §6.1).
  async function appendCuts(state: SpanTransformState) {
    const deltas = state.written?.cutDelta ?? [];
    if (deltas.length === 0) return { nodeTrace: ['appendCuts'] };
    const span = state.span as ReforgeTransform.PlanSpan;

    await db
      .insert(schema.reforgeCuts)
      .values(
        deltas.map(delta => ({
          planId: BigInt(state.planId),
          cutKey: slugifyCutKey(delta.label),
          kind: delta.kind ?? ('thread' as const),
          label: delta.label,
          aliases: delta.aliases ?? [delta.label],
          detail: delta.detail ?? null,
          disposition: delta.disposition ?? ('cut' as const),
          replacementNote: delta.replacementNote ?? null,
          originSpanOrdinal: span.ordinal,
          firstSourceChapter: span.fromChapter,
          lastSourceChapter: span.toChapter,
          // The chapter that made the cut may describe it; the ban starts with the next one.
          effectiveFromOutput: state.outputChapter + 1,
        })),
      )
      .onConflictDoNothing()
      .catch(err => logger.warn('cut ledger append error (non-fatal)', { err, outputChapter: state.outputChapter }));

    return { nodeTrace: ['appendCuts'] };
  }

  function finish(state: SpanTransformState) {
    return { outcome: state.outcome ?? 'written', nodeTrace: ['finish'] };
  }

  return new StateGraph(SpanTransformAnnotation)
    .addNode('loadSpan', loadSpan)
    .addNode('transformContext', transformContext)
    .addNode('write', write)
    .addNode('residueScan', residueScan)
    .addNode('cutScan', cutScan)
    .addNode('judge', judge)
    .addNode('prepareRepair', prepareRepair)
    .addNode('persistOutput', persistOutput)
    .addNode('mergeGlossary', mergeGlossary)
    .addNode('appendCuts', appendCuts)
    .addNode('finish', finish)
    .addEdge(START, 'loadSpan')
    .addEdge('loadSpan', 'transformContext')
    .addEdge('transformContext', 'write')
    .addEdge('write', 'residueScan')
    .addEdge('residueScan', 'cutScan')
    .addEdge('cutScan', 'judge')
    .addConditionalEdges('judge', routeAfterTransformJudge, { persist: 'persistOutput', repair: 'prepareRepair' })
    .addEdge('prepareRepair', 'write')
    .addEdge('persistOutput', 'mergeGlossary')
    .addEdge('mergeGlossary', 'appendCuts')
    .addEdge('appendCuts', 'finish')
    .addEdge('finish', END)
    .compile({ checkpointer });
}

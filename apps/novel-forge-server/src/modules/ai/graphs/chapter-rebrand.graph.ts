import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph';
import { and, desc, eq, lt, ne, sql } from 'drizzle-orm';
import { AppError, Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Rebrand } from '@server/database';
import * as schema from '@server/database/schemas';

import { type GlossaryLike, renderGlossarySlice, type ResidueIssue, scanResidue, selectGlossarySlice } from '../../rebrand/residue-scan';
import { type ContextAssembler } from '../context/context-assembler.service';
import { type ModelRouterService, type ProjectConfig } from '../model-router.service';
import { PROMPT_REGISTRY } from '../prompts';
import { type RebrandAuditOutput, type RebrandConvertOutput } from '../schemas';
import { type TelemetryContext } from '../telemetry.handler';

// Direct file import of DI-free pure functions — never the rebrand barrel, whose service imports this module.

export interface RebrandGraphServices {
  db: PrimaryDatabase;
  contextAssembler: ContextAssembler;
  modelRouter: ModelRouterService;
  checkpointer: BaseCheckpointSaver;
}

export interface RebrandAuditIssueRecord {
  source: 'audit';
  type: string;
  detail: string;
  excerpt?: string;
}

type ConversionIssue = ResidueIssue | RebrandAuditIssueRecord;

const ChapterRebrandAnnotation = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, n) => n, default: () => '0' }),
  chapter: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  runId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  chapterProse: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  chapterTitle: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  worldNotes: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  directives: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  settings: Annotation<Rebrand.Settings>({ reducer: (_, n) => n, default: () => ({}) }),
  glossary: Annotation<GlossaryLike[]>({ reducer: (_, n) => n, default: () => [] }),
  glossarySlice: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  carryState: Annotation<Record<string, unknown> | null>({ reducer: (_, n) => n, default: () => null }),
  prevBody: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  stableContext: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  volatileContext: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  converted: Annotation<RebrandConvertOutput | null>({ reducer: (_, n) => n, default: () => null }),
  residueIssues: Annotation<ResidueIssue[]>({ reducer: (_, n) => n, default: () => [] }),
  auditIssues: Annotation<RebrandAuditIssueRecord[]>({ reducer: (_, n) => n, default: () => [] }),
  attempt: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  repairNotes: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  outcome: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  nodeTrace: Annotation<string[]>({ reducer: (a, n) => [...a, ...n], default: () => [] }),
});

type RebrandState = typeof ChapterRebrandAnnotation.State;

const logger = Logger.getLogger(APP_NAME, 'chapter-rebrand.graph');

/** Clean → persist; dirty within the repair budget (`settings.maxRepairs`, default 1) → repair; still dirty → persist as attention. */
export function routeAfterAudit(state: Pick<RebrandState, 'residueIssues' | 'auditIssues' | 'attempt' | 'settings'>): 'persist' | 'repair' {
  const dirty = state.residueIssues.length + state.auditIssues.length > 0;
  if (!dirty) return 'persist';
  const maxRepairs = state.settings.maxRepairs ?? 1;
  return state.attempt < maxRepairs ? 'repair' : 'persist';
}

function renderIssues(issues: ConversionIssue[]): string {
  return issues.map((issue, i) => `${i + 1}. [${issue.type}] ${issue.detail}${issue.excerpt ? ` — near: "${issue.excerpt}"` : ''}`).join('\n');
}

export function createChapterRebrandGraph(services: RebrandGraphServices): ReturnType<typeof buildChapterRebrandGraph> {
  return buildChapterRebrandGraph(services);
}

function buildChapterRebrandGraph(services: RebrandGraphServices) {
  const { db, contextAssembler, modelRouter, checkpointer } = services;

  async function loadChapter(state: RebrandState) {
    const projectId = BigInt(state.projectId);
    const [chapter, rebrand, glossaryRows, previous] = await Promise.all([
      db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, state.chapter)) }),
      db.query.rebrands.findFirst({ where: eq(schema.rebrands.projectId, projectId) }),
      db.query.rebrandGlossary.findMany({ where: eq(schema.rebrandGlossary.projectId, projectId) }),
      // Carry state and the previous ending come from the previous CONVERTED body — the source tail
      // would leak pre-rebrand names and break inserted-thread continuity (design §5).
      db.query.chapterConversions.findFirst({
        where: and(eq(schema.chapterConversions.projectId, projectId), lt(schema.chapterConversions.chapter, state.chapter), ne(schema.chapterConversions.status, 'failed')),
        orderBy: [desc(schema.chapterConversions.chapter)],
      }),
    ]);

    if (!chapter) throw AppError.internal(`[loadChapter] Chapter ${state.chapter} not found for project ${state.projectId}`);
    if (!rebrand?.worldNotes) throw AppError.internal(`[loadChapter] Rebrand glossary is not seeded for project ${state.projectId}`);

    logger.debug('rebrand loadChapter', {
      runId: state.runId,
      chapter: state.chapter,
      proseLength: (chapter.content ?? '').length,
      glossarySize: glossaryRows.length,
      hasCarryState: !!previous?.carryState,
      hasPrevBody: !!previous?.body,
    });
    return {
      chapterProse: chapter.content ?? '',
      chapterTitle: chapter.title ?? '',
      worldNotes: rebrand.worldNotes,
      directives: rebrand.directives,
      settings: (rebrand.settings ?? {}) as Rebrand.Settings,
      glossary: glossaryRows.map(g => ({ sourceName: g.sourceName, variants: g.variants as string[] | null, replacement: g.replacement, category: g.category, notes: g.notes })),
      carryState: (previous?.carryState as Record<string, unknown> | null) ?? null,
      prevBody: previous?.body || null,
      nodeTrace: ['loadChapter'],
    };
  }

  async function assembleContext(state: RebrandState) {
    const projectId = BigInt(state.projectId);
    const glossarySlice = renderGlossarySlice(selectGlossarySlice(state.chapterProse, state.glossary));

    const pack = await contextAssembler.forRebrand(projectId, state.chapter, {
      worldNotes: state.worldNotes,
      directives: state.directives,
      glossarySlice,
      carryState: state.carryState ? JSON.stringify(state.carryState) : null,
      prevBody: state.prevBody,
    });
    if (pack.id) await db.update(schema.workflowRuns).set({ contextPackId: pack.id }).where(eq(schema.workflowRuns.id, state.runId));

    logger.debug('rebrand assembleContext', { runId: state.runId, chapter: state.chapter, glossarySliceLength: glossarySlice.length, contextPackLength: pack.rendered.length });
    return { stableContext: pack.renderedStable, volatileContext: pack.renderedVolatile, glossarySlice, nodeTrace: ['assembleContext'] };
  }

  async function convert(state: RebrandState) {
    const projectId = BigInt(state.projectId);
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const prompt = PROMPT_REGISTRY['rebrand-convert'];

    const ctx: TelemetryContext = {
      projectId,
      runId: state.runId,
      node: state.attempt === 0 ? 'convert' : 'repair',
      promptKey: prompt.key,
      promptVersion: prompt.version,
      role: 'rebrand',
    };
    const result = (await modelRouter.structured(
      prompt,
      { stableContext: state.stableContext, volatileContext: state.volatileContext, chapterProse: state.chapterProse, repairNotes: state.repairNotes || 'none' },
      ctx,
      projectRow as ProjectConfig | undefined,
    )) as RebrandConvertOutput;

    logger.debug('rebrand convert', {
      runId: state.runId,
      chapter: state.chapter,
      attempt: state.attempt,
      bodyLength: result.body.length,
      discoveredNames: result.discoveredNames?.length ?? 0,
      fixes: result.fixes?.length ?? 0,
      addedScenes: result.addedScenes?.length ?? 0,
    });
    return { converted: result, nodeTrace: ['convert'] };
  }

  function residueScan(state: RebrandState) {
    if (!state.converted) return { residueIssues: [], nodeTrace: ['residueScan'] };
    const combined = [...state.glossary, ...(state.converted.discoveredNames ?? [])];
    const residueIssues = scanResidue(state.converted.body, combined, state.settings.bannedExtra ?? [], state.settings.termPacks);
    if (residueIssues.length > 0) logger.debug('rebrand residueScan found issues', { runId: state.runId, chapter: state.chapter, issues: residueIssues });
    return { residueIssues, nodeTrace: ['residueScan'] };
  }

  async function audit(state: RebrandState) {
    if (!state.converted || state.settings.auditEnabled === false) return { auditIssues: [], nodeTrace: ['audit'] };

    const projectId = BigInt(state.projectId);
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const prompt = PROMPT_REGISTRY['rebrand-audit'];

    const ctx: TelemetryContext = { projectId, runId: state.runId, node: 'audit', promptKey: prompt.key, promptVersion: prompt.version, role: 'audit' };
    const result = (await modelRouter.structured(
      prompt,
      { worldNotes: state.worldNotes, glossarySlice: state.glossarySlice, convertedProse: state.converted.body },
      ctx,
      projectRow as ProjectConfig | undefined,
    )) as RebrandAuditOutput;

    const auditIssues: RebrandAuditIssueRecord[] =
      result.verdict === 'issues' ? result.issues.map(i => ({ source: 'audit' as const, type: i.type, detail: i.detail, excerpt: i.excerpt })) : [];
    logger.debug('rebrand audit', { runId: state.runId, chapter: state.chapter, verdict: result.verdict, auditIssues: auditIssues.length });
    return { auditIssues, nodeTrace: ['audit'] };
  }

  function prepareRepair(state: RebrandState) {
    const issues: ConversionIssue[] = [...state.residueIssues, ...state.auditIssues];
    logger.debug('rebrand repair pass', { chapter: state.chapter, issues: issues.length });
    return { attempt: state.attempt + 1, repairNotes: renderIssues(issues), nodeTrace: ['prepareRepair'] };
  }

  async function persistConversion(state: RebrandState) {
    if (!state.converted) throw AppError.internal('[persistConversion] No converted output to persist');
    const projectId = BigInt(state.projectId);
    const converted = state.converted;
    const issues: ConversionIssue[] = [...state.residueIssues, ...state.auditIssues];
    const status: Rebrand.ConversionStatus = issues.length > 0 ? 'attention' : 'converted';
    logger.debug('rebrand persistConversion', { runId: state.runId, chapter: state.chapter, status, issues: issues.length, attempt: state.attempt });

    const values = {
      projectId,
      chapter: state.chapter,
      title: converted.title,
      body: converted.body,
      summaryOfChanges: converted.summaryOfChanges ?? null,
      fixes: (converted.fixes as never) ?? null,
      addedScenes: (converted.addedScenes as never) ?? null,
      // A directive thread must keep flowing even when a chapter adds nothing to it.
      carryState: ((converted.carryState ?? state.carryState) as never) ?? null,
      status,
      issues: issues.length > 0 ? (issues as never) : null,
      glossaryCount: state.glossary.length + (converted.discoveredNames?.length ?? 0),
      runId: state.runId,
    };
    await db
      .insert(schema.chapterConversions)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.chapterConversions.projectId, schema.chapterConversions.chapter],
        set: {
          title: sql`EXCLUDED.title`,
          body: sql`EXCLUDED.body`,
          summaryOfChanges: sql`EXCLUDED.summary_of_changes`,
          fixes: sql`EXCLUDED.fixes`,
          addedScenes: sql`EXCLUDED.added_scenes`,
          carryState: sql`EXCLUDED.carry_state`,
          status: sql`EXCLUDED.status`,
          issues: sql`EXCLUDED.issues`,
          glossaryCount: sql`EXCLUDED.glossary_count`,
          runId: sql`EXCLUDED.run_id`,
          revision: sql`${schema.chapterConversions.revision} + 1`,
          updatedAt: new Date(),
        },
      });

    return { outcome: status, nodeTrace: ['persistConversion'] };
  }

  // Runs even for attention rows — later chapters need the discovered names either way. Conflicts
  // keep the existing mapping: a name is never re-mapped once made (design §2).
  async function mergeGlossary(state: RebrandState) {
    const discovered = state.converted?.discoveredNames ?? [];
    if (discovered.length === 0) return { nodeTrace: ['mergeGlossary'] };
    const projectId = BigInt(state.projectId);

    await db
      .insert(schema.rebrandGlossary)
      .values(
        discovered.map(m => ({
          projectId,
          sourceName: m.sourceName,
          variants: m.variants ?? null,
          replacement: m.replacement,
          category: m.category,
          notes: m.notes ?? null,
          createdChapter: state.chapter,
        })),
      )
      .onConflictDoNothing()
      .catch(err => logger.warn('glossary merge error (non-fatal)', { err, chapter: state.chapter }));

    return { nodeTrace: ['mergeGlossary'] };
  }

  function finish(state: RebrandState) {
    return { outcome: state.outcome ?? 'converted', nodeTrace: ['finish'] };
  }

  return new StateGraph(ChapterRebrandAnnotation)
    .addNode('loadChapter', loadChapter)
    .addNode('assembleContext', assembleContext)
    .addNode('convert', convert)
    .addNode('residueScan', residueScan)
    .addNode('audit', audit)
    .addNode('prepareRepair', prepareRepair)
    .addNode('persistConversion', persistConversion)
    .addNode('mergeGlossary', mergeGlossary)
    .addNode('finish', finish)
    .addEdge(START, 'loadChapter')
    .addEdge('loadChapter', 'assembleContext')
    .addEdge('assembleContext', 'convert')
    .addEdge('convert', 'residueScan')
    .addEdge('residueScan', 'audit')
    .addConditionalEdges('audit', routeAfterAudit, { persist: 'persistConversion', repair: 'prepareRepair' })
    .addEdge('prepareRepair', 'convert')
    .addEdge('persistConversion', 'mergeGlossary')
    .addEdge('mergeGlossary', 'finish')
    .addEdge('finish', END)
    .compile({ checkpointer });
}

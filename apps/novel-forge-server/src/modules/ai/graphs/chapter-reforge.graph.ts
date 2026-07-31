/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph';
import { and, desc, eq, lt, ne, sql } from 'drizzle-orm';
import { AppError, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Reforge } from '@server/database';
import * as schema from '@server/database/schemas';

import { type GlossaryLike, renderGlossarySlice, type ResidueIssue, scanResidue, selectGlossarySlice } from '../../rebrand/residue-scan';
import { type ContextAssembler } from '../context/context-assembler.service';
import { type ModelRouterService, type ProjectConfig } from '../model-router.service';
import { PROMPT_REGISTRY } from '../prompts';
import { type ReforgeJudgeOutput, type ReforgeOutlineOutput, type ReforgeWriteOutput } from '../schemas';
import { type TelemetryContext } from '../telemetry.handler';

// Direct file import of DI-free pure functions — never the rebrand barrel, whose service imports the AI module.

/**
 * Defining types
 */

export interface ReforgeGraphServices {
  db: PrimaryDatabase;
  contextAssembler: ContextAssembler;
  modelRouter: ModelRouterService;
  checkpointer: BaseCheckpointSaver;
}

export interface ReforgeFidelityIssueRecord {
  source: 'fidelity';
  type: string;
  detail: string;
  excerpt?: string;
}

type ReforgeIssue = ResidueIssue | ReforgeFidelityIssueRecord;

const ChapterReforgeAnnotation = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, n) => n, default: () => '0' }),
  chapter: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  runId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  chapterProse: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  worldNotes: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  directives: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  instructions: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  settings: Annotation<Reforge.Settings>({ reducer: (_, n) => n, default: () => ({}) }),
  glossary: Annotation<GlossaryLike[]>({ reducer: (_, n) => n, default: () => [] }),
  glossarySlice: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  carryState: Annotation<Record<string, unknown> | null>({ reducer: (_, n) => n, default: () => null }),
  prevBody: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  outlinePack: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  writePack: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  outline: Annotation<ReforgeOutlineOutput | null>({ reducer: (_, n) => n, default: () => null }),
  renderedOutline: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  written: Annotation<ReforgeWriteOutput | null>({ reducer: (_, n) => n, default: () => null }),
  fidelity: Annotation<ReforgeJudgeOutput | null>({ reducer: (_, n) => n, default: () => null }),
  residueIssues: Annotation<ResidueIssue[]>({ reducer: (_, n) => n, default: () => [] }),
  judgeIssues: Annotation<ReforgeFidelityIssueRecord[]>({ reducer: (_, n) => n, default: () => [] }),
  attempt: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  repairNotes: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  outcome: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
});

type ReforgeState = typeof ChapterReforgeAnnotation.State;

/**
 * Declaring the constants
 */

const logger = Logger.getLogger(APP_NAME, 'chapter-reforge.graph');

/**
 * Clean → persist; dirty on the first attempt → one repair pass through write; still dirty → persist
 * as attention. Named `Fidelity` to stay distinct from chapter-generation's `routeAfterJudge` in the
 * shared graphs barrel.
 */
export function routeAfterFidelityJudge(state: Pick<ReforgeState, 'residueIssues' | 'judgeIssues' | 'attempt'>): 'persist' | 'repair' {
  const dirty = state.residueIssues.length + state.judgeIssues.length > 0;
  if (!dirty) return 'persist';
  return state.attempt === 0 ? 'repair' : 'persist';
}

function renderIssues(issues: ReforgeIssue[]): string {
  return issues.map((issue, i) => `${i + 1}. [${issue.type}] ${issue.detail}${issue.excerpt ? ` — near: "${issue.excerpt}"` : ''}`).join('\n');
}

/** Renders the outline as readable text for the write and judge prompts — the fidelity contract in prose form. */
function renderOutline(outline: ReforgeOutlineOutput): string {
  const beats = outline.beats
    .map((b, i) => {
      const lines = [`${i + 1}. ${b.summary}`, `   Purpose: ${b.purpose}`];
      if (b.entities?.length) lines.push(`   Entities: ${b.entities.join(', ')}`);
      if (b.emotionalTurn) lines.push(`   Emotional turn: ${b.emotionalTurn}`);
      if (b.dialogueAnchors?.length) lines.push(`   Dialogue anchors:\n${b.dialogueAnchors.map(d => `     - ${d}`).join('\n')}`);
      return lines.join('\n');
    })
    .join('\n\n');
  return `Title: ${outline.title}\nThroughline: ${outline.throughline}\n\nBeats:\n${beats}`;
}

function wordCount(body: string): number {
  return body.trim().split(/\s+/).filter(Boolean).length;
}

export function createChapterReforgeGraph(services: ReforgeGraphServices): ReturnType<typeof buildChapterReforgeGraph> {
  return buildChapterReforgeGraph(services);
}

function buildChapterReforgeGraph(services: ReforgeGraphServices) {
  const { db, contextAssembler, modelRouter, checkpointer } = services;

  // ─── loadChapter ──────────────────────────────────────────────────────────────
  async function loadChapter(state: ReforgeState) {
    const projectId = BigInt(state.projectId);
    const [chapter, reforge, rebrand, glossaryRows, previous] = await Promise.all([
      db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, state.chapter)) }),
      db.query.reforges.findFirst({ where: eq(schema.reforges.projectId, projectId) }),
      db.query.rebrands.findFirst({ where: eq(schema.rebrands.projectId, projectId) }),
      db.query.rebrandGlossary.findMany({ where: eq(schema.rebrandGlossary.projectId, projectId) }),
      // Carry state and the previous ending come from the previous REFORGED body — the source tail
      // would leak pre-rename names and break re-authored continuity (design §5).
      db.query.chapterReforges.findFirst({
        where: and(eq(schema.chapterReforges.projectId, projectId), lt(schema.chapterReforges.chapter, state.chapter), ne(schema.chapterReforges.status, 'failed')),
        orderBy: [desc(schema.chapterReforges.chapter)],
      }),
    ]);

    if (!chapter) throw AppError.internal(`[loadChapter] Chapter ${state.chapter} not found for project ${state.projectId}`);
    // The rename bible is shared with rebrand; reforge phase 2 seeds it before any chapter runs.
    if (!rebrand?.worldNotes) throw AppError.internal(`[loadChapter] Rename bible is not seeded for project ${state.projectId}`);

    logger.debug('reforge loadChapter', {
      runId: state.runId,
      chapter: state.chapter,
      proseLength: (chapter.content ?? '').length,
      glossarySize: glossaryRows.length,
      hasInstructions: !!reforge?.instructions,
      hasCarryState: !!previous?.carryState,
      hasPrevBody: !!previous?.body,
    });
    return {
      chapterProse: chapter.content ?? '',
      worldNotes: rebrand.worldNotes,
      directives: rebrand.directives,
      instructions: reforge?.instructions ?? null,
      settings: (reforge?.settings ?? {}) as Reforge.Settings,
      glossary: glossaryRows.map(g => ({ sourceName: g.sourceName, variants: g.variants as string[] | null, replacement: g.replacement, category: g.category, notes: g.notes })),
      carryState: (previous?.carryState as Record<string, unknown> | null) ?? null,
      prevBody: previous?.body || null,
    };
  }

  // ─── outlineContext ────────────────────────────────────────────────────────────
  async function outlineContext(state: ReforgeState) {
    const projectId = BigInt(state.projectId);
    const glossarySlice = renderGlossarySlice(selectGlossarySlice(state.chapterProse, state.glossary));
    const pack = await contextAssembler.forReforgeOutline(projectId, state.chapter, { worldNotes: state.worldNotes, glossarySlice });
    if (pack.id) await db.update(schema.workflowRuns).set({ contextPackId: pack.id }).where(eq(schema.workflowRuns.id, state.runId));

    logger.debug('reforge outlineContext', { runId: state.runId, chapter: state.chapter, glossarySliceLength: glossarySlice.length, packLength: pack.rendered.length });
    return { outlinePack: pack.rendered, glossarySlice };
  }

  // ─── outline ────────────────────────────────────────────────────────────────────
  async function outline(state: ReforgeState) {
    const projectId = BigInt(state.projectId);
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const prompt = PROMPT_REGISTRY['reforge-outline'];

    const ctx: TelemetryContext = { projectId, runId: state.runId, node: 'outline', promptKey: prompt.key, promptVersion: prompt.version, role: 'reforge' };
    const result = (await modelRouter.structured(
      prompt,
      { contextPack: state.outlinePack, chapterProse: state.chapterProse },
      ctx,
      projectRow as ProjectConfig | undefined,
    )) as ReforgeOutlineOutput;

    logger.debug('reforge outline', { runId: state.runId, chapter: state.chapter, beats: result.beats.length });
    return { outline: result, renderedOutline: renderOutline(result) };
  }

  // ─── writeContext ────────────────────────────────────────────────────────────────
  async function writeContext(state: ReforgeState) {
    const projectId = BigInt(state.projectId);
    const pack = await contextAssembler.forReforge(projectId, state.chapter, {
      worldNotes: state.worldNotes,
      directives: state.directives,
      instructions: state.instructions,
      glossarySlice: state.glossarySlice,
      carryState: state.carryState ? JSON.stringify(state.carryState) : null,
      prevBody: state.prevBody,
    });
    if (pack.id) await db.update(schema.workflowRuns).set({ contextPackId: pack.id }).where(eq(schema.workflowRuns.id, state.runId));

    logger.debug('reforge writeContext', { runId: state.runId, chapter: state.chapter, packLength: pack.rendered.length });
    return { writePack: pack.rendered };
  }

  // ─── write (also the repair pass) ────────────────────────────────────────────────
  async function write(state: ReforgeState) {
    const projectId = BigInt(state.projectId);
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const prompt = PROMPT_REGISTRY['reforge-write'];

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
      { contextPack: state.writePack, outline: state.renderedOutline, repairNotes: state.repairNotes || 'none' },
      ctx,
      projectRow as ProjectConfig | undefined,
    )) as ReforgeWriteOutput;

    logger.debug('reforge write', {
      runId: state.runId,
      chapter: state.chapter,
      attempt: state.attempt,
      bodyLength: result.body.length,
      discoveredNames: result.discoveredNames?.length ?? 0,
      removals: result.changes?.removals?.length ?? 0,
    });
    return { written: result };
  }

  // ─── residueScan (deterministic, free — runs on every attempt) ───────────────────
  function residueScan(state: ReforgeState) {
    if (!state.written) return { residueIssues: [] };
    const combined = [...state.glossary, ...(state.written.discoveredNames ?? [])];
    // The shared BANNED_REAL_WORLD_TERMS list lives inside scanResidue; reforge adds no extra terms.
    const residueIssues = scanResidue(state.written.body, combined, []);
    if (residueIssues.length > 0) logger.debug('reforge residueScan found issues', { runId: state.runId, chapter: state.chapter, issues: residueIssues });
    return { residueIssues };
  }

  // ─── judge (fidelity — beat coverage, naming, de-nationalization; NOT prose taste) ─
  async function judge(state: ReforgeState) {
    if (!state.written || state.settings.judgeEnabled === false) return { judgeIssues: [], fidelity: null };

    const projectId = BigInt(state.projectId);
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const prompt = PROMPT_REGISTRY['reforge-judge'];

    const ctx: TelemetryContext = { projectId, runId: state.runId, node: 'judge', promptKey: prompt.key, promptVersion: prompt.version, role: 'judge' };
    const result = (await modelRouter.structured(
      prompt,
      { outline: state.renderedOutline, worldNotes: state.worldNotes, glossarySlice: state.glossarySlice, writtenProse: state.written.body },
      ctx,
      projectRow as ProjectConfig | undefined,
    )) as ReforgeJudgeOutput;

    const judgeIssues: ReforgeFidelityIssueRecord[] =
      result.verdict === 'issues' ? result.issues.map(i => ({ source: 'fidelity' as const, type: i.type, detail: i.detail, excerpt: i.excerpt })) : [];
    logger.debug('reforge judge', {
      runId: state.runId,
      chapter: state.chapter,
      verdict: result.verdict,
      coveredBeats: result.coveredBeats,
      totalBeats: result.totalBeats,
      judgeIssues: judgeIssues.length,
    });
    return { judgeIssues, fidelity: result };
  }

  // ─── prepareRepair ────────────────────────────────────────────────────────────────
  function prepareRepair(state: ReforgeState) {
    const issues: ReforgeIssue[] = [...state.residueIssues, ...state.judgeIssues];
    logger.debug('reforge repair pass', { chapter: state.chapter, issues: issues.length });
    return { attempt: state.attempt + 1, repairNotes: renderIssues(issues) };
  }

  // ─── persistReforge ────────────────────────────────────────────────────────────────
  async function persistReforge(state: ReforgeState) {
    if (!state.written) throw AppError.internal('[persistReforge] No written output to persist');
    const projectId = BigInt(state.projectId);
    const written = state.written;
    const issues: ReforgeIssue[] = [...state.residueIssues, ...state.judgeIssues];
    const status: Reforge.ChapterStatus = issues.length > 0 ? 'attention' : 'reforged';
    logger.debug('reforge persistReforge', { runId: state.runId, chapter: state.chapter, status, issues: issues.length, attempt: state.attempt });

    const values = {
      projectId,
      chapter: state.chapter,
      title: written.title,
      body: written.body,
      summary: written.summary ?? null,
      sourceBeats: (state.outline as never) ?? null,
      changes: (written.changes as never) ?? null,
      fidelity: (state.fidelity as never) ?? null,
      // A directive thread must keep flowing even when a chapter adds nothing to it.
      carryState: ((written.carryState ?? state.carryState) as never) ?? null,
      status,
      issues: issues.length > 0 ? (issues as never) : null,
      wordCount: wordCount(written.body),
      runId: state.runId,
    };
    await db
      .insert(schema.chapterReforges)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.chapterReforges.projectId, schema.chapterReforges.chapter],
        set: {
          title: sql`EXCLUDED.title`,
          body: sql`EXCLUDED.body`,
          summary: sql`EXCLUDED.summary`,
          sourceBeats: sql`EXCLUDED.source_beats`,
          changes: sql`EXCLUDED.changes`,
          fidelity: sql`EXCLUDED.fidelity`,
          carryState: sql`EXCLUDED.carry_state`,
          status: sql`EXCLUDED.status`,
          issues: sql`EXCLUDED.issues`,
          wordCount: sql`EXCLUDED.word_count`,
          runId: sql`EXCLUDED.run_id`,
          revision: sql`${schema.chapterReforges.revision} + 1`,
          updatedAt: new Date(),
        },
      });

    return { outcome: status };
  }

  // ─── mergeGlossary ───────────────────────────────────────────────────────────────
  // Runs even for attention rows — later chapters need the discovered names either way. Conflicts
  // keep the existing mapping: a name is never re-mapped once made (design §2).
  async function mergeGlossary(state: ReforgeState) {
    const discovered = state.written?.discoveredNames ?? [];
    if (discovered.length === 0) return {};
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

    return {};
  }

  function finish(state: ReforgeState) {
    return { outcome: state.outcome ?? 'reforged' };
  }

  return new StateGraph(ChapterReforgeAnnotation)
    .addNode('loadChapter', loadChapter)
    .addNode('outlineContext', outlineContext)
    .addNode('generateOutline', outline)
    .addNode('writeContext', writeContext)
    .addNode('write', write)
    .addNode('residueScan', residueScan)
    .addNode('judge', judge)
    .addNode('prepareRepair', prepareRepair)
    .addNode('persistReforge', persistReforge)
    .addNode('mergeGlossary', mergeGlossary)
    .addNode('finish', finish)
    .addEdge(START, 'loadChapter')
    .addEdge('loadChapter', 'outlineContext')
    .addEdge('outlineContext', 'generateOutline')
    .addEdge('generateOutline', 'writeContext')
    .addEdge('writeContext', 'write')
    .addEdge('write', 'residueScan')
    .addEdge('residueScan', 'judge')
    .addConditionalEdges('judge', routeAfterFidelityJudge, { persist: 'persistReforge', repair: 'prepareRepair' })
    .addEdge('prepareRepair', 'write')
    .addEdge('persistReforge', 'mergeGlossary')
    .addEdge('mergeGlossary', 'finish')
    .addEdge('finish', END)
    .compile({ checkpointer });
}

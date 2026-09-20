import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph';
import { and, desc, eq, lt, ne, sql } from 'drizzle-orm';
import { AppError, Logger } from '@shadow-library/common';
import { chapterContentHash } from '@shadow-library/sdk/publishing';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Translation } from '@server/database';
import * as schema from '@server/database/schemas';

import { type ForgeCallPolicy, type PluginPolicyService, type ScopedPolicyResolver } from '../../plugins/plugin-policy.service';
import { scanFidelity } from '../../translation/fidelity-scan';
import { renderTranslationGlossarySlice, selectTranslationGlossarySlice } from '../../translation/glossary-slice';
import { type ScriptProfile, scriptProfileFor } from '../../translation/script-profile';
import { previousTail, segmentSource, type SourceSegment } from '../../translation/segment-source';
import { sourceTerms } from '../../translation/term-matcher';
import { type TranslationTermLike } from '../../translation/translation.types';
import { type ContextAssembler } from '../context/context-assembler.service';
import { type ModelRouterService, type ProjectConfig } from '../model-router.service';
import { PROMPT_REGISTRY } from '../prompts';
import { type TranslateSegmentOutput, type TranslationAuditOutput, type TranslationTermSuggestion } from '../schemas';
import { type TelemetryContext } from '../telemetry.handler';

// Direct file imports of DI-free pure functions — never the translation barrel, whose service imports this module.

export interface TranslationGraphServices {
  db: PrimaryDatabase;
  contextAssembler: ContextAssembler;
  modelRouter: ModelRouterService;
  pluginPolicy: PluginPolicyService;
  checkpointer: BaseCheckpointSaver;
}

const DEFAULT_SEGMENT_TOKENS = 1800;
// The graph's recursion budget is a fixed constant set by the caller, so an unbounded per-project
// `maxRepairs` could abort a fully translated chapter mid-repair and lose it as a failed run.
const MAX_REPAIRS_CEILING = 3;
const PREV_CHAPTER_TAIL_CHARS = 600;
const PREV_SEGMENT_TAIL_CHARS = 600;

const ChapterTranslationAnnotation = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, n) => n, default: () => '0' }),
  chapter: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  runId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  original: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  originalTitle: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  contentHash: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  language: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  styleNotes: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  settings: Annotation<Translation.Settings>({ reducer: (_, n) => n, default: () => ({}) }),
  glossary: Annotation<TranslationTermLike[]>({ reducer: (_, n) => n, default: () => [] }),
  sliceEntries: Annotation<TranslationTermLike[]>({ reducer: (_, n) => n, default: () => [] }),
  glossarySlice: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  appliedTerms: Annotation<Record<string, number>>({ reducer: (_, n) => n, default: () => ({}) }),
  prevChapterTail: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  stableContext: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  volatileContext: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  segments: Annotation<SourceSegment[]>({ reducer: (_, n) => n, default: () => [] }),
  translatedSegments: Annotation<string[]>({ reducer: (_, n) => n, default: () => [] }),
  pending: Annotation<number[]>({ reducer: (_, n) => n, default: () => [] }),
  translatedTitle: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  discoveredTerms: Annotation<TranslationTermSuggestion[]>({ reducer: (_, n) => n, default: () => [] }),
  body: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  segmentRecords: Annotation<Translation.Segment[]>({ reducer: (_, n) => n, default: () => [] }),
  fidelityIssues: Annotation<Translation.Issue[]>({ reducer: (_, n) => n, default: () => [] }),
  auditIssues: Annotation<Translation.Issue[]>({ reducer: (_, n) => n, default: () => [] }),
  attempt: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  repairNotes: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  outcome: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  nodeTrace: Annotation<string[]>({ reducer: (a, n) => [...a, ...n], default: () => [] }),
});

type TranslationState = typeof ChapterTranslationAnnotation.State;

const logger = Logger.getLogger(APP_NAME, 'chapter-translation.graph');

/**
 * Clean → persist; dirty within the repair budget (`settings.maxRepairs`, default 1, capped at
 * `MAX_REPAIRS_CEILING`) → repair the flagged segments; still dirty → persist as attention. Named
 * `Fidelity` (not `FidelityJudge`, which chapter-reforge owns) to stay distinct in the shared barrel.
 */
export function routeAfterFidelity(state: Pick<TranslationState, 'fidelityIssues' | 'auditIssues' | 'attempt' | 'settings'>): 'persist' | 'repair' {
  const dirty = state.fidelityIssues.length + state.auditIssues.length > 0;
  if (!dirty) return 'persist';
  const maxRepairs = Math.min(state.settings.maxRepairs ?? 1, MAX_REPAIRS_CEILING);
  return state.attempt < maxRepairs ? 'repair' : 'persist';
}

/** The stable half of the translation pack: byte-identical for every chapter of a project, so the provider cache prefix holds. */
export function renderTermPolicy(settings: Translation.Settings): string {
  const honorifics =
    settings.honorifics === 'translate'
      ? 'Honorifics: render source honorifics as the English address a native reader expects, or drop them where English would carry none. Never transliterate them.'
      : 'Honorifics: keep source honorifics attached to names exactly as the original has them.';
  return [
    'Treatments:',
    '- translate — render the sense in English.',
    '- localize — replace with the closest English equivalent a native reader expects.',
    '- transliterate — spell the sound in Latin letters.',
    '- preserve — leave the original characters untouched.',
    '',
    'Approved terms are binding. Provisional terms are binding until a reviewer says otherwise: use the listed target every time and never invent a second rendering for a term the glossary already maps. Terms listed as "not terms" are ordinary words — translate them normally.',
    '',
    honorifics,
  ].join('\n');
}

/** The audit reads aligned pairs, and its `segmentIndex` is 1-based — the heading numbering it keys off. */
export function renderAuditPairs(segments: SourceSegment[], translated: string[]): string {
  return segments.map((segment, i) => `### Segment ${i + 1}\n[original]\n${segment.text}\n[translation]\n${translated[i] ?? ''}`).join('\n\n');
}

function renderIssues(issues: Translation.Issue[]): string {
  return issues
    .map((issue, i) => {
      const where = issue.segmentIndex === undefined ? '' : ` (segment ${issue.segmentIndex + 1})`;
      return `${i + 1}. [${issue.type}]${where} ${issue.detail}${issue.excerpt ? ` — near: "${issue.excerpt}"` : ''}`;
    })
    .join('\n');
}

// Issues are stored 0-based so `segmentIndex` indexes the row's own `segments` array; the prompt and its
// schema report 1-based, and an out-of-range answer degrades to a whole-chapter issue rather than a bad index.
function toSegmentIndex(reported: number | undefined, count: number): number | undefined {
  if (reported === undefined) return undefined;
  const index = reported - 1;
  return index >= 0 && index < count ? index : undefined;
}

function foldTerm(term: string, profile: ScriptProfile): string {
  return profile.wordBoundaries ? term.toLowerCase() : term;
}

// A term the reviewer has already called "not a term" must not come back as a suggestion, and must not
// reach the fidelity scan either — re-admitted as `suggested` it reads as a dropped glossary term and
// burns the repair budget on a rendering the project deliberately refused.
function rejectedSourceTerms(glossary: TranslationTermLike[], profile: ScriptProfile): Set<string> {
  return new Set(
    glossary
      .filter(entry => entry.status === 'rejected')
      .flatMap(sourceTerms)
      .map(term => foldTerm(term, profile)),
  );
}

function asTermLike(term: TranslationTermSuggestion): TranslationTermLike {
  return {
    sourceTerm: term.sourceTerm,
    variants: term.variants ?? null,
    target: term.target,
    category: term.category,
    treatment: term.treatment,
    status: 'suggested',
    meaning: term.meaning,
  };
}

export function createChapterTranslationGraph(services: TranslationGraphServices): ReturnType<typeof buildChapterTranslationGraph> {
  return buildChapterTranslationGraph(services);
}

function buildChapterTranslationGraph(services: TranslationGraphServices) {
  const { db, contextAssembler, modelRouter, pluginPolicy, checkpointer } = services;

  // One `project_plugins` read and one `projects` read for the run: the pack, every segment and the audit share them.
  let resolver: Promise<ScopedPolicyResolver> | undefined;
  async function policyFor(projectId: bigint, chapter: number): Promise<ForgeCallPolicy> {
    resolver ??= pluginPolicy.scoped(projectId);
    return (await resolver).for({ role: 'translate', chapter });
  }

  let project: Promise<typeof schema.projects.$inferSelect | undefined> | undefined;
  async function projectFor(projectId: bigint) {
    project ??= Promise.resolve(db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }));
    return project;
  }

  async function loadChapter(state: TranslationState) {
    const projectId = BigInt(state.projectId);
    const [chapter, translation, glossaryRows, previous, projectRow] = await Promise.all([
      db.query.chapters.findFirst({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, state.chapter)) }),
      db.query.translations.findFirst({ where: eq(schema.translations.projectId, projectId) }),
      db.query.translationGlossary.findMany({ where: eq(schema.translationGlossary.projectId, projectId) }),
      db.query.chapterTranslations.findFirst({
        where: and(eq(schema.chapterTranslations.projectId, projectId), lt(schema.chapterTranslations.chapter, state.chapter), ne(schema.chapterTranslations.status, 'failed')),
        orderBy: [desc(schema.chapterTranslations.chapter)],
      }),
      projectFor(projectId),
    ]);

    if (!chapter) throw AppError.internal(`[loadChapter] Chapter ${state.chapter} not found for project ${state.projectId}`);
    if (!chapter.originalContent) throw AppError.internal(`[loadChapter] Chapter ${state.chapter} has no original content for project ${state.projectId}`);
    if (!translation?.styleNotes) throw AppError.internal(`[loadChapter] Translation is not seeded for project ${state.projectId}`);

    const glossary: TranslationTermLike[] = glossaryRows.map(entry => ({
      id: String(entry.id),
      sourceTerm: entry.sourceTerm,
      variants: entry.variants,
      target: entry.target,
      category: entry.category,
      treatment: entry.treatment,
      status: entry.status,
      meaning: entry.meaning,
      revision: entry.revision,
    }));

    logger.debug('translation loadChapter', {
      runId: state.runId,
      chapter: state.chapter,
      originalLength: chapter.originalContent.length,
      glossarySize: glossary.length,
      hasPrevTranslation: !!previous?.body,
    });
    return {
      original: chapter.originalContent,
      originalTitle: chapter.originalTitle,
      contentHash: chapter.contentHash,
      language: projectRow?.originalLanguage ?? null,
      styleNotes: translation.styleNotes,
      settings: translation.settings ?? {},
      glossary,
      prevChapterTail: previous?.body ? previousTail(previous.body, PREV_CHAPTER_TAIL_CHARS) : null,
      nodeTrace: ['loadChapter'],
    };
  }

  async function assembleContext(state: TranslationState) {
    const projectId = BigInt(state.projectId);
    const profile = scriptProfileFor(state.language);
    const slice = selectTranslationGlossarySlice(state.original, state.glossary, profile);
    const glossarySlice = renderTranslationGlossarySlice(slice);

    const policy = await policyFor(projectId, state.chapter);
    const pack = await contextAssembler.forTranslate(
      projectId,
      state.chapter,
      { styleNotes: state.styleNotes, termPolicy: renderTermPolicy(state.settings), glossarySlice, prevTranslatedTail: state.prevChapterTail },
      { policy },
    );
    if (pack.id) await db.update(schema.workflowRuns).set({ contextPackId: pack.id }).where(eq(schema.workflowRuns.id, state.runId));

    logger.debug('translation assembleContext', {
      runId: state.runId,
      chapter: state.chapter,
      sliceEntries: slice.entries.length,
      rejectedInSlice: slice.rejected.length,
      contextPackLength: pack.rendered.length,
    });
    return {
      sliceEntries: slice.entries,
      glossarySlice,
      appliedTerms: slice.appliedTerms,
      stableContext: pack.renderedStable,
      volatileContext: pack.renderedVolatile,
      nodeTrace: ['assembleContext'],
    };
  }

  function segment(state: TranslationState) {
    const segments = segmentSource(state.original, state.settings.segmentTokens ?? DEFAULT_SEGMENT_TOKENS);
    logger.debug('translation segment', { runId: state.runId, chapter: state.chapter, segments: segments.length });
    return { segments, translatedSegments: segments.map(() => ''), pending: segments.map(s => s.index), nodeTrace: ['segment'] };
  }

  async function translateSegment(state: TranslationState) {
    const index = state.pending[0];
    const source = index === undefined ? undefined : state.segments[index];
    if (index === undefined || !source) throw AppError.internal(`[translateSegment] No pending segment for chapter ${state.chapter} of project ${state.projectId}`);

    const projectId = BigInt(state.projectId);
    const prompt = PROMPT_REGISTRY['translate-chapter'];
    const prevSegment = index > 0 ? (state.translatedSegments[index - 1] ?? '') : '';

    const ctx: TelemetryContext = {
      projectId,
      runId: state.runId,
      node: state.attempt === 0 ? 'translate' : 'repair',
      promptKey: prompt.key,
      promptVersion: prompt.version,
      role: 'translate',
    };
    const result = (await modelRouter.structured(
      prompt,
      {
        stableContext: state.stableContext,
        volatileContext: state.volatileContext,
        segmentIndex: index + 1,
        segmentCount: state.segments.length,
        sourceSegment: source.text,
        prevTranslatedTail: previousTail(prevSegment, PREV_SEGMENT_TAIL_CHARS) || 'none',
        repairNotes: state.repairNotes || 'none',
      },
      ctx,
      (await projectFor(projectId)) as ProjectConfig | undefined,
      await policyFor(projectId, state.chapter),
    )) as TranslateSegmentOutput;

    const translatedSegments = [...state.translatedSegments];
    translatedSegments[index] = result.body;

    // A repair pass re-translates segments that already reported their terms; without deduping here the
    // duplicates reach the fidelity scan as separate entries and repeat one glossary_violation per copy.
    const profile = scriptProfileFor(state.language);
    const discoveredTerms = [...state.discoveredTerms];
    const known = new Set(discoveredTerms.map(term => foldTerm(term.sourceTerm, profile)));
    for (const term of result.discoveredTerms ?? []) {
      const key = foldTerm(term.sourceTerm, profile);
      if (known.has(key)) continue;
      known.add(key);
      discoveredTerms.push(term);
    }
    logger.debug('translation translateSegment', {
      runId: state.runId,
      chapter: state.chapter,
      segment: index,
      attempt: state.attempt,
      bodyLength: result.body.length,
      discoveredTerms: result.discoveredTerms?.length ?? 0,
    });
    return {
      translatedSegments,
      pending: state.pending.slice(1),
      translatedTitle: index === 0 ? (result.title ?? state.translatedTitle) : state.translatedTitle,
      discoveredTerms,
      nodeTrace: ['translateSegment'],
    };
  }

  function routeAfterSegment(state: TranslationState): 'translate' | 'join' {
    return state.pending.length > 0 ? 'translate' : 'join';
  }

  function join(state: TranslationState) {
    const segmentRecords = state.segments.map((s, i) => ({ sourceStart: s.start, sourceEnd: s.end, body: state.translatedSegments[i] ?? '' }));
    return { body: state.translatedSegments.join('\n\n'), segmentRecords, nodeTrace: ['join'] };
  }

  function fidelityScan(state: TranslationState) {
    const profile = scriptProfileFor(state.language);
    const rejected = rejectedSourceTerms(state.glossary, profile);
    const discovered = state.discoveredTerms.filter(term => !rejected.has(foldTerm(term.sourceTerm, profile))).map(asTermLike);
    const entries = [...state.sliceEntries, ...discovered];
    const fidelityIssues = scanFidelity({ original: state.original, translation: state.body, entries, profile, bands: state.settings.fidelityBands });
    if (fidelityIssues.length > 0) logger.debug('translation fidelityScan found issues', { runId: state.runId, chapter: state.chapter, issues: fidelityIssues });
    return { fidelityIssues, nodeTrace: ['fidelityScan'] };
  }

  async function audit(state: TranslationState) {
    if (state.settings.auditEnabled === false) return { auditIssues: [], nodeTrace: ['audit'] };

    const projectId = BigInt(state.projectId);
    const prompt = PROMPT_REGISTRY['translate-audit'];

    const ctx: TelemetryContext = { projectId, runId: state.runId, node: 'audit', promptKey: prompt.key, promptVersion: prompt.version, role: 'audit' };
    const result = (await modelRouter.structured(
      prompt,
      { styleNotes: state.styleNotes, glossarySlice: state.glossarySlice, pairs: renderAuditPairs(state.segments, state.translatedSegments) },
      ctx,
      (await projectFor(projectId)) as ProjectConfig | undefined,
    )) as TranslationAuditOutput;

    const auditIssues: Translation.Issue[] =
      result.verdict === 'issues'
        ? result.issues.map(issue => ({
            source: 'audit' as const,
            type: issue.type,
            detail: issue.detail,
            excerpt: issue.excerpt,
            segmentIndex: toSegmentIndex(issue.segmentIndex, state.segments.length),
          }))
        : [];
    logger.debug('translation audit', { runId: state.runId, chapter: state.chapter, verdict: result.verdict, auditIssues: auditIssues.length });
    return { auditIssues, nodeTrace: ['audit'] };
  }

  function prepareRepair(state: TranslationState) {
    const issues = [...state.fidelityIssues, ...state.auditIssues];
    const flagged = new Set<number>();
    let wholeChapter = false;
    for (const issue of issues) {
      if (issue.segmentIndex === undefined) wholeChapter = true;
      else flagged.add(issue.segmentIndex);
    }
    const pending = wholeChapter ? state.segments.map(s => s.index) : [...flagged].sort((a, b) => a - b);

    logger.debug('translation repair pass', { runId: state.runId, chapter: state.chapter, issues: issues.length, pending });
    return { attempt: state.attempt + 1, repairNotes: renderIssues(issues), pending, nodeTrace: ['prepareRepair'] };
  }

  async function persistTranslation(state: TranslationState) {
    const projectId = BigInt(state.projectId);
    const issues = [...state.fidelityIssues, ...state.auditIssues];
    const status: Translation.ChapterStatus = issues.length > 0 ? 'attention' : 'translated';
    const sourceHash = state.contentHash ?? chapterContentHash({ title: state.originalTitle ?? '', content: state.original });
    logger.debug('translation persistTranslation', { runId: state.runId, chapter: state.chapter, status, issues: issues.length, attempt: state.attempt });

    await db
      .insert(schema.chapterTranslations)
      .values({
        projectId,
        chapter: state.chapter,
        title: state.translatedTitle ?? state.originalTitle,
        body: state.body,
        status,
        issues: issues.length > 0 ? issues : null,
        appliedTerms: state.appliedTerms,
        glossaryStale: false,
        sourceHash,
        sourceStale: false,
        segments: state.segmentRecords,
        runId: state.runId,
      })
      .onConflictDoUpdate({
        target: [schema.chapterTranslations.projectId, schema.chapterTranslations.chapter],
        set: {
          title: sql`EXCLUDED.title`,
          body: sql`EXCLUDED.body`,
          status: sql`EXCLUDED.status`,
          issues: sql`EXCLUDED.issues`,
          appliedTerms: sql`EXCLUDED.applied_terms`,
          glossaryStale: sql`EXCLUDED.glossary_stale`,
          sourceHash: sql`EXCLUDED.source_hash`,
          sourceStale: sql`EXCLUDED.source_stale`,
          segments: sql`EXCLUDED.segments`,
          runId: sql`EXCLUDED.run_id`,
          // A row that just translated cleanly must not keep advertising the failure of an earlier run.
          lastError: null,
          lastFailedRunId: null,
          revision: sql`${schema.chapterTranslations.revision} + 1`,
          updatedAt: new Date(),
        },
      });

    return { outcome: status, nodeTrace: ['persistTranslation'] };
  }

  // Runs for attention rows too — later chapters need the discovered terms either way. Rejected terms are
  // dropped here rather than left to the reviewer, or the model re-suggests them on every chapter.
  async function mergeGlossary(state: TranslationState) {
    if (state.discoveredTerms.length === 0) return { nodeTrace: ['mergeGlossary'] };
    const projectId = BigInt(state.projectId);
    const profile = scriptProfileFor(state.language);
    const rejected = rejectedSourceTerms(state.glossary, profile);

    const values = state.discoveredTerms
      .filter(term => !rejected.has(foldTerm(term.sourceTerm, profile)))
      .map(term => ({
        projectId,
        sourceTerm: term.sourceTerm,
        variants: term.variants ?? null,
        target: term.target,
        category: term.category,
        treatment: term.treatment,
        meaning: term.meaning,
        contextExcerpt: term.contextExcerpt ?? null,
        alternatives: term.alternatives ?? null,
        status: 'suggested' as const,
        origin: 'discovered' as const,
        createdChapter: state.chapter,
      }));
    if (values.length === 0) return { nodeTrace: ['mergeGlossary'] };

    await db
      .insert(schema.translationGlossary)
      .values(values)
      .onConflictDoNothing()
      .catch(err => logger.warn('glossary merge error (non-fatal)', { err, chapter: state.chapter }));

    return { nodeTrace: ['mergeGlossary'] };
  }

  function finish(state: TranslationState) {
    return { outcome: state.outcome ?? 'translated', nodeTrace: ['finish'] };
  }

  return new StateGraph(ChapterTranslationAnnotation)
    .addNode('loadChapter', loadChapter)
    .addNode('assembleContext', assembleContext)
    .addNode('segment', segment)
    .addNode('translateSegment', translateSegment)
    .addNode('join', join)
    .addNode('fidelityScan', fidelityScan)
    .addNode('audit', audit)
    .addNode('prepareRepair', prepareRepair)
    .addNode('persistTranslation', persistTranslation)
    .addNode('mergeGlossary', mergeGlossary)
    .addNode('finish', finish)
    .addEdge(START, 'loadChapter')
    .addEdge('loadChapter', 'assembleContext')
    .addEdge('assembleContext', 'segment')
    .addEdge('segment', 'translateSegment')
    .addConditionalEdges('translateSegment', routeAfterSegment, { translate: 'translateSegment', join: 'join' })
    .addEdge('join', 'fidelityScan')
    .addEdge('fidelityScan', 'audit')
    .addConditionalEdges('audit', routeAfterFidelity, { persist: 'persistTranslation', repair: 'prepareRepair' })
    .addEdge('prepareRepair', 'translateSegment')
    .addEdge('persistTranslation', 'mergeGlossary')
    .addEdge('mergeGlossary', 'finish')
    .addEdge('finish', END)
    .compile({ checkpointer });
}

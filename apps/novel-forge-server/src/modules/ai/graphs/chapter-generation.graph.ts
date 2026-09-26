import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph';
import { and, desc, eq, lt, ne, sql } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';

import { markDescendantDraftsStale, refusedDraftWriteError, revokeProvisionalReveals } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type Generation, type PrimaryDatabase, type Project } from '@server/database';
import * as schema from '@server/database/schemas';

import {
  type FactLike,
  KNOWLEDGE_LEAK_PREFIX,
  type KnowledgeLeakIssue,
  loadKnowledgeView,
  parseKnowledgeContract,
  renderForbiddenFacts,
  renderJudgeReaderKnows,
  scanKnowledgeLeaks,
  writerSafeLeakLines,
} from '../../bible/fact/knowledge-view';
import { loadWriterDisclosurePolicy, type WriterDisclosurePolicy } from '../../bible/fact/writer-disclosure-policy';
import { resolveWordTarget } from '../../eval/deterministic-metrics';
import { type ForgeCallPolicy, type PluginPolicyService, type PolicyCall, type ProjectBaseline, type ScopedPolicyResolver } from '../../plugins/plugin-policy.service';
import { recordGenerationJudge } from '../../review/review-records';
import { chapterContainment, chapterContentMode, type ChapterRole, routeChapterCall } from '../chapter-route';
import { type ContextAssembler } from '../context/context-assembler.service';
import { type ContextSection, splitSegments } from '../context/sections';
import { loadWriterBrief } from '../context/writer-brief';
import { extractJsonCandidates, tryParseJson } from '../json-extract';
import { type ModelRouterService, type ProjectConfig } from '../model-router.service';
import { PROMPT_REGISTRY } from '../prompts';
import { generationWordTargetVars } from '../prompts/generation.prompt';
import { type IndexingService } from '../retrieval/indexing.service';
import { type FixOutput, type GenerationState, type JudgeOutput, JudgeSchema, renderEndingContract } from '../schemas';
import { parseSchema } from '../schemas/validate';
import { type TelemetryContext, type TelemetryHandler } from '../telemetry.handler';
import { runToolLoop } from '../tools/tool-loop';
import { type ToolRegistryService } from '../tools/tool-registry.service';
import { type ToolContext } from '../tools/types';
import { type CallRoute, type UnrestrictedRouteDeps } from '../unrestricted-route';
import { expandShortDraft } from './draft-expansion';
import { checkDraftMechanics } from './mechanical-check';
import { assessReadability, READABILITY_PREFIX, readabilityNote, renderReadabilityEvidence } from './readability-check';

export interface GraphServices {
  db: PrimaryDatabase;
  contextAssembler: ContextAssembler;
  modelRouter: ModelRouterService;
  telemetry: TelemetryHandler;
  toolRegistry: ToolRegistryService;
  indexingService: IndexingService;
  pluginPolicy: PluginPolicyService;
  checkpointer: BaseCheckpointSaver;
}

const ChapterGenAnnotation = Annotation.Root({
  // inputs (immutable — reducer just replaces)
  projectId: Annotation<string>({ reducer: (_, n) => n, default: () => '0' }),
  chapter: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  volumeKey: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  guidance: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  autoFix: Annotation<boolean>({ reducer: (_, n) => n, default: () => false }),
  maxFixes: Annotation<number>({ reducer: (_, n) => n, default: () => 3 }),
  runId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  // working data
  contextPackId: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  prose: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  title: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  summary: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  continuationState: Annotation<GenerationState>({ reducer: (_, n) => n, default: () => ({}) }),
  verdict: Annotation<'consistent' | 'contradiction' | 'evaluation_failed' | null>({ reducer: (_, n) => n, default: () => null }),
  endingCompliant: Annotation<boolean>({ reducer: (_, n) => n, default: () => true }),
  knowledgeCompliant: Annotation<boolean>({ reducer: (_, n) => n, default: () => true }),
  mechanicallyCompliant: Annotation<boolean>({ reducer: (_, n) => n, default: () => true }),
  briefCompliant: Annotation<boolean>({ reducer: (_, n) => n, default: () => true }),
  readabilityCompliant: Annotation<boolean>({ reducer: (_, n) => n, default: () => true }),
  readabilityEvidence: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  readabilityNote: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  mechanicalFindings: Annotation<JudgeFinding[]>({ reducer: (_, n) => n, default: () => [] }),
  findings: Annotation<JudgeFinding[]>({ reducer: (_, n) => n, default: () => [] }),
  knowledgeWriterFindings: Annotation<JudgeFinding[]>({ reducer: (_, n) => n, default: () => [] }),
  previousFindings: Annotation<JudgeFinding[]>({ reducer: (_, n) => n, default: () => [] }),
  attempt: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  repairMode: Annotation<'patch' | 'rewrite'>({ reducer: (_, n) => n, default: () => 'patch' }),
  patchApplied: Annotation<boolean>({ reducer: (_, n) => n, default: () => false }),
  // Sticky, not last-write-wins: any call a plugin routed permissively during the run shapes the prose
  // that lands, so once raised the run stays contained however many later nodes resolve an unraised policy.
  writerClassRaised: Annotation<boolean>({ reducer: (a, n) => a || n, default: () => false }),
  // Settled once from the plan when the run starts, so a plan edited mid-run cannot move later nodes off the route the prose was written on.
  contentMode: Annotation<Project.ContentMode | null>({ reducer: (_, n) => n, default: () => null }),
  // outcome
  draftId: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  outcome: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  // The real path taken through the graph, in execution order — each node appends its own name so
  // repair-ladder detours (which a hardcoded happy-path list can never show) show up honestly.
  nodeTrace: Annotation<string[]>({ reducer: (a, n) => [...a, ...n], default: () => [] }),
});

type ChapterGenState = typeof ChapterGenAnnotation.State;
export type PersistDraftInput = Pick<
  ChapterGenState,
  'projectId' | 'chapter' | 'volumeKey' | 'runId' | 'attempt' | 'repairMode' | 'writerClassRaised' | 'title' | 'prose' | 'summary' | 'continuationState'
> &
  Partial<Pick<ChapterGenState, 'contentMode'>>;
export type JudgeFinding = JudgeOutput['findings'][number];

const logger = Logger.getLogger(APP_NAME, 'chapter-generation.graph');

export interface RunRouteDeps extends UnrestrictedRouteDeps {
  runPolicy: (projectId: bigint, call: PolicyCall) => Promise<ForgeCallPolicy>;
}

export interface RunCall {
  role: ChapterRole;
  chapter: number;
  mode: Project.ContentMode;
  raised: boolean;
}

// A raised run's prose is persisted as an isolated draft, so every later call that reads it stays on the unrestricted map whatever its own role resolves to.
export function routeRunCall(deps: RunRouteDeps, projectId: bigint, call: RunCall, project: ProjectConfig | undefined): Promise<CallRoute> {
  const mode = call.raised ? 'unrestricted' : call.mode;
  return routeChapterCall({ ...deps, standardPolicy: deps.runPolicy }, projectId, { role: call.role, chapter: call.chapter, mode }, project);
}

export async function persistGeneratedDraft(db: PrimaryDatabase, state: PersistDraftInput): Promise<Generation.Draft> {
  const projectId = BigInt(state.projectId);
  const source = state.attempt === 0 ? 'generated' : state.repairMode === 'patch' ? 'patched' : 'rewritten';
  const containment = chapterContainment(state.contentMode ?? 'standard', { raised: state.writerClassRaised });

  // Upsert the draft and record its revision in one transaction: the revision log must never
  // diverge from the draft it describes. `onConflictDoNothing` on the revision keeps the whole
  // node idempotent on checkpoint replay, but a real insert failure now rolls the draft back too.
  return db.transaction(async tx => {
    const previous = await tx.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, state.chapter)) });
    // Paths such as unrestricted fill, import and hand edits change the body without logging a revision; snapshot it so replacing it never loses prose.
    if (previous) {
      await tx
        .insert(schema.draftRevisions)
        .values({
          projectId,
          draftId: previous.id,
          revision: previous.revision,
          source: previous.generator === 'human' ? 'imported' : 'generated',
          body: previous.body,
          summary: previous.summary,
          state: previous.state,
        })
        .onConflictDoNothing();
      await tx.delete(schema.continuityProposals).where(and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.chapter, state.chapter)));
    }

    const generator = containment.generator ?? 'standard';
    const isolated = containment.isolated ?? false;
    const [row] = await tx
      .insert(schema.drafts)
      .values({
        projectId,
        chapter: state.chapter,
        title: state.title,
        body: state.prose,
        summary: state.summary,
        state: state.continuationState as never,
        volumeKey: state.volumeKey || null,
        revision: 0,
        reviewStatus: 'generating',
        staleReason: null,
        generator,
        isolated,
      })
      .onConflictDoUpdate({
        target: [schema.drafts.projectId, schema.drafts.chapter],
        set: {
          title: sql`EXCLUDED.title`,
          body: sql`EXCLUDED.body`,
          summary: sql`EXCLUDED.summary`,
          state: sql`EXCLUDED.state`,
          revision: sql`drafts.revision + 1`,
          reviewStatus: 'generating',
          staleReason: null,
          generator,
          isolated,
          updatedAt: new Date(),
        },
        setWhere: ne(schema.drafts.status, 'final'),
      })
      .returning();

    if (!row) throw await refusedDraftWriteError(tx, projectId, state.chapter);
    // Later drafts were written against whatever this chapter held before, so new prose here leaves them resting on text that no longer exists.
    await markDescendantDraftsStale(tx, projectId, state.chapter, `ancestor chapter ${state.chapter} was ${previous ? 'regenerated' : 'drafted'}`);
    await revokeProvisionalReveals(tx, projectId, state.chapter);

    await tx
      .insert(schema.draftRevisions)
      .values({
        projectId,
        draftId: row.id,
        revision: row.revision,
        source,
        body: state.prose,
        summary: state.summary,
        state: state.continuationState as never,
        runId: state.runId || null,
      })
      .onConflictDoNothing();

    return row;
  });
}

export type DraftReview = Partial<Pick<Generation.Draft, 'judge' | 'judgeNote' | 'reviewStatus'>>;

export async function setOpenDraftReview(db: Pick<PrimaryDatabase, 'update'>, draftId: string, review: DraftReview): Promise<void> {
  await db
    .update(schema.drafts)
    .set({ ...review, updatedAt: new Date() })
    .where(and(eq(schema.drafts.id, BigInt(draftId)), ne(schema.drafts.status, 'final'), ne(schema.drafts.reviewStatus, 'approved')));
}

// `judge` and `fix` reload the assembled pack from `context_packs` rather than building their own, so the `minWriterClass` guard runs against the lowest of the three classes.
export const CHAPTER_PACK_CONSUMERS = ['generation', 'judge', 'fix'] as const;

// Normalize finding text for dedup comparison.
function normalizeFinding(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

// True if any finding in `findings` exactly matches (same severity, same normalized text) a finding in `previousFindings`.
export function sameFinding(findings: JudgeFinding[], previousFindings: JudgeFinding[]): boolean {
  if (previousFindings.length === 0) return false;
  for (const f of findings) {
    const norm = normalizeFinding(f.text);
    for (const prev of previousFindings) {
      if (f.severity === prev.severity && norm === normalizeFinding(prev.text)) return true;
    }
  }
  return false;
}

// Routing function after judge — exported for testing. Ending-contract, knowledge-leak, mechanical,
// brief-fulfillment and readability violations ride the same repair ladder as continuity findings but never harden the verdict.
// Readability alone is never a reason to hold a chapter: once repair is off or spent it is accepted for normal review, so
// a stylistic miss cannot halt a batch or block the next chapter the way a contradiction does.
export function routeAfterJudge(
  state: Pick<ChapterGenState, 'verdict' | 'autoFix' | 'attempt' | 'maxFixes' | 'findings' | 'previousFindings'> & {
    endingCompliant?: boolean;
    knowledgeCompliant?: boolean;
    mechanicallyCompliant?: boolean;
    briefCompliant?: boolean;
    readabilityCompliant?: boolean;
  },
): string {
  const endingCompliant = state.endingCompliant !== false;
  const knowledgeCompliant = state.knowledgeCompliant !== false;
  const mechanicallyCompliant = state.mechanicallyCompliant !== false;
  const briefCompliant = state.briefCompliant !== false;
  const readabilityCompliant = state.readabilityCompliant !== false;
  if (state.verdict === 'evaluation_failed') return 'awaitReview';
  const otherwiseCompliant = state.verdict === 'consistent' && endingCompliant && knowledgeCompliant && mechanicallyCompliant && briefCompliant;
  if (otherwiseCompliant && readabilityCompliant) return 'accept';
  if (otherwiseCompliant) {
    const readabilityBudgetSpent = state.attempt >= state.maxFixes || sameFinding(state.findings, state.previousFindings);
    return state.autoFix && !readabilityBudgetSpent ? 'repairPatch' : 'accept';
  }
  // A readability quote the repair left alone must not end a repair loop that is still fixing a contradiction.
  const withoutReadability = (findings: JudgeFinding[]): JudgeFinding[] => findings.filter(finding => !finding.text.startsWith(READABILITY_PREFIX));
  const budgetSpent = state.attempt >= state.maxFixes || sameFinding(withoutReadability(state.findings), withoutReadability(state.previousFindings));
  if (!state.autoFix) return 'awaitReview';
  if (budgetSpent) return 'acceptAsIs';
  return 'repairPatch';
}

// Routing function after repairPatch — exported for testing.
export function routeAfterPatch(state: Pick<ChapterGenState, 'patchApplied'>): string {
  return state.patchApplied ? 'persistDraft' : 'repairRewrite';
}

// Merges the deterministic leak pre-scan with the judge's own knowledgeCompliance — exported for
// testing. A pre-scan hit forces non-compliance regardless of what the model reported.
export function mergeKnowledgeCompliance(
  compliance: { compliant: boolean; issues: string[] } | undefined,
  prescan: KnowledgeLeakIssue[],
  forbidden: FactLike[] = [],
): { knowledgeCompliant: boolean; findings: JudgeFinding[]; writerFindings: JudgeFinding[] } {
  const judgeIssues = compliance && !compliance.compliant ? compliance.issues : [];
  const issues = [...prescan.map(leak => `"${leak.term}" exposes [${leak.factKey}] — ${leak.excerpt}`), ...judgeIssues];
  return {
    knowledgeCompliant: issues.length === 0,
    findings: issues.map(issue => ({ severity: 'soft' as const, text: `${KNOWLEDGE_LEAK_PREFIX}${issue}` })),
    writerFindings: writerSafeLeakFindings(prescan, judgeIssues, forbidden),
  };
}

export function writerSafeLeakFindings(prescan: KnowledgeLeakIssue[], judgeIssues: string[], forbidden: FactLike[]): JudgeFinding[] {
  return writerSafeLeakLines(prescan, judgeIssues, forbidden).map(text => ({ severity: 'soft' as const, text }));
}

/** Other findings can still name or paraphrase a forbidden fact, so they are scrubbed; the leak findings are already in their writer-safe form. */
function writerFacingFindings(state: Pick<ChapterGenState, 'findings' | 'knowledgeWriterFindings'>, disclosure: WriterDisclosurePolicy): string {
  const render = (findings: JudgeFinding[]): string => findings.map(finding => `[${finding.severity}] ${finding.text}`).join('\n');
  const others = disclosure.scrub(render(state.findings.filter(finding => !finding.text.startsWith(KNOWLEDGE_LEAK_PREFIX))), 'note');
  const leaks = state.knowledgeWriterFindings.map(finding => ({ ...finding, text: disclosure.scrubLeakLine(finding.text) }));
  return [others, render(leaks)].filter(Boolean).join('\n');
}

export function parseJudgeOutput(raw: string): JudgeOutput | null {
  const fromJson = parseSchema<JudgeOutput>(JudgeSchema, tryParseJson(raw));
  if (fromJson.success) return fromJson.data;
  for (const candidate of extractJsonCandidates(raw)) {
    const fromExtracted = parseSchema<JudgeOutput>(JudgeSchema, candidate);
    if (fromExtracted.success) return fromExtracted.data;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createChapterGenerationNodes(services: Omit<GraphServices, 'checkpointer'>) {
  const { db, contextAssembler, modelRouter, toolRegistry, pluginPolicy } = services;

  // The graph is built per run, so this closure is the run's scope: one `project_plugins` read per baseline feeds every
  // node's policy instead of one read per model call. The baseline is the chapter's mode, not the project's.
  const resolvers = new Map<Project.ContentMode, Promise<ScopedPolicyResolver>>();
  function resolverFor(projectId: bigint, mode: Project.ContentMode): Promise<ScopedPolicyResolver> {
    let resolver = resolvers.get(mode);
    if (!resolver) resolvers.set(mode, (resolver = pluginPolicy.scoped(projectId, { contentMode: mode })));
    return resolver;
  }

  async function policyFor(projectId: bigint, mode: Project.ContentMode, call: PolicyCall): Promise<ForgeCallPolicy> {
    return (await resolverFor(projectId, mode)).for(call);
  }

  async function packPolicyFor(projectId: bigint, mode: Project.ContentMode, call: PolicyCall): Promise<ForgeCallPolicy> {
    return (await resolverFor(projectId, mode)).forPack(call, CHAPTER_PACK_CONSUMERS);
  }

  const runPluginPolicy = {
    resolve: (projectId: bigint, call: PolicyCall, baseline?: ProjectBaseline) =>
      policyFor(projectId, baseline?.contentMode === 'unrestricted' ? 'unrestricted' : 'standard', call),
  };

  // One snapshot per run and chapter, so the pack, the brief and every repair prompt withhold the same material.
  const disclosures = new Map<number, Promise<WriterDisclosurePolicy>>();
  function disclosureFor(projectId: bigint, chapter: number): Promise<WriterDisclosurePolicy> {
    let disclosure = disclosures.get(chapter);
    if (!disclosure) disclosures.set(chapter, (disclosure = loadWriterDisclosurePolicy(db, projectId, chapter)));
    return disclosure;
  }

  const settledModes = new Map<number, Promise<Project.ContentMode>>();
  function chapterModeFor(projectId: bigint, chapter: number): Promise<Project.ContentMode> {
    let mode = settledModes.get(chapter);
    if (!mode) {
      const brief = db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)), columns: { contentMode: true } });
      settledModes.set(chapter, (mode = brief.then(row => chapterContentMode({ brief: row }))));
    }
    return mode;
  }

  // A state without a mode (a node entered directly, or a checkpoint older than the field) re-reads the plan rather than assuming standard.
  async function routeFor(
    projectId: bigint,
    role: ChapterRole,
    state: Pick<ChapterGenState, 'chapter' | 'writerClassRaised'> & Partial<Pick<ChapterGenState, 'contentMode'>>,
    project: ProjectConfig | undefined,
  ): Promise<CallRoute> {
    const mode = state.contentMode ?? (await chapterModeFor(projectId, state.chapter));
    const runPolicy = (id: bigint, call: PolicyCall) => policyFor(id, mode, call);
    const call = { role, chapter: state.chapter, mode, raised: state.writerClassRaised };
    return routeRunCall({ pluginPolicy: runPluginPolicy, modelRouter, runPolicy }, projectId, call, project);
  }

  async function assembleContext(state: ChapterGenState) {
    const projectId = BigInt(state.projectId);
    const contentMode = await chapterModeFor(projectId, state.chapter);
    const call: PolicyCall = { role: 'generation', chapter: state.chapter };
    const policy = await policyFor(projectId, contentMode, call);
    const pack = await contextAssembler.forChapter(projectId, state.chapter, {
      policy: await packPolicyFor(projectId, contentMode, call),
      disclosure: await disclosureFor(projectId, state.chapter),
      enforceWriterReservations: true,
    });
    // Link the pack to the run row so the run detail can show the prompt anatomy behind the tokens.
    if (pack.id !== null) await db.update(schema.workflowRuns).set({ contextPackId: pack.id }).where(eq(schema.workflowRuns.id, state.runId));
    return { contextPackId: pack.id ? String(pack.id) : null, contentMode, writerClassRaised: policy.raised, nodeTrace: ['assembleContext'] };
  }

  async function draftChapter(state: ChapterGenState) {
    const projectId = BigInt(state.projectId);
    const [brief, projectRow] = await Promise.all([
      db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, state.chapter)) }),
      db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);

    let stableContext = '';
    let volatileContext = '';
    if (state.contextPackId) {
      const pack = await db.query.contextPacks.findFirst({ where: eq(schema.contextPacks.id, BigInt(state.contextPackId)) });
      ({ renderedStable: stableContext, renderedVolatile: volatileContext } = splitSegments((pack?.sections as ContextSection[] | null) ?? []));
    }

    const ctx: TelemetryContext = {
      projectId,
      runId: state.runId,
      node: 'draftChapter',
      promptKey: 'generation',
      promptVersion: PROMPT_REGISTRY.generation.version,
      role: 'generation',
      chapter: state.chapter,
    };

    const { policy, project } = await routeFor(projectId, 'draft', state, projectRow as ProjectConfig | undefined);
    const disclosure = await disclosureFor(projectId, state.chapter);
    const { chapterBrief, endingContract } = await loadWriterBrief(db, projectId, state.chapter, brief, disclosure);
    const guidance = writerSafeGuidance(disclosure, state.guidance);
    const wordTarget = resolveWordTarget(projectRow);
    const result = (await modelRouter.structured(
      PROMPT_REGISTRY.generation,
      { stableContext, volatileContext, chapterBrief, endingContract, guidance, ...generationWordTargetVars(wordTarget) },
      ctx,
      project,
      policy,
    )) as { title: string; body: string; summary: string; state?: GenerationState };
    const expansion = await expandShortDraft(modelRouter, { body: result.body, stableContext, volatileContext, chapterBrief, endingContract, guidance }, ctx, project, policy);

    let title = result.title ?? '';
    let raised = state.writerClassRaised || policy.raised;
    if (!title) {
      const titleCtx: TelemetryContext = { ...ctx, promptKey: 'title', node: 'draftChapter:title' };
      const titleRoute = await routeFor(projectId, 'title', { ...state, writerClassRaised: raised }, undefined);
      raised ||= titleRoute.policy.raised;
      const titleResult = (await modelRouter.structured(PROMPT_REGISTRY.title, { prose: result.body.slice(0, 500) }, titleCtx, titleRoute.project, titleRoute.policy)) as {
        title: string;
      };
      title = titleResult.title ?? '';
    }

    logger.debug('generation draftChapter', {
      runId: state.runId,
      chapter: state.chapter,
      attempt: state.attempt,
      proseLength: expansion.body.length,
      draftWords: expansion.initialWords,
      words: expansion.finalWords,
      expansionPasses: expansion.passes,
      title,
    });
    return {
      prose: expansion.body,
      title,
      summary: result.summary,
      continuationState: result.state ?? {},
      writerClassRaised: raised,
      nodeTrace: ['draftChapter'],
    };
  }

  async function persistDraft(state: ChapterGenState) {
    const contentMode = state.contentMode ?? (await chapterModeFor(BigInt(state.projectId), state.chapter));
    const draft = await persistGeneratedDraft(db, { ...state, contentMode });
    return { draftId: String(draft.id), nodeTrace: ['persistDraft'] };
  }

  const MECHANICAL_PRIOR_WINDOW = 10;

  async function mechanicalCheck(state: ChapterGenState) {
    const projectId = BigInt(state.projectId);
    const [projectRow, priorChapters] = await Promise.all([
      db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      db.query.chapters.findMany({
        where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done'), eq(schema.chapters.isolated, false), lt(schema.chapters.number, state.chapter)),
        orderBy: [desc(schema.chapters.number)],
        limit: MECHANICAL_PRIOR_WINDOW,
        columns: { content: true },
      }),
    ]);

    const wordTarget = resolveWordTarget(projectRow);
    const mechanicalFindings = checkDraftMechanics(state.prose, priorChapters.map(c => c.content ?? '').filter(Boolean), wordTarget);
    const mechanicallyCompliant = !mechanicalFindings.some(f => f.severity === 'hard');
    const readability = assessReadability(state.prose);
    logger.debug('generation mechanicalCheck', {
      runId: state.runId,
      chapter: state.chapter,
      attempt: state.attempt,
      findings: mechanicalFindings.length,
      mechanicallyCompliant,
    });
    return {
      mechanicalFindings,
      mechanicallyCompliant,
      readabilityEvidence: readability ? renderReadabilityEvidence(readability) : null,
      readabilityNote: readabilityNote(readability),
      nodeTrace: ['mechanicalCheck'],
    };
  }

  async function judge(state: ChapterGenState) {
    const projectId = BigInt(state.projectId);
    const [projectRow, brief] = await Promise.all([
      db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, state.chapter)) }),
    ]);

    let renderedPack = '';
    if (state.contextPackId) {
      const pack = await db.query.contextPacks.findFirst({ where: eq(schema.contextPacks.id, BigInt(state.contextPackId)) });
      renderedPack = pack?.rendered ?? '';
    }

    const toolCtx: ToolContext = {
      chapter: state.chapter,
      db: { query: db.query, select: db.select.bind(db) },
      node: 'judge',
      projectId,
      retrieval: services.indexingService as never,
      runId: state.runId || '',
    };

    const tools = toolRegistry.forNode('judge', toolCtx);
    const rawTools = toolRegistry.getRaw('judge');
    const { policy: judgePolicy, project: judgeProject } = await routeFor(projectId, 'judge', state, projectRow as ProjectConfig | undefined);
    const judgeTelemetry = {
      projectId,
      runId: state.runId || undefined,
      node: 'judge',
      promptKey: PROMPT_REGISTRY.judge.key,
      promptVersion: PROMPT_REGISTRY.judge.version,
      role: 'judge',
      chapter: state.chapter,
    };
    const model = await modelRouter.chatFor('judge', judgeTelemetry, judgeProject, judgePolicy);

    const renderedContract = renderEndingContract(brief?.endingContract);
    const contractBlock = renderedContract
      ? `\n\n## ENDING CONTRACT\n${renderedContract}\n\nAlso assess the draft ending against this contract and include endingCompliance in your JSON.`
      : '';

    // The judge — unlike the drafter — sees the full forbidden list:
    // asymmetric visibility is what lets it catch leaks the pack-level filtering cannot prevent.
    const knowledgeContract = parseKnowledgeContract(brief?.knowledgeContract);
    const knowledgeView = knowledgeContract ? await loadKnowledgeView(db, projectId, state.chapter, knowledgeContract) : null;
    // Open canon is scheduled (`revealChapter <= OPEN_FROM_CHAPTER`), never marked by source — nothing writes
    // `source: 'seed'` any more, so this filter only guards facts an older install minted.
    const forbidden = (knowledgeView?.hidden ?? []).filter(fact => fact.source !== 'seed');
    const knowledgeBlock =
      forbidden.length > 0
        ? `\n\n## FORBIDDEN KNOWLEDGE\n${renderForbiddenFacts(forbidden)}\n\nThe POV cast does not know these facts — assess the draft for leaks and include knowledgeCompliance in your JSON.`
        : '';
    const readerKnowsBlock = renderJudgeReaderKnows(knowledgeView?.readerKnows ?? []);

    const povLine = brief?.pov ? `POV: ${brief.pov}\n` : '';
    const readabilityBlock = state.readabilityEvidence
      ? `\n\n${state.readabilityEvidence}\n\nWeigh this evidence in readabilityCompliance; the project's writing-style additions win where they allow this prose.`
      : '';
    const briefBlock = `\n\n## BRIEF\n${povLine}${brief?.body ?? ''}\n\nThis is the plan the chapter was written from — assess whether the draft delivers it and include briefCompliance in your JSON.`;

    const systemMsg = new SystemMessage(PROMPT_REGISTRY.judge.system);
    const humanMsg = new HumanMessage(
      `Context:\n${renderedPack}\n\n---\nDraft prose to evaluate:\n${state.prose}${briefBlock}${contractBlock}${knowledgeBlock}${readerKnowsBlock}${readabilityBlock}\n\nEvaluate this chapter draft for continuity and consistency with the established canon. Return a JSON object with verdict ("consistent" or "contradiction") and findings array.`,
    );
    const judgeMessages = [...(PROMPT_REGISTRY.judge.fewShots ?? []), systemMsg, humanMsg];

    async function runJudgeModel(): Promise<JudgeOutput | null> {
      const { messages } = await runToolLoop(model, tools, rawTools, judgeMessages, toolCtx, db as never);
      const lastAi = [...messages].reverse().find(m => m instanceof AIMessage || m._getType() === 'ai');
      const rawContent = lastAi ? (typeof lastAi.content === 'string' ? lastAi.content : JSON.stringify(lastAi.content)) : '{}';
      return parseJudgeOutput(rawContent);
    }

    let judgeResult = await runJudgeModel();
    if (!judgeResult) {
      logger.warn('generation judge: could not parse judge output — retrying once', { runId: state.runId, chapter: state.chapter });
      judgeResult = await runJudgeModel();
    }
    if (judgeResult) await modelRouter.screenOutput('judge', judgeResult, judgeTelemetry, judgeProject, judgePolicy);

    const evaluationFailed = !judgeResult;
    const verdict = judgeResult?.verdict ?? 'evaluation_failed';
    const findings = [...(judgeResult?.findings ?? [])];
    if (evaluationFailed) {
      logger.warn('generation judge: judge output unparseable after retry — routing to human review', { runId: state.runId, chapter: state.chapter });
      findings.push({ severity: 'hard', text: 'judge output unparseable' });
    }

    // Contract violations ride the repair ladder as soft findings — they never harden the verdict.
    const compliance = renderedContract ? judgeResult?.endingCompliance : undefined;
    const endingCompliant = compliance ? compliance.compliant : true;
    if (compliance && !compliance.compliant) findings.push(...compliance.issues.map(issue => ({ severity: 'soft' as const, text: `ending contract: ${issue}` })));

    const briefCompliance = judgeResult?.briefCompliance;
    const briefCompliant = briefCompliance ? briefCompliance.compliant : false;
    if (briefCompliance && !briefCompliance.compliant) findings.push(...briefCompliance.issues.map(issue => ({ severity: 'soft' as const, text: `brief: ${issue}` })));
    else if (!briefCompliance) findings.push({ severity: 'soft' as const, text: 'brief: judge omitted briefCompliance — treated as non-compliant' });

    const readabilityIssues = judgeResult?.readabilityCompliance?.compliant === false ? judgeResult.readabilityCompliance.issues : [];
    findings.push(...readabilityIssues.map(issue => ({ severity: 'soft' as const, text: `${READABILITY_PREFIX}${issue}` })));
    const readabilityCompliant = readabilityIssues.length === 0;

    const knowledge = mergeKnowledgeCompliance(
      forbidden.length > 0 ? judgeResult?.knowledgeCompliance : undefined,
      forbidden.length > 0 ? scanKnowledgeLeaks(state.prose, forbidden) : [],
      forbidden,
    );
    findings.push(...knowledge.findings);
    findings.push(...state.mechanicalFindings);
    logger.debug('generation judge', {
      runId: state.runId,
      chapter: state.chapter,
      attempt: state.attempt,
      verdict,
      findings: findings.length,
      endingCompliant,
      knowledgeCompliant: knowledge.knowledgeCompliant,
      briefCompliant,
      readabilityCompliant,
    });

    if (state.draftId) {
      const reviewStatus = verdict === 'consistent' ? 'needs_review' : 'contradiction';
      const judgeNote = [...findings.map(f => `[${f.severity}] ${f.text}`), state.readabilityNote].filter(Boolean).join('\n');
      await setOpenDraftReview(db, state.draftId, { judge: verdict, judgeNote: judgeNote || null, reviewStatus });
    }

    return {
      verdict,
      findings,
      endingCompliant,
      knowledgeCompliant: knowledge.knowledgeCompliant,
      knowledgeWriterFindings: knowledge.writerFindings,
      briefCompliant,
      readabilityCompliant,
      writerClassRaised: judgePolicy.raised,
      nodeTrace: ['judge'],
    };
  }

  function writerSafeGuidance(disclosure: WriterDisclosurePolicy, guidance: string): string {
    return guidance ? disclosure.scrub(guidance, 'note') : guidance;
  }

  async function repairPatch(state: ChapterGenState) {
    const projectId = BigInt(state.projectId);
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    let renderedPack = '';
    if (state.contextPackId) {
      const pack = await db.query.contextPacks.findFirst({ where: eq(schema.contextPacks.id, BigInt(state.contextPackId)) });
      renderedPack = pack?.rendered ?? '';
    }

    const findingsStr = writerFacingFindings(state, await disclosureFor(projectId, state.chapter));
    const ctx: TelemetryContext = {
      projectId,
      runId: state.runId,
      node: 'repairPatch',
      promptKey: 'fix',
      promptVersion: PROMPT_REGISTRY.fix.version,
      role: 'fix',
      chapter: state.chapter,
    };

    const { policy, project } = await routeFor(projectId, 'repair', state, projectRow as ProjectConfig | undefined);
    const result = (await modelRouter.structured(PROMPT_REGISTRY.fix, { contextPack: renderedPack, prose: state.prose, findings: findingsStr }, ctx, project, policy)) as FixOutput;

    logger.debug('generation repairPatch', { runId: state.runId, chapter: state.chapter, attempt: state.attempt, action: result.action, patches: result.patches?.length ?? 0 });

    if (result.action === 'rewrite' && result.body) {
      return { prose: result.body, repairMode: 'rewrite' as const, patchApplied: false, writerClassRaised: policy.raised, nodeTrace: ['repairPatch'] };
    }

    if (result.action === 'patch' && result.patches && result.patches.length > 0) {
      let patched = state.prose;
      let allApplied = true;

      for (const patch of result.patches) {
        const occurrences = patched.split(patch.find).length - 1;
        if (occurrences !== 1) {
          allApplied = false;
          break;
        }
        patched = patched.replace(patch.find, patch.replace);
      }

      if (allApplied) {
        return {
          prose: patched,
          repairMode: 'patch' as const,
          patchApplied: true,
          attempt: state.attempt + 1,
          previousFindings: state.findings,
          writerClassRaised: policy.raised,
          nodeTrace: ['repairPatch'],
        };
      }
      logger.debug('generation repairPatch: a patch anchor was not uniquely found — falling back to rewrite', { runId: state.runId, chapter: state.chapter });
    }

    return { repairMode: 'rewrite' as const, patchApplied: false, writerClassRaised: policy.raised, nodeTrace: ['repairPatch'] };
  }

  async function repairRewrite(state: ChapterGenState) {
    const projectId = BigInt(state.projectId);
    const [brief, projectRow] = await Promise.all([
      db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, state.chapter)) }),
      db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);

    let stableContext = '';
    let volatileContext = '';
    if (state.contextPackId) {
      const pack = await db.query.contextPacks.findFirst({ where: eq(schema.contextPacks.id, BigInt(state.contextPackId)) });
      ({ renderedStable: stableContext, renderedVolatile: volatileContext } = splitSegments((pack?.sections as ContextSection[] | null) ?? []));
    }

    const disclosure = await disclosureFor(projectId, state.chapter);
    const findingsStr = writerFacingFindings(state, disclosure);
    const authorGuidance = writerSafeGuidance(disclosure, state.guidance);
    const guidance = authorGuidance ? `${authorGuidance}\n\nPrevious judge findings to avoid:\n${findingsStr}` : `Avoid these issues from the previous draft:\n${findingsStr}`;

    const ctx: TelemetryContext = {
      projectId,
      runId: state.runId,
      node: 'repairRewrite',
      promptKey: 'generation',
      promptVersion: PROMPT_REGISTRY.generation.version,
      role: 'generation',
      chapter: state.chapter,
    };

    const { policy, project } = await routeFor(projectId, 'draft', state, projectRow as ProjectConfig | undefined);
    const { chapterBrief, endingContract } = await loadWriterBrief(db, projectId, state.chapter, brief, disclosure);
    const wordTarget = resolveWordTarget(projectRow);
    const result = (await modelRouter.structured(
      PROMPT_REGISTRY.generation,
      { stableContext, volatileContext, chapterBrief, endingContract, guidance, ...generationWordTargetVars(wordTarget) },
      ctx,
      project,
      policy,
    )) as { title: string; body: string; summary: string; state?: GenerationState };
    const expansion = await expandShortDraft(modelRouter, { body: result.body, stableContext, volatileContext, chapterBrief, endingContract, guidance }, ctx, project, policy);
    logger.debug('generation repairRewrite', {
      runId: state.runId,
      chapter: state.chapter,
      attempt: state.attempt,
      draftWords: expansion.initialWords,
      words: expansion.finalWords,
      expansionPasses: expansion.passes,
    });

    return {
      prose: expansion.body,
      title: result.title || state.title,
      summary: result.summary,
      continuationState: result.state ?? {},
      attempt: state.attempt + 1,
      previousFindings: state.findings,
      repairMode: 'rewrite' as const,
      writerClassRaised: policy.raised,
      nodeTrace: ['repairRewrite'],
    };
  }

  async function accept(state: ChapterGenState) {
    if (state.draftId) {
      await setOpenDraftReview(db, state.draftId, { reviewStatus: 'needs_review' });
    }
    return { outcome: 'accepted', nodeTrace: ['accept'] };
  }

  async function acceptAsIs(state: ChapterGenState) {
    if (state.draftId) {
      await setOpenDraftReview(db, state.draftId, { reviewStatus: 'contradiction' });
    }
    return { outcome: 'accepted_with_findings', nodeTrace: ['acceptAsIs'] };
  }

  async function awaitReview(state: ChapterGenState) {
    if (state.draftId) {
      await setOpenDraftReview(db, state.draftId, { reviewStatus: 'contradiction' });
    }
    return { outcome: 'awaiting_review', nodeTrace: ['awaitReview'] };
  }

  // Every path that ends a run passes here, so this stores the terminal judge pass only; a review record failing must not fail the chapter.
  async function finish(state: ChapterGenState) {
    if (state.draftId) {
      const record = { projectId: BigInt(state.projectId), chapter: state.chapter, draftId: BigInt(state.draftId), runId: state.runId, body: state.prose };
      await recordGenerationJudge(db, { ...record, pass: { verdict: state.verdict, findings: state.findings } }).catch(err =>
        logger.warn('generation judge pass not recorded as a review', { err, runId: state.runId, chapter: state.chapter }),
      );
    }
    return { outcome: state.outcome, nodeTrace: ['finish'] };
  }

  return { assembleContext, draftChapter, persistDraft, mechanicalCheck, judge, repairPatch, repairRewrite, accept, acceptAsIs, awaitReview, finish };
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createChapterGenerationGraph(services: GraphServices) {
  const nodes = createChapterGenerationNodes(services);
  return new StateGraph(ChapterGenAnnotation)
    .addNode('assembleContext', nodes.assembleContext)
    .addNode('draftChapter', nodes.draftChapter)
    .addNode('persistDraft', nodes.persistDraft)
    .addNode('mechanicalCheck', nodes.mechanicalCheck)
    .addNode('judge', nodes.judge)
    .addNode('repairPatch', nodes.repairPatch)
    .addNode('repairRewrite', nodes.repairRewrite)
    .addNode('accept', nodes.accept)
    .addNode('acceptAsIs', nodes.acceptAsIs)
    .addNode('awaitReview', nodes.awaitReview)
    .addNode('finish', nodes.finish)
    .addEdge(START, 'assembleContext')
    .addEdge('assembleContext', 'draftChapter')
    .addEdge('draftChapter', 'persistDraft')
    .addEdge('persistDraft', 'mechanicalCheck')
    .addEdge('mechanicalCheck', 'judge')
    .addConditionalEdges('judge', routeAfterJudge, { accept: 'accept', awaitReview: 'awaitReview', acceptAsIs: 'acceptAsIs', repairPatch: 'repairPatch' })
    .addConditionalEdges('repairPatch', routeAfterPatch, { persistDraft: 'persistDraft', repairRewrite: 'repairRewrite' })
    .addEdge('repairRewrite', 'persistDraft')
    .addEdge('accept', 'finish')
    .addEdge('acceptAsIs', 'finish')
    .addEdge('awaitReview', 'finish')
    .addEdge('finish', END)
    .compile({ checkpointer: services.checkpointer });
}

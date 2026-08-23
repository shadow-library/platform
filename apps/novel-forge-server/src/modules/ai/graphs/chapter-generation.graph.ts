import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { AppError, Logger } from '@shadow-library/common';

import { renderChapterBrief } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { type KnowledgeLeakIssue, loadKnowledgeView, parseKnowledgeContract, renderForbiddenFacts, scanKnowledgeLeaks } from '../../bible/fact/knowledge-view';
import { type ContextAssembler } from '../context/context-assembler.service';
import { type ContextSection, splitSegments } from '../context/sections';
import { type ModelRouterService, type ProjectConfig } from '../model-router.service';
import { PROMPT_REGISTRY } from '../prompts';
import { type IndexingService } from '../retrieval/indexing.service';
import { type FixOutput, type JudgeOutput, JudgeSchema, renderEndingContract } from '../schemas';
import { parseSchema } from '../schemas/validate';
import { type TelemetryContext, type TelemetryHandler } from '../telemetry.handler';
import { runToolLoop } from '../tools/tool-loop';
import { type ToolRegistryService } from '../tools/tool-registry.service';
import { type ToolContext } from '../tools/types';
import { checkDraftMechanics } from './mechanical-check';

export interface GraphServices {
  db: PrimaryDatabase;
  contextAssembler: ContextAssembler;
  modelRouter: ModelRouterService;
  telemetry: TelemetryHandler;
  toolRegistry: ToolRegistryService;
  indexingService: IndexingService;
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
  continuationState: Annotation<Record<string, string>>({ reducer: (_, n) => n, default: () => ({}) }),
  verdict: Annotation<'consistent' | 'contradiction' | 'evaluation_failed' | null>({ reducer: (_, n) => n, default: () => null }),
  endingCompliant: Annotation<boolean>({ reducer: (_, n) => n, default: () => true }),
  knowledgeCompliant: Annotation<boolean>({ reducer: (_, n) => n, default: () => true }),
  mechanicallyCompliant: Annotation<boolean>({ reducer: (_, n) => n, default: () => true }),
  briefCompliant: Annotation<boolean>({ reducer: (_, n) => n, default: () => true }),
  mechanicalFindings: Annotation<JudgeFinding[]>({ reducer: (_, n) => n, default: () => [] }),
  findings: Annotation<JudgeFinding[]>({ reducer: (_, n) => n, default: () => [] }),
  previousFindings: Annotation<JudgeFinding[]>({ reducer: (_, n) => n, default: () => [] }),
  attempt: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  repairMode: Annotation<'patch' | 'rewrite'>({ reducer: (_, n) => n, default: () => 'patch' }),
  patchApplied: Annotation<boolean>({ reducer: (_, n) => n, default: () => false }),
  // outcome
  draftId: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  outcome: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  // The real path taken through the graph, in execution order — each node appends its own name so
  // repair-ladder detours (which a hardcoded happy-path list can never show) show up honestly.
  nodeTrace: Annotation<string[]>({ reducer: (a, n) => [...a, ...n], default: () => [] }),
});

type ChapterGenState = typeof ChapterGenAnnotation.State;
export type JudgeFinding = JudgeOutput['findings'][number];

const logger = Logger.getLogger(APP_NAME, 'chapter-generation.graph');

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

// Routing function after judge — exported for testing. Ending-contract, knowledge-leak, mechanical and
// brief-fulfillment violations ride the same repair ladder as continuity findings (refinement design §9.2,
// character-knowledge design §6, harness D32/D33) but never harden the verdict.
export function routeAfterJudge(
  state: Pick<ChapterGenState, 'verdict' | 'autoFix' | 'attempt' | 'maxFixes' | 'findings' | 'previousFindings'> & {
    endingCompliant?: boolean;
    knowledgeCompliant?: boolean;
    mechanicallyCompliant?: boolean;
    briefCompliant?: boolean;
  },
): string {
  const endingCompliant = state.endingCompliant !== false;
  const knowledgeCompliant = state.knowledgeCompliant !== false;
  const mechanicallyCompliant = state.mechanicallyCompliant !== false;
  const briefCompliant = state.briefCompliant !== false;
  if (state.verdict === 'evaluation_failed') return 'awaitReview';
  if (state.verdict === 'consistent' && endingCompliant && knowledgeCompliant && mechanicallyCompliant && briefCompliant) return 'accept';
  if (!state.autoFix) return 'awaitReview';
  if (state.attempt >= state.maxFixes || sameFinding(state.findings, state.previousFindings)) return 'acceptAsIs';
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
): { knowledgeCompliant: boolean; findings: JudgeFinding[] } {
  const issues = [...prescan.map(leak => `"${leak.term}" exposes [${leak.factKey}] — ${leak.excerpt}`), ...(compliance && !compliance.compliant ? compliance.issues : [])];
  return { knowledgeCompliant: issues.length === 0, findings: issues.map(issue => ({ severity: 'soft' as const, text: `knowledge leak: ${issue}` })) };
}

function extractJsonBlock(text: string): unknown {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          start = -1;
        }
      }
    }
  }
  return null;
}

function parseJudgeOutput(raw: string): JudgeOutput | null {
  const fromJson = parseSchema<JudgeOutput>(JudgeSchema, tryParseJson(raw));
  if (fromJson.success) return fromJson.data;
  const extracted = extractJsonBlock(raw);
  if (extracted) {
    const fromExtracted = parseSchema<JudgeOutput>(JudgeSchema, extracted);
    if (fromExtracted.success) return fromExtracted.data;
  }
  return null;
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return extractJsonBlock(raw);
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createChapterGenerationGraph(services: GraphServices) {
  const { db, contextAssembler, modelRouter, toolRegistry, checkpointer } = services;

  async function assembleContext(state: ChapterGenState) {
    const pack = await contextAssembler.forChapter(BigInt(state.projectId), state.chapter);
    // Link the pack to the run row so the run detail can show the prompt anatomy behind the tokens.
    if (pack.id !== null) await db.update(schema.workflowRuns).set({ contextPackId: pack.id }).where(eq(schema.workflowRuns.id, state.runId));
    return { contextPackId: pack.id ? String(pack.id) : null, nodeTrace: ['assembleContext'] };
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
    };

    const result = (await modelRouter.structured(
      PROMPT_REGISTRY.generation,
      { stableContext, volatileContext, chapterBrief: renderChapterBrief(brief), endingContract: renderEndingContract(brief?.endingContract), guidance: state.guidance },
      ctx,
      projectRow as ProjectConfig | undefined,
    )) as { title: string; body: string; summary: string; state?: Record<string, string> };

    let title = result.title ?? '';
    if (!title) {
      const titleCtx: TelemetryContext = { ...ctx, promptKey: 'title', node: 'draftChapter:title' };
      const titleResult = (await modelRouter.structured(PROMPT_REGISTRY.title, { prose: result.body.slice(0, 500) }, titleCtx)) as { title: string };
      title = titleResult.title ?? '';
    }

    logger.debug('generation draftChapter', { runId: state.runId, chapter: state.chapter, attempt: state.attempt, proseLength: result.body.length, title });
    return {
      prose: result.body,
      title,
      summary: result.summary,
      continuationState: (result.state ?? {}) as Record<string, string>,
      nodeTrace: ['draftChapter'],
    };
  }

  async function persistDraft(state: ChapterGenState) {
    const projectId = BigInt(state.projectId);
    const source = state.attempt === 0 ? 'generated' : state.repairMode === 'patch' ? 'patched' : 'rewritten';

    // Upsert the draft and record its revision in one transaction: the revision log must never
    // diverge from the draft it describes. `onConflictDoNothing` on the revision keeps the whole
    // node idempotent on checkpoint replay, but a real insert failure now rolls the draft back too.
    const draft = await db.transaction(async tx => {
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
        })
        .onConflictDoUpdate({
          target: [schema.drafts.projectId, schema.drafts.chapter],
          set: {
            title: sql`EXCLUDED.title`,
            body: sql`EXCLUDED.body`,
            summary: sql`EXCLUDED.summary`,
            state: sql`EXCLUDED.state`,
            revision: sql`drafts.revision + 1`,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!row) throw AppError.internal('[persistDraft] unexpected null result');

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

    return { draftId: String(draft.id), nodeTrace: ['persistDraft'] };
  }

  const MECHANICAL_PRIOR_WINDOW = 10;

  async function mechanicalCheck(state: ChapterGenState) {
    const priorChapters = await db.query.chapters.findMany({
      where: and(eq(schema.chapters.projectId, BigInt(state.projectId)), eq(schema.chapters.status, 'done'), lt(schema.chapters.number, state.chapter)),
      orderBy: [desc(schema.chapters.number)],
      limit: MECHANICAL_PRIOR_WINDOW,
      columns: { content: true },
    });

    const mechanicalFindings = checkDraftMechanics(state.prose, priorChapters.map(c => c.content ?? '').filter(Boolean));
    const mechanicallyCompliant = !mechanicalFindings.some(f => f.severity === 'hard');
    logger.debug('generation mechanicalCheck', {
      runId: state.runId,
      chapter: state.chapter,
      attempt: state.attempt,
      findings: mechanicalFindings.length,
      mechanicallyCompliant,
    });
    return { mechanicalFindings, mechanicallyCompliant, nodeTrace: ['mechanicalCheck'] };
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
    const model = modelRouter.chatFor('judge', projectRow as ProjectConfig | undefined);

    const renderedContract = renderEndingContract(brief?.endingContract);
    const contractBlock = renderedContract
      ? `\n\n## ENDING CONTRACT\n${renderedContract}\n\nAlso assess the draft ending against this contract and include endingCompliance in your JSON.`
      : '';

    // The judge — unlike the drafter — sees the full forbidden list (character-knowledge design §6):
    // asymmetric visibility is what lets it catch leaks the pack-level filtering cannot prevent.
    const knowledgeContract = parseKnowledgeContract(brief?.knowledgeContract);
    const knowledgeView = knowledgeContract ? await loadKnowledgeView(db, projectId, state.chapter, knowledgeContract) : null;
    const forbidden = knowledgeView?.hidden ?? [];
    const knowledgeBlock =
      forbidden.length > 0
        ? `\n\n## FORBIDDEN KNOWLEDGE\n${renderForbiddenFacts(forbidden)}\n\nThe POV cast does not know these facts — assess the draft for leaks and include knowledgeCompliance in your JSON.`
        : '';

    const povLine = brief?.pov ? `POV: ${brief.pov}\n` : '';
    const briefBlock = `\n\n## BRIEF\n${povLine}${brief?.body ?? ''}\n\nThis is the plan the chapter was written from — assess whether the draft delivers it and include briefCompliance in your JSON.`;

    const systemMsg = new SystemMessage(PROMPT_REGISTRY.judge.system);
    const humanMsg = new HumanMessage(
      `Context:\n${renderedPack}\n\n---\nDraft prose to evaluate:\n${state.prose}${briefBlock}${contractBlock}${knowledgeBlock}\n\nEvaluate this chapter draft for continuity and consistency with the established canon. Return a JSON object with verdict ("consistent" or "contradiction") and findings array.`,
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
    const briefCompliant = briefCompliance ? briefCompliance.compliant : true;
    if (briefCompliance && !briefCompliance.compliant) findings.push(...briefCompliance.issues.map(issue => ({ severity: 'soft' as const, text: `brief: ${issue}` })));

    const knowledge = mergeKnowledgeCompliance(
      forbidden.length > 0 ? judgeResult?.knowledgeCompliance : undefined,
      forbidden.length > 0 ? scanKnowledgeLeaks(state.prose, forbidden) : [],
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
    });

    if (state.draftId) {
      const reviewStatus = verdict === 'consistent' ? 'needs_review' : 'contradiction';
      const judgeNote = findings.map(f => `[${f.severity}] ${f.text}`).join('\n');
      await db
        .update(schema.drafts)
        .set({ judge: verdict, judgeNote: judgeNote || null, reviewStatus, updatedAt: new Date() })
        .where(eq(schema.drafts.id, BigInt(state.draftId)));
    }

    return { verdict, findings, endingCompliant, knowledgeCompliant: knowledge.knowledgeCompliant, briefCompliant, nodeTrace: ['judge'] };
  }

  async function repairPatch(state: ChapterGenState) {
    const projectId = BigInt(state.projectId);
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });

    let renderedPack = '';
    if (state.contextPackId) {
      const pack = await db.query.contextPacks.findFirst({ where: eq(schema.contextPacks.id, BigInt(state.contextPackId)) });
      renderedPack = pack?.rendered ?? '';
    }

    const findingsStr = state.findings.map(f => `[${f.severity}] ${f.text}`).join('\n');
    const ctx: TelemetryContext = { projectId, runId: state.runId, node: 'repairPatch', promptKey: 'fix', promptVersion: '1.0.0', role: 'fix' };

    const result = (await modelRouter.structured(
      PROMPT_REGISTRY.fix,
      { contextPack: renderedPack, prose: state.prose, findings: findingsStr },
      ctx,
      projectRow as ProjectConfig | undefined,
    )) as FixOutput;

    logger.debug('generation repairPatch', { runId: state.runId, chapter: state.chapter, attempt: state.attempt, action: result.action, patches: result.patches?.length ?? 0 });

    if (result.action === 'rewrite' && result.body) {
      return { prose: result.body, repairMode: 'rewrite' as const, patchApplied: false, nodeTrace: ['repairPatch'] };
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
        return { prose: patched, repairMode: 'patch' as const, patchApplied: true, attempt: state.attempt + 1, previousFindings: state.findings, nodeTrace: ['repairPatch'] };
      }
      logger.debug('generation repairPatch: a patch anchor was not uniquely found — falling back to rewrite', { runId: state.runId, chapter: state.chapter });
    }

    // Patch failed — fall through to rewrite.
    return { repairMode: 'rewrite' as const, patchApplied: false, nodeTrace: ['repairPatch'] };
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

    const findingsStr = state.findings.map(f => `[${f.severity}] ${f.text}`).join('\n');
    const guidance = state.guidance ? `${state.guidance}\n\nPrevious judge findings to avoid:\n${findingsStr}` : `Avoid these issues from the previous draft:\n${findingsStr}`;

    const ctx: TelemetryContext = {
      projectId,
      runId: state.runId,
      node: 'repairRewrite',
      promptKey: 'generation',
      promptVersion: PROMPT_REGISTRY.generation.version,
      role: 'generation',
    };

    const result = (await modelRouter.structured(
      PROMPT_REGISTRY.generation,
      { stableContext, volatileContext, chapterBrief: renderChapterBrief(brief), endingContract: renderEndingContract(brief?.endingContract), guidance },
      ctx,
      projectRow as ProjectConfig | undefined,
    )) as { title: string; body: string; summary: string; state?: Record<string, string> };

    return {
      prose: result.body,
      title: result.title || state.title,
      summary: result.summary,
      continuationState: (result.state ?? {}) as Record<string, string>,
      attempt: state.attempt + 1,
      previousFindings: state.findings,
      repairMode: 'patch' as const,
      nodeTrace: ['repairRewrite'],
    };
  }

  async function accept(state: ChapterGenState) {
    if (state.draftId) {
      await db
        .update(schema.drafts)
        .set({ reviewStatus: 'needs_review', updatedAt: new Date() })
        .where(eq(schema.drafts.id, BigInt(state.draftId)));
    }
    return { outcome: 'accepted', nodeTrace: ['accept'] };
  }

  async function acceptAsIs(state: ChapterGenState) {
    if (state.draftId) {
      await db
        .update(schema.drafts)
        .set({ reviewStatus: 'contradiction', updatedAt: new Date() })
        .where(eq(schema.drafts.id, BigInt(state.draftId)));
    }
    return { outcome: 'accepted_with_findings', nodeTrace: ['acceptAsIs'] };
  }

  async function awaitReview(state: ChapterGenState) {
    if (state.draftId) {
      await db
        .update(schema.drafts)
        .set({ reviewStatus: 'contradiction', updatedAt: new Date() })
        .where(eq(schema.drafts.id, BigInt(state.draftId)));
    }
    return { outcome: 'awaiting_review', nodeTrace: ['awaitReview'] };
  }

  function finish(state: ChapterGenState) {
    return { outcome: state.outcome, nodeTrace: ['finish'] };
  }

  return new StateGraph(ChapterGenAnnotation)
    .addNode('assembleContext', assembleContext)
    .addNode('draftChapter', draftChapter)
    .addNode('persistDraft', persistDraft)
    .addNode('mechanicalCheck', mechanicalCheck)
    .addNode('judge', judge)
    .addNode('repairPatch', repairPatch)
    .addNode('repairRewrite', repairRewrite)
    .addNode('accept', accept)
    .addNode('acceptAsIs', acceptAsIs)
    .addNode('awaitReview', awaitReview)
    .addNode('finish', finish)
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
    .compile({ checkpointer });
}

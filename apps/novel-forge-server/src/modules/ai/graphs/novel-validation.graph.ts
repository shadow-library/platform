import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph';
import { and, eq } from 'drizzle-orm';
import { Logger } from '@shadow-library/common';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { type ContextAssembler } from '../context/context-assembler.service';
import { type ModelRouterService, type ProjectConfig } from '../model-router.service';
import { PROMPT_REGISTRY } from '../prompts';
import { type IndexingService } from '../retrieval/indexing.service';
import { type ValidationOutput, ValidationSchema } from '../schemas';
import { parseSchema } from '../schemas/validate';
import { type TelemetryHandler } from '../telemetry.handler';
import { runToolLoop } from '../tools/tool-loop';
import { type ToolRegistryService } from '../tools/tool-registry.service';
import { type ToolContext } from '../tools/types';

export interface ValidationServices {
  db: PrimaryDatabase;
  contextAssembler: ContextAssembler;
  modelRouter: ModelRouterService;
  telemetry: TelemetryHandler;
  toolRegistry: ToolRegistryService;
  indexingService: IndexingService;
  checkpointer: BaseCheckpointSaver;
}

interface WindowSpec {
  from: number;
  to: number;
}

export interface NovelValidationReport extends ValidationOutput {
  windowsRequested: number;
  windowsSucceeded: number;
  failedRanges: WindowSpec[];
}

const NovelValidationAnnotation = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, n) => n, default: () => '0' }),
  runId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  windows: Annotation<WindowSpec[]>({ reducer: (_, n) => n, default: () => [] }),
  windowFindings: Annotation<ValidationOutput[]>({ reducer: (_, n) => n, default: () => [] }),
  succeededWindows: Annotation<WindowSpec[]>({ reducer: (_, n) => n, default: () => [] }),
  failedWindows: Annotation<WindowSpec[]>({ reducer: (_, n) => n, default: () => [] }),
  report: Annotation<NovelValidationReport | null>({ reducer: (_, n) => n, default: () => null }),
  outcome: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
});

type ValidationState = typeof NovelValidationAnnotation.State;

const DEFAULT_WINDOW_SIZE = 20;
const logger = Logger.getLogger(APP_NAME, 'novel-validation.graph');

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

function tryParseValidation(raw: string): ValidationOutput | null {
  try {
    const parsed = parseSchema<ValidationOutput>(ValidationSchema, JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // try extraction
  }
  const extracted = extractJsonBlock(raw);
  if (extracted) {
    const parsed = parseSchema<ValidationOutput>(ValidationSchema, extracted);
    if (parsed.success) return parsed.data;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createNovelValidationGraph(services: ValidationServices) {
  const { db, contextAssembler, modelRouter, toolRegistry, checkpointer } = services;

  async function planWindows(state: ValidationState) {
    const projectId = BigInt(state.projectId);

    const chapterRows = await db.query.chapters.findMany({
      where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done')),
      orderBy: schema.chapters.number,
      columns: { number: true },
    });

    if (chapterRows.length === 0) return { windows: [] };

    const volumeRows = await db.query.volumes.findMany({ where: eq(schema.volumes.projectId, projectId), orderBy: schema.volumes.ordinal });

    const windows: WindowSpec[] = [];
    const chapterNums = chapterRows.map(c => c.number);
    const minCh = chapterNums[0] ?? 1;
    const maxCh = chapterNums[chapterNums.length - 1] ?? 1;

    if (volumeRows.length > 0) {
      for (const vol of volumeRows) {
        const from = vol.startChapter ?? minCh;
        const to = vol.endChapter ?? maxCh;
        if (from <= maxCh) windows.push({ from, to: Math.min(to, maxCh) });
      }
    } else {
      // Default: slide by DEFAULT_WINDOW_SIZE.
      for (let from = minCh; from <= maxCh; from += DEFAULT_WINDOW_SIZE) {
        windows.push({ from, to: Math.min(from + DEFAULT_WINDOW_SIZE - 1, maxCh) });
      }
    }

    logger.debug('validation planWindows', { runId: state.runId, chapters: chapterRows.length, windows: windows.length });
    return { windows };
  }

  async function validateWindows(state: ValidationState) {
    const projectId = BigInt(state.projectId);
    const allFindings: ValidationOutput[] = [];
    const succeededWindows: WindowSpec[] = [];
    const failedWindows: WindowSpec[] = [];

    for (const window of state.windows) {
      try {
        const pack = await contextAssembler.forValidationWindow(projectId, window.from, window.to);

        const toolCtx: ToolContext = {
          chapter: null,
          db: { query: db.query, select: db.select.bind(db) },
          node: 'validateWindow',
          projectId,
          retrieval: services.indexingService as never,
          runId: state.runId || '',
        };

        const tools = toolRegistry.forNode('validateWindow', toolCtx);
        const rawTools = toolRegistry.getRaw('validateWindow');
        const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
        const model = modelRouter.chatFor('validation', projectRow as ProjectConfig | undefined);

        const systemMsg = new SystemMessage(PROMPT_REGISTRY.validation.system);
        const humanMsg = new HumanMessage(
          `Validate the following chapters (${window.from}-${window.to}) for continuity and consistency issues:\n\n${pack.rendered}\n\nReturn a JSON object with issues array and summary.`,
        );

        const { messages } = await runToolLoop(model, tools, rawTools, [systemMsg, humanMsg], toolCtx, db as never);

        const lastAi = [...messages].reverse().find(m => m instanceof AIMessage || m._getType() === 'ai');
        const rawContent = lastAi ? (typeof lastAi.content === 'string' ? lastAi.content : JSON.stringify(lastAi.content)) : '{}';
        const findings = tryParseValidation(rawContent);
        if (!findings) throw new Error(`unable to parse validation output for window ${window.from}-${window.to}`);
        allFindings.push(findings);
        succeededWindows.push(window);
      } catch (err) {
        logger.warn('validateWindows: window failed (non-fatal)', { err, window });
        failedWindows.push(window);
      }
    }

    return { windowFindings: allFindings, succeededWindows, failedWindows };
  }

  async function mergeFindings(state: ValidationState) {
    const seen = new Set<string>();
    const deduplicated: ValidationOutput['issues'] = [];

    for (const wf of state.windowFindings) {
      for (const issue of wf.issues) {
        const key = issue.description.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          deduplicated.push(issue);
        }
      }
    }

    deduplicated.sort((a, b) => (a.severity === 'error' && b.severity !== 'error' ? -1 : b.severity === 'error' && a.severity !== 'error' ? 1 : 0));

    const windowsRequested = state.windows.length;
    const windowsSucceeded = state.succeededWindows.length;
    const failedRanges = state.failedWindows.map(w => ({ from: w.from, to: w.to }));

    const summary =
      state.windowFindings
        .map(wf => wf.summary)
        .filter(Boolean)
        .join(' | ') || (windowsRequested > 0 && windowsSucceeded === 0 ? `No windows could be validated this run (0/${windowsRequested} succeeded).` : 'No issues found.');
    const report: NovelValidationReport = { issues: deduplicated, summary, windowsRequested, windowsSucceeded, failedRanges };

    logger.debug('validation mergeFindings', {
      runId: state.runId,
      windowsRequested,
      windowsSucceeded,
      failedRanges: failedRanges.length,
      issues: deduplicated.length,
      errors: deduplicated.filter(i => i.severity === 'error').length,
    });
    return { report };
  }

  async function persistReport(state: ValidationState) {
    const projectId = BigInt(state.projectId);
    const report = state.report;
    const issues = report?.issues ?? [];

    logger.info('validation persistReport', {
      runId: state.runId,
      issues: issues.length,
      windowsRequested: report?.windowsRequested ?? 0,
      windowsSucceeded: report?.windowsSucceeded ?? 0,
    });

    // Durably record the report — the run outcome alone is not queryable canon.
    await db.insert(schema.validationReports).values({
      projectId,
      scope: 'novel',
      chapter: null,
      issues: issues.length,
      summary: report?.summary ?? null,
      payload: (report ?? { issues: [], summary: '', windowsRequested: 0, windowsSucceeded: 0, failedRanges: [] }) as never,
    });

    // Only chapters inside a window that was actually, successfully validated this run may have
    // needsRevalidation touched — a failed or unrequested window must leave an earlier flag alone.
    const coveredChapters = new Set<number>();
    for (const w of state.succeededWindows) for (let n = w.from; n <= w.to; n++) coveredChapters.add(n);

    if (coveredChapters.size > 0) {
      const errorChapters = new Set(issues.filter(i => i.severity === 'error' && typeof i.chapter === 'number').map(i => i.chapter));
      const finalized = await db.query.chapters.findMany({ where: and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.status, 'done')), columns: { number: true } });
      for (const ch of finalized) {
        if (!coveredChapters.has(ch.number)) continue;
        await db
          .update(schema.chapters)
          .set({ needsRevalidation: errorChapters.has(ch.number), updatedAt: new Date() })
          .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, ch.number)));
      }
    }

    return { outcome: JSON.stringify(state.report) };
  }

  return new StateGraph(NovelValidationAnnotation)
    .addNode('planWindows', planWindows)
    .addNode('validateWindows', validateWindows)
    .addNode('mergeFindings', mergeFindings)
    .addNode('persistReport', persistReport)
    .addEdge(START, 'planWindows')
    .addEdge('planWindows', 'validateWindows')
    .addEdge('validateWindows', 'mergeFindings')
    .addEdge('mergeFindings', 'persistReport')
    .addEdge('persistReport', END)
    .compile({ checkpointer });
}

import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { ContextAssembler } from '../context/context-assembler.service';
import { ModelRouterService } from '../model-router.service';
import { IndexingService } from '../retrieval/indexing.service';
import { TelemetryHandler } from '../telemetry.handler';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { type BibleBuilderServices, createBibleBuilderGraph } from './bible-builder.graph';
import { createChapterFinalizationGraph, type FinalizationServices } from './chapter-finalization.graph';
import { createChapterGenerationGraph, type GraphServices } from './chapter-generation.graph';
import { createChapterRebrandGraph, type RebrandGraphServices } from './chapter-rebrand.graph';
import { createChapterReforgeGraph, type ReforgeGraphServices } from './chapter-reforge.graph';
import { createNovelValidationGraph, type ValidationServices } from './novel-validation.graph';
import { createSourceExtractionGraph, type ExtractionServices } from './source-extraction.graph';

export interface ChapterGenerationInput {
  projectId: bigint;
  chapter: number;
  volumeKey?: string;
  guidance?: string;
  autoFix?: boolean;
  maxFixes?: number;
  jobId?: string;
}

export interface ChapterFinalizationInput {
  projectId: bigint;
  chapter: number;
  draftId?: bigint;
  prose: string;
  summary: string;
  title?: string;
  continuationState?: Record<string, string>;
  generator?: string;
  jobId?: string;
}

export interface BibleBuilderInput {
  projectId: bigint;
  brief: string;
  force?: boolean;
  jobId?: string;
}

export interface SourceExtractionInput {
  projectId: bigint;
  chapter: number;
  jobId?: string;
}

export interface RebrandChapterInput {
  projectId: bigint;
  chapter: number;
  jobId?: string;
}

export interface ReforgeChapterInput {
  projectId: bigint;
  chapter: number;
  jobId?: string;
}

export interface NovelValidationInput {
  projectId: bigint;
  jobId?: string;
}

export interface WorkflowRunResult {
  runId: string;
  outcome: string;
  status: string;
}

// LangGraph's PostgresSaver opens its own raw connection pool and needs a plain connection string,
// which the injected DatabaseService does not expose. Read the same canonical env key the
// DatabaseModule is configured from rather than Config.get (which returns undefined until the module
// registers the key lazily on first connect — a wrong-DB fallback risk here).
const DB_URL = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';

// jsonb columns serialise via JSON.stringify, which throws on bigint. Every workflow input carries
// bigint identifiers (projectId, draftId), so coerce them to strings before the row is persisted.
function toJsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val)));
}

@Injectable()
export class WorkflowRunService {
  private readonly logger = Logger.getLogger(APP_NAME, WorkflowRunService.name);
  private readonly db: PrimaryDatabase;
  private readonly checkpointer: PostgresSaver;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly contextAssembler: ContextAssembler,
    private readonly modelRouter: ModelRouterService,
    private readonly telemetry: TelemetryHandler,
    private readonly toolRegistry: ToolRegistryService,
    private readonly indexingService: IndexingService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
    this.checkpointer = PostgresSaver.fromConnString(DB_URL);
  }

  async onModuleInit(): Promise<void> {
    // Ensure the LangGraph checkpoint tables exist for the connected database (idempotent).
    await this.checkpointer.setup();
  }

  private get graphServices(): GraphServices {
    return {
      db: this.db,
      contextAssembler: this.contextAssembler,
      modelRouter: this.modelRouter,
      telemetry: this.telemetry,
      toolRegistry: this.toolRegistry,
      indexingService: this.indexingService,
      checkpointer: this.checkpointer,
    };
  }

  // Create a workflow_run row, or reuse the one left behind by a crashed prior attempt of the same
  // job/target. Reusing its id (used as the checkpoint thread_id) is what lets a retried job resume
  // from the last completed graph node instead of re-executing — and re-calling — the LLM.
  private async createRun(projectId: bigint, graph: string, target: string, input: unknown, jobId?: string): Promise<string> {
    if (jobId) {
      const existing = await this.db.query.workflowRuns.findFirst({
        where: and(eq(schema.workflowRuns.jobId, jobId), eq(schema.workflowRuns.graph, graph), eq(schema.workflowRuns.target, target), eq(schema.workflowRuns.status, 'running')),
        columns: { id: true },
      });
      if (existing) {
        this.logger.warn('Resuming existing workflow run from checkpoint after crash', { runId: existing.id, jobId, graph, target });
        return existing.id;
      }
    }

    const [run] = await this.db
      .insert(schema.workflowRuns)
      .values({ projectId, graph, target, status: 'running', input: toJsonSafe(input) as never, jobId: jobId ?? null, nodeTrace: [] })
      .returning({ id: schema.workflowRuns.id });
    if (!run) throw AppError.internal(`[WorkflowRunService] Failed to create workflow_run row`);
    this.logger.info('workflow run created', { runId: run.id, projectId, graph, target, jobId });
    this.logger.debug('workflow run input', { runId: run.id, graph, input });
    return run.id;
  }

  private async completeRun(runId: string, outcome: string | null, status: 'completed' | 'awaiting_review', nodeTrace: string[]): Promise<void> {
    this.logger.info('workflow run finished', { runId, status, outcome });
    this.logger.debug('workflow run node trace', { runId, nodeTrace });
    await this.db
      .update(schema.workflowRuns)
      .set({ status, outcome: outcome ?? undefined, endedAt: new Date(), nodeTrace: nodeTrace as never })
      .where(eq(schema.workflowRuns.id, runId));
  }

  private async failRun(runId: string, err: unknown, node?: string): Promise<void> {
    const error = err instanceof Error ? { class: err.constructor.name, message: err.message, node } : { class: 'UnknownError', message: String(err), node };
    this.logger.debug('persisting workflow run failure', { runId, node, error });
    await this.db
      .update(schema.workflowRuns)
      .set({ status: 'failed', error: error as never, endedAt: new Date() })
      .where(eq(schema.workflowRuns.id, runId));
  }

  /**
   * Records which context pack fed this run's prompt — the run detail uses it to explain the input
   * tokens (the pack, not the user's one-line message, is where they go). Call it from every chain
   * or node that assembles a pack for the run.
   */
  async linkContextPack(runId: string, contextPackId: bigint | null): Promise<void> {
    if (contextPackId === null) return;
    await this.db.update(schema.workflowRuns).set({ contextPackId }).where(eq(schema.workflowRuns.id, runId));
  }

  /**
   * Runs a plain (non-graph, non-checkpointed) chain under workflow_runs bookkeeping — the rule-11
   * seam for the refinement chains (chat-turn, premise-enhance, bible-audit, arc-plan): every turn
   * gets a fresh runId that correlates its model_calls and context pack, and failures land in the
   * same audit trail as graph runs.
   */
  async runChain<T>(projectId: bigint, graph: string, target: string, input: unknown, fn: (runId: string) => Promise<T>): Promise<{ runId: string; result: T }> {
    const runId = await this.createRun(projectId, graph, target, input);
    try {
      const result = await fn(runId);
      await this.completeRun(runId, 'completed', 'completed', [graph]);
      return { runId, result };
    } catch (err) {
      await this.failRun(runId, err, graph);
      throw err;
    }
  }

  async runChapterGeneration(input: ChapterGenerationInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'chapter-generation', `chapter-${input.chapter}`, input, input.jobId);
    const nodeTrace: string[] = [];

    try {
      const graph = createChapterGenerationGraph(this.graphServices);
      const rawState = await graph.invoke(
        {
          projectId: String(input.projectId),
          chapter: input.chapter,
          volumeKey: input.volumeKey ?? '',
          guidance: input.guidance ?? '',
          autoFix: input.autoFix ?? false,
          maxFixes: input.maxFixes ?? 3,
          runId,
        },
        { configurable: { thread_id: runId } },
      );
      const finalState = rawState as unknown as { outcome: string | null };
      const outcome = finalState.outcome ?? 'completed';
      const status: 'completed' | 'awaiting_review' = outcome === 'awaiting_review' ? 'awaiting_review' : 'completed';
      nodeTrace.push('assembleContext', 'draftChapter', 'persistDraft', 'judge', 'finish');

      await this.completeRun(runId, outcome, status, nodeTrace);
      return { runId, outcome, status };
    } catch (err) {
      this.logger.error('runChapterGeneration failed', { err, runId });
      await this.failRun(runId, err);
      return { runId, outcome: 'failed', status: 'failed' };
    }
  }

  async runChapterFinalization(input: ChapterFinalizationInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'chapter-finalization', `chapter-${input.chapter}`, input, input.jobId);
    const nodeTrace: string[] = [];

    try {
      const graph = createChapterFinalizationGraph(this.graphServices as FinalizationServices);
      await graph.invoke(
        {
          projectId: String(input.projectId),
          chapter: input.chapter,
          draftId: input.draftId ? String(input.draftId) : null,
          prose: input.prose,
          summary: input.summary,
          title: input.title ?? '',
          continuationState: input.continuationState ?? {},
          generator: input.generator ?? 'standard',
          runId,
        },
        { configurable: { thread_id: runId } },
      );

      nodeTrace.push('guard', 'commitProse', 'extractContinuity', 'applyContinuity', 'updateIndexes', 'advanceCursor', 'finish');
      await this.completeRun(runId, 'completed', 'completed', nodeTrace);
      return { runId, outcome: 'completed', status: 'completed' };
    } catch (err) {
      this.logger.error('runChapterFinalization failed', { err, runId });
      await this.failRun(runId, err);
      return { runId, outcome: 'failed', status: 'failed' };
    }
  }

  async runBibleBuilder(input: BibleBuilderInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'bible-builder', 'all-stages', input, input.jobId);
    const nodeTrace: string[] = [];

    try {
      const graph = createBibleBuilderGraph(this.graphServices as BibleBuilderServices);
      await graph.invoke({ projectId: String(input.projectId), brief: input.brief, force: input.force ?? false, runId }, { configurable: { thread_id: runId } });

      nodeTrace.push('foundation', 'worldAndPower', 'factionsAndLocations', 'characters', 'plot', 'volumes', 'indexLore');
      await this.completeRun(runId, 'completed', 'completed', nodeTrace);
      return { runId, outcome: 'completed', status: 'completed' };
    } catch (err) {
      this.logger.error('runBibleBuilder failed', { err, runId });
      await this.failRun(runId, err);
      return { runId, outcome: 'failed', status: 'failed' };
    }
  }

  async runSourceExtraction(input: SourceExtractionInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'source-extraction', `chapter-${input.chapter}`, input, input.jobId);
    const nodeTrace: string[] = [];

    try {
      const graph = createSourceExtractionGraph(this.graphServices as ExtractionServices);
      await graph.invoke({ projectId: String(input.projectId), chapter: input.chapter, runId }, { configurable: { thread_id: runId } });

      nodeTrace.push('loadChapter', 'extractKnowledge', 'persistKnowledge', 'embedProse', 'finish');
      await this.completeRun(runId, 'completed', 'completed', nodeTrace);
      return { runId, outcome: 'completed', status: 'completed' };
    } catch (err) {
      this.logger.error('runSourceExtraction failed', { err, runId });
      await this.failRun(runId, err);
      return { runId, outcome: 'failed', status: 'failed' };
    }
  }

  async runChapterRebrand(input: RebrandChapterInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'chapter-rebrand', `chapter-${input.chapter}`, input, input.jobId);
    const nodeTrace: string[] = [];

    try {
      const graph = createChapterRebrandGraph(this.graphServices as RebrandGraphServices);
      const rawState = await graph.invoke({ projectId: String(input.projectId), chapter: input.chapter, runId }, { configurable: { thread_id: runId } });
      const outcome = (rawState as unknown as { outcome: string | null }).outcome ?? 'converted';

      nodeTrace.push('loadChapter', 'assembleContext', 'convert', 'residueScan', 'audit', 'persistConversion', 'mergeGlossary', 'finish');
      await this.completeRun(runId, outcome, 'completed', nodeTrace);
      return { runId, outcome, status: 'completed' };
    } catch (err) {
      this.logger.error('runChapterRebrand failed', { err, runId });
      await this.failRun(runId, err);
      return { runId, outcome: 'failed', status: 'failed' };
    }
  }

  async runChapterReforge(input: ReforgeChapterInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'chapter-reforge', `chapter-${input.chapter}`, input, input.jobId);
    const nodeTrace: string[] = [];

    try {
      const graph = createChapterReforgeGraph(this.graphServices as ReforgeGraphServices);
      const rawState = await graph.invoke({ projectId: String(input.projectId), chapter: input.chapter, runId }, { configurable: { thread_id: runId } });
      const outcome = (rawState as unknown as { outcome: string | null }).outcome ?? 'reforged';

      nodeTrace.push('loadChapter', 'outlineContext', 'generateOutline', 'writeContext', 'write', 'residueScan', 'judge', 'persistReforge', 'mergeGlossary', 'finish');
      await this.completeRun(runId, outcome, 'completed', nodeTrace);
      return { runId, outcome, status: 'completed' };
    } catch (err) {
      this.logger.error('runChapterReforge failed', { err, runId });
      await this.failRun(runId, err);
      return { runId, outcome: 'failed', status: 'failed' };
    }
  }

  async runNovelValidation(input: NovelValidationInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'novel-validation', 'full-novel', input, input.jobId);
    const nodeTrace: string[] = [];

    try {
      const graph = createNovelValidationGraph(this.graphServices as ValidationServices);
      const rawState = await graph.invoke({ projectId: String(input.projectId), runId }, { configurable: { thread_id: runId } });
      const outcome = (rawState as unknown as { outcome?: string | null }).outcome ?? 'completed';
      nodeTrace.push('planWindows', 'validateWindows', 'mergeFindings', 'persistReport');

      await this.completeRun(runId, outcome, 'completed', nodeTrace);
      return { runId, outcome, status: 'completed' };
    } catch (err) {
      this.logger.error('runNovelValidation failed', { err, runId });
      await this.failRun(runId, err);
      return { runId, outcome: 'failed', status: 'failed' };
    }
  }
}

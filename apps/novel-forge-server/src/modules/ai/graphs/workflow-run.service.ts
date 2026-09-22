import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { ProjectEventService } from '../../events/project-event.service';
import { PluginPolicyService } from '../../plugins/plugin-policy.service';
import { ContextAssembler } from '../context/context-assembler.service';
import { ModelRouterService } from '../model-router.service';
import { IndexingService } from '../retrieval/indexing.service';
import { type GenerationState } from '../schemas';
import { TelemetryHandler } from '../telemetry.handler';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { type BibleBuilderServices, createBibleBuilderGraph } from './bible-builder.graph';
import { createChapterFinalizationGraph, type FinalizationServices } from './chapter-finalization.graph';
import { createChapterGenerationGraph, type GraphServices } from './chapter-generation.graph';
import { createChapterRebrandGraph, type RebrandGraphServices } from './chapter-rebrand.graph';
import { createChapterReforgeGraph, type ReforgeGraphServices } from './chapter-reforge.graph';
import { createChapterTranslationGraph, type TranslationGraphServices } from './chapter-translation.graph';
import { createSpanTransformGraph, type SpanTransformServices } from './span-transform.graph';
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
  continuationState?: GenerationState;
  generator?: string;
  isolated?: boolean;
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

export interface TranslationChapterInput {
  projectId: bigint;
  chapter: number;
  jobId?: string;
}

export interface SpanTransformInput {
  projectId: bigint;
  planId: bigint;
  outputChapter: number;
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
  /** Bible-builder only: stages a non-force run left untouched because a document already had content. */
  skippedStages?: string[];
}

const SKIPPED_STAGE_MARKER = 'skipped:';

export interface RunTrace {
  nodeTrace: string[];
  skippedStages: string[];
}

// No dedicated column for a skipped stage, so it rides the persisted node trace as a marker entry.
export function splitRunTrace(persisted: readonly string[] | null): RunTrace {
  const nodeTrace: string[] = [];
  const skippedStages: string[] = [];
  for (const entry of persisted ?? []) {
    if (entry.startsWith(SKIPPED_STAGE_MARKER)) skippedStages.push(entry.slice(SKIPPED_STAGE_MARKER.length));
    else nodeTrace.push(entry);
  }
  return { nodeTrace, skippedStages };
}

interface GraphOutcome {
  outcome: string;
  status: 'completed' | 'awaiting_review';
  nodeTrace: string[];
  skippedStages?: string[];
}

// LangGraph's PostgresSaver opens its own raw connection pool and needs a plain connection string,
// which the injected DatabaseService does not expose. Read the same canonical env key the
// DatabaseModule is configured from rather than Config.get (which returns undefined until the module
// registers the key lazily on first connect — a wrong-DB fallback risk here).
const DB_URL = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';

// Each segment of a chapter is its own superstep and every repair pass replays the flagged ones, so the
// LangGraph default of 25 aborts any real chapter mid-translation — and an abort here loses a fully
// translated chapter as a failed run. This covers segments x (MAX_REPAIRS_CEILING + 1) + the fixed nodes
// up to a 32-segment chapter, i.e. ~57k source tokens at the default 1,800-token segment size.
const TRANSLATION_RECURSION_LIMIT = 150;

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
    private readonly pluginPolicy: PluginPolicyService,
    private readonly events: ProjectEventService,
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
      pluginPolicy: this.pluginPolicy,
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
    this.events.publish(projectId, { type: 'run', runId: run.id, graph, target, status: 'running' });
    this.logger.debug('workflow run input', { runId: run.id, graph, input });
    return run.id;
  }

  // Every settle carries the `running` predicate: a run is written once, by whichever path reaches it
  // first, so a late finish cannot reopen a cancelled row and leave the audit trail lying about it.
  private async completeRun(runId: string, outcome: string | null, status: 'completed' | 'awaiting_review', nodeTrace: string[], skippedStages?: string[]): Promise<void> {
    this.logger.info('workflow run finished', { runId, status, outcome });
    const persistedTrace = skippedStages?.length ? [...nodeTrace, ...skippedStages.map(stage => `${SKIPPED_STAGE_MARKER}${stage}`)] : nodeTrace;
    this.logger.debug('workflow run node trace', { runId, nodeTrace: persistedTrace });
    const [run] = await this.db
      .update(schema.workflowRuns)
      .set({ status, outcome: outcome ?? undefined, endedAt: new Date(), nodeTrace: persistedTrace as never })
      .where(and(eq(schema.workflowRuns.id, runId), eq(schema.workflowRuns.status, 'running')))
      .returning({ projectId: schema.workflowRuns.projectId, graph: schema.workflowRuns.graph, target: schema.workflowRuns.target });
    if (run) this.events.publish(run.projectId, { type: 'run', runId, graph: run.graph, target: run.target, status });
  }

  private async failRun(runId: string, err: unknown, node?: string): Promise<void> {
    const code = err instanceof AppError ? err.code : undefined;
    const error = err instanceof Error ? { class: err.constructor.name, message: err.message, code, node } : { class: 'UnknownError', message: String(err), node };
    this.logger.debug('persisting workflow run failure', { runId, node, error });
    const [run] = await this.db
      .update(schema.workflowRuns)
      .set({ status: 'failed', error: error as never, endedAt: new Date() })
      .where(and(eq(schema.workflowRuns.id, runId), eq(schema.workflowRuns.status, 'running')))
      .returning({ projectId: schema.workflowRuns.projectId, graph: schema.workflowRuns.graph, target: schema.workflowRuns.target });
    if (run) this.events.publish(run.projectId, { type: 'run', runId, graph: run.graph, target: run.target, status: 'failed' });
  }

  // Terminal and non-retrying: the run keeps whatever it already persisted.
  private async cancelRun(runId: string, nodeTrace?: string[]): Promise<void> {
    this.logger.info('workflow run cancelled', { runId });
    const [run] = await this.db
      .update(schema.workflowRuns)
      .set({ status: 'cancelled', outcome: 'cancelled', endedAt: new Date(), ...(nodeTrace?.length ? { nodeTrace: nodeTrace as never } : {}) })
      .where(and(eq(schema.workflowRuns.id, runId), eq(schema.workflowRuns.status, 'running')))
      .returning({ projectId: schema.workflowRuns.projectId, graph: schema.workflowRuns.graph, target: schema.workflowRuns.target });
    if (run) this.events.publish(run.projectId, { type: 'run', runId, graph: run.graph, target: run.target, status: 'cancelled' });
  }

  /**
   * Aborts a run in flight, returning whether one was live on this replica — an unknown or already
   * settled run answers `false` rather than throwing. The run itself writes the `cancelled` row as it
   * unwinds, so this never races a concurrent settle. Cancellation is process-local: a
   * run owned by another replica is invisible here.
   */
  cancel(runId: string): boolean {
    const live = this.modelRouter.abortRun(runId);
    this.logger.info('workflow run cancellation requested', { runId, live });
    return live;
  }

  // The one place a run's abort controller is registered and released, so no exit path can leak one.
  // A run aborted between model calls has nothing left to interrupt, so a graph that still finishes
  // settles as cancelled rather than completed — the author asked for it to stop.
  private async runGraph(runId: string, graph: string, invoke: () => Promise<GraphOutcome>): Promise<WorkflowRunResult> {
    const signal = this.modelRouter.bindRunSignal(runId);
    try {
      const { outcome, status, nodeTrace, skippedStages } = await invoke();
      if (signal.aborted) {
        await this.cancelRun(runId, nodeTrace);
        return { runId, outcome: 'cancelled', status: 'cancelled' };
      }
      await this.completeRun(runId, outcome, status, nodeTrace, skippedStages);
      return { runId, outcome, status, ...(skippedStages ? { skippedStages } : {}) };
    } catch (err) {
      if (signal.aborted) {
        await this.cancelRun(runId);
        return { runId, outcome: 'cancelled', status: 'cancelled' };
      }
      this.logger.error(`${graph} failed`, { err, runId });
      await this.failRun(runId, err);
      return { runId, outcome: 'failed', status: 'failed' };
    } finally {
      this.modelRouter.releaseRunSignal(runId);
    }
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
  async runChain<T>(projectId: bigint, graph: string, target: string, input: unknown, fn: (runId: string) => Promise<T>, jobId?: string): Promise<{ runId: string; result: T }> {
    const runId = await this.createRun(projectId, graph, target, input, jobId);
    const signal = this.modelRouter.bindRunSignal(runId);
    try {
      const result = await fn(runId);
      if (signal.aborted) throw AppErrorCode.AI_013.create();
      await this.completeRun(runId, 'completed', 'completed', [graph]);
      return { runId, result };
    } catch (err) {
      if (signal.aborted) await this.cancelRun(runId, [graph]);
      else await this.failRun(runId, err, graph);
      throw err;
    } finally {
      this.modelRouter.releaseRunSignal(runId);
    }
  }

  async runChapterGeneration(input: ChapterGenerationInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'chapter-generation', `chapter-${input.chapter}`, input, input.jobId);

    return this.runGraph(runId, 'runChapterGeneration', async () => {
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
      const finalState = rawState as unknown as { outcome: string | null; nodeTrace?: string[] };
      const outcome = finalState.outcome ?? 'completed';

      return { outcome, status: outcome === 'awaiting_review' ? 'awaiting_review' : 'completed', nodeTrace: finalState.nodeTrace ?? [] };
    });
  }

  async runChapterFinalization(input: ChapterFinalizationInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'chapter-finalization', `chapter-${input.chapter}`, input, input.jobId);

    return this.runGraph(runId, 'runChapterFinalization', async () => {
      const graph = createChapterFinalizationGraph(this.graphServices as FinalizationServices);
      const rawState = await graph.invoke(
        {
          projectId: String(input.projectId),
          chapter: input.chapter,
          draftId: input.draftId ? String(input.draftId) : null,
          prose: input.prose,
          summary: input.summary,
          title: input.title ?? '',
          continuationState: input.continuationState ?? {},
          generator: input.generator ?? 'standard',
          isolated: input.isolated ?? false,
          runId,
        },
        { configurable: { thread_id: runId } },
      );

      const finalState = rawState as unknown as { nodeTrace?: string[] };
      return { outcome: 'completed', status: 'completed', nodeTrace: finalState.nodeTrace ?? [] };
    });
  }

  async runBibleBuilder(input: BibleBuilderInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'bible-builder', 'all-stages', input, input.jobId);

    return this.runGraph(runId, 'runBibleBuilder', async () => {
      const graph = createBibleBuilderGraph(this.graphServices as BibleBuilderServices);
      const rawState = await graph.invoke({ projectId: String(input.projectId), brief: input.brief, force: input.force ?? false, runId }, { configurable: { thread_id: runId } });

      const finalState = rawState as unknown as { nodeTrace?: string[]; skippedStages?: string[] };
      return { outcome: 'completed', status: 'completed', nodeTrace: finalState.nodeTrace ?? [], skippedStages: finalState.skippedStages ?? [] };
    });
  }

  async runSourceExtraction(input: SourceExtractionInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'source-extraction', `chapter-${input.chapter}`, input, input.jobId);

    return this.runGraph(runId, 'runSourceExtraction', async () => {
      const graph = createSourceExtractionGraph(this.graphServices as ExtractionServices);
      const rawState = await graph.invoke({ projectId: String(input.projectId), chapter: input.chapter, runId }, { configurable: { thread_id: runId } });

      const finalState = rawState as unknown as { nodeTrace?: string[] };
      return { outcome: 'completed', status: 'completed', nodeTrace: finalState.nodeTrace ?? [] };
    });
  }

  async runChapterRebrand(input: RebrandChapterInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'chapter-rebrand', `chapter-${input.chapter}`, input, input.jobId);

    return this.runGraph(runId, 'runChapterRebrand', async () => {
      const graph = createChapterRebrandGraph(this.graphServices as RebrandGraphServices);
      const rawState = await graph.invoke({ projectId: String(input.projectId), chapter: input.chapter, runId }, { configurable: { thread_id: runId } });
      const finalState = rawState as unknown as { outcome: string | null; nodeTrace?: string[] };

      return { outcome: finalState.outcome ?? 'converted', status: 'completed', nodeTrace: finalState.nodeTrace ?? [] };
    });
  }

  async runChapterReforge(input: ReforgeChapterInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'chapter-reforge', `chapter-${input.chapter}`, input, input.jobId);

    return this.runGraph(runId, 'runChapterReforge', async () => {
      const graph = createChapterReforgeGraph(this.graphServices as ReforgeGraphServices);
      const rawState = await graph.invoke({ projectId: String(input.projectId), chapter: input.chapter, runId }, { configurable: { thread_id: runId } });
      const finalState = rawState as unknown as { outcome: string | null; nodeTrace?: string[] };

      return { outcome: finalState.outcome ?? 'reforged', status: 'completed', nodeTrace: finalState.nodeTrace ?? [] };
    });
  }

  async runChapterTranslation(input: TranslationChapterInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'chapter-translation', `chapter-${input.chapter}`, input, input.jobId);

    return this.runGraph(runId, 'runChapterTranslation', async () => {
      const graph = createChapterTranslationGraph(this.graphServices as TranslationGraphServices);
      const rawState = await graph.invoke(
        { projectId: String(input.projectId), chapter: input.chapter, runId },
        { configurable: { thread_id: runId }, recursionLimit: TRANSLATION_RECURSION_LIMIT },
      );
      const finalState = rawState as unknown as { outcome: string | null; nodeTrace?: string[] };

      return { outcome: finalState.outcome ?? 'translated', status: 'completed', nodeTrace: finalState.nodeTrace ?? [] };
    });
  }

  async runSpanTransform(input: SpanTransformInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'span-transform', `output-${input.outputChapter}`, input, input.jobId);

    return this.runGraph(runId, 'runSpanTransform', async () => {
      const graph = createSpanTransformGraph(this.graphServices as SpanTransformServices);
      const rawState = await graph.invoke(
        { projectId: String(input.projectId), planId: String(input.planId), outputChapter: input.outputChapter, runId },
        { configurable: { thread_id: runId } },
      );
      const finalState = rawState as unknown as { outcome: string | null; nodeTrace?: string[] };

      return { outcome: finalState.outcome ?? 'written', status: 'completed', nodeTrace: finalState.nodeTrace ?? [] };
    });
  }

  async runNovelValidation(input: NovelValidationInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'novel-validation', 'full-novel', input, input.jobId);

    return this.runGraph(runId, 'runNovelValidation', async () => {
      const graph = createNovelValidationGraph(this.graphServices as ValidationServices);
      const rawState = await graph.invoke({ projectId: String(input.projectId), runId }, { configurable: { thread_id: runId } });
      const finalState = rawState as unknown as { outcome?: string | null; nodeTrace?: string[] };

      return { outcome: finalState.outcome ?? 'completed', status: 'completed', nodeTrace: finalState.nodeTrace ?? [] };
    });
  }
}

/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';
import { and, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase } from '@server/database';
import * as schema from '@server/database/schemas';

import { ContextAssembler } from '../context/context-assembler.service';
import { ModelRouterService } from '../model-router.service';
import { TelemetryHandler } from '../telemetry.handler';
import { type BibleBuilderServices, createBibleBuilderGraph } from './bible-builder.graph';
import { type FinalizationServices, createChapterFinalizationGraph } from './chapter-finalization.graph';
import { type GraphServices, createChapterGenerationGraph } from './chapter-generation.graph';
import { type ValidationServices, createNovelValidationGraph } from './novel-validation.graph';
import { type ExtractionServices, createSourceExtractionGraph } from './source-extraction.graph';
import { IndexingService } from '../retrieval/indexing.service';
import { ToolRegistryService } from '../tools/tool-registry.service';

/**
 * Defining types
 */

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

export interface NovelValidationInput {
  projectId: bigint;
  jobId?: string;
}

export interface WorkflowRunResult {
  runId: string;
  outcome: string;
  status: string;
}

/**
 * Declaring the constants
 */

const DB_URL = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';

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
      .values({ projectId, graph, target, status: 'running', input: input as never, jobId: jobId ?? null, nodeTrace: [] })
      .returning({ id: schema.workflowRuns.id });
    if (!run) throw new Error(`[WorkflowRunService] Failed to create workflow_run row`);
    return run.id;
  }

  private async completeRun(runId: string, outcome: string | null, status: 'completed' | 'awaiting_review', nodeTrace: string[]): Promise<void> {
    await this.db
      .update(schema.workflowRuns)
      .set({ status, outcome: outcome ?? undefined, endedAt: new Date(), nodeTrace: nodeTrace as never })
      .where(eq(schema.workflowRuns.id, runId));
  }

  private async failRun(runId: string, err: unknown, node?: string): Promise<void> {
    const error = err instanceof Error ? { class: err.constructor.name, message: err.message, node } : { class: 'UnknownError', message: String(err), node };
    await this.db
      .update(schema.workflowRuns)
      .set({ status: 'failed', error: error as never, endedAt: new Date() })
      .where(eq(schema.workflowRuns.id, runId));
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

  async runNovelValidation(input: NovelValidationInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'novel-validation', 'full-novel', input, input.jobId);
    const nodeTrace: string[] = [];

    try {
      const graph = createNovelValidationGraph(this.graphServices as ValidationServices);
      const rawState = await graph.invoke({ projectId: String(input.projectId), runId }, { configurable: { thread_id: runId } });
      const outcome = (rawState as unknown as { outcome?: string | null }).outcome ?? 'completed';
      nodeTrace.push('planWindows', 'validateWindows', 'mergeFindings', 'persistReport');

      // Store validation report as the run outcome.
      await this.completeRun(runId, outcome, 'completed', nodeTrace);
      return { runId, outcome, status: 'completed' };
    } catch (err) {
      this.logger.error('runNovelValidation failed', { err, runId });
      await this.failRun(runId, err);
      return { runId, outcome: 'failed', status: 'failed' };
    }
  }
}

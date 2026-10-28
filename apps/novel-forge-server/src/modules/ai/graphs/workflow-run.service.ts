import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { and, eq, inArray, isNull } from 'drizzle-orm';
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
import { isHardLineRefusal } from '../hard-line';
import { ModelRouterService } from '../model-router.service';
import { IndexingService } from '../retrieval/indexing.service';
import { type GenerationState } from '../schemas';
import { TelemetryHandler } from '../telemetry.handler';
import { ToolRegistryService } from '../tools/tool-registry.service';
import { WriterSnapshotService } from '../writer-snapshot.service';
import { type BibleBuilderServices, createBibleBuilderGraph } from './bible-builder.graph';
import { createChapterFinalizationGraph, type FinalizationServices } from './chapter-finalization.graph';
import { createChapterGenerationGraph, type GraphServices } from './chapter-generation.graph';
import { createNovelValidationGraph, type ValidationServices } from './novel-validation.graph';
import { RunCancellationService, type RunCancelOutcome } from './run-cancellation.service';
import { resumeOnceOnTransientFailure } from './transient-resume';

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
  draftRevision?: number;
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
  /** The runs this replica opened per job, so a job whose rows went with its project can still abort them. */
  private readonly jobRuns = new Map<string, Set<string>>();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly contextAssembler: ContextAssembler,
    private readonly modelRouter: ModelRouterService,
    private readonly telemetry: TelemetryHandler,
    private readonly toolRegistry: ToolRegistryService,
    private readonly indexingService: IndexingService,
    private readonly pluginPolicy: PluginPolicyService,
    private readonly events: ProjectEventService,
    private readonly writerSnapshots: WriterSnapshotService,
    private readonly cancellation: RunCancellationService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
    this.checkpointer = PostgresSaver.fromConnString(DB_URL);
  }

  async onModuleInit(): Promise<void> {
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
      writerSnapshots: this.writerSnapshots,
      checkpointer: this.checkpointer,
    };
  }

  /** Reuses the run row a crashed attempt of the same job and target left running, so a retried job keeps one run; its graph restarts from the first node. */
  async createRun(projectId: bigint, graph: string, target: string, input: unknown, jobId?: string, parentRunId?: string): Promise<string> {
    if (jobId) {
      const existing = await this.db.query.workflowRuns.findFirst({
        where: and(eq(schema.workflowRuns.jobId, jobId), eq(schema.workflowRuns.graph, graph), eq(schema.workflowRuns.target, target), eq(schema.workflowRuns.status, 'running')),
        columns: { id: true },
      });
      if (existing) {
        this.logger.warn('Reusing the run a crashed attempt left running; its graph restarts from the first node', { runId: existing.id, jobId, graph, target });
        return this.trackJobRun(jobId, existing.id);
      }
    }

    const [run] = await this.db
      .insert(schema.workflowRuns)
      .values({ projectId, graph, target, status: 'running', input: toJsonSafe(input) as never, jobId: jobId ?? null, parentRunId: parentRunId ?? null, nodeTrace: [] })
      .returning({ id: schema.workflowRuns.id });
    if (!run) throw AppError.internal(`[WorkflowRunService] Failed to create workflow_run row`);
    this.logger.info('workflow run created', { runId: run.id, projectId, graph, target, jobId, parentRunId });
    this.events.publish(projectId, { type: 'run', runId: run.id, graph, target, status: 'running' });
    this.logger.debug('workflow run input', { runId: run.id, graph, input });
    return jobId ? this.trackJobRun(jobId, run.id) : run.id;
  }

  private trackJobRun(jobId: string, runId: string): string {
    const runs = this.jobRuns.get(jobId) ?? new Set<string>();
    runs.add(runId);
    this.jobRuns.set(jobId, runs);
    return runId;
  }

  /** Local only: the executor calling this runs the job, so its runs are on this replica. */
  cancelJobRuns(jobId: string): void {
    for (const runId of this.jobRuns.get(jobId) ?? []) this.modelRouter.abortRun(runId);
  }

  forgetJobRuns(jobId: string): void {
    this.jobRuns.delete(jobId);
  }

  /** Links a run created before its parent existed (compaction runs before the turn run) — every other run names its parent at creation. */
  async setParentRun(runId: string, parentRunId: string): Promise<void> {
    await this.db.update(schema.workflowRuns).set({ parentRunId }).where(eq(schema.workflowRuns.id, runId));
  }

  // Every settle carries the `running` predicate: a run is written once, by whichever path reaches it
  // first, so a late finish cannot reopen a cancelled row and leave the audit trail lying about it.
  // Completing also needs no cancel on record: one taken by another replica after this replica's last
  // check would otherwise lose to a finish its author had asked to stop. Answers false when that cancel won.
  private async completeRun(runId: string, outcome: string | null, status: 'completed' | 'awaiting_review', nodeTrace: string[], skippedStages?: string[]): Promise<boolean> {
    this.logger.info('workflow run finished', { runId, status, outcome });
    const persistedTrace = skippedStages?.length ? [...nodeTrace, ...skippedStages.map(stage => `${SKIPPED_STAGE_MARKER}${stage}`)] : nodeTrace;
    this.logger.debug('workflow run node trace', { runId, nodeTrace: persistedTrace });
    const [run] = await this.db
      .update(schema.workflowRuns)
      .set({ status, outcome: outcome ?? undefined, endedAt: new Date(), nodeTrace: persistedTrace as never })
      .where(and(eq(schema.workflowRuns.id, runId), eq(schema.workflowRuns.status, 'running'), isNull(schema.workflowRuns.cancelRequestedAt)))
      .returning({ projectId: schema.workflowRuns.projectId, graph: schema.workflowRuns.graph, target: schema.workflowRuns.target });
    if (!run) return !(await this.cancelRun(runId, persistedTrace));
    this.events.publish(run.projectId, { type: 'run', runId, graph: run.graph, target: run.target, status });
    return true;
  }

  private async failRun(runId: string, err: unknown, node?: string): Promise<void> {
    const code = err instanceof AppError ? err.code : undefined;
    const details = isHardLineRefusal(err) ? { details: err.data } : {};
    const error = err instanceof Error ? { class: err.constructor.name, message: err.message, code, node, ...details } : { class: 'UnknownError', message: String(err), node };
    this.logger.debug('persisting workflow run failure', { runId, node, error });
    const [run] = await this.db
      .update(schema.workflowRuns)
      .set({ status: 'failed', error: error as never, endedAt: new Date() })
      .where(and(eq(schema.workflowRuns.id, runId), eq(schema.workflowRuns.status, 'running')))
      .returning({ projectId: schema.workflowRuns.projectId, graph: schema.workflowRuns.graph, target: schema.workflowRuns.target });
    if (!run) return;
    await this.releaseUnjudgedDraft(run.projectId, runId);
    this.events.publish(run.projectId, { type: 'run', runId, graph: run.graph, target: run.target, status: 'failed' });
  }

  // A run that stops after persisting its draft and before judging it would leave that draft `generating`, which refuses every later save (DRF_019).
  // Only a draft whose current revision this run wrote is released, so a newer run on the same chapter keeps its own.
  private async releaseUnjudgedDraft(projectId: bigint, runId: string): Promise<void> {
    const { drafts, draftRevisions } = schema;
    const written = this.db
      .select({ id: drafts.id })
      .from(drafts)
      .innerJoin(draftRevisions, and(eq(draftRevisions.draftId, drafts.id), eq(draftRevisions.revision, drafts.revision)))
      .where(and(eq(drafts.projectId, projectId), eq(drafts.reviewStatus, 'generating'), eq(draftRevisions.runId, runId)));
    const released = await this.db
      .update(drafts)
      .set({ reviewStatus: 'needs_review', updatedAt: new Date() })
      .where(and(inArray(drafts.id, written), eq(drafts.reviewStatus, 'generating')))
      .returning({ chapter: drafts.chapter });
    if (released.length > 0) this.logger.warn('released a draft its run left unjudged', { runId, chapters: released.map(draft => draft.chapter) });
  }

  /** Settles the runs a job opened that are still running after the job itself settled — a run opened for a job that never reached it. */
  async settleJobRuns(jobId: string, status: 'completed' | 'failed' | 'cancelled', err?: unknown): Promise<void> {
    const live = await this.db
      .select({ id: schema.workflowRuns.id })
      .from(schema.workflowRuns)
      .where(and(eq(schema.workflowRuns.jobId, jobId), eq(schema.workflowRuns.status, 'running')));
    for (const { id } of live) {
      if (status === 'failed') await this.failRun(id, err ?? AppError.internal('the job settled before its run finished'));
      else if (status === 'cancelled') await this.cancelRun(id);
      else await this.completeRun(id, 'completed', 'completed', []);
    }
  }

  // Terminal and non-retrying: the run keeps whatever it already persisted. Answers whether this call settled it.
  private async cancelRun(runId: string, nodeTrace?: string[]): Promise<boolean> {
    this.logger.info('workflow run cancelled', { runId });
    const [run] = await this.db
      .update(schema.workflowRuns)
      .set({ status: 'cancelled', outcome: 'cancelled', endedAt: new Date(), ...(nodeTrace?.length ? { nodeTrace: nodeTrace as never } : {}) })
      .where(and(eq(schema.workflowRuns.id, runId), eq(schema.workflowRuns.status, 'running')))
      .returning({ projectId: schema.workflowRuns.projectId, graph: schema.workflowRuns.graph, target: schema.workflowRuns.target });
    if (!run) return false;
    await this.releaseUnjudgedDraft(run.projectId, runId);
    this.events.publish(run.projectId, { type: 'run', runId, graph: run.graph, target: run.target, status: 'cancelled' });
    return true;
  }

  /**
   * Cancels a run wherever it runs — an unknown or already settled run answers `already_settled` rather than throwing. The run itself
   * writes the `cancelled` row as it unwinds, so this never races a concurrent settle.
   */
  cancel(runId: string): Promise<RunCancelOutcome> {
    return this.cancellation.request(runId);
  }

  // The one place a run's abort controller is registered and released, so no exit path can leak one.
  // A run aborted between model calls has nothing left to interrupt, so a graph that still finishes
  // settles as cancelled rather than completed — the author asked for it to stop. The graph is handed
  // the signal too, so an abort also stops it at its next node boundary.
  private async runGraph(runId: string, graph: string, invoke: (signal: AbortSignal) => Promise<GraphOutcome>): Promise<WorkflowRunResult> {
    const signal = this.modelRouter.bindRunSignal(runId);
    this.cancellation.watch(runId);
    try {
      const { outcome, status, nodeTrace, skippedStages } = await invoke(signal);
      if (signal.aborted) {
        await this.cancelRun(runId, nodeTrace);
        return { runId, outcome: 'cancelled', status: 'cancelled' };
      }
      if (!(await this.completeRun(runId, outcome, status, nodeTrace, skippedStages))) return { runId, outcome: 'cancelled', status: 'cancelled' };
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
      this.cancellation.unwatch(runId);
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
   * Runs a plain, non-checkpointed chain under workflow_runs bookkeeping, so the refinement chains get a fresh runId correlating their model_calls and context pack,
   * and failures reach the same audit trail as graph runs.
   */
  async runChain<T>(
    projectId: bigint,
    graph: string,
    target: string,
    input: unknown,
    fn: (runId: string) => Promise<T>,
    jobId?: string,
    parentRunId?: string,
  ): Promise<{ runId: string; result: T }> {
    const runId = await this.createRun(projectId, graph, target, input, jobId, parentRunId);
    const signal = this.modelRouter.bindRunSignal(runId);
    this.cancellation.watch(runId);
    try {
      const result = await fn(runId);
      if (signal.aborted) throw AppErrorCode.AI_013.create();
      if (await this.completeRun(runId, 'completed', 'completed', [graph])) return { runId, result };
      this.modelRouter.abortRun(runId);
      throw AppErrorCode.AI_013.create();
    } catch (err) {
      if (signal.aborted) await this.cancelRun(runId, [graph]);
      else await this.failRun(runId, err, graph);
      throw err;
    } finally {
      this.cancellation.unwatch(runId);
      this.modelRouter.releaseRunSignal(runId);
    }
  }

  async runChapterGeneration(input: ChapterGenerationInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'chapter-generation', `chapter-${input.chapter}`, input, input.jobId);

    return this.runGraph(runId, 'runChapterGeneration', async signal => {
      const graph = createChapterGenerationGraph(this.graphServices);
      const start = {
        projectId: String(input.projectId),
        chapter: input.chapter,
        volumeKey: input.volumeKey ?? '',
        guidance: input.guidance ?? '',
        autoFix: input.autoFix ?? false,
        maxFixes: input.maxFixes ?? 3,
        runId,
      };
      const config = { configurable: { thread_id: runId }, signal };
      const rawState = await resumeOnceOnTransientFailure(resume => graph.invoke(resume ? null : start, config), {
        signal,
        mayResume: async () => !(await this.isDraftFinal(input.projectId, input.chapter)),
        onResume: err => this.logger.warn('chapter generation met a transient model failure; resuming from its last checkpoint', { runId, chapter: input.chapter, err }),
      });
      const finalState = rawState as unknown as { outcome: string | null; nodeTrace?: string[] };
      const outcome = finalState.outcome ?? 'completed';

      return { outcome, status: outcome === 'awaiting_review' ? 'awaiting_review' : 'completed', nodeTrace: finalState.nodeTrace ?? [] };
    });
  }

  private async isDraftFinal(projectId: bigint, chapter: number): Promise<boolean> {
    const draft = await this.db.query.drafts.findFirst({
      where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, chapter)),
      columns: { status: true },
    });
    return draft?.status === 'final';
  }

  async runChapterFinalization(input: ChapterFinalizationInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'chapter-finalization', `chapter-${input.chapter}`, input, input.jobId);

    return this.runGraph(runId, 'runChapterFinalization', async signal => {
      const graph = createChapterFinalizationGraph(this.graphServices as FinalizationServices);
      const rawState = await graph.invoke(
        {
          projectId: String(input.projectId),
          chapter: input.chapter,
          draftId: input.draftId ? String(input.draftId) : null,
          draftRevision: input.draftRevision ?? null,
          prose: input.prose,
          summary: input.summary,
          title: input.title ?? '',
          continuationState: input.continuationState ?? {},
          generator: input.generator ?? 'standard',
          isolated: input.isolated ?? false,
          runId,
        },
        { configurable: { thread_id: runId }, signal },
      );

      const finalState = rawState as unknown as { nodeTrace?: string[] };
      return { outcome: 'completed', status: 'completed', nodeTrace: finalState.nodeTrace ?? [] };
    });
  }

  async runBibleBuilder(input: BibleBuilderInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'bible-builder', 'all-stages', input, input.jobId);

    return this.runGraph(runId, 'runBibleBuilder', async signal => {
      const graph = createBibleBuilderGraph(this.graphServices as BibleBuilderServices);
      const rawState = await graph.invoke(
        { projectId: String(input.projectId), brief: input.brief, force: input.force ?? false, runId },
        { configurable: { thread_id: runId }, signal },
      );

      const finalState = rawState as unknown as { nodeTrace?: string[]; skippedStages?: string[] };
      return { outcome: 'completed', status: 'completed', nodeTrace: finalState.nodeTrace ?? [], skippedStages: finalState.skippedStages ?? [] };
    });
  }

  async runNovelValidation(input: NovelValidationInput): Promise<WorkflowRunResult> {
    const runId = await this.createRun(input.projectId, 'novel-validation', 'full-novel', input, input.jobId);

    return this.runGraph(runId, 'runNovelValidation', async signal => {
      const graph = createNovelValidationGraph(this.graphServices as ValidationServices);
      const rawState = await graph.invoke({ projectId: String(input.projectId), runId }, { configurable: { thread_id: runId }, signal });
      const finalState = rawState as unknown as { outcome?: string | null; nodeTrace?: string[] };

      return { outcome: finalState.outcome ?? 'completed', status: 'completed', nodeTrace: finalState.nodeTrace ?? [] };
    });
  }
}

import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { type Ai, type PrimaryDatabase, schema } from '@server/database';

import { type ContextSection } from '../ai/context/sections';
import { type RunTrace, splitRunTrace } from '../ai/graphs/workflow-run.service';
import { type CallUsageTotals, emptyCallUsageTotals, type GroupedUsageRow, summarizeCallUsage, summarizeGroupedCallUsage } from '../ai/usage/call-usage';
import {
  AUTHOR_FACING_GRAPHS,
  type ChapterCostResponse,
  type ListRunsQuery,
  type ListWorkflowRunResponse,
  type RunUsageDetailResponse,
  type RunUsageResponse,
} from './run-inspection.dto';

interface RunContextSectionSummary {
  key: string;
  tier: string;
  segment: string;
  tokens: number;
  truncated: boolean;
}

interface RunContextPackSummary {
  id: string;
  purpose: string;
  budgetTokens: number | null;
  usedTokens: number | null;
  sections: RunContextSectionSummary[];
}

function toRunUsageResponse(totals: CallUsageTotals, run: { startedAt: Date; endedAt: Date | null } | null): RunUsageResponse {
  return {
    calls: totals.calls,
    inputTokens: totals.inputTokens,
    cachedInputTokens: totals.cachedInputTokens,
    outputTokens: totals.outputTokens,
    costUsd: totals.costUsd,
    estimatedCostUsd: totals.estimatedCostUsd,
    durationMs: run?.endedAt ? run.endedAt.getTime() - run.startedAt.getTime() : null,
    byCostSource: totals.byCostSource.map(({ costSource, calls, costUsd }) => ({ costSource, calls, costUsd })),
  };
}

type PresentedRun = Omit<Ai.WorkflowRun, 'nodeTrace'> & RunTrace;

function presentRun(run: Ai.WorkflowRun): PresentedRun {
  return { ...run, ...splitRunTrace(run.nodeTrace) };
}

@Injectable()
export class RunInspectionService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async listRuns(projectId: bigint, query: ListRunsQuery): Promise<ListWorkflowRunResponse> {
    // `date:parse` turns unparsable input into an Invalid Date rather than throwing — checked here so a bad filter is a typed 400, not a 500 from Postgres.
    if ((query.from && Number.isNaN(query.from.getTime())) || (query.to && Number.isNaN(query.to.getTime())) || (query.from && query.to && query.from > query.to)) {
      throw AppErrorCode.AI_014.create();
    }

    const conditions = [eq(schema.workflowRuns.projectId, projectId), inArray(schema.workflowRuns.graph, AUTHOR_FACING_GRAPHS)];
    if (query.graph) conditions.push(eq(schema.workflowRuns.graph, query.graph));
    if (query.from) conditions.push(gte(schema.workflowRuns.startedAt, query.from));
    if (query.to) conditions.push(lte(schema.workflowRuns.startedAt, query.to));
    const where = and(...conditions);

    const [runs, [totalRow]] = await Promise.all([
      this.db.query.workflowRuns.findMany({ where, orderBy: [desc(schema.workflowRuns.startedAt)], limit: query.limit, offset: query.offset }),
      this.db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.workflowRuns)
        .where(where),
    ]);

    const totals = await this.runUsageTotals(projectId, runs);
    const items = runs.map(run => ({ ...presentRun(run), totals: totals.get(run.id) ?? toRunUsageResponse(emptyCallUsageTotals(), run) }));
    return { items, total: totalRow?.total ?? 0, limit: query.limit, offset: query.offset };
  }

  async getRun(
    projectId: bigint,
    runId: string,
  ): Promise<PresentedRun & { modelCalls: Ai.ModelCall[]; toolCalls: Ai.ToolCall[]; contextPack?: RunContextPackSummary; totals: RunUsageResponse }> {
    const run = await this.db.query.workflowRuns.findFirst({ where: and(eq(schema.workflowRuns.projectId, projectId), eq(schema.workflowRuns.id, runId)) });
    if (!run) throw AppErrorCode.PRJ_001.create();
    const [modelCalls, toolCalls, contextPack] = await Promise.all([
      this.db.query.modelCalls.findMany({
        where: and(eq(schema.modelCalls.projectId, projectId), eq(schema.modelCalls.runId, runId)),
        orderBy: asc(schema.modelCalls.createdAt),
      }),
      this.db.query.toolCalls.findMany({ where: eq(schema.toolCalls.runId, runId), orderBy: asc(schema.toolCalls.createdAt) }),
      this.loadPackSummary(run.contextPackId),
    ]);
    const totals = toRunUsageResponse(summarizeCallUsage(modelCalls), run);
    // Omitted (never null) when unlinked — the route serialiser cannot build nullable nested objects.
    return { ...presentRun(run), modelCalls, toolCalls, totals, ...(contextPack ? { contextPack } : {}) };
  }

  /** A run's usage: totals and each call's role/model/tier/mode/tokens/cost and charge (`GenerationController` drops model, provider and reasoning effort for a non-admin) — `columns` selection, not schema stripping, is what keeps `rawOutput`/`error`/`input` out of the returned object. */
  async getRunUsage(projectId: bigint, runId: string): Promise<RunUsageDetailResponse> {
    const run = await this.db.query.workflowRuns.findFirst({
      where: and(eq(schema.workflowRuns.projectId, projectId), eq(schema.workflowRuns.id, runId)),
      columns: { id: true, projectId: true, jobId: true, graph: true, target: true, status: true, outcome: true, nodeTrace: true, startedAt: true, endedAt: true },
    });
    if (!run) throw AppErrorCode.PRJ_001.create();
    const modelCalls = await this.db.query.modelCalls.findMany({
      where: and(eq(schema.modelCalls.projectId, projectId), eq(schema.modelCalls.runId, runId)),
      orderBy: asc(schema.modelCalls.createdAt),
      columns: {
        id: true,
        node: true,
        role: true,
        provider: true,
        model: true,
        promptKey: true,
        promptVersion: true,
        status: true,
        inputTokens: true,
        cachedInputTokens: true,
        outputTokens: true,
        latencyMs: true,
        costUsd: true,
        costSource: true,
        tier: true,
        contentMode: true,
        reasoningEffort: true,
        attempt: true,
        createdAt: true,
      },
    });
    const { nodeTrace: _nodeTrace, ...runSummary } = { ...run, ...splitRunTrace(run.nodeTrace) };
    const calls = modelCalls.map(call => {
      const { costUsd: chargeUsd, estimatedCostUsd: estimatedChargeUsd } = summarizeCallUsage([call]);
      return { ...call, chargeUsd, estimatedChargeUsd };
    });
    return { ...runSummary, totals: toRunUsageResponse(summarizeCallUsage(modelCalls), run), calls };
  }

  /** Every model call any action has made against chapter N (generation, finalization, judge, review, revision, continuity, extraction, summarize) — tagged directly on `model_calls.chapter`. */
  async getChapterCost(projectId: bigint, chapter: number): Promise<ChapterCostResponse> {
    const calls = await this.db.query.modelCalls.findMany({
      where: and(eq(schema.modelCalls.projectId, projectId), eq(schema.modelCalls.chapter, chapter)),
      columns: {
        role: true,
        model: true,
        status: true,
        costSource: true,
        costUsd: true,
        inputTokens: true,
        cachedInputTokens: true,
        outputTokens: true,
        latencyMs: true,
      },
    });

    const byRole = new Map<string, { role: string; calls: number; costUsd: number }>();
    for (const call of calls) {
      const { costUsd } = summarizeCallUsage([call]);
      const entry = byRole.get(call.role) ?? { role: call.role, calls: 0, costUsd: 0 };
      entry.calls += 1;
      entry.costUsd += costUsd;
      byRole.set(call.role, entry);
    }

    return {
      chapter,
      totals: toRunUsageResponse(summarizeCallUsage(calls), null),
      byRole: [...byRole.values()].sort((a, b) => b.costUsd - a.costUsd),
    };
  }

  /** Totals for a page of already-loaded runs — grouped in SQL, not by reading every underlying model_calls row, since a page can hold many runs. */
  private async runUsageTotals(projectId: bigint, runs: readonly { id: string; startedAt: Date; endedAt: Date | null }[]): Promise<Map<string, RunUsageResponse>> {
    const result = new Map<string, RunUsageResponse>();
    if (runs.length === 0) return result;
    const runIds = runs.map(r => r.id);
    const calls = schema.modelCalls;
    const rows = await this.db
      .select({
        runId: calls.runId,
        model: calls.model,
        status: calls.status,
        costSource: calls.costSource,
        calls: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${calls.inputTokens}), 0)::bigint`.mapWith(Number),
        cachedInputTokens: sql<number>`coalesce(sum(${calls.cachedInputTokens}), 0)::bigint`.mapWith(Number),
        outputTokens: sql<number>`coalesce(sum(${calls.outputTokens}), 0)::bigint`.mapWith(Number),
        latencyMs: sql<number>`coalesce(sum(${calls.latencyMs}), 0)::bigint`.mapWith(Number),
        recordedCostUsd: sql<number>`coalesce(sum(${calls.costUsd}) filter (where ${calls.costUsd} is not null), 0)`.mapWith(Number),
        unpricedInputTokens: sql<number>`coalesce(sum(${calls.inputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
        unpricedOutputTokens: sql<number>`coalesce(sum(${calls.outputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
      })
      .from(calls)
      .where(and(eq(calls.projectId, projectId), inArray(calls.runId, runIds)))
      .groupBy(calls.runId, calls.model, calls.status, calls.costSource);

    const rowsByRun = new Map<string, GroupedUsageRow[]>();
    for (const row of rows) {
      if (!row.runId) continue;
      const list = rowsByRun.get(row.runId) ?? [];
      list.push(row);
      rowsByRun.set(row.runId, list);
    }
    for (const run of runs) result.set(run.id, toRunUsageResponse(summarizeGroupedCallUsage(rowsByRun.get(run.id) ?? []), run));
    return result;
  }

  private async loadPackSummary(contextPackId: bigint | null): Promise<RunContextPackSummary | null> {
    if (contextPackId === null) return null;
    const pack = await this.db.query.contextPacks.findFirst({ where: eq(schema.contextPacks.id, contextPackId) });
    if (!pack) return null;
    const sections = ((pack.sections as ContextSection[] | null) ?? []).map(s => ({ key: s.key, tier: s.tier, segment: s.segment, tokens: s.tokens, truncated: s.truncated }));
    return { id: String(pack.id), purpose: pack.purpose, budgetTokens: pack.budgetTokens, usedTokens: pack.usedTokens, sections };
  }

  async getRunCall(projectId: bigint, runId: string, callId: bigint): Promise<Ai.ModelCall> {
    const call = await this.db.query.modelCalls.findFirst({
      where: and(eq(schema.modelCalls.projectId, projectId), eq(schema.modelCalls.runId, runId), eq(schema.modelCalls.id, callId)),
    });
    if (!call) throw AppErrorCode.PRJ_001.create();
    return call;
  }

  async getRunContext(projectId: bigint, runId: string): Promise<RunContextPackSummary & { rendered: string }> {
    const run = await this.db.query.workflowRuns.findFirst({ where: and(eq(schema.workflowRuns.projectId, projectId), eq(schema.workflowRuns.id, runId)) });
    if (!run) throw AppErrorCode.PRJ_001.create();
    const summary = await this.loadPackSummary(run.contextPackId);
    if (!summary) throw AppErrorCode.CTX_001.create();
    const pack = await this.db.query.contextPacks.findFirst({ where: eq(schema.contextPacks.id, BigInt(summary.id)) });
    return { ...summary, rendered: pack?.rendered ?? '' };
  }
}

export function withoutCallModels(usage: RunUsageDetailResponse): RunUsageDetailResponse {
  return { ...usage, calls: usage.calls.map(call => utils.object.omitKeys(call, ['provider', 'model', 'reasoningEffort'])) };
}

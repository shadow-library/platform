import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import * as schema from '@server/database/schemas';

import { type GroupedUsageRow, summarizeGroupedCallUsage } from '../../usage';
import { type RegisteredTool, type ToolContext } from '../types';

const PERIODS = ['today', 'week', 'month', 'all'] as const;
type Period = (typeof PERIODS)[number];

const inputSchema = z.object({
  chapter: z.number().int().min(1).optional(),
  period: z.enum(PERIODS).optional(),
  last_run: z.boolean().optional(),
});

const outputSchema = z.string();

// "today" is a rolling 24 hours, not the calendar day.
const PERIOD_LABELS: Record<Period, string> = { today: 'the last 24 hours', week: 'the last 7 days', month: 'the last 30 days', all: 'all time' };

const DAY_MS = 24 * 60 * 60 * 1000;

function periodStart(period: Period): Date | null {
  if (period === 'today') return new Date(Date.now() - DAY_MS);
  if (period === 'week') return new Date(Date.now() - 7 * DAY_MS);
  if (period === 'month') return new Date(Date.now() - 30 * DAY_MS);
  return null;
}

function formatUsd(amount: number): string {
  return `$${amount > 0 && amount < 0.01 ? amount.toFixed(4) : amount.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number): string {
  return n.toLocaleString('en-US');
}

interface WorkflowRunRow {
  id: string;
  parentRunId: string | null;
  startedAt: Date;
}

/** The most recent top-level run that isn't `excludeRunId`. Exported so the selection rule is unit-testable directly; `lastRunIds` expresses the same rule in SQL. */
export function selectLastRun<R extends WorkflowRunRow>(runs: readonly R[], excludeRunId: string): R | null {
  const candidates = runs.filter(run => run.parentRunId === null && run.id !== excludeRunId);
  return candidates.reduce<R | null>((latest, run) => (!latest || run.startedAt > latest.startedAt ? run : latest), null);
}

/** The author's previous run plus that run's own title/compaction children. */
async function lastRunIds(ctx: ToolContext): Promise<string[] | null> {
  const last = await ctx.db.query.workflowRuns.findFirst({
    where: (run, { and, eq, isNull, ne }) => and(eq(run.projectId, ctx.projectId), isNull(run.parentRunId), ne(run.id, ctx.runId)),
    orderBy: (run, { desc }) => [desc(run.startedAt), desc(run.id)],
    columns: { id: true },
  });
  if (!last) return null;

  const children = await ctx.db.query.workflowRuns.findMany({
    where: (run, { and, eq }) => and(eq(run.projectId, ctx.projectId), eq(run.parentRunId, last.id)),
    columns: { id: true },
  });
  return [last.id, ...children.map(child => child.id)];
}

function byRole(rows: readonly (GroupedUsageRow & { role: string })[]): { role: string; totals: ReturnType<typeof summarizeGroupedCallUsage> }[] {
  const grouped = new Map<string, (GroupedUsageRow & { role: string })[]>();
  for (const row of rows) grouped.set(row.role, [...(grouped.get(row.role) ?? []), row]);
  return [...grouped.entries()].map(([role, group]) => ({ role, totals: summarizeGroupedCallUsage(group) })).sort((a, b) => b.totals.costUsd - a.totals.costUsd);
}

export const getUsageTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description:
    "Retrieve the project's AI usage — cost, tokens, calls and duration — scoped to a chapter, a period (today, week, month, all) or the author's last run, with a per-role breakdown and whether the figures are estimated. Read-only; carries no prompt or answer content.",
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const period: Period = parsed.period ?? 'all';

    let runIds: string[] | null = null;
    if (parsed.last_run) {
      runIds = await lastRunIds(ctx);
      if (!runIds) return 'No earlier run recorded yet.';
    }
    const start = runIds ? null : periodStart(period);

    const modelCalls = schema.modelCalls;
    const clauses = [eq(modelCalls.projectId, ctx.projectId)];
    if (parsed.chapter !== undefined) clauses.push(eq(modelCalls.chapter, parsed.chapter));
    if (start) clauses.push(gte(modelCalls.createdAt, start));
    if (runIds) clauses.push(inArray(modelCalls.runId, runIds));

    const rows = await ctx.db
      .select({
        role: modelCalls.role,
        model: modelCalls.model,
        status: modelCalls.status,
        costSource: modelCalls.costSource,
        calls: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${modelCalls.inputTokens}), 0)::bigint`.mapWith(Number),
        cachedInputTokens: sql<number>`coalesce(sum(${modelCalls.cachedInputTokens}), 0)::bigint`.mapWith(Number),
        outputTokens: sql<number>`coalesce(sum(${modelCalls.outputTokens}), 0)::bigint`.mapWith(Number),
        latencyMs: sql<number>`coalesce(sum(${modelCalls.latencyMs}), 0)::bigint`.mapWith(Number),
        recordedCostUsd: sql<number>`coalesce(sum(${modelCalls.costUsd}), 0)`.mapWith(Number),
        unpricedInputTokens: sql<number>`coalesce(sum(${modelCalls.inputTokens}) filter (where ${modelCalls.costUsd} is null), 0)::bigint`.mapWith(Number),
        unpricedOutputTokens: sql<number>`coalesce(sum(${modelCalls.outputTokens}) filter (where ${modelCalls.costUsd} is null), 0)::bigint`.mapWith(Number),
      })
      .from(modelCalls)
      .where(and(...clauses))
      .groupBy(modelCalls.role, modelCalls.model, modelCalls.status, modelCalls.costSource);

    const scopeParts: string[] = [];
    if (parsed.chapter !== undefined) scopeParts.push(`chapter ${parsed.chapter}`);
    scopeParts.push(runIds ? 'the last run' : PERIOD_LABELS[period]);
    const scope = scopeParts.join(', ');

    if (rows.length === 0) return `No usage recorded for ${scope}.`;

    const totals = summarizeGroupedCallUsage(rows);
    const lines = [
      `Usage for ${scope}: ${totals.calls} calls, ${formatTokens(totals.inputTokens + totals.outputTokens)} tokens (${formatTokens(totals.inputTokens)} in / ${formatTokens(totals.outputTokens)} out), ${formatUsd(totals.costUsd)}, ${formatDuration(totals.totalLatencyMs)} total.`,
      totals.estimatedCostUsd > 0 ? 'Some of this figure is estimated — not every call recorded a price.' : 'Fully recorded — no estimate involved.',
    ];

    const roles = byRole(rows);
    if (roles.length > 1) {
      lines.push('', 'By role:');
      for (const { role, totals: roleTotals } of roles) lines.push(`- ${role}: ${roleTotals.calls} calls, ${formatUsd(roleTotals.costUsd)}`);
    }

    return lines.join('\n');
  },
  inputSchema,
  maxCallsPerRun: 5,
  name: 'get_usage',
  outputSchema,
  tokensBudget: 2000,
};

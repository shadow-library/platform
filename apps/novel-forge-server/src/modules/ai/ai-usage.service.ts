import { and, eq, gte, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { ownedBy, type OwnerRef } from '@server/common';
import { type Ai, type PrimaryDatabase, schema } from '@server/database';

import { type CostWindow, type DayCostRow, summarizeByDay, summarizeCost } from '../project/project/project-cost';
import { type AccountUsageResponse, type ProjectCostItem } from './ai.dto';
import { classifyRowCost } from './quota';

export interface ProjectCostGroupRow {
  projectId: bigint;
  title: string | null;
  model: string;
  costSource: Ai.CostSource | null;
  calls: number;
  recordedCostUsd: number;
  unpricedInputTokens: number;
  unpricedOutputTokens: number;
}

export function summarizeByProject(rows: readonly ProjectCostGroupRow[]): ProjectCostItem[] {
  const byProject = new Map<string, ProjectCostItem>();
  for (const row of rows) {
    const { costUsd } = classifyRowCost(row);
    const key = row.projectId.toString();
    const entry = byProject.get(key) ?? { projectId: row.projectId, title: row.title, calls: 0, costUsd: 0 };
    entry.calls += row.calls;
    entry.costUsd += costUsd;
    byProject.set(key, entry);
  }
  return [...byProject.values()].sort((a, b) => b.costUsd - a.costUsd);
}

@Injectable()
export class AiUsageService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Cost, tokens and calls across every project the caller owns — `summarizeCost`'s own shaping, plus a per-novel breakdown. */
  async usage(owner: OwnerRef): Promise<AccountUsageResponse> {
    const calls = schema.modelCalls;
    const projects = schema.projects;
    const ownerFilter = ownedBy(projects, owner);
    const window = sql<CostWindow>`case when ${calls.createdAt} >= now() - interval '7 days' then 'last7Days' when ${calls.createdAt} >= now() - interval '30 days' then 'last30Days' else 'older' end`;

    const [rows, dayRows, projectRows] = await Promise.all([
      this.db
        .select({
          role: calls.role,
          model: calls.model,
          window,
          status: calls.status,
          costSource: calls.costSource,
          tier: calls.tier,
          contentMode: calls.contentMode,
          calls: sql<number>`count(*)::int`,
          inputTokens: sql<number>`coalesce(sum(${calls.inputTokens}), 0)::bigint`.mapWith(Number),
          outputTokens: sql<number>`coalesce(sum(${calls.outputTokens}), 0)::bigint`.mapWith(Number),
          recordedCostUsd: sql<number>`coalesce(sum(${calls.costUsd}), 0)`.mapWith(Number),
          unpricedInputTokens: sql<number>`coalesce(sum(${calls.inputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
          unpricedOutputTokens: sql<number>`coalesce(sum(${calls.outputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
        })
        .from(calls)
        .innerJoin(projects, eq(calls.projectId, projects.id))
        .where(ownerFilter)
        .groupBy(calls.role, calls.model, window, calls.status, calls.costSource, calls.tier, calls.contentMode),
      this.db
        .select({
          day: sql<string>`to_char(${calls.createdAt}, 'YYYY-MM-DD')`,
          model: calls.model,
          status: calls.status,
          costSource: calls.costSource,
          calls: sql<number>`count(*)::int`,
          recordedCostUsd: sql<number>`coalesce(sum(${calls.costUsd}), 0)`.mapWith(Number),
          unpricedInputTokens: sql<number>`coalesce(sum(${calls.inputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
          unpricedOutputTokens: sql<number>`coalesce(sum(${calls.outputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
        })
        .from(calls)
        .innerJoin(projects, eq(calls.projectId, projects.id))
        .where(and(ownerFilter, gte(calls.createdAt, sql`date_trunc('day', now() - interval '30 days')`)))
        .groupBy(sql`1`, calls.model, calls.status, calls.costSource),
      this.db
        .select({
          projectId: calls.projectId,
          title: projects.title,
          model: calls.model,
          status: calls.status,
          costSource: calls.costSource,
          calls: sql<number>`count(*)::int`,
          recordedCostUsd: sql<number>`coalesce(sum(${calls.costUsd}), 0)`.mapWith(Number),
          unpricedInputTokens: sql<number>`coalesce(sum(${calls.inputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
          unpricedOutputTokens: sql<number>`coalesce(sum(${calls.outputTokens}) filter (where ${calls.costUsd} is null), 0)::bigint`.mapWith(Number),
        })
        .from(calls)
        .innerJoin(projects, eq(calls.projectId, projects.id))
        .where(ownerFilter)
        .groupBy(calls.projectId, projects.title, calls.model, calls.status, calls.costSource),
    ]);

    return { ...summarizeCost(rows), byDay: summarizeByDay(dayRows as DayCostRow[]), byProject: summarizeByProject(projectRows) };
  }
}

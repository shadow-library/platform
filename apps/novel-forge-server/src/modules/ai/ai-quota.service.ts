import { and, eq, gte, ne, type SQL, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { ownedBy, type OwnerRef } from '@server/common';
import { type PrimaryDatabase, schema } from '@server/database';

import { type AiQuotaResponse } from './ai.dto';
import { computeWindowUsage, type WindowUsageRow } from './quota';

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_CALLS = 1000;
const DEFAULT_MAX_COST_USD = 50;

/** A refused row (the hard line, a Synapse budget) records a call no model ran, so the window never counts it. */
const dispatched = ne(schema.modelCalls.status, 'refused');

interface QuotaLimits {
  maxCalls: number;
  maxCostUsd: number;
  windowMs: number;
}

@Injectable()
export class AiQuotaService {
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  private limits(): QuotaLimits {
    return {
      maxCalls: Config.get('ai.quota.max-calls') ?? DEFAULT_MAX_CALLS,
      maxCostUsd: Config.get('ai.quota.max-cost-usd') ?? DEFAULT_MAX_COST_USD,
      windowMs: Config.get('ai.quota.window-ms') ?? DEFAULT_WINDOW_MS,
    };
  }

  /** The caller's own rolling-window status, reported only: Synapse budgets are what refuse a call. */
  async currentWindowStatus(owner: OwnerRef): Promise<AiQuotaResponse> {
    const { maxCalls, maxCostUsd, windowMs } = this.limits();
    const windowStart = new Date(Date.now() - windowMs);

    const [rows, [oldest]] = await Promise.all([
      this.readWindowUsageWhere(ownedBy(schema.projects, owner), windowStart),
      this.db
        .select({ createdAt: schema.modelCalls.createdAt })
        .from(schema.modelCalls)
        .innerJoin(schema.projects, eq(schema.modelCalls.projectId, schema.projects.id))
        .where(and(ownedBy(schema.projects, owner), gte(schema.modelCalls.createdAt, windowStart), dispatched))
        .orderBy(schema.modelCalls.createdAt)
        .limit(1),
    ]);

    const usage = computeWindowUsage(rows);
    return {
      calls: usage.calls,
      costUsd: usage.costUsd,
      maxCalls,
      maxCostUsd,
      windowMs,
      resetsAt: oldest ? new Date(oldest.createdAt.getTime() + windowMs) : null,
    };
  }

  private async readWindowUsageWhere(owner: SQL, windowStart: Date): Promise<WindowUsageRow[]> {
    const rows = await this.db
      .select({
        model: schema.modelCalls.model,
        calls: sql<number>`count(*)::int`,
        inputTokens: sql<string>`coalesce(sum(${schema.modelCalls.inputTokens}) filter (where ${schema.modelCalls.costUsd} is null), 0)`,
        outputTokens: sql<string>`coalesce(sum(${schema.modelCalls.outputTokens}) filter (where ${schema.modelCalls.costUsd} is null), 0)`,
        recordedCostUsd: sql<string>`coalesce(sum(${schema.modelCalls.costUsd}) filter (where ${schema.modelCalls.costUsd} is not null), 0)`,
      })
      .from(schema.modelCalls)
      .innerJoin(schema.projects, eq(schema.modelCalls.projectId, schema.projects.id))
      .where(and(owner, gte(schema.modelCalls.createdAt, windowStart), dispatched))
      .groupBy(schema.modelCalls.model);

    return rows.map(row => ({
      model: row.model,
      calls: Number(row.calls),
      inputTokens: Number(row.inputTokens),
      outputTokens: Number(row.outputTokens),
      recordedCostUsd: Number(row.recordedCostUsd),
    }));
  }
}

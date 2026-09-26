import { and, eq, gte, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { ownedBy, type OwnerRef } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { type AiQuotaResponse } from './ai.dto';
import { computeWindowUsage, quotaBreach, type WindowUsageRow } from './quota';

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_CALLS = 1000;
const DEFAULT_MAX_COST_USD = 50;

interface QuotaLimits {
  maxCalls: number;
  maxCostUsd: number;
  windowMs: number;
}

@Injectable()
export class AiQuotaService {
  private readonly logger = Logger.getLogger(APP_NAME, AiQuotaService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  // The one place these three settings are read, so `enforce` and `currentWindowStatus` can never disagree on what the window is.
  private limits(): QuotaLimits {
    return {
      maxCalls: Config.get('ai.quota.max-calls') ?? DEFAULT_MAX_CALLS,
      maxCostUsd: Config.get('ai.quota.max-cost-usd') ?? DEFAULT_MAX_COST_USD,
      windowMs: Config.get('ai.quota.window-ms') ?? DEFAULT_WINDOW_MS,
    };
  }

  // Per-principal (project owner) throttle enforced before any model dispatch. The window is counted
  // over `model_calls` joined to the owner's projects, so background jobs are gated the same as request
  // turns even though neither carries the acting principal down to this point. A read failure fails
  // OPEN: the allowlist (HIGH-006) already bounds spend to registry models, and a DB blip must not halt
  // all authoring — the same blip would already be stopping run/telemetry writes anyway.
  async enforce(projectId: bigint): Promise<void> {
    const { maxCalls, maxCostUsd, windowMs } = this.limits();
    if (maxCalls <= 0 && maxCostUsd <= 0) return;

    const windowStart = new Date(Date.now() - windowMs);

    let rows: WindowUsageRow[];
    try {
      rows = await this.readWindowUsage(projectId, windowStart);
    } catch (err) {
      this.logger.warn('AI quota check skipped — usage read failed (fail-open)', { projectId, err });
      return;
    }

    const breach = quotaBreach(computeWindowUsage(rows), { maxCalls, maxCostUsd });
    if (breach === 'rate') throw AppErrorCode.AI_008.create();
    if (breach === 'spend') throw AppErrorCode.AI_009.create();
  }

  /** The caller's own rolling-window status: what `enforce` would check, shown rather than enforced. */
  async currentWindowStatus(owner: OwnerRef): Promise<AiQuotaResponse> {
    const { maxCalls, maxCostUsd, windowMs } = this.limits();
    const windowStart = new Date(Date.now() - windowMs);

    const [rows, [oldest]] = await Promise.all([
      this.readWindowUsageForOwner(owner, windowStart),
      this.db
        .select({ createdAt: schema.modelCalls.createdAt })
        .from(schema.modelCalls)
        .innerJoin(schema.projects, eq(schema.modelCalls.projectId, schema.projects.id))
        .where(and(ownedBy(schema.projects, owner), gte(schema.modelCalls.createdAt, windowStart)))
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

  private async readWindowUsage(projectId: bigint, windowStart: Date): Promise<WindowUsageRow[]> {
    const project = await this.db.query.projects.findFirst({ columns: { ownerKind: true, ownerId: true }, where: eq(schema.projects.id, projectId) });
    if (project?.ownerId == null) return [];
    return this.readWindowUsageForOwner({ kind: project.ownerKind, id: project.ownerId }, windowStart);
  }

  private async readWindowUsageForOwner(owner: OwnerRef, windowStart: Date): Promise<WindowUsageRow[]> {
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
      .where(and(ownedBy(schema.projects, owner), gte(schema.modelCalls.createdAt, windowStart)))
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

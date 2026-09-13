import { and, eq, gte, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Config, Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { computeWindowUsage, quotaBreach, type WindowUsageRow } from './quota';

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_CALLS = 1000;
const DEFAULT_MAX_COST_USD = 50;

@Injectable()
export class AiQuotaService {
  private readonly logger = Logger.getLogger(APP_NAME, AiQuotaService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  // Per-principal (project owner) throttle enforced before any model dispatch. The window is counted
  // over `model_calls` joined to the owner's projects, so background jobs are gated the same as request
  // turns even though neither carries the acting principal down to this point. A read failure fails
  // OPEN: the allowlist (HIGH-006) already bounds spend to registry models, and a DB blip must not halt
  // all authoring — the same blip would already be stopping run/telemetry writes anyway.
  async enforce(projectId: bigint): Promise<void> {
    const maxCalls = Config.get('ai.quota.max-calls') ?? DEFAULT_MAX_CALLS;
    const maxCostUsd = Config.get('ai.quota.max-cost-usd') ?? DEFAULT_MAX_COST_USD;
    if (maxCalls <= 0 && maxCostUsd <= 0) return;

    const windowMs = Config.get('ai.quota.window-ms') ?? DEFAULT_WINDOW_MS;
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

  private async readWindowUsage(projectId: bigint, windowStart: Date): Promise<WindowUsageRow[]> {
    const owner = await this.db.query.projects.findFirst({ columns: { ownerId: true }, where: eq(schema.projects.id, projectId) });
    const ownerId = owner?.ownerId;
    if (ownerId == null) return [];

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
      .where(and(eq(schema.projects.ownerId, ownerId), gte(schema.modelCalls.createdAt, windowStart)))
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

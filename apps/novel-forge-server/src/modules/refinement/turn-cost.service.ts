import { and, eq, inArray } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { type CallUsageTotals, emptyCallUsageTotals, summarizeCallUsage, type UsageCallRow } from '../ai/usage/call-usage';

@Injectable()
export class TurnCostService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /** Cost/token totals per assistant message id — a turn's own run plus its title/compaction runs (linked via `parent_run_id`). User messages never carry a figure; they share the turn's `runId` with the reply. */
  async forMessages(projectId: bigint, messages: readonly Pick<Refinement.ChatMessage, 'id' | 'role' | 'runId'>[]): Promise<Map<bigint, CallUsageTotals>> {
    const turnRunIds = [...new Set(messages.filter(m => m.role === 'assistant' && m.runId != null).map(m => m.runId as string))];
    if (turnRunIds.length === 0) return new Map();

    const childRuns = await this.db.query.workflowRuns.findMany({
      where: and(eq(schema.workflowRuns.projectId, projectId), inArray(schema.workflowRuns.parentRunId, turnRunIds)),
      columns: { id: true, parentRunId: true },
    });
    const childIdsByParent = new Map<string, string[]>();
    for (const child of childRuns) {
      if (!child.parentRunId) continue;
      const list = childIdsByParent.get(child.parentRunId) ?? [];
      list.push(child.id);
      childIdsByParent.set(child.parentRunId, list);
    }

    const allRunIds = [...turnRunIds, ...childRuns.map(r => r.id)];
    const calls = await this.db.query.modelCalls.findMany({
      where: and(eq(schema.modelCalls.projectId, projectId), inArray(schema.modelCalls.runId, allRunIds)),
      columns: { runId: true, model: true, status: true, costSource: true, costUsd: true, inputTokens: true, cachedInputTokens: true, outputTokens: true, latencyMs: true },
    });
    const callsByRun = new Map<string, UsageCallRow[]>();
    for (const call of calls) {
      if (!call.runId) continue;
      const list = callsByRun.get(call.runId) ?? [];
      list.push(call);
      callsByRun.set(call.runId, list);
    }

    const result = new Map<bigint, CallUsageTotals>();
    for (const message of messages) {
      if (message.role !== 'assistant' || !message.runId) continue;
      const childIds = childIdsByParent.get(message.runId) ?? [];
      const rows = [...(callsByRun.get(message.runId) ?? []), ...childIds.flatMap(id => callsByRun.get(id) ?? [])];
      result.set(message.id, rows.length > 0 ? summarizeCallUsage(rows) : emptyCallUsageTotals());
    }
    return result;
  }
}

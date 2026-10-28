import { and, inArray, sql } from 'drizzle-orm';

import { type PrimaryDatabase, type Project, schema } from '@server/database';

import { DEFAULT_COST_TIER, isContentMode, isCostTier } from '../ai/defaults';
import { type ProjectConfig } from '../ai/model-router.service';

/** Its run input is the only record of the selection a turn ran under. */
export const CHAT_TURN_GRAPH = 'chat-turn';

export interface ChatSelection {
  contentMode: Project.ContentMode;
  costTier: Project.CostTier;
}

export interface ChatSelectionOverride {
  contentMode?: Project.ContentMode;
  costTier?: Project.CostTier;
}

/** A chat follows its project; nothing is written back, so a turn's one-shot pick lasts exactly that turn. */
export function chatSelection(turn: ChatSelectionOverride, project?: ProjectConfig): ChatSelection {
  const projectMode: Project.ContentMode = project?.contentMode === 'unrestricted' ? 'unrestricted' : 'standard';
  return { contentMode: turn.contentMode ?? projectMode, costTier: turn.costTier ?? project?.costTier ?? DEFAULT_COST_TIER };
}

/** A run recorded before selections existed has none. */
export async function loadTurnSelections(db: PrimaryDatabase, runIds: string[]): Promise<Map<string, Partial<ChatSelection>>> {
  if (runIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: schema.workflowRuns.id,
      costTier: sql<string | null>`${schema.workflowRuns.input}->>'costTier'`,
      contentMode: sql<string | null>`${schema.workflowRuns.input}->>'contentMode'`,
    })
    .from(schema.workflowRuns)
    .where(and(inArray(schema.workflowRuns.id, runIds), inArray(schema.workflowRuns.graph, [CHAT_TURN_GRAPH])));
  return new Map(rows.map(row => [row.id, toSelection(row)]));
}

function toSelection(row: { costTier: unknown; contentMode: unknown }): Partial<ChatSelection> {
  return { ...(isCostTier(row.costTier) ? { costTier: row.costTier } : {}), ...(isContentMode(row.contentMode) ? { contentMode: row.contentMode } : {}) };
}

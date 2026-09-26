import { and, inArray, sql } from 'drizzle-orm';

import { type PrimaryDatabase, type Project, type Refinement, schema } from '@server/database';

import { DEFAULT_COST_TIER, isContentMode, isCostTier, isUnrestrictedAllowed, type ResolvedModel } from '../ai/defaults';
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

type SessionSelection = Pick<Refinement.ChatSession, 'contentMode' | 'costTier' | 'modelProvider' | 'modelId'>;

/** Nothing is written back, so a turn's pick lasts exactly that turn. */
export function chatSelection(turn: ChatSelectionOverride, session: SessionSelection, project?: ProjectConfig): ChatSelection {
  const projectMode: Project.ContentMode = project?.contentMode === 'unrestricted' ? 'unrestricted' : 'standard';
  return {
    contentMode: turn.contentMode ?? session.contentMode ?? projectMode,
    costTier: turn.costTier ?? session.costTier ?? project?.costTier ?? DEFAULT_COST_TIER,
  };
}

/**
 * The project a chat reply is routed with: the selection applied, and the chat's own model pin written over the project's chat pick.
 * A pin off the unrestricted allowlist is dropped in unrestricted mode, so the reply falls to the project's pick or the tier map there.
 */
export function chatRoutedProject(project: ProjectConfig | undefined, session: SessionSelection, selection: ChatSelection): ProjectConfig {
  const pin: ResolvedModel | undefined = session.modelProvider && session.modelId ? { provider: session.modelProvider, model: session.modelId } : undefined;
  const usable = pin && (selection.contentMode === 'standard' || isUnrestrictedAllowed('chat', pin));
  const routed: ProjectConfig = { ...project, contentMode: selection.contentMode, costTier: selection.costTier };
  return usable ? withChatModel(routed, pin) : routed;
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

export function withChatModel(project: ProjectConfig, model: ResolvedModel): ProjectConfig {
  const config = project.config ?? {};
  return { ...project, config: { ...config, models: { ...config.models, chat: model } } };
}

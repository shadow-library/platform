import { and, inArray, sql } from 'drizzle-orm';

import { type PrimaryDatabase, type Project, type Refinement, schema } from '@server/database';

import { DEFAULT_COST_TIER, isContentMode, isCostTier } from '../ai/defaults';
import { type ProjectConfig } from '../ai/model-router.service';
import { SYNAPSE_PROVIDER } from '../ai/synapse-request';

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

type SessionAliasPin = Pick<Refinement.ChatSession, 'aliasKey'>;

/** Nothing is written back, so a turn's pick lasts exactly that turn. */
export function chatSelection(turn: ChatSelectionOverride, session: Pick<Refinement.ChatSession, 'contentMode' | 'costTier'>, project?: ProjectConfig): ChatSelection {
  const projectMode: Project.ContentMode = project?.contentMode === 'unrestricted' ? 'unrestricted' : 'standard';
  return {
    contentMode: turn.contentMode ?? session.contentMode ?? projectMode,
    costTier: turn.costTier ?? session.costTier ?? project?.costTier ?? DEFAULT_COST_TIER,
  };
}

/** The project a chat reply is routed with: the selection applied, and the alias pin only while the catalog `offered` it (sent as stored when the catalog is unreadable). */
export function aliasRoutedProject(project: ProjectConfig | undefined, session: SessionAliasPin, selection: ChatSelection, offered?: readonly string[]): ProjectConfig {
  const routed: ProjectConfig = { ...project, contentMode: selection.contentMode, costTier: selection.costTier };
  const alias = session.aliasKey;
  if (!alias || (offered && !offered.includes(alias))) return routed;
  return { ...routed, chatAlias: alias, chatPinned: true };
}

/** A chat's pin is its alias, shown in the pin fields as the option it was picked from: provider `synapse`, the key as model. */
export function presentChatSession<T extends Refinement.ChatSession>(session: T): T {
  return { ...session, modelProvider: session.aliasKey ? SYNAPSE_PROVIDER : null, modelId: session.aliasKey };
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

import { type Command, type CommandResult } from './command.types';
import { type QuestDetail, type QuestDraft, type QuestSummary } from './quest.types';
import { type CaptureTarget, type DayView, type PlanView, type QuestDraftPreview } from './view.types';

export type QuestFilter = 'active' | 'inactive' | 'all';

export type PlanScope = 'week' | 'month';

export interface PlanRange {
  scope: PlanScope;
  /** Any date inside the period; the provider resolves it to the period's bounds. */
  anchor: string;
}

/**
 * The seam every day-group screen reads through. Reads are plain queries; every write is a command, so the
 * sync/offline provider that replaces the fixtures can queue, retry and replay them without a new interface.
 */
export interface DataProvider {
  getDay(date: string): Promise<DayView>;
  getPlan(range: PlanRange): Promise<PlanView>;
  listQuests(filter: QuestFilter): Promise<QuestSummary[]>;
  getQuest(questId: string): Promise<QuestDetail>;
  previewDraft(draft: QuestDraft): Promise<QuestDraftPreview>;
  /** Quest-name matching for Quick Capture — today's occurrences only, ranked best-first. */
  findOccurrences(query: string, date: string): Promise<CaptureTarget[]>;
  dispatchCommand(command: Command): Promise<CommandResult>;
}

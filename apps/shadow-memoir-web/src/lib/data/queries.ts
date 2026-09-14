import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { occurrenceSupersededCopy } from './command-feedback';
import { type CommandHandle, type LocalReading, useDomainCommand } from './command-runner';
import { type Command, type CommandConfirmation, type CommandOutcome, type CommandResult } from './command.types';
import { type DataProvider, type PlanRange, type QuestFilter } from './data-provider';
import { useMemoirData } from './data-context';
import { type QuestDetail, type QuestDraft, type QuestSummary } from './quest.types';
import { type CaptureTarget, type DayView, type PlanView, type QuestDraftPreview, type QuickLogTile } from './view.types';

export const memoirKeys = {
  all: ['memoir'] as const,
  day: (date: string) => ['memoir', 'day', date] as const,
  plan: (range: PlanRange) => ['memoir', 'plan', range.scope, range.anchor] as const,
  quests: (filter: QuestFilter) => ['memoir', 'quests', filter] as const,
  quest: (questId: string) => ['memoir', 'quest', questId] as const,
  draftPreview: (draft: QuestDraft) => ['memoir', 'draft-preview', draft.durationMinutes, draft.recurrence] as const,
  occurrences: (query: string, date: string) => ['memoir', 'occurrences', date, query] as const,
  quickLogTiles: (date: string) => ['memoir', 'quick-log-tiles', date] as const,
};

export function useDay(date?: string): UseQueryResult<DayView> {
  const { provider, queryClient, today } = useMemoirData();
  const day = date ?? today;
  return useQuery({ queryKey: memoirKeys.day(day), queryFn: () => provider.getDay(day) }, queryClient);
}

/** Keyed under `memoirKeys` rather than `quickLogKeys` so a delta pull refreshes the rail with everything else it changed. */
export function useQuickLogTiles(date?: string): UseQueryResult<QuickLogTile[]> {
  const { quickLogs, queryClient, today } = useMemoirData();
  const day = date ?? today;
  return useQuery({ queryKey: memoirKeys.quickLogTiles(day), queryFn: () => quickLogs.tiles(day) }, queryClient);
}

export function usePlan(range: PlanRange): UseQueryResult<PlanView> {
  const { provider, queryClient } = useMemoirData();
  return useQuery({ queryKey: memoirKeys.plan(range), queryFn: () => provider.getPlan(range) }, queryClient);
}

export function useQuestList(filter: QuestFilter): UseQueryResult<QuestSummary[]> {
  const { provider, queryClient } = useMemoirData();
  return useQuery({ queryKey: memoirKeys.quests(filter), queryFn: () => provider.listQuests(filter) }, queryClient);
}

export function useQuestDetail(questId: string): UseQueryResult<QuestDetail> {
  const { provider, queryClient } = useMemoirData();
  return useQuery({ queryKey: memoirKeys.quest(questId), queryFn: () => provider.getQuest(questId) }, queryClient);
}

export function useDraftPreview(draft: QuestDraft): UseQueryResult<QuestDraftPreview> {
  const { provider, queryClient } = useMemoirData();
  return useQuery({ queryKey: memoirKeys.draftPreview(draft), queryFn: () => provider.previewDraft(draft) }, queryClient);
}

export function useOccurrenceSearch(query: string, date?: string): UseQueryResult<CaptureTarget[]> {
  const { provider, queryClient, today } = useMemoirData();
  const day = date ?? today;
  return useQuery({ queryKey: memoirKeys.occurrences(query, day), queryFn: () => provider.findOccurrences(query, day), enabled: query.trim().length > 0 }, queryClient);
}

export type QuestCommandHook = CommandHandle<Command, CommandOutcome, CommandConfirmation>;

function readQuestResult(result: CommandResult): LocalReading<CommandOutcome, CommandConfirmation> {
  if (result.status === 'needs-confirmation') return { kind: 'confirm', confirmation: result };
  if (result.status === 'rejected') return { kind: 'rejected', message: result.message, error: result.error };
  return { kind: 'done', local: result, delivery: result.delivery, xpAwarded: result.xpAwarded, coinsAwarded: result.coinsAwarded };
}

/** The server reports which outcome won an occurrence; the mock and older servers leave it to the delta, which has landed by the time a claim settles. */
async function describeOccurrenceWinner(provider: DataProvider, command: Command, result: Record<string, unknown>): Promise<string | null> {
  if (typeof result['state'] === 'string' || !('occurrenceId' in command)) return null;
  const date = command.occurrenceId.split(':')[1];
  if (!date) return null;
  const occurrence = (await provider.getDay(date)).occurrences.find(item => item.id === command.occurrenceId);
  return occurrence && occurrence.state !== 'upcoming' ? occurrenceSupersededCopy(occurrence.state) : null;
}

export function useCommand(): QuestCommandHook {
  const { provider, queryClient } = useMemoirData();
  return useDomainCommand({
    dispatch: (command, options) => provider.dispatchCommand(command, options),
    read: readQuestResult,
    queryClient,
    queryKey: memoirKeys.all,
    describeSuperseded: (command, result) => describeOccurrenceWinner(provider, command, result),
  });
}

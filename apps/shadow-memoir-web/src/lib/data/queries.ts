import { useMutation, type UseMutationResult, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type Command, type CommandResult } from './command.types';
import { type PlanRange, type QuestFilter } from './data-provider';
import { useMemoirData } from './data-context';
import { type QuestDetail, type QuestDraft, type QuestSummary } from './quest.types';
import { type CaptureTarget, type DayView, type PlanView, type QuestDraftPreview, type QuickLogTile } from './view.types';

export const memoirKeys = {
  all: ['memoir'] as const,
  day: (date: string) => ['memoir', 'day', date] as const,
  plan: (range: PlanRange) => ['memoir', 'plan', range.scope, range.anchor] as const,
  quests: (filter: QuestFilter) => ['memoir', 'quests', filter] as const,
  quest: (questId: string) => ['memoir', 'quest', questId] as const,
  draftPreview: (draft: QuestDraft) => ['memoir', 'draft-preview', draft.durationMinutes, draft.recurrence.daysOfWeek.join('')] as const,
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
  const { quickLogs, queryClient, today, currency } = useMemoirData();
  const day = date ?? today;
  return useQuery({ queryKey: memoirKeys.quickLogTiles(day), queryFn: () => quickLogs.tiles(day, currency) }, queryClient);
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

export function useOccurrenceSearch(query: string): UseQueryResult<CaptureTarget[]> {
  const { provider, queryClient, today } = useMemoirData();
  return useQuery({ queryKey: memoirKeys.occurrences(query, today), queryFn: () => provider.findOccurrences(query, today), enabled: query.trim().length > 0 }, queryClient);
}

export function useCommand(): UseMutationResult<CommandResult, Error, Command> {
  const { provider, queryClient } = useMemoirData();
  return useMutation(
    {
      mutationFn: (command: Command) => provider.dispatchCommand(command),
      onSuccess: result => {
        if (result.status === 'needs-confirmation') return;
        void queryClient.invalidateQueries({ queryKey: memoirKeys.all });
      },
    },
    queryClient,
  );
}

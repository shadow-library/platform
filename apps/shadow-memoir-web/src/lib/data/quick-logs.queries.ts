import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { type CommandHandle, type LocalReading, useDomainCommand } from './command-runner';
import { useMemoirData } from './data-context';
import { type HealthView, type JournalView, type MealsView, type QuickLogCommand, type QuickLogCommandResult, type SideQuestsView, type WeightView } from './quick-logs.types';

const quickLogKeys = {
  all: ['memoir', 'quick-logs'] as const,
  journal: () => ['memoir', 'quick-logs', 'journal'] as const,
  meals: (date: string) => ['memoir', 'quick-logs', 'meals', date] as const,
  weight: () => ['memoir', 'quick-logs', 'weight'] as const,
  health: (date: string) => ['memoir', 'quick-logs', 'health', date] as const,
  sideQuests: () => ['memoir', 'quick-logs', 'side-quests'] as const,
};

export function useJournal(): UseQueryResult<JournalView> {
  const { quickLogs, queryClient } = useMemoirData();
  return useQuery({ queryKey: quickLogKeys.journal(), queryFn: () => quickLogs.journal() }, queryClient);
}

export function useMeals(date: string): UseQueryResult<MealsView> {
  const { quickLogs, queryClient } = useMemoirData();
  return useQuery({ queryKey: quickLogKeys.meals(date), queryFn: () => quickLogs.meals(date) }, queryClient);
}

export function useWeight(): UseQueryResult<WeightView> {
  const { quickLogs, queryClient } = useMemoirData();
  return useQuery({ queryKey: quickLogKeys.weight(), queryFn: () => quickLogs.weight() }, queryClient);
}

export function useHealth(date: string): UseQueryResult<HealthView> {
  const { quickLogs, queryClient } = useMemoirData();
  return useQuery({ queryKey: quickLogKeys.health(date), queryFn: () => quickLogs.health(date) }, queryClient);
}

export function useSideQuests(): UseQueryResult<SideQuestsView> {
  const { quickLogs, queryClient } = useMemoirData();
  return useQuery({ queryKey: quickLogKeys.sideQuests(), queryFn: () => quickLogs.sideQuests() }, queryClient);
}

export type QuickLogCommandHook = CommandHandle<QuickLogCommand, QuickLogCommandResult, QuickLogCommandResult>;

function readQuickLogResult(result: QuickLogCommandResult): LocalReading<QuickLogCommandResult, QuickLogCommandResult> {
  if (result.needsConfirmation) return { kind: 'confirm', confirmation: result };
  return { kind: 'done', local: result, delivery: result.delivery, xpAwarded: result.reward?.xp ?? 0, coinsAwarded: result.reward?.coins ?? 0 };
}

export function useQuickLogCommand(): QuickLogCommandHook {
  const { quickLogs, queryClient } = useMemoirData();
  return useDomainCommand({
    dispatch: (command, options) => quickLogs.dispatchCommand(command, options),
    read: readQuickLogResult,
    queryClient,
    queryKey: quickLogKeys.all,
  });
}

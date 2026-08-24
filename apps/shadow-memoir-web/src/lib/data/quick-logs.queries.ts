import { useMutation, type UseMutationResult, useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useMemoirData } from './data-context';
import { type HealthView, type JournalView, type MealsView, type QuickLogCommand, type QuickLogCommandResult, type SideQuestsView, type WeightView } from './quick-logs.types';

export const quickLogKeys = {
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

export function useQuickLogCommand(): UseMutationResult<QuickLogCommandResult, Error, QuickLogCommand> {
  const { quickLogs, queryClient } = useMemoirData();
  return useMutation(
    { mutationFn: (command: QuickLogCommand) => quickLogs.dispatchCommand(command), onSuccess: () => queryClient.invalidateQueries({ queryKey: quickLogKeys.all }) },
    queryClient,
  );
}
